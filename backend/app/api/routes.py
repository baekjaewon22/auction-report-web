# -*- coding: utf-8 -*-
"""
API 라우트 + WebSocket
"""

import os
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

from ..models.schemas import ReportRequest, ProgressUpdate, ReportResult
from ..services.orchestrator import generate_report
from ..core.config import settings, OUTPUT_DIR, CAPTURE_DIR, ensure_dirs

logger = logging.getLogger(__name__)
router = APIRouter()

# 진행상황 저장소 (간단한 in-memory)
progress_store: dict[str, list[ProgressUpdate]] = {}
active_websockets: dict[str, list[WebSocket]] = {}


@router.get("/health")
async def health_check():
    return {"status": "ok", "title": settings.app_title}


@router.post("/report/generate", response_model=ReportResult)
async def api_generate_report(request: ReportRequest):
    """보고서 생성 (동기적 실행, 결과 반환)"""
    import uuid
    task_id = str(uuid.uuid4())[:8]

    async def _progress(update: ProgressUpdate):
        # WebSocket으로 전송
        if task_id in active_websockets:
            for ws in active_websockets[task_id]:
                try:
                    await ws.send_json(update.model_dump())
                except Exception:
                    pass
        # 메모리 저장
        if task_id not in progress_store:
            progress_store[task_id] = []
        progress_store[task_id].append(update)

    result = await asyncio.to_thread(
        lambda: asyncio.run(generate_report(request, progress_callback=_progress))
    )

    return ReportResult(
        success=result.get("success", False),
        output_file=result.get("output_file"),
        message=result.get("message", ""),
    )


@router.post("/report/start")
async def api_start_report(request: ReportRequest):
    """보고서 생성 시작 (비동기, task_id 반환)"""
    import uuid
    task_id = str(uuid.uuid4())[:8]
    progress_store[task_id] = []

    def _sync_progress(update: ProgressUpdate):
        """동기 콜백: progress 저장 (스레드 안전)"""
        progress_store.setdefault(task_id, []).append(update)

    def _run_sync():
        """별도 스레드에서 동기 실행"""
        try:
            # generate_report는 내부에서 블로킹 작업(Selenium 등)을 하므로 스레드에서 실행
            import asyncio as _aio
            result = _aio.run(generate_report(request, progress_callback=_sync_progress))
            progress_store.setdefault(task_id, []).append(
                ProgressUpdate(
                    step=6, total_steps=6,
                    title="완료" if result.get("success") else "실패",
                    message=result.get("message", ""),
                    status="completed" if result.get("success") else "error",
                    percent=100.0,
                )
            )
        except Exception as e:
            progress_store.setdefault(task_id, []).append(
                ProgressUpdate(
                    step=0, total_steps=6,
                    title="오류", message=str(e),
                    status="error", percent=0,
                )
            )

    # 별도 스레드에서 실행 → task_id 즉시 반환
    import threading
    t = threading.Thread(target=_run_sync, daemon=True)
    t.start()

    return {"task_id": task_id}


@router.get("/report/progress/{task_id}")
async def api_get_progress(task_id: str):
    """진행상황 폴링 조회"""
    updates = progress_store.get(task_id, [])
    return {"task_id": task_id, "updates": [u.model_dump() for u in updates]}


@router.get("/report/download")
async def api_download_report():
    """생성된 보고서 다운로드"""
    output_file = settings.output_file
    if not os.path.exists(output_file):
        raise HTTPException(status_code=404, detail="보고서 파일이 없습니다.")
    return FileResponse(
        output_file,
        media_type="application/vnd.ms-powerpoint.presentation.macroEnabled.12",
        filename=os.path.basename(output_file),
    )


@router.post("/upload/excel")
async def api_upload_excel(file: UploadFile = File(...)):
    """엑셀 파일 업로드"""
    ensure_dirs()
    upload_dir = OUTPUT_DIR / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = str(upload_dir / file.filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    return {"path": file_path, "filename": file.filename}


@router.websocket("/ws/progress/{task_id}")
async def ws_progress(websocket: WebSocket, task_id: str):
    """WebSocket으로 실시간 진행상황 수신"""
    await websocket.accept()

    if task_id not in active_websockets:
        active_websockets[task_id] = []
    active_websockets[task_id].append(websocket)

    try:
        # 기존 진행상황 전송
        for update in progress_store.get(task_id, []):
            await websocket.send_json(update.model_dump())

        # 연결 유지
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    finally:
        if task_id in active_websockets:
            active_websockets[task_id].remove(websocket)
