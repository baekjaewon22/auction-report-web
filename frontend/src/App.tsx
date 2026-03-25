import { useState } from 'react'
import HomePage from './pages/HomePage'
import ProgressPage from './pages/ProgressPage'
import ResultPage from './pages/ResultPage'

export type AppPage = 'home' | 'progress' | 'result'

export interface AppState {
  taskId: string
  resultMessage: string
  success: boolean
}

export default function App() {
  const [page, setPage] = useState<AppPage>('home')
  const [state, setState] = useState<AppState>({
    taskId: '',
    resultMessage: '',
    success: false,
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-gray-200/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">경매 보고서 자동화</h1>
            <p className="text-xs text-gray-400">MyAuction PPT Generator</p>
          </div>
        </div>
      </header>

      {/* 메인 */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {page === 'home' && (
          <HomePage
            onStart={(taskId) => {
              setState((s) => ({ ...s, taskId }))
              setPage('progress')
            }}
          />
        )}
        {page === 'progress' && (
          <ProgressPage
            taskId={state.taskId}
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
            onBack={() => setPage('home')}
          />
        )}
      </main>
    </div>
  )
}
