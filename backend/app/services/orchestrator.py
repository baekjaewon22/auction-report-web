# -*- coding: utf-8 -*-
"""
오케스트레이터: 전체 보고서 생성 파이프라인
- final.py의 main() 함수를 모듈화한 것
- WebSocket으로 진행상황 전송
"""

import os
import re
import time
import logging
from typing import Optional, Callable

from pptx import Presentation
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from ..core.config import (
    settings, CAPTURE_DIR, SELENIUM_PROFILE_DIR,
    ensure_dirs, load_config, save_config,
)
from ..core.utils import track_file, cleanup_generated_files
from ..models.schemas import ReportRequest, ProgressUpdate

from . import crawler
from . import capturer
from . import pdf_processor
from . import ppt_builder
from . import excel_handler
from .selenium_driver import (
    create_driver, login_myauction, click_tab_safe,
    switch_to_new_window, wait_document_ready,
)

logger = logging.getLogger(__name__)

# 이미지 패턴
IMG_PATTERN = str(CAPTURE_DIR / "building_register_{page}.png")
SALE_IMG_PATTERN = str(CAPTURE_DIR / "sale_spec_{page}.png")
STATUS_IMG_PATTERN = str(CAPTURE_DIR / "status_report_{page}.png")
REGISTRY_IMG_PATTERN = str(CAPTURE_DIR / "registry_summary_{page}.png")

# 캡처 파일 경로
COURT_GUIDE_PNG = str(CAPTURE_DIR / "court_guide_capture.png")
KAKAO_MAP_PNG = str(CAPTURE_DIR / "kakao_map.png")
KAKAO_SAT_PNG = str(CAPTURE_DIR / "kakao_satellite.png")
LAND_USE_PLAN_PNG = str(CAPTURE_DIR / "land_use_plan.png")
APPRAISAL_PREFIX = str(CAPTURE_DIR / "appraisal_location_part")

REGISTRY_NEEDLE = "주요 등기사항 요약"
BUILDING_OVERVIEW_PNG = str(CAPTURE_DIR / "building_overview.png")

# 전체 단계 수
TOTAL_STEPS = 6


async def generate_report(
    request: ReportRequest,
    progress_callback: Optional[Callable] = None,
) -> dict:
    """
    전체 보고서 생성 파이프라인
    progress_callback(ProgressUpdate) 로 진행상황 전달
    """
    ensure_dirs()

    def emit(step, title, message, status="running", percent=0.0):
        if progress_callback:
            try:
                update = ProgressUpdate(
                    step=step, total_steps=TOTAL_STEPS,
                    title=title, message=message,
                    status=status, percent=percent,
                )
                # 동기/비동기 콜백 모두 지원
                import asyncio
                if asyncio.iscoroutinefunction(progress_callback):
                    try:
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            loop.create_task(progress_callback(update))
                        else:
                            asyncio.run(progress_callback(update))
                    except RuntimeError:
                        pass
                else:
                    progress_callback(update)
            except Exception:
                pass
        logger.info(f"[{step}/{TOTAL_STEPS}] {title}: {message}")

    url = request.url.strip()
    if url.startswith("//"):
        url = "https:" + url

    # /view/ → /view3/ 변환 + 마이옥션 아이디 파라미터 추가
    import re as _re
    if "/view/" in url and "/view3/" not in url:
        url = url.replace("/view/", "/view3/", 1)
        logger.info(f"URL 자동 변환: /view/ → /view3/")
    # URL 끝에 아이디가 없으면 추가
    url_parts = url.rstrip("/").split("/")
    # view3/숫자 형태이고, 뒤에 아이디가 없으면 추가
    if "/view3/" in url:
        # view3/1452773 까지만 있고 아이디가 없는 경우
        view3_idx = url.find("/view3/")
        after_view3 = url[view3_idx + 7:].rstrip("/")  # "1452773" 또는 "1452773/아이디"
        parts = after_view3.split("/")
        if len(parts) == 1 and parts[0].isdigit():
            # 숫자만 있고 아이디 없음 → 아이디 추가
            url = url.rstrip("/") + "/" + request.myauction_id
            logger.info(f"URL에 마이옥션 아이디 추가: {url}")
    logger.info(f"최종 URL: {url}")

    # 초기화
    data = {}
    prs = None
    LAND_MODE = False
    total_building = total_sale = total_registry = total_status = 0
    tenant_imgs = building_registry_imgs = land_registry_imgs = []
    land_use_plan_img = kakao_map_img = kakao_sat_img = ""
    loc_left_img = loc_right_img = ""
    court_start_time = court_end_time = court_capture_png = ""
    building_overview_img = ""

    # ===== STEP 0: Selenium 준비 =====
    emit(0, "브라우저 준비", "Chrome 시작 중...")

    profile_dir = ""
    if request.remember_login:
        safe_id = re.sub(r"[^0-9A-Za-z._-]", "_", request.myauction_id)
        profile_dir = os.path.join(SELENIUM_PROFILE_DIR, safe_id)
        os.makedirs(profile_dir, exist_ok=True)

    driver = create_driver(profile_dir=profile_dir)

    try:
        # ===== STEP 1: 로그인 + 파싱 =====
        emit(1, "사이트 파싱", "마이옥션 로그인 중...", percent=5)
        login_myauction(driver, request.myauction_id, request.myauction_pw)

        emit(1, "사이트 파싱", "상세 페이지 접속 중...", percent=10)
        driver.get(url)
        wait_document_ready(driver, timeout=30)
        time.sleep(5)

        emit(1, "사이트 파싱", "데이터 추출 중...", percent=15)
        soup = crawler.fetch_soup_from_driver(driver)
        data = crawler.parse_myauction_detail(soup, url, driver=driver)
        LAND_MODE = bool(data.get("LAND_MODE", False))

        # 토지이용계획 텍스트
        try:
            landplan_url = (data.get("landplan_url") or "").strip()
            if landplan_url:
                refined = crawler.fetch_land_zoning_from_plan(driver, landplan_url)
                if refined:
                    data["land_zoning"] = refined
        except Exception as e:
            logger.warning(f"토지이용계획 추출 실패: {e}")

        emit(1, "사이트 파싱", "파싱 완료", percent=20)

        # ===== STEP 2: PPT 기본 채우기 =====
        emit(2, "PPT 기본값", "템플릿 로드 중...", percent=20)
        prs = Presentation(settings.pptm_template)
        ppt_builder.fill_slide_with_data(prs, data)
        ppt_builder.insert_main_photo(prs, data.get("photo_url", ""))
        emit(2, "PPT 기본값", "기본값 채우기 완료", percent=25)

        # ===== STEP 3: 캡처 =====
        emit(3, "문서 캡처", "관할법원안내 처리 중...", percent=25)
        base_handle = driver.current_window_handle

        # 관할법원안내
        try:
            court_start_time, court_end_time, court_popup = capturer.open_court_guide_popup(driver)
            court_capture_png = capturer.capture_court_popup(driver, COURT_GUIDE_PNG)
            driver.close()
            driver.switch_to.window(base_handle)
            wait_document_ready(driver)
        except Exception as e:
            logger.warning(f"관할법원안내 실패: {e}")
            try:
                if driver.current_window_handle != base_handle:
                    driver.switch_to.window(base_handle)
            except Exception:
                pass

        # 토지이용계획 캡처
        emit(3, "문서 캡처", "토지이용계획 캡처 중...", percent=30)
        try:
            land_use_plan_img = capturer.capture_land_use_plan(driver, LAND_USE_PLAN_PNG)
        except Exception as e:
            logger.warning(f"토지이용계획 캡처 실패: {e}")

        # 임차인/등기부 캡처
        emit(3, "문서 캡처", "임차인/등기부현황 캡처 중...", percent=35)
        try:
            tenant_imgs, building_registry_imgs, land_registry_imgs = capturer.capture_tenant_and_registry(driver)
        except Exception as e:
            logger.warning(f"캡처 실패: {e}")

        # 공시자료 팝업
        emit(3, "문서 캡처", "공시자료 팝업 열기...", percent=40)
        wait = WebDriverWait(driver, 15)
        before = set(driver.window_handles)
        bu_link = wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "부동산표시")))
        bu_link.click()
        time.sleep(1)

        after = set(driver.window_handles)
        new_handles = list(after - before)
        if not new_handles:
            raise RuntimeError("공시자료 팝업을 찾지 못했습니다.")
        popup_handle = new_handles[0]
        driver.switch_to.window(popup_handle)
        wait = WebDriverWait(driver, 15)

        # 카카오맵
        emit(3, "문서 캡처", "전자지도/위성지도 캡처 중...", percent=45)
        try:
            kakao_map_img = capturer.open_kakao_and_capture(driver, popup_handle, "전자지도", KAKAO_MAP_PNG)
        except Exception as e:
            logger.warning(f"전자지도 캡처 실패: {e}")
        try:
            kakao_sat_img = capturer.open_kakao_and_capture(driver, popup_handle, "위성지도", KAKAO_SAT_PNG)
        except Exception as e:
            logger.warning(f"위성지도 캡처 실패: {e}")

        # [MODE] 건축물대장 탭 존재시 건축물 버전 강제 전환
        if LAND_MODE:
            try:
                _tab = click_tab_safe(wait, driver, ["건축물대장", "건축물"])
                if _tab:
                    logger.info("토지로 판별됐지만 '건축물대장' 탭 존재 → 건축물버전으로 전환")
                    LAND_MODE = False
                    data["LAND_MODE"] = False
                    data["BUILDING_MODE"] = True
            except Exception:
                pass

        # 건축물대장
        emit(3, "문서 캡처", "건축물대장 처리 중...", percent=50)
        if not LAND_MODE:
            try:
                clicked = click_tab_safe(wait, driver, ["건축물대장", "건축물"])
                if not clicked:
                    raise RuntimeError("건축물대장 탭을 찾지 못했습니다.")
                logger.info(f"팝업 내 '{clicked}' 탭 클릭 완료")
                time.sleep(1)
                iframe = wait.until(EC.presence_of_element_located((By.ID, "detail_target")))
                pdf_url = iframe.get_attribute("src")
                if not pdf_url:
                    raise RuntimeError("건축물대장 iframe src 없음")
                pdf_path = pdf_processor.download_pdf_with_cookies(driver, pdf_url, "building_register")
                total_building = pdf_processor.pdf_to_images(pdf_path, IMG_PATTERN, dpi=250)
            except Exception as e:
                logger.warning(f"건축물대장 실패 → 생략(계속 진행): {e}")
        else:
            logger.info("토지버전 → 건축물대장 생략")

        # 매각물건명세서
        emit(3, "문서 캡처", "매각물건명세서 처리 중...", percent=55)
        try:
            clicked = click_tab_safe(wait, driver, ["매각물건명세서", "물건명세서"])
            time.sleep(1)
            iframe = wait.until(EC.presence_of_element_located((By.ID, "detail_target")))
            pdf_url = iframe.get_attribute("src")
            if pdf_url:
                pdf_path = pdf_processor.download_pdf_with_cookies(driver, pdf_url, "sale_spec")
                total_sale = pdf_processor.pdf_to_images(pdf_path, SALE_IMG_PATTERN, dpi=250)
        except Exception as e:
            logger.warning(f"매각물건명세서 실패: {e}")

        # 등기부(건물)
        emit(3, "문서 캡처", "등기부 처리 중...", percent=60)
        if not LAND_MODE:
            try:
                clicked = click_tab_safe(wait, driver, ["등기부(건물)", "등기부", "건물"])
                if not clicked:
                    raise RuntimeError("등기부(건물) 탭을 찾지 못했습니다.")
                logger.info(f"팝업 내 '{clicked}' 탭 클릭 완료")
                time.sleep(1)
                iframe = wait.until(EC.presence_of_element_located((By.ID, "detail_target")))
                pdf_url = iframe.get_attribute("src")
                if not pdf_url:
                    raise RuntimeError("등기부(건물) iframe src 없음")

                reg_pdf = pdf_processor.download_pdf_with_cookies(driver, pdf_url, "registry_building")

                # "주요 등기사항 요약" 문구 페이지 찾기 → 가로 변환
                start_idx = pdf_processor.find_first_page_contains_text(reg_pdf, REGISTRY_NEEDLE)
                if start_idx == -1:
                    # 문구 못 찾음 → 마지막 페이지만 가로 변환
                    logger.warning(f"'{REGISTRY_NEEDLE}' 문구를 못 찾음 → 마지막 페이지만 사용")
                    reg_land_pdf = reg_pdf.replace(".pdf", "_last_landscape.pdf")
                    reg_pdf = pdf_processor.pdf_last_page_to_landscape(reg_pdf, reg_land_pdf, dpi=220)
                    track_file(reg_pdf)
                else:
                    # 문구 발견 → 해당 페이지부터 끝까지 가로 변환
                    logger.info(f"'{REGISTRY_NEEDLE}' 발견: {start_idx+1}페이지부터 가로 변환")
                    reg_land_pdf = reg_pdf.replace(".pdf", f"_from_{start_idx+1}_landscape.pdf")
                    reg_pdf = pdf_processor.pdf_pages_from_to_landscape(reg_pdf, reg_land_pdf, start_idx, dpi=220)
                    track_file(reg_pdf)

                total_registry = pdf_processor.pdf_to_images(reg_pdf, REGISTRY_IMG_PATTERN, dpi=250)
            except Exception as e:
                logger.warning(f"등기부(건물) 실패 → 생략(계속 진행): {e}")
        else:
            logger.info("토지버전 → 등기부(건물) 생략")

        # 등기부(토지) - 토지 모드일 때만
        total_registry_land = 0
        if LAND_MODE:
            try:
                emit(3, "문서 캡처", "등기부(토지) 처리 중...", percent=62)
                clicked = click_tab_safe(wait, driver, ["등기부(토지)", "등기부", "토지"])
                if not clicked:
                    raise RuntimeError("등기부(토지) 탭을 찾지 못했습니다.")
                logger.info(f"팝업 내 '{clicked}' 탭 클릭 완료")
                time.sleep(1)
                iframe = wait.until(EC.presence_of_element_located((By.ID, "detail_target")))
                pdf_url = iframe.get_attribute("src")
                if not pdf_url:
                    raise RuntimeError("등기부(토지) iframe src 없음")
                reg_land_pdf = pdf_processor.download_pdf_with_cookies(driver, pdf_url, "registry_land")
                reg_land_img_pattern = str(CAPTURE_DIR / "registry_land_{page}.png")
                total_registry_land = pdf_processor.pdf_to_images(reg_land_pdf, reg_land_img_pattern, dpi=250)
            except Exception as e:
                logger.warning(f"등기부(토지) 실패 → 생략(계속 진행): {e}")

        # 감정평가서
        emit(3, "문서 캡처", "감정평가서 위치도 처리 중...", percent=65)
        try:
            clicked = click_tab_safe(wait, driver, ["감정평가서", "감정평가", "감정"])
            time.sleep(1)
            iframe = wait.until(EC.presence_of_element_located((By.ID, "detail_target")))
            pdf_url = iframe.get_attribute("src")
            if pdf_url:
                appr_pdf = pdf_processor.download_pdf_with_cookies(driver, pdf_url, "appraisal_report")

                # (A) 위치도 탐색 + 렌더링
                found = pdf_processor.find_appraisal_map_pages(appr_pdf)
                chosen = pdf_processor.choose_location_types(found)
                if chosen:
                    page_indices = [found[t] for t in chosen]
                    imgs = pdf_processor.render_pages_vector(appr_pdf, page_indices, APPRAISAL_PREFIX)
                    if len(imgs) >= 1:
                        loc_left_img = imgs[0]
                    if len(imgs) >= 2:
                        loc_right_img = imgs[1]

                # (B) 내부구조도 / 건물개황도 탐색 + 렌더링
                emit(3, "문서 캡처", "내부구조도 탐색 중...", percent=68)
                try:
                    overview_page = pdf_processor.find_building_overview_page(appr_pdf)
                    if overview_page >= 0:
                        overview_imgs = pdf_processor.render_pages_vector(
                            appr_pdf, [overview_page],
                            str(CAPTURE_DIR / "building_overview"),
                            dpi=260,
                        )
                        if overview_imgs:
                            building_overview_img = overview_imgs[0]
                            logger.info(f"내부구조도 렌더링 완료: {building_overview_img}")
                except Exception as e2:
                    logger.warning(f"내부구조도 탐색 실패(계속 진행): {e2}")

        except Exception as e:
            logger.warning(f"감정평가서 실패: {e}")

        # 현황조사서
        emit(3, "문서 캡처", "현황조사서 처리 중...", percent=70)
        try:
            clicked = click_tab_safe(wait, driver, ["현황조사서"])
            time.sleep(1)
            status_pdf = pdf_processor.print_current_page_to_pdf(driver, "status_report", landscape=True)
            if pdf_processor.is_valid_pdf(status_pdf):
                total_status = pdf_processor.pdf_to_images(status_pdf, STATUS_IMG_PATTERN, dpi=300)
        except Exception as e:
            logger.warning(f"현황조사서 실패: {e}")

        emit(3, "문서 캡처", "캡처 완료", percent=75)

    except Exception as e:
        logger.error(f"파이프라인 실패: {e}")
        emit(0, "오류", str(e), status="error")
        return {"success": False, "message": str(e)}
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    # ===== STEP 4: PPT 이미지 삽입 =====
    emit(4, "PPT 이미지 삽입", "슬라이드에 이미지 삽입 중...", percent=75)

    if prs is None:
        return {"success": False, "message": "PPT 로드 실패"}

    # 관할법원 텍스트 치환
    try:
        slide40 = ppt_builder.find_slide_by_note_key(prs, "SLIDE_KEY=CALC_COST")
        if slide40:
            deposit_num = re.sub(r"[^0-9,]", "", data.get("deposit", "") or "")
            mapping = {
                "{deposit}": deposit_num,
                "{auction_date}": data.get("auction_date", "") or "",
                "{auction_start_time}": court_start_time or "",
                "Auction_start_time": court_start_time or "",
                "{auction_end_time}": court_end_time or "",
                "Auction_end_time": court_end_time or "",
            }
            ppt_builder.replace_placeholders_in_slide(slide40, mapping)
            ppt_builder.remove_won_unit_in_slide(slide40)
    except Exception as e:
        logger.warning(f"40번 슬라이드 실패: {e}")

    # 관할법원 캡처 삽입
    if court_capture_png and os.path.exists(court_capture_png):
        ppt_builder.insert_single_image(prs, "SLIDE_KEY=COURT_GUIDE", court_capture_png, use_note_key=True)

    # 문서 이미지 삽입
    cap_dir = str(CAPTURE_DIR)
    ppt_builder.insert_images_into_ppt(prs, total_building, "건축물대장", IMG_PATTERN, clone_from_next=True, forced_num="(5)")
    ppt_builder.insert_images_into_ppt(prs, total_sale, "매각물건명세서", SALE_IMG_PATTERN, clone_from_next=True)
    ppt_builder.insert_images_into_ppt(prs, total_registry, "등기사항 요약", REGISTRY_IMG_PATTERN, clone_from_next=True)
    ppt_builder.insert_images_into_ppt(prs, total_status, "현황조사서", STATUS_IMG_PATTERN, clone_from_next=True)

    # 임차인/등기부현황
    if tenant_imgs:
        ppt_builder.insert_images_into_ppt(
            prs, len(tenant_imgs), "임차인 현황",
            os.path.join(cap_dir, "tenant_status_{page}.png"),
            clone_from_next=True, base_as_last=True,
        )

    if building_registry_imgs:
        ppt_builder.insert_images_into_ppt(
            prs, len(building_registry_imgs), "등기부 현황",
            os.path.join(cap_dir, "building_registry_status_{page}.png"),
            clone_from_next=True, base_as_last=True,
        )

    # 단일 이미지 삽입
    ppt_builder.insert_single_image(prs, "전자지도", KAKAO_MAP_PNG)
    ppt_builder.insert_single_image(prs, "위성지도", KAKAO_SAT_PNG)
    ppt_builder.insert_single_image(prs, "토지이용계획", land_use_plan_img)

    # 건물개황도 (내부구조도/호별배치도) → PPT "건물개황도" 슬라이드에 삽입
    if building_overview_img and os.path.exists(building_overview_img):
        # "건물개황도", "내부구조도", "호별배치도" 중 하나로 슬라이드 검색
        inserted = False
        for kw in ["건물개황도", "내부구조도", "호별배치도"]:
            slide = ppt_builder.find_slide_by_keyword(prs, kw)
            if slide:
                ppt_builder.insert_single_image(prs, kw, building_overview_img)
                logger.info(f"'{kw}' 슬라이드에 건물개황도 삽입 완료")
                inserted = True
                break
        if not inserted:
            logger.warning("건물개황도/내부구조도/호별배치도 슬라이드를 찾지 못했습니다.")

    if loc_left_img or loc_right_img:
        ppt_builder.insert_two_images_location(prs, "위치도", loc_left_img, loc_right_img)

    emit(4, "PPT 이미지 삽입", "삽입 완료", percent=85)

    # ===== STEP 5: 엑셀 토큰 =====
    if request.xlsx_path and os.path.exists(request.xlsx_path):
        # (A) 엑셀 시트 → 이미지 캡처 → PPT 노란박스 교체
        emit(5, "엑셀 반영", "엑셀 시트 캡처 중...", percent=85)
        try:
            cap_dir = str(CAPTURE_DIR)
            sheet_images = excel_handler.capture_excel_sheets_to_images(request.xlsx_path, cap_dir)
            if sheet_images:
                excel_handler.insert_excel_sheets_into_ppt(prs, sheet_images)
                logger.info(f"엑셀 시트 {len(sheet_images)}개 PPT 삽입 완료")
            else:
                logger.warning("엑셀 시트 캡처 결과 없음")
        except Exception as e:
            logger.warning(f"엑셀 시트 캡처/삽입 실패: {e}")

        # (B) 기존 엑셀 토큰 (EXCEL_CELL, EXCEL_CALC 등)
        emit(5, "엑셀 반영", "엑셀 토큰 적용 중...", percent=88)
        try:
            excel_handler.apply_excel_tokens_to_ppt(prs, request.xlsx_path)
        except Exception as e:
            logger.warning(f"엑셀 토큰 반영 실패: {e}")

        emit(5, "엑셀 반영", "엑셀 반영 완료", percent=90)

    # ===== STEP 6: 저장 =====
    emit(6, "저장", "PPT 저장 중...", percent=90)
    output_file = settings.output_file
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    ppt_builder.save_pptm_preserve_vba(settings.pptm_template, prs, output_file)

    cleanup_generated_files()

    emit(6, "저장", "완료!", status="completed", percent=100)
    logger.info(f"보고서 생성 완료: {output_file}")

    return {
        "success": True,
        "output_file": output_file,
        "message": "보고서 생성이 완료되었습니다.",
        "data": data,
    }
