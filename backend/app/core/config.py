# -*- coding: utf-8 -*-
"""
앱 설정 / 경로 관리
- EXE(PyInstaller) / 일반 Python 실행 모두 대응
- .env 파일 지원
"""

import os
import sys
import json
import platform
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings


# ============================================================
# 실행 환경 감지
# ============================================================
IS_FROZEN = getattr(sys, "frozen", False)
IS_WINDOWS = platform.system() == "Windows"


def get_app_root() -> Path:
    if IS_FROZEN:
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass).resolve()
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent.parent  # backend/


APP_ROOT = get_app_root()


# ============================================================
# 디렉토리 경로
# ============================================================
TEMPLATES_DIR = APP_ROOT / "templates"
BIN_DIR = APP_ROOT / "bin"
OUTPUT_DIR = APP_ROOT / "output"
CAPTURE_DIR = APP_ROOT / "capture"
PDF_DOWNLOAD_DIR = APP_ROOT / "download_pdf"
LOGS_DIR = APP_ROOT / "logs"
FRONTEND_DIST_DIR = APP_ROOT.parent / "frontend" / "dist"

# Poppler (PDF → 이미지)
POPPLER_BIN_DIR = BIN_DIR / "poppler" / "Library" / "bin"
POPPLER_FALLBACKS = [
    r"C:\poppler-25.12.0\Library\bin",
    r"C:\poppler\Library\bin",
    "/usr/bin",  # Linux
]

# Tesseract (OCR)
TESSERACT_FALLBACKS = [
    str(BIN_DIR / "tesseract" / "tesseract.exe"),
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    "/usr/bin/tesseract",  # Linux
]


def find_poppler_path() -> str:
    if POPPLER_BIN_DIR.exists():
        return str(POPPLER_BIN_DIR)
    for p in POPPLER_FALLBACKS:
        if os.path.exists(p):
            return p
    return ""


def find_tesseract_path() -> str:
    for p in TESSERACT_FALLBACKS:
        if os.path.exists(p):
            return p
    return "tesseract"  # PATH에 있길 바라며


POPPLER_PATH = find_poppler_path()
TESSERACT_PATH = find_tesseract_path()

# Selenium 프로필
SELENIUM_PROFILE_DIR = str(APP_ROOT / "selenium_profile")


def ensure_dirs() -> None:
    for d in [OUTPUT_DIR, CAPTURE_DIR, PDF_DOWNLOAD_DIR, LOGS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


# ============================================================
# 사용자 설정 (JSON)
# ============================================================
APP_NAME = "MyAuctionPPT"
CONFIG_FILENAME = "config.json"


def get_app_dir() -> str:
    if IS_WINDOWS:
        local = os.environ.get("LOCALAPPDATA")
        if local and os.path.isdir(local):
            base = os.path.join(local, APP_NAME)
        else:
            base = os.path.join(os.path.expanduser("~"), f".{APP_NAME.lower()}")
    else:
        base = os.path.join(os.path.expanduser("~"), f".{APP_NAME.lower()}")
    os.makedirs(base, exist_ok=True)
    return base


def get_config_path() -> str:
    return os.path.join(get_app_dir(), CONFIG_FILENAME)


def load_config() -> dict:
    path = get_config_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def save_config(cfg: dict) -> None:
    path = get_config_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


# ============================================================
# FastAPI Settings
# ============================================================
class Settings(BaseSettings):
    app_title: str = "경매 보고서 자동화"
    debug: bool = False
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # 템플릿
    pptm_template: str = str(TEMPLATES_DIR / "샘플.pptm")
    output_file: str = str(OUTPUT_DIR / "샘플_적용본.pptm")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
