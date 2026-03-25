import { useEffect, useState } from 'react'
import { getProgress, type ProgressUpdate } from '../api/client'

const STEP_LABELS = [
  '브라우저 준비',
  '사이트 파싱',
  'PPT 기본값 채우기',
  '문서 캡처',
  'PPT 이미지 삽입',
  '엑셀 반영',
  '저장 완료',
]

interface Props {
  taskId: string
  onComplete: (success: boolean, message: string) => void
}

export default function ProgressPage({ taskId, onComplete }: Props) {
  const [updates, setUpdates] = useState<ProgressUpdate[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [percent, setPercent] = useState(0)
  const [currentMessage, setCurrentMessage] = useState('준비 중...')
  const [status, setStatus] = useState<'running' | 'completed' | 'error'>('running')

  useEffect(() => {
    let cancelled = false
    let lastIndex = 0

    // 폴링으로 진행상황 조회 (1.5초 간격, 안정적)
    const poll = setInterval(async () => {
      if (cancelled) return
      try {
        const data = await getProgress(taskId)
        if (!data.updates || data.updates.length === 0) return

        // 새 업데이트만 처리
        const newUpdates = data.updates.slice(lastIndex)
        if (newUpdates.length === 0) return
        lastIndex = data.updates.length

        setUpdates(data.updates)

        const last = data.updates[data.updates.length - 1]
        setCurrentStep(last.step)
        setPercent(last.percent)
        setCurrentMessage(last.message)
        setStatus(last.status)

        if (last.status === 'completed' || last.status === 'error') {
          clearInterval(poll)
          cancelled = true
          setTimeout(() => onComplete(last.status === 'completed', last.message), 1500)
        }
      } catch {}
    }, 1500)

    return () => {
      cancelled = true
      clearInterval(poll)
    }
  }, [taskId])

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* 진행 카드 */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900">보고서 생성 중</h2>
          <span className="text-2xl font-bold text-primary-600">{Math.round(percent)}%</span>
        </div>

        {/* 프로그레스 바 */}
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-6">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              status === 'error'
                ? 'bg-red-500'
                : status === 'completed'
                ? 'bg-green-500'
                : 'bg-gradient-to-r from-primary-500 to-accent-500'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* 현재 상태 */}
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
          {status === 'running' && (
            <svg className="animate-spin h-5 w-5 text-primary-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {status === 'completed' && (
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          )}
          {status === 'error' && (
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          )}
          <div>
            <p className="font-medium text-gray-800">{STEP_LABELS[currentStep] || '처리 중'}</p>
            <p className="text-sm text-gray-500">{currentMessage}</p>
          </div>
        </div>
      </div>

      {/* 단계 목록 */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">진행 단계</h3>
        <div className="space-y-3">
          {STEP_LABELS.map((label, i) => {
            const isDone = i < currentStep || (i === currentStep && status === 'completed')
            const isCurrent = i === currentStep && status === 'running'
            const isFuture = i > currentStep

            return (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                  isDone ? 'bg-green-500 text-white' :
                  isCurrent ? 'bg-primary-500 text-white animate-pulse' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {isDone ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-sm ${isDone ? 'text-gray-800 font-medium' : isCurrent ? 'text-primary-700 font-semibold' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 로그 */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">실시간 로그</h3>
        <div className="bg-gray-900 rounded-xl p-4 max-h-48 overflow-y-auto font-mono text-xs">
          {updates.map((u, i) => (
            <div key={i} className={`py-0.5 ${
              u.status === 'error' ? 'text-red-400' : u.status === 'completed' ? 'text-green-400' : 'text-gray-300'
            }`}>
              [{u.title}] {u.message}
            </div>
          ))}
          {updates.length === 0 && <div className="text-gray-500">대기 중...</div>}
        </div>
      </div>
    </div>
  )
}
