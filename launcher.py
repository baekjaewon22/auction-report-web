# -*- coding: utf-8 -*-
"""
EXE 런처: PyWebView + FastAPI
- FastAPI 서버를 백그라운드 스레드로 시작
- PyWebView로 네이티브 윈도우를 띄워 React UI 표시
"""

import sys
import os
import time
import threading
import logging

# PyInstaller frozen 환경에서 경로 보정
if getattr(sys, "frozen", False):
    os.chdir(os.path.dirname(sys.executable))
    sys.path.insert(0, os.path.dirname(sys.executable))


def start_server():
    """FastAPI 서버를 백그라운드에서 실행"""
    import uvicorn
    uvicorn.run(
        "backend.app.main:app",
        host="127.0.0.1",
        port=8000,
        log_level="warning",
    )


def wait_for_server(url: str, timeout: int = 30):
    """서버가 준비될 때까지 대기"""
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(0.3)
    return False


def main():
    # 1) 서버 시작 (백그라운드 스레드)
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # 2) 서버 준비 대기
    server_url = "http://127.0.0.1:8000/api/health"
    if not wait_for_server(server_url):
        print("서버 시작 실패!")
        sys.exit(1)

    # 3) PyWebView 윈도우 열기
    try:
        import webview
        window = webview.create_window(
            title="경매 보고서 자동화",
            url="http://127.0.0.1:8000",
            width=1100,
            height=800,
            min_size=(900, 600),
            resizable=True,
            confirm_close=True,
        )
        webview.start(debug=False)
    except ImportError:
        # PyWebView 없으면 브라우저로 열기
        import webbrowser
        print("PyWebView 미설치 → 브라우저에서 열기")
        webbrowser.open("http://127.0.0.1:8000")
        print("서버 실행 중... (Ctrl+C로 종료)")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
