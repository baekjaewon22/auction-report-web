import { useEffect, useState } from 'react'
import { startReport, startRightsCertificateBatch, type OutputType } from '../api/client'
import { getMyAuctionCredentials, getProfile, getUser, recordUsageLog } from '../api/auth'

interface Props {
  outputType: OutputType
  onStart: (taskId: string, outputType: OutputType) => void
  onBack: () => void
}

export default function HomePage({ outputType, onStart, onBack }: Props) {
  const [url, setUrl] = useState('')
  const [urlsText, setUrlsText] = useState('')
  const [myaId, setMyaId] = useState('')
  const [myaPw, setMyaPw] = useState('')
  const [credentialLoaded, setCredentialLoaded] = useState(false)
  const [credentialMaskedId, setCredentialMaskedId] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [authorTitle, setAuthorTitle] = useState('')
  const [authorPhone, setAuthorPhone] = useState('')
  const [remember, setRemember] = useState(true)
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [startAt, setStartAt] = useState('')
  const [intervalSeconds, setIntervalSeconds] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isRightsCertificate = outputType === 'rights_certificate'
  const currentUser = getUser()
  const canUseRightsCertificate = currentUser?.role === 'admin' || currentUser?.permission === 'special'

  useEffect(() => {
    let cancelled = false
    async function loadCredentials() {
      try {
        const [profile, credentials] = await Promise.all([
          getProfile().catch(() => {
            const user = getUser()
            return {
              username: user?.username || '',
              role: user?.role || 'user',
              name: user?.name || '',
              title: user?.title || '',
              phone: user?.phone || '',
            }
          }),
          getMyAuctionCredentials(),
        ])
        if (cancelled) return
        setAuthorName(profile.name || '')
        setAuthorTitle(profile.title || '')
        setAuthorPhone(profile.phone || '')
        if (credentials.has_credentials) {
          setMyaId(credentials.myauction_id)
          setMyaPw(credentials.myauction_pw)
          setCredentialMaskedId(credentials.myauction_id_masked || credentials.myauction_id)
          setCredentialLoaded(true)
        } else {
          setCredentialLoaded(false)
        }
      } catch {
        if (!cancelled) {
          setCredentialLoaded(false)
        }
      }
    }
    loadCredentials()
    return () => {
      cancelled = true
    }
  }, [])

  const parseRightsUrls = () => urlsText
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const handleSubmit = async () => {
    const rightsUrls = parseRightsUrls()
    if (isRightsCertificate && !canUseRightsCertificate) {
      setError('권리분석 보증서는 특별 권한이 있는 사원만 생성할 수 있습니다.')
      return
    }
    if (isRightsCertificate ? rightsUrls.length === 0 : !url.trim()) {
      setError('경매 상세 URL을 입력해주세요.')
      return
    }
    if (!myaId.trim() || !myaPw.trim()) {
      setError('저장된 마이옥션 계정 정보가 없습니다.')
      return
    }
    if (!authorName.trim() || !authorTitle.trim() || !authorPhone.trim()) {
      setError('기본설정관리에서 성명, 직책, 전화번호를 먼저 저장해주세요.')
      return
    }

    setLoading(true)
    setError('')

    // 즉시 진행 페이지로 전환 → 백그라운드에서 API 호출
    try {
      const shouldBatchRights = isRightsCertificate && (rightsUrls.length > 1 || scheduleEnabled)
      const result = shouldBatchRights
        ? await startRightsCertificateBatch({
            output_type: 'rights_certificate',
            urls: rightsUrls.map((item) => item.startsWith('//') ? 'https:' + item : item),
            myauction_id: myaId,
            myauction_pw: myaPw,
            remember_login: remember,
            author_name: authorName,
            author_title: authorTitle,
            author_phone: authorPhone,
            requester_role: currentUser?.role || 'user',
            requester_permission: currentUser?.permission || 'basic',
            start_at: scheduleEnabled && startAt ? startAt : undefined,
            interval_seconds: intervalSeconds,
          })
        : await startReport({
            output_type: outputType,
            url: isRightsCertificate
              ? (rightsUrls[0].startsWith('//') ? 'https:' + rightsUrls[0] : rightsUrls[0])
              : (url.startsWith('//') ? 'https:' + url : url),
            myauction_id: myaId,
            myauction_pw: myaPw,
            remember_login: remember,
            author_name: authorName,
            author_title: authorTitle,
            author_phone: authorPhone,
            requester_role: currentUser?.role || 'user',
            requester_permission: currentUser?.permission || 'basic',
          })
      await recordUsageLog({
        action: 'report_start',
        output_type: outputType,
        task_id: result.task_id,
        detail: outputType === 'rights_certificate' ? '권리분석 보증서 생성' : '브리핑자료 생성',
        url: isRightsCertificate ? rightsUrls[0] : url,
        urls_count: isRightsCertificate ? rightsUrls.length : 1,
      })
      // task_id 받자마자 즉시 진행 페이지로
      onStart(result.task_id, outputType)
    } catch (e: any) {
      setError(e.message || '서버 연결 실패')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">{isRightsCertificate ? '권리분석 보증서' : '브리핑자료'}</p>
          <h2 className="text-2xl font-bold text-gray-900">
            {isRightsCertificate ? '권리분석 보증서 생성' : '브리핑자료 생성'}
          </h2>
        </div>
        <button type="button" className="btn-secondary" onClick={onBack}>
          다른 작업 선택
        </button>
      </div>

      {/* URL 입력 */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L5.75 8.688" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-800">
            {isRightsCertificate ? '권리분석 보증서 경매 물건 URL' : '경매 물건 URL'}
          </h2>
        </div>
        {isRightsCertificate ? (
          <textarea
            className="input-field min-h-36 resize-y"
            placeholder={'https://www.my-auction.co.kr/view/...\nhttps://www.my-auction.co.kr/view3/...'}
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
          />
        ) : (
          <input
            type="text"
            className="input-field"
            placeholder="https://www.my-auction.co.kr/view/... 또는 /view3/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}
        {isRightsCertificate && (
          <p className="mt-2 text-xs text-gray-500">
            {parseRightsUrls().length > 0 ? `${parseRightsUrls().length}건 입력됨` : 'view 또는 view3 주소를 한 줄에 한 개씩 입력하거나 쉼표로 구분'}
          </p>
        )}
      </div>

      {/* 로그인 정보 */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-800">마이옥션 로그인</h2>
        </div>
        {credentialLoaded ? (
          <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3">
            <p className="text-sm font-medium text-green-800">저장된 마이옥션 계정을 사용합니다.</p>
            <p className="text-xs text-green-600 mt-0.5">{credentialMaskedId || myaId}</p>
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <p className="text-sm font-medium text-amber-800">저장된 마이옥션 계정이 없습니다.</p>
            <p className="text-xs text-amber-700 mt-0.5">상단의 기본설정관리에서 마이옥션 계정을 먼저 저장해주세요.</p>
          </div>
        )}
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-500">자동로그인 (세션 유지)</span>
        </label>
      </div>

      {isRightsCertificate && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-800">반복 작업 스케줄</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-gray-200 px-4 py-3">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">예약 실행</span>
            </label>
            <div>
              <label className="label">물건 간 대기(초)</label>
              <input
                type="number"
                min={0}
                className="input-field"
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
          {scheduleEnabled && (
            <div className="mt-4">
              <label className="label">시작 시간</label>
              <input
                type="datetime-local"
                className="input-field"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* 실행 버튼 */}
      <button
        className="btn-primary w-full text-lg py-4"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            시작 중...
          </span>
        ) : (
          outputType === 'rights_certificate' ? '권리분석 보증서 생성 시작' : '보고서 생성 시작'
        )}
      </button>
    </div>
  )
}
