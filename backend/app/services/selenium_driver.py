# -*- coding: utf-8 -*-
"""
Selenium WebDriver 관리
- Chrome 드라이버 생성/종료
- 마이옥션 로그인
- 공통 헬퍼 (탭 전환, 팝업 처리 등)
"""

import os
import re
import time
import logging
import tempfile
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    ElementClickInterceptedException,
    ElementNotInteractableException,
    StaleElementReferenceException,
    TimeoutException,
    SessionNotCreatedException,
    WebDriverException,
)

from ..core.config import APP_ROOT, IS_WINDOWS

logger = logging.getLogger(__name__)

WINDOW_WIDTH = 1500
WINDOW_HEIGHT = 900
SELENIUM_PROFILE_DIR = str(APP_ROOT / "selenium_profile")


def _build_chrome_options(profile_dir: str = "", headless: bool = False):
    options = webdriver.ChromeOptions()
    options.add_argument(f"--window-size={WINDOW_WIDTH},{WINDOW_HEIGHT}")
    options.add_argument("--lang=ko-KR")
    options.add_argument("--disable-notifications")
    options.add_argument("--disable-popup-blocking")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-features=RendererCodeIntegrity")
    options.add_experimental_option("excludeSwitches", ["enable-logging", "enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.page_load_strategy = "eager"

    if headless:
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")

    if profile_dir:
        abs_profile = os.path.abspath(profile_dir)
        os.makedirs(abs_profile, exist_ok=True)
        options.add_argument(f"--user-data-dir={abs_profile}")

    return options


def _short_webdriver_error(exc: Exception) -> str:
    text = str(exc or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:500]


def _chrome_start_error(exc: Exception) -> str:
    message = _short_webdriver_error(exc)
    lowered = message.lower()
    if "user data directory is already in use" in lowered or "already in use" in lowered:
        return "Chrome 브라우저 실행 실패: 저장 로그인 프로필이 이미 사용 중입니다. 잠시 후 다시 시도하거나 실행 중인 자동화 Chrome을 종료해 주세요."
    if "only supports chrome version" in lowered or ("session not created" in lowered and "chrome version" in lowered):
        return f"Chrome 브라우저 실행 실패: 크롬 버전과 ChromeDriver 환경이 맞지 않습니다. ({message})"
    return f"Chrome 브라우저 실행 실패: {message or '원인을 확인하지 못했습니다.'}"


def _create_driver_legacy(profile_dir: str = "", headless: bool = False) -> webdriver.Chrome:
    try:
        options = _build_chrome_options(profile_dir=profile_dir, headless=headless)
        driver = webdriver.Chrome(service=ChromeService(), options=options)
    except SessionNotCreatedException as e:
        raise RuntimeError(
            "Chrome 브라우저 실행 실패: 크롬 버전과 Selenium 환경이 맞지 않습니다."
        ) from e
    except WebDriverException as e:
        if profile_dir:
            logger.warning("저장 프로필 실패 → 임시 프로필로 재시도")
            temp_profile = os.path.join(
                tempfile.gettempdir(),
                f"myauction_chrome_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            )
            try:
                options = _build_chrome_options(profile_dir=temp_profile, headless=headless)
                driver = webdriver.Chrome(service=ChromeService(), options=options)
            except Exception as e2:
                raise RuntimeError("Chrome 실행 실패. 크롬 설치 및 기존 창 종료를 확인하세요.") from e2
        else:
            raise RuntimeError("Chrome 실행 실패. 크롬 설치를 확인하세요.") from e

    driver.set_page_load_timeout(60)
    driver.set_script_timeout(60)
    driver.implicitly_wait(1)
    return driver


def create_driver(profile_dir: str = "", headless: bool = False) -> webdriver.Chrome:
    first_error = None
    attempts = [profile_dir or ""]

    if profile_dir:
        temp_profile = os.path.join(
            tempfile.gettempdir(),
            f"myauction_chrome_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        )
        attempts.append(temp_profile)

    for idx, candidate_profile in enumerate(attempts):
        try:
            if idx > 0:
                logger.warning(
                    f"저장 Chrome 프로필 실행 실패, 임시 프로필로 재시도: {_short_webdriver_error(first_error)}"
                )
            options = _build_chrome_options(profile_dir=candidate_profile, headless=headless)
            driver = webdriver.Chrome(service=ChromeService(), options=options)
            driver.set_page_load_timeout(60)
            driver.set_script_timeout(60)
            driver.implicitly_wait(1)
            return driver
        except (SessionNotCreatedException, WebDriverException) as e:
            if first_error is None:
                first_error = e
            if idx == len(attempts) - 1:
                raise RuntimeError(_chrome_start_error(e)) from e

    raise RuntimeError(_chrome_start_error(first_error))


def _dismiss_alert(driver) -> str:
    """alert가 있으면 텍스트를 반환하고 닫음. 없으면 빈 문자열."""
    try:
        from selenium.webdriver.common.alert import Alert
        alert = Alert(driver)
        text = alert.text or ""
        alert.accept()
        return text
    except Exception:
        return ""


def _dismiss_click_interceptors(driver) -> None:
    _dismiss_alert(driver)
    try:
        driver.execute_script("""
            const selectors = [
              '.ui-dialog-titlebar-close',
              '.btn_close',
              '.popup_close',
              '.layer_close',
              '.close',
              '[aria-label="Close"]',
              '[aria-label="닫기"]',
              '[title="닫기"]',
              'button[onclick*="close"]',
              'a[onclick*="close"]'
            ];
            for (const selector of selectors) {
              for (const el of document.querySelectorAll(selector)) {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                if (
                  style.display !== 'none' &&
                  style.visibility !== 'hidden' &&
                  rect.width > 0 &&
                  rect.height > 0
                ) {
                  el.click();
                  return true;
                }
              }
            }
            const event = new KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              keyCode: 27,
              which: 27,
              bubbles: true
            });
            document.dispatchEvent(event);
            window.dispatchEvent(event);
            return false;
        """)
    except Exception:
        pass


def safe_click(driver, element, *, settle: float = 0.2) -> bool:
    last_err = None
    for attempt in range(2):
        try:
            driver.execute_script(
                "arguments[0].scrollIntoView({block:'center', inline:'center'});",
                element,
            )
            time.sleep(settle)
        except Exception as e:
            last_err = e

        try:
            element.click()
            return True
        except (ElementClickInterceptedException, ElementNotInteractableException, StaleElementReferenceException) as e:
            last_err = e
            logger.warning(f"Selenium click retry ({attempt + 1}/2): {e}")
            _dismiss_click_interceptors(driver)
            time.sleep(0.25)
        except Exception as e:
            last_err = e
            break

    try:
        driver.execute_script("arguments[0].click();", element)
        return True
    except Exception as e:
        last_err = e

    if last_err:
        raise last_err
    return False


def login_myauction(driver: webdriver.Chrome, user_id: str, user_pw: str):
    driver.get("https://www.my-auction.co.kr/member/login.php")
    logger.info("마이옥션 로그인 페이지 접속")
    time.sleep(1)

    # 페이지 로드 중 alert 있으면 먼저 닫기
    _dismiss_alert(driver)

    wait = WebDriverWait(driver, 15)

    # 이미 로그인 상태면 스킵
    try:
        if "logout" in (driver.page_source or "").lower():
            logger.info("이미 로그인 상태 → 스킵")
            return
    except Exception:
        pass

    # 로그인 시도 (최대 2회)
    for attempt in range(1, 3):
        try:
            # alert가 남아있으면 닫기
            _dismiss_alert(driver)

            id_box = wait.until(EC.presence_of_element_located((By.ID, "id")))
            pw_box = driver.find_element(By.ID, "passwd")

            # 기존 값 완전 제거 후 입력
            id_box.clear()
            time.sleep(0.2)
            driver.execute_script("arguments[0].value = '';", id_box)
            id_box.send_keys(user_id)

            pw_box.clear()
            time.sleep(0.2)
            driver.execute_script("arguments[0].value = '';", pw_box)
            pw_box.send_keys(user_pw)
            time.sleep(0.3)

            # Enter 대신 로그인 버튼 클릭 시도
            try:
                login_btn = driver.find_element(By.CSS_SELECTOR, "input[type='submit'], button[type='submit'], .btn_login, #login_btn")
                safe_click(driver, login_btn)
            except Exception:
                # 버튼 못 찾으면 Enter
                pw_box.send_keys(Keys.RETURN)

            logger.info(f"로그인 시도 ({attempt}회)")
            time.sleep(2)

            # alert 확인 (로그인 실패 시 "회원정보가 일치하지 않습니다" 등)
            alert_text = _dismiss_alert(driver)
            if alert_text:
                logger.warning(f"로그인 alert: {alert_text}")
                if attempt < 2:
                    logger.info("재시도합니다...")
                    driver.get("https://www.my-auction.co.kr/member/login.php")
                    time.sleep(1)
                    _dismiss_alert(driver)
                    continue
                else:
                    raise RuntimeError(f"로그인 실패: {alert_text}")

            # 로그인 성공 확인
            try:
                page_src = driver.page_source or ""
                if "logout" in page_src.lower() or "로그아웃" in page_src:
                    logger.info("로그인 성공 확인")
                    return
            except Exception:
                pass

            # 명시적 확인 못해도 alert 없으면 성공으로 간주
            logger.info("로그인 완료 (가정)")
            return

        except RuntimeError:
            raise
        except Exception as e:
            logger.warning(f"로그인 시도 {attempt} 실패: {e}")
            _dismiss_alert(driver)
            if attempt >= 2:
                raise RuntimeError(f"로그인 실패: {e}")


def click_tab_safe(wait: WebDriverWait, driver: webdriver.Chrome, candidates: list):
    last_err = None
    for text in candidates:
        try:
            el = wait.until(EC.element_to_be_clickable((By.PARTIAL_LINK_TEXT, text)))
            safe_click(driver, el)
            return text
        except Exception as e:
            last_err = e
    raise last_err if last_err else RuntimeError("탭 클릭 실패")


def switch_to_new_window(driver, before_handles, timeout=15):
    end = time.time() + timeout
    before = set(before_handles)
    while time.time() < end:
        after = set(driver.window_handles)
        new_handles = list(after - before)
        if new_handles:
            driver.switch_to.window(new_handles[0])
            return new_handles[0]
        time.sleep(0.2)
    raise RuntimeError("새 탭(창) 핸들을 찾지 못했습니다.")


def wait_document_ready(driver, timeout=25):
    WebDriverWait(driver, timeout).until(
        lambda d: d.execute_script("return document.readyState") == "complete"
    )
