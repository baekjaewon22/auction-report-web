@echo off
REM Windows 개발 서버 실행

echo ===== 백엔드 서버 시작 (port 8000) =====
start "Backend" cmd /c "cd backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo ===== 프론트엔드 서버 시작 (port 5173) =====
start "Frontend" cmd /c "cd frontend && npm run dev"

echo.
echo 프론트엔드: http://localhost:5173
echo 백엔드 API: http://localhost:8000/api/health
echo.
echo 각 창을 닫으면 서버가 종료됩니다.
pause
