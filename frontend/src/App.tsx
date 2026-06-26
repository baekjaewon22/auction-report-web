import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import WorkSelectPage from './pages/WorkSelectPage'
import ProgressPage from './pages/ProgressPage'
import ResultPage from './pages/ResultPage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'
import DownloadHistoryPage from './pages/DownloadHistoryPage'
import { isLoggedIn, verify, logout, getUser } from './api/auth'
import type { OutputType } from './api/client'

export type AppPage = 'login' | 'home' | 'briefing' | 'rights' | 'progress' | 'result' | 'admin' | 'settings' | 'downloads'

export interface AppState {
  taskId: string
  outputType: OutputType
  resultMessage: string
  success: boolean
}

export default function App() {
  const [page, setPage] = useState<AppPage>('login')
  const [authChecked, setAuthChecked] = useState(false)
  const [state, setState] = useState<AppState>({
    taskId: '',
    outputType: 'auction_report',
    resultMessage: '',
    success: false,
  })

  // 앱 시작 시 토큰 유효성 확인
  useEffect(() => {
    async function checkAuth() {
      if (isLoggedIn()) {
        try {
          const result = await verify()
          if (result.valid) {
            setPage('home')
          } else {
            logout()
          }
        } catch {
          // 서버 연결 실패 시 일단 로컬 토큰만으로 허용
          // (오프라인 대비)
          setPage('home')
        }
      }
      setAuthChecked(true)
    }
    checkAuth()
  }, [])

  const handleLogin = (role: string) => {
    setPage('home')
  }

  const handleLogout = () => {
    logout()
    setPage('login')
  }

  const canUseRightsCertificate = () => {
    const user = getUser()
    return user?.role === 'admin' || user?.permission === 'special'
  }

  // 인증 체크 중 스플래시
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 animate-pulse">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <p className="text-slate-400">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 로그인 페이지
  if (page === 'login') {
    return <LoginPage onLogin={handleLogin} />
  }

  // 메인 앱
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-gray-200/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage('home')}
            className="flex items-center gap-3 text-left rounded-xl px-1 py-1 -mx-1 hover:bg-white/70 transition"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
          <div>
              <h1 className="text-lg font-bold text-gray-900">경매 문서 자동화</h1>
              <p className="text-xs text-gray-400">Briefing & Rights Certificate</p>
            </div>
          </button>
          <div className="flex items-center gap-3">
            {getUser()?.role === 'admin' && (
              <button
                onClick={() => setPage(page === 'admin' ? 'home' : 'admin')}
                className={`text-sm transition px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${page === 'admin' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
                사원관리
              </button>
            )}
            <button
              onClick={() => setPage(page === 'downloads' ? 'home' : 'downloads')}
              className={`text-sm transition px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${page === 'downloads' ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h2.25M6.75 9.75h1.5" />
              </svg>
              다운로드이력
            </button>
            <button
              onClick={() => setPage(page === 'settings' ? 'home' : 'settings')}
              className={`text-sm transition px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${page === 'settings' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.657.846.085.04.17.082.252.126.326.172.72.165 1.038-.024l1.091-.648a1.125 1.125 0 0 1 1.45.12l1.833 1.833c.389.389.44.997.12 1.45l-.648 1.091c-.189.318-.196.712-.024 1.038.044.083.086.167.126.252.16.344.472.594.846.657l1.281.213c.542.09.94.56.94 1.11v2.593c0 .55-.398 1.02-.94 1.11l-1.281.213a1.125 1.125 0 0 0-.846.657c-.04.085-.082.17-.126.252-.172.326-.165.72.024 1.038l.648 1.091c.32.453.269 1.061-.12 1.45l-1.833 1.833a1.125 1.125 0 0 1-1.45.12l-1.091-.648a1.125 1.125 0 0 0-1.038-.024 6.707 6.707 0 0 1-.252.126 1.125 1.125 0 0 0-.657.846l-.213 1.281c-.09.542-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281a1.125 1.125 0 0 0-.657-.846 6.707 6.707 0 0 1-.252-.126 1.125 1.125 0 0 0-1.038.024l-1.091.648a1.125 1.125 0 0 1-1.45-.12L2.56 20.94a1.125 1.125 0 0 1-.12-1.45l.648-1.091c.189-.318.196-.712.024-1.038a6.707 6.707 0 0 1-.126-.252 1.125 1.125 0 0 0-.846-.657L.86 16.239a1.125 1.125 0 0 1-.94-1.11v-2.593c0-.55.398-1.02.94-1.11l1.281-.213c.374-.063.686-.313.846-.657.04-.085.082-.17.126-.252a1.125 1.125 0 0 0-.024-1.038L2.44 8.176a1.125 1.125 0 0 1 .12-1.45L4.393 4.893a1.125 1.125 0 0 1 1.45-.12l1.091.648c.318.189.712.196 1.038.024.083-.044.167-.086.252-.126.344-.16.594-.472.657-.846l.213-1.281Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75A3.75 3.75 0 1 0 12 8.25a3.75 3.75 0 0 0 0 7.5Z" />
              </svg>
              기본설정관리
            </button>
            <span className="text-sm text-gray-500">{getUser()?.name || getUser()?.username}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-red-500 transition px-3 py-1.5 rounded-lg hover:bg-red-50"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* 메인 */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {page === 'home' && (
          <WorkSelectPage
            onSelect={(outputType) => {
              if (outputType === 'rights_certificate' && !canUseRightsCertificate()) {
                setState((s) => ({ ...s, outputType: 'auction_report' }))
                setPage('home')
                return
              }
              setState((s) => ({ ...s, outputType }))
              setPage(outputType === 'rights_certificate' ? 'rights' : 'briefing')
            }}
          />
        )}
        {page === 'briefing' && (
          <HomePage
            outputType="auction_report"
            onBack={() => setPage('home')}
            onStart={(taskId, outputType) => {
              setState((s) => ({ ...s, taskId, outputType }))
              setPage('progress')
            }}
          />
        )}
        {page === 'rights' && (
          <HomePage
            outputType="rights_certificate"
            onBack={() => setPage('home')}
            onStart={(taskId, outputType) => {
              setState((s) => ({ ...s, taskId, outputType }))
              setPage('progress')
            }}
          />
        )}
        {page === 'progress' && (
          <ProgressPage
            taskId={state.taskId}
            outputType={state.outputType}
            onComplete={(success, message) => {
              setState((s) => ({ ...s, success, resultMessage: message }))
              setPage('result')
            }}
          />
        )}
        {page === 'result' && (
          <ResultPage
            success={state.success}
            message={state.resultMessage}
            taskId={state.taskId}
            outputType={state.outputType}
            onBack={() => setPage(state.outputType === 'rights_certificate' ? 'rights' : 'briefing')}
          />
        )}
        {page === 'admin' && (
          <AdminPage onBack={() => setPage('home')} />
        )}
        {page === 'settings' && (
          <SettingsPage onBack={() => setPage('home')} />
        )}
        {page === 'downloads' && (
          <DownloadHistoryPage onBack={() => setPage('home')} />
        )}
      </main>
    </div>
  )
}
