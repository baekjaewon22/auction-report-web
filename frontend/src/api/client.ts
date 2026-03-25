const API_BASE = '/api'

export interface ReportRequest {
  url: string
  myauction_id: string
  myauction_pw: string
  remember_login: boolean
  xlsx_path?: string
}

export interface ProgressUpdate {
  step: number
  total_steps: number
  title: string
  message: string
  status: 'running' | 'completed' | 'error'
  percent: number
}

export interface ReportResult {
  success: boolean
  output_file?: string
  message: string
}

export async function startReport(req: ReportRequest): Promise<{ task_id: string }> {
  const res = await fetch(`${API_BASE}/report/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`서버 오류: ${res.status}`)
  return res.json()
}

export async function getProgress(taskId: string): Promise<{ updates: ProgressUpdate[] }> {
  const res = await fetch(`${API_BASE}/report/progress/${taskId}`)
  if (!res.ok) throw new Error(`진행상황 조회 실패`)
  return res.json()
}

export function downloadReport(): string {
  return `${API_BASE}/report/download`
}

export async function uploadExcel(file: File): Promise<{ path: string; filename: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/upload/excel`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('엑셀 업로드 실패')
  return res.json()
}

export function connectWebSocket(
  taskId: string,
  onMessage: (update: ProgressUpdate) => void,
  onClose?: () => void,
): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/progress/${taskId}`)

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      if (data.type === 'ping') return
      onMessage(data as ProgressUpdate)
    } catch {}
  }
  ws.onclose = () => onClose?.()

  return ws
}
