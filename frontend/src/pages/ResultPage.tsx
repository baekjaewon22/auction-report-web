import { downloadReport } from '../api/client'

interface Props {
  success: boolean
  message: string
  onBack: () => void
}

export default function ResultPage({ success, message, onBack }: Props) {
  return (
    <div className="animate-in fade-in">
      <div className="card text-center py-12">
        {success ? (
          <>
            {/* 성공 아이콘 */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">보고서 생성 완료!</h2>
            <p className="text-gray-500 mb-8">{message || '파일이 성공적으로 생성되었습니다.'}</p>
            <div className="flex items-center justify-center gap-4">
              <a
                href={downloadReport()}
                className="btn-primary inline-flex items-center gap-2"
                download
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                PPT 다운로드
              </a>
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
    </div>
  )
}
