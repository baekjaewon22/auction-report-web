import type { OutputType } from '../api/client'
import { getUser } from '../api/auth'

interface Props {
  onSelect: (outputType: OutputType) => void
}

export default function WorkSelectPage({ onSelect }: Props) {
  const user = getUser()
  const canUseRightsCertificate = user?.role === 'admin' || user?.permission === 'special'

  return (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <p className="text-sm text-gray-500">작업 선택</p>
        <h2 className="text-2xl font-bold text-gray-900">생성할 문서를 선택하세요</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onSelect('auction_report')}
          className="card text-left hover:border-primary-300 hover:shadow-lg transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 0H5.625A2.625 2.625 0 0 0 3 4.875v14.25A2.625 2.625 0 0 0 5.625 21h12.75A2.625 2.625 0 0 0 21 18.375V11.25a9 9 0 0 0-9-9H8.25Z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-gray-900">브리핑자료</h3>
              <p className="text-sm text-gray-500 mt-1">PPT 보고서와 문서 캡처를 자동으로 구성합니다.</p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (canUseRightsCertificate) onSelect('rights_certificate')
          }}
          disabled={!canUseRightsCertificate}
          className={`card text-left transition-all ${
            canUseRightsCertificate
              ? 'hover:border-purple-300 hover:shadow-lg'
              : 'opacity-55 cursor-not-allowed'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-7.5 5.25h9M12 3.75 19.5 7.5v5.25c0 4.142-3.358 7.5-7.5 7.5s-7.5-3.358-7.5-7.5V7.5L12 3.75Z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-gray-900">권리분석 보증서</h3>
              <p className="text-sm text-gray-500 mt-1">
                {canUseRightsCertificate
                  ? '매각물건명세서와 등기부 권리분석으로 보증서를 생성합니다.'
                  : '특별 권한이 있는 사원만 사용할 수 있습니다.'}
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
