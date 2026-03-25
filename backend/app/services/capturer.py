# -*- coding: utf-8 -*-
"""
스크린샷/캡처 서비스
- 웹 페이지 fullpage 캡처
- 관할법원안내 팝업 캡처
- 카카오맵 전자지도/위성지도 캡처
- 토지이용계획 캡처
- 임차인/등기부현황 테이블 캡처
"""

import os
import re
import time
import base64
import logging
from io import BytesIO

from PIL import Image, ImageChops
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

from ..core.config import CAPTURE_DIR, ensure_dirs
from ..core.utils import track_file, ensure_dir_for_file
from .selenium_driver import wait_document_ready, switch_to_new_window

logger = logging.getLogger(__name__)

ensure_dirs()


# ============================================================
# 공통 캡처 유틸
# ============================================================
def _capture_fullpage_png(driver) -> Image.Image:
    driver.execute_cdp_cmd("Page.enable", {})
    driver.execute_script("window.scrollTo(0, document.documentElement.scrollHeight);")
    time.sleep(0.25)
    driver.execute_script("window.scrollTo(0, 0);")
    time.sleep(0.25)
    shot = driver.execute_cdp_cmd("Page.captureScreenshot", {
        "format": "png",
        "fromSurface": True,
        "captureBeyondViewport": True,
    })
    return Image.open(BytesIO(base64.b64decode(shot["data"]))).convert("RGB")


def _get_doc_size_css(driver):
    return driver.execute_script("""
        const de = document.documentElement;
        const body = document.body;
        const w = Math.max(de.scrollWidth, body ? body.scrollWidth : 0, de.clientWidth);
        const h = Math.max(de.scrollHeight, body ? body.scrollHeight : 0, de.clientHeight);
        return {w, h};
    """)


def _get_abs_rect_css(driver, el):
    return driver.execute_script("""
        const el = arguments[0];
        const r = el.getBoundingClientRect();
        const sx = window.scrollX || document.documentElement.scrollLeft;
        const sy = window.scrollY || document.documentElement.scrollTop;
        return {left: r.left + sx, top: r.top + sy, width: r.width, height: r.height};
    """, el)


def _hide_overlays(driver):
    driver.execute_script("""
        ['#mcm_submit_wrap','#dtl_wing','#wing_wrap','#ch-plugin',
         'iframe[src*="channel.io"]'].forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.dataset.__old_display = el.style.display;
            el.style.display = 'none';
          });
        });
    """)


def _restore_overlays(driver):
    driver.execute_script("""
        document.querySelectorAll('[data-__old_display]').forEach(el => {
          el.style.display = el.dataset.__old_display || '';
          delete el.dataset.__old_display;
        });
    """)


def trim_white_margin(src_path: str, dst_path: str) -> str:
    im = Image.open(src_path).convert("RGB")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    diff = ImageChops.difference(im, bg)
    bbox = diff.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.save(dst_path)
    return dst_path


# ============================================================
# 관할법원안내 팝업
# ============================================================
def open_court_guide_popup(driver, timeout=15):
    wait = WebDriverWait(driver, timeout)
    base_handle = driver.current_window_handle
    base_handles = set(driver.window_handles)

    btn = wait.until(EC.element_to_be_clickable((
        By.XPATH,
        "//a[contains(normalize-space(.),'관할법원안내') or contains(@onclick,'court_layer')]"
    )))
    driver.execute_script("arguments[0].click();", btn)

    end = time.time() + timeout
    popup_handle = None
    while time.time() < end:
        diff = list(set(driver.window_handles) - base_handles)
        if diff:
            popup_handle = diff[0]
            break
        time.sleep(0.2)

    if not popup_handle:
        raise RuntimeError("관할법원안내 팝업 핸들을 찾지 못했습니다.")

    driver.switch_to.window(popup_handle)
    WebDriverWait(driver, 10).until(
        lambda d: "입찰" in d.page_source or "시간" in d.page_source
    )
    time.sleep(0.8)
    wait_document_ready(driver, timeout=25)

    # 시간 추출
    cst = wait.until(EC.presence_of_element_located((By.ID, "cstdate")))
    value_text = (cst.text or "").strip()

    start_time, end_time = "", ""
    m1 = re.search(r"입찰시작시간\s*([0-2]?\d:[0-5]\d)", value_text)
    m2 = re.search(r"입찰마감시간\s*([0-2]?\d:[0-5]\d)", value_text)
    if m1:
        start_time = m1.group(1)
    if m2:
        end_time = m2.group(1)

    return start_time, end_time, popup_handle


def capture_court_popup(driver, out_path: str, timeout=15):
    ensure_dir_for_file(out_path)
    wait = WebDriverWait(driver, timeout)
    wait_document_ready(driver, timeout=25)

    right_el = wait.until(EC.presence_of_element_located((By.ID, "clw_right")))
    map_el = wait.until(EC.presence_of_element_located((By.ID, "map")))
    cst_el = wait.until(EC.presence_of_element_located((By.ID, "cstdate")))

    try:
        bottom_row = cst_el.find_element(By.XPATH, "./ancestor::tr[1]")
    except Exception:
        bottom_row = cst_el

    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", bottom_row)
    time.sleep(0.2)

    full_img = _capture_fullpage_png(driver)
    doc = _get_doc_size_css(driver)
    dpr = float(driver.execute_script("return window.devicePixelRatio || 1;"))

    img_w, img_h = full_img.size
    exp_w, exp_h = doc["w"] * dpr, doc["h"] * dpr
    sx = img_w / exp_w if exp_w else 1.0
    sy = img_h / exp_h if exp_h else 1.0

    right_r = _get_abs_rect_css(driver, right_el)
    map_r = _get_abs_rect_css(driver, map_el)
    bot_r = _get_abs_rect_css(driver, bottom_row)

    left_px = max(0, int(round(right_r["left"] * dpr * sx)))
    right_px = min(img_w, int(round((right_r["left"] + right_r["width"]) * dpr * sx)))
    top_px = max(0, int(round(map_r["top"] * dpr * sy)))
    bottom_px = min(img_h, int(round((bot_r["top"] + bot_r["height"]) * dpr * sy)))

    cropped = full_img.crop((left_px, top_px, right_px, bottom_px))
    cropped.save(out_path, "PNG")
    track_file(out_path)
    return out_path


# ============================================================
# 카카오맵 캡처
# ============================================================
def capture_kakaomap(driver, out_path: str):
    ensure_dir_for_file(out_path)
    wait_document_ready(driver, timeout=30)
    time.sleep(1.2)

    driver.execute_cdp_cmd("Page.enable", {})
    shot = driver.execute_cdp_cmd("Page.captureScreenshot", {
        "format": "png", "fromSurface": True, "captureBeyondViewport": False,
    })
    full_img = Image.open(BytesIO(base64.b64decode(shot["data"]))).convert("RGB")
    w, h = full_img.size

    left_cut = min(520, max(300, int(w * 0.28)))
    cropped = full_img.crop((left_cut, 0, w, h))
    cropped.save(out_path, "PNG")
    track_file(out_path)
    return out_path


def open_kakao_and_capture(driver, popup_handle, link_text: str, out_path: str):
    before_tabs = list(driver.window_handles)

    xpath = (
        f"//a[contains(@href,'map.kakao.com') and "
        f"contains(normalize-space(.), '{link_text}')]"
    )
    end = time.time() + 15
    while time.time() < end:
        try:
            driver.switch_to.default_content()
            el = driver.find_element(By.XPATH, xpath)
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
            time.sleep(0.2)
            driver.execute_script("arguments[0].click();", el)
            break
        except Exception:
            time.sleep(0.3)

    new_handle = switch_to_new_window(driver, before_tabs, timeout=20)
    try:
        driver.maximize_window()
    except Exception:
        driver.set_window_size(1920, 1080)
    time.sleep(1.2)

    try:
        capture_kakaomap(driver, out_path)
        return out_path
    finally:
        driver.close()
        driver.switch_to.window(popup_handle)


# ============================================================
# 토지이용계획 캡처
# ============================================================
def capture_land_use_plan(driver, out_path: str, timeout=20):
    ensure_dir_for_file(out_path)
    wait = WebDriverWait(driver, timeout)
    base_handle = driver.current_window_handle
    before_handles = set(driver.window_handles)

    btn = wait.until(EC.element_to_be_clickable((
        By.XPATH, "//a[contains(normalize-space(.),'토지이용계획')]"
    )))
    driver.execute_script("arguments[0].click();", btn)

    new_handle = None
    end = time.time() + timeout
    while time.time() < end:
        diff = set(driver.window_handles) - before_handles
        if diff:
            new_handle = diff.pop()
            break
        time.sleep(0.2)

    if not new_handle:
        raise RuntimeError("토지이용계획 새 탭을 찾지 못했습니다.")

    driver.switch_to.window(new_handle)
    wait_document_ready(driver, timeout=30)
    time.sleep(1)

    driver.execute_script("""
        document.querySelectorAll('.ui-dialog, .ui-widget-overlay, .layer_pop')
            .forEach(el => el.remove());
    """)
    time.sleep(0.3)

    top_el = wait.until(EC.presence_of_element_located((
        By.XPATH, "//th[normalize-space()='소재지']/ancestor::div[contains(@class,'tbl01')][1]"
    )))
    bottom_el = wait.until(EC.presence_of_element_located((
        By.XPATH,
        "//caption[contains(normalize-space(.),'토지이용계획 - 확인도면')]"
        "/ancestor::div[contains(@class,'tbl01')][1]"
    )))

    driver.execute_script("arguments[0].scrollIntoView({block:'end'});", bottom_el)
    time.sleep(0.8)

    full_img = _capture_fullpage_png(driver)
    doc = _get_doc_size_css(driver)
    dpr = float(driver.execute_script("return window.devicePixelRatio || 1;"))

    img_w, img_h = full_img.size
    sx = img_w / (doc["w"] * dpr) if doc["w"] else 1.0
    sy = img_h / (doc["h"] * dpr) if doc["h"] else 1.0

    top_r = _get_abs_rect_css(driver, top_el)
    bot_r = _get_abs_rect_css(driver, bottom_el)

    pad = 10
    left_px = max(0, int((top_r["left"] - pad) * dpr * sx))
    right_px = min(img_w, int((top_r["left"] + top_r["width"] + pad) * dpr * sx))
    top_px = max(0, int((top_r["top"] - pad) * dpr * sy))
    bottom_px = min(img_h, int((bot_r["top"] + bot_r["height"] + pad) * dpr * sy))

    cropped = full_img.crop((left_px, top_px, right_px, bottom_px))
    cropped.save(out_path, "PNG")
    track_file(out_path)

    driver.close()
    driver.switch_to.window(base_handle)
    return out_path


# ============================================================
# 임차인/등기부현황 테이블 분할 캡처
# ============================================================
def _find_table_under_h3(driver, h3_text: str, timeout=20):
    wait = WebDriverWait(driver, timeout)
    h3 = wait.until(
        EC.presence_of_element_located((By.XPATH, f"//h3[normalize-space()='{h3_text}']"))
    )
    table = h3.find_element(
        By.XPATH,
        "./ancestor::div[@id='dtl_stock'][1]//table[contains(@class,'tbl_detail')]"
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'start'});", h3)
    time.sleep(0.2)
    return table


def capture_table_split_by_rows(driver, h3_text: str, out_prefix: str, rows_per_page=8, timeout=20):
    ensure_dir_for_file(out_prefix)
    table = _find_table_under_h3(driver, h3_text, timeout=timeout)
    rows = table.find_elements(By.XPATH, ".//tr")
    if not rows:
        raise RuntimeError(f"{h3_text}: 테이블 행이 없습니다.")

    results = []
    for i in range(0, len(rows), rows_per_page):
        chunk = rows[i:i + rows_per_page]
        _hide_overlays(driver)
        try:
            full_img = _capture_fullpage_png(driver)
            top_r = _get_abs_rect_css(driver, chunk[0])
            bot_r = _get_abs_rect_css(driver, chunk[-1])
            doc = _get_doc_size_css(driver)
            dpr = float(driver.execute_script("return window.devicePixelRatio || 1;"))

            img_w, img_h = full_img.size
            sx = img_w / (doc["w"] * dpr)
            sy = img_h / (doc["h"] * dpr)

            top_px = int(top_r["top"] * dpr * sy)
            bottom_px = int((bot_r["top"] + bot_r["height"]) * dpr * sy)
            cropped = full_img.crop((0, top_px, img_w, bottom_px))

            out_path = f"{out_prefix}_{len(results) + 1}.png"
            cropped.save(out_path, "PNG")
            track_file(out_path)
            results.append(out_path)
        finally:
            _restore_overlays(driver)

    return results


def capture_tenant_and_registry(driver):
    wait_document_ready(driver, timeout=30)
    time.sleep(1.0)

    tenant_imgs, building_imgs, land_imgs = [], [], []
    cap_dir = str(CAPTURE_DIR)

    try:
        tenant_imgs = capture_table_split_by_rows(
            driver, "임차인현황",
            os.path.join(cap_dir, "tenant_status"), rows_per_page=8
        )
        logger.info(f"임차인현황 캡처 완료 ({len(tenant_imgs)}장)")
    except Exception as e:
        logger.warning(f"임차인현황 캡처 실패: {e}")

    try:
        building_imgs = capture_table_split_by_rows(
            driver, "건물 등기부현황",
            os.path.join(cap_dir, "building_registry_status"), rows_per_page=8
        )
        logger.info(f"건물 등기부현황 캡처 완료 ({len(building_imgs)}장)")
    except TimeoutException:
        logger.info("건물 등기부현황 없음 → 스킵")
    except Exception as e:
        logger.warning(f"건물 등기부현황 캡처 실패: {e}")

    try:
        land_imgs = capture_table_split_by_rows(
            driver, "토지 등기부현황",
            os.path.join(cap_dir, "land_registry_status"), rows_per_page=8, timeout=5
        )
        logger.info(f"토지 등기부현황 캡처 완료 ({len(land_imgs)}장)")
    except TimeoutException:
        logger.info("토지 등기부현황 없음 → 스킵")
    except Exception as e:
        logger.warning(f"토지 등기부현황 캡처 실패: {e}")

    return tenant_imgs, building_imgs, land_imgs


# ============================================================
# 건물개황도 (내부구조도 / 호별배치도) 캡처
# ============================================================
def capture_building_overview(driver, out_path: str, timeout=15):
    """
    마이옥션 상세 페이지 사이드바에서 건물개황도 이미지 캡처.
    - 셀렉터: #dtlw_link > ul > li:nth-child(5) > a
    - 링크 텍스트: "내부구조도" 또는 "호별배치도" 또는 "건물개황도"
    - 클릭 → 새 탭 → 이미지 캡처 → 탭 닫기
    """
    ensure_dir_for_file(out_path)
    base_handle = driver.current_window_handle
    before_handles = set(driver.window_handles)

    # 1) 사이드바 링크 찾기 (CSS 셀렉터 우선, 없으면 텍스트로 탐색)
    link = None
    try:
        link = driver.find_element(By.CSS_SELECTOR, "#dtlw_link > ul > li:nth-child(5) > a")
    except Exception:
        pass

    if not link:
        # 텍스트 기반 탐색
        keywords = ["내부구조도", "호별배치도", "건물개황도"]
        for kw in keywords:
            try:
                link = driver.find_element(
                    By.XPATH,
                    f"//div[@id='dtlw_link']//a[contains(normalize-space(.), '{kw}')]"
                )
                if link:
                    break
            except Exception:
                continue

    if not link:
        raise RuntimeError("건물개황도/내부구조도/호별배치도 링크를 찾지 못했습니다.")

    link_text = (link.text or "").strip()
    logger.info(f"건물개황도 링크 발견: '{link_text}'")

    # 2) 클릭 → 새 탭 열기
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", link)
    time.sleep(0.3)
    driver.execute_script("arguments[0].click();", link)

    # 3) 새 탭 대기
    new_handle = None
    end = time.time() + timeout
    while time.time() < end:
        diff = list(set(driver.window_handles) - before_handles)
        if diff:
            new_handle = diff[0]
            break
        time.sleep(0.3)

    if not new_handle:
        raise RuntimeError("건물개황도 새 탭이 열리지 않았습니다.")

    driver.switch_to.window(new_handle)
    wait_document_ready(driver, timeout=20)
    time.sleep(1.5)

    try:
        # 4) 이미지 캡처 (전체 페이지)
        driver.execute_cdp_cmd("Page.enable", {})
        shot = driver.execute_cdp_cmd("Page.captureScreenshot", {
            "format": "png",
            "fromSurface": True,
            "captureBeyondViewport": True,
        })
        full_img = Image.open(BytesIO(base64.b64decode(shot["data"]))).convert("RGB")

        # 5) 이미지에서 실제 내용 영역만 크롭 (흰 여백 제거)
        #    페이지에 이미지만 있는 경우가 많으므로 non-white bbox로 트림
        bg = Image.new("RGB", full_img.size, (255, 255, 255))
        diff = ImageChops.difference(full_img, bg)
        bbox = diff.getbbox()
        if bbox:
            # 약간의 패딩 추가
            pad = 10
            x0 = max(0, bbox[0] - pad)
            y0 = max(0, bbox[1] - pad)
            x1 = min(full_img.width, bbox[2] + pad)
            y1 = min(full_img.height, bbox[3] + pad)
            full_img = full_img.crop((x0, y0, x1, y1))

        full_img.save(out_path, "PNG")
        track_file(out_path)
        logger.info(f"건물개황도 캡처 완료: {out_path}")
        return out_path

    finally:
        # 6) 새 탭 닫고 원래 탭으로 복귀
        try:
            driver.close()
        except Exception:
            pass
        driver.switch_to.window(base_handle)
