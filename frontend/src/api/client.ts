const API_BASE = '/api'

export type OutputType = 'auction_report' | 'rights_certificate'

export interface ReportRequest {
  output_type: OutputType
  url: string
  myauction_id: string
  myauction_pw: string
  remember_login: boolean
  author_name?: string
  author_title?: string
  author_phone?: string
  requester_role?: string
  requester_permission?: 'basic' | 'special'
}

export interface RightsCertificateBatchRequest {
  output_type: 'rights_certificate'
  urls: string[]
  myauction_id: string
  myauction_pw: string
  remember_login: boolean
  author_name?: string
  author_title?: string
  author_phone?: string
  requester_role?: string
  requester_permission?: 'basic' | 'special'
  start_at?: string
  interval_seconds?: number
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

export type DownloadFormat = 'pdf' | 'pptx' | 'zip'

export interface DownloadHistoryItem {
  id: string
  task_id: string
  output_type: OutputType
  title: string
  file_name: string
  created_at: string
  message: string
  exists: boolean
  formats: DownloadFormat[]
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

export async function startRightsCertificateBatch(req: RightsCertificateBatchRequest): Promise<{ task_id: string }> {
  const res = await fetch(`${API_BASE}/report/start-batch`, {
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

export function downloadReport(taskId?: string, format?: DownloadFormat): string {
  const query = format ? `?format=${format}` : ''
  return taskId ? `${API_BASE}/report/download/${taskId}${query}` : `${API_BASE}/report/download${query}`
}

export async function getDownloadHistory(): Promise<{ items: DownloadHistoryItem[]; limit: number }> {
  const res = await fetch(`${API_BASE}/report/download-history`)
  if (!res.ok) throw new Error('다운로드 이력 조회 실패')
  return res.json()
}

export function downloadHistoryItem(historyId: string, format?: DownloadFormat): string {
  const query = format ? `?format=${format}` : ''
  return `${API_BASE}/report/download-history/${historyId}${query}`
}

export function connectWebSocket(
  taskId: string,
  onMessage: (update: ProgressUpdate) => void,
  onClose?: () => void,
): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//${window.location.host}${API_BASE}/ws/progress/${taskId}`)

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
