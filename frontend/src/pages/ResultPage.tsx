import { useEffect, useState } from 'react'
import { downloadHistoryItem, downloadReport, getDownloadHistory } from '../api/client'
import type { DownloadFormat, DownloadHistoryItem, OutputType } from '../api/client'

interface Props {
  success: boolean
  message: string
  taskId: string
  outputType: OutputType
  onBack: () => void
}

export default function ResultPage({ success, message, taskId, outputType, onBack }: Props) {
  const outputLabel = outputType === 'rights_certificate' ? '권리분석 보증서' : '보고서'
  const isRightsCertificate = outputType === 'rights_certificate'
  const [history, setHistory] = useState<DownloadHistoryItem[]>([])
  const [historyError, setHistoryError] = useState('')

  const loadHistory = async () => {
    try {
      const result = await getDownloadHistory()
      setHistory(result.items || [])
      setHistoryError('')
    } catch {
      setHistoryError('다운로드 이력을 불러오지 못했습니다.')
    }
  }

  useEffect(() => {
    loadHistory()
  }, [taskId, success])

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="card text-center py-12">
        {success ? (
          <>
            {/* 성공 아이콘 */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{outputLabel} 생성 완료!</h2>
            <p className="text-gray-500 mb-8">{message || '파일이 성공적으로 생성되었습니다.'}</p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <a
                href={downloadReport(taskId, isRightsCertificate ? 'pptx' : undefined)}
                className="btn-primary inline-flex items-center gap-2"
                download
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {isRightsCertificate ? 'PPTX 다운로드' : 'PPT 다운로드'}
              </a>
              {isRightsCertificate && (
                <a
                  href={downloadReport(taskId, 'pdf')}
                  className="btn-secondary inline-flex items-center gap-2"
                  download
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-.988-2.387l-4.5-4.5A3.375 3.375 0 0 0 11.625 3H8.25A2.25 2.25 0 0 0 6 5.25v13.5A2.25 2.25 0 0 0 8.25 21h7.5A2.25 2.25 0 0 0 18 18.75" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4.5A1.5 1.5 0 0 0 13.5 9H18M9.75 15h4.5m-4.5 3h4.5" />
                  </svg>
                  PDF 출력물 저장
                </a>
              )}
              <button className="btn-secondary" onClick={onBack}>
                새로 만들기
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 실패 아이콘 */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">생성 실패</h2>
            <p className="text-red-500 mb-8">{message || '알 수 없는 오류가 발생했습니다.'}</p>
            <button className="btn-primary" onClick={onBack}>
              다시 시도
            </button>
          </>
        )}
      </div>
      <DownloadHistoryPanel items={history} error={historyError} onRefresh={loadHistory} />
    </div>
  )
}

function DownloadHistoryPanel({
  items,
  error,
  onRefresh,
}: {
  items: DownloadHistoryItem[]
  error: string
  onRefresh: () => void
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">다운로드 이력</h3>
          <p className="text-xs text-gray-500 mt-0.5">최근 20개까지만 보관됩니다.</p>
        </div>
        <button type="button" className="btn-secondary text-sm py-2" onClick={onRefresh}>
          새로고침
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          아직 다운로드 이력이 없습니다.
        </div>
      )}

      {!error && items.length > 0 && (
        <div className="divide-y divide-gray-100">
          {items.map((item) => (
            <div key={item.id} className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">{item.file_name || item.title}</p>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${item.exists ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {item.exists ? '파일 보관 중' : '파일 없음'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {outputTypeLabel(item.output_type)} · {formatHistoryDate(item.created_at)}
                </p>
                {item.message && <p className="text-xs text-gray-400 mt-1 truncate">{item.message}</p>}
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {item.exists ? (
                  historyFormats(item).map((format) => (
                    <a
                      key={format || 'default'}
                      href={downloadHistoryItem(item.id, format || undefined)}
                      className="btn-secondary text-sm py-2"
                      download
                    >
                      {formatLabel(format, item)}
                    </a>
                  ))
                ) : (
                  <span className="text-sm text-gray-400">재다운로드 불가</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function historyFormats(item: DownloadHistoryItem): Array<DownloadFormat | ''> {
  if (item.formats.includes('zip')) return ['zip']
  const formats: Array<DownloadFormat | ''> = []
  if (item.formats.includes('pptx')) formats.push('pptx')
  if (item.formats.includes('pdf')) formats.push('pdf')
  if (formats.length === 0) formats.push('')
  return formats
}

function formatLabel(format: DownloadFormat | '', item: DownloadHistoryItem): string {
  if (format === 'zip') return 'ZIP 다운로드'
  if (format === 'pptx') return item.output_type === 'rights_certificate' ? 'PPTX' : 'PPT'
  if (format === 'pdf') return 'PDF'
  return '다운로드'
}

function outputTypeLabel(outputType: OutputType): string {
  return outputType === 'rights_certificate' ? '권리분석 보증서' : '브리핑자료'
}

function formatHistoryDate(value: string): string {
  if (!value) return '일시 확인 필요'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
