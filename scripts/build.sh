#!/bin/bash
# 빌드 스크립트: React 빌드 → PyInstaller EXE 패키징

set -e

echo "===== 1) React 프론트엔드 빌드 ====="
cd frontend
npm install
npm run build
cd ..

echo "===== 2) PyInstaller EXE 빌드 ====="
pip install -r backend/requirements.txt
pyinstaller build_exe.spec --clean

echo "===== 빌드 완료 ====="
echo "결과: dist/AuctionReportGenerator/"
