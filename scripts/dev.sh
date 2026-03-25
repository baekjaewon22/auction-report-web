#!/bin/bash
# 개발 서버 실행 (백엔드 + 프론트엔드 동시)

echo "===== 백엔드 서버 시작 (port 8000) ====="
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
cd ..

echo "===== 프론트엔드 서버 시작 (port 5173) ====="
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "프론트엔드: http://localhost:5173"
echo "백엔드 API: http://localhost:8000/api/health"
echo ""
echo "종료: Ctrl+C"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
