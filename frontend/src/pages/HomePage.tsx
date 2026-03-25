import { useState, useRef } from 'react'
import { startReport, uploadExcel } from '../api/client'

interface Props {
  onStart: (taskId: string) => void
}

export default function HomePage({ onStart }: Props) {
  const [url, setUrl] = useState('')
  const [myaId, setMyaId] = useState('')
  const [myaPw, setMyaPw] = useState('')
  const [remember, setRemember] = useState(true)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelPath, setExcelPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleExcelSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelFile(file)
    try {
      const result = await uploadExcel(file)
      setExcelPath(result.path)
    } catch {
      setError('엑셀 파일 업로드 실패')
    }
  }

  const handleSubmit = async () => {
    if (!url.trim()) {
      setError('경매 상세 URL을 입력해주세요.')
      return
    }
    if (!myaId.trim() || !myaPw.trim()) {
      setError('마이옥션 아이디/비밀번호를 입력해주세요.')
      return
    }

    setLoading(true)
    setError('')

    // 즉시 진행 페이지로 전환 → 백그라운드에서 API 호출
    try {
      const result = await startReport({
        url: url.startsWith('//') ? 'https:' + url : url,
        myauction_id: myaId,
        myauction_pw: myaPw,
        remember_login: remember,
        xlsx_path: excelPath || undefined,
      })
      // task_id 받자마자 즉시 진행 페이지로
      onStart(result.task_id)
    } catch (e: any) {
      setError(e.message || '서버 연결 실패')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* URL 입력 */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L5.75 8.688" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-800">경매 물건 URL</h2>
        </div>
        <input
          type="text"
          className="input-field"
          placeholder="https://www.my-auction.co.kr/view3/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">아이디</label>
            <input
              type="text"
              className="input-field"
              placeholder="아이디 입력"
              value={myaId}
              onChange={(e) => setMyaId(e.target.value)}
            />
          </div>
          <div>
            <label className="label">비밀번호</label>
            <input
              type="password"
              className="input-field"
              placeholder="비밀번호 입력"
              value={myaPw}
              onChange={(e) => setMyaPw(e.target.value)}
            />
          </div>
        </div>
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

      {/* 엑셀 첨부 */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-800">엑셀 첨부 (선택)</h2>
        </div>
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50/30 transition-all"
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleExcelSelect}
          />
          {excelFile ? (
            <div className="flex items-center justify-center gap-2 text-primary-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span className="font-medium">{excelFile.name}</span>
            </div>
          ) : (
            <div className="text-gray-400">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
              </svg>
              <p className="text-sm">클릭하여 엑셀 파일(.xlsx) 선택</p>
            </div>
          )}
        </div>
      </div>

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
          '보고서 생성 시작'
        )}
      </button>
    </div>
  )
}
