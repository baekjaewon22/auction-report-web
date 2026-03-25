# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec 파일
빌드: pyinstaller build_exe.spec
"""

import os

block_cipher = None
ROOT = os.path.abspath('.')

a = Analysis(
    ['launcher.py'],
    pathex=[ROOT],
    binaries=[],
    datas=[
        ('frontend/dist', 'frontend/dist'),       # 빌드된 React
        ('backend/templates', 'backend/templates'), # PPT 템플릿
        ('backend/bin', 'backend/bin'),             # poppler, tesseract
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'backend.app.main',
        'backend.app.api.routes',
        'backend.app.services.orchestrator',
        'backend.app.services.crawler',
        'backend.app.services.capturer',
        'backend.app.services.pdf_processor',
        'backend.app.services.ppt_builder',
        'backend.app.services.excel_handler',
        'backend.app.services.selenium_driver',
        'selenium.webdriver.chrome.webdriver',
        'selenium.webdriver.chrome.service',
        'selenium.webdriver.chrome.options',
        'selenium.webdriver.common.by',
        'selenium.webdriver.common.keys',
        'selenium.webdriver.support.ui',
        'selenium.webdriver.support.expected_conditions',
        'pptx',
        'fitz',
        'PIL',
        'numpy',
        'openpyxl',
        'bs4',
        'webview',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='AuctionReportGenerator',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # GUI 모드 (콘솔 없음)
    icon='backend/bin/icon.ico' if os.path.exists('backend/bin/icon.ico') else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='AuctionReportGenerator',
)
