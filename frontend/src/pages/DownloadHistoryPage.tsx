import { useEffect, useState } from 'react'
import { downloadHistoryItem, getDownloadHistory } from '../api/client'
import type { DownloadFormat, DownloadHistoryItem, OutputType } from '../api/client'

interface Props {
  onBack: () => void
}

export default function DownloadHistoryPage({ onBack }: Props) {
  const [items, setItems] = useState<DownloadHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadHistory = async () => {
    setLoading(true)
    try {
      const result = await getDownloadHistory()
      setItems(result.items || [])
      setError('')
    } catch {
      setError('다운로드 이력을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">최근 20개 보관</p>
          <h2 className="text-2xl font-bold text-gray-900">다운로드 이력</h2>
        </div>
        <button type="button" className="btn-secondary" onClick={onBack}>
          돌아가기
        </button>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">저장된 다운로드 내역</h3>
            <p className="text-xs text-gray-500 mt-0.5">20개를 초과하면 오래된 내역부터 자동 삭제됩니다.</p>
          </div>
          <button type="button" className="btn-secondary text-sm py-2" onClick={loadHistory}>
            새로고침
          </button>
        </div>

        {loading && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            이력을 불러오는 중...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            아직 다운로드 이력이 없습니다.
          </div>
        )}

        {!loading && !error && items.length > 0 && (
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
