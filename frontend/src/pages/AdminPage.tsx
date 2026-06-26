import { useState, useEffect } from 'react'
import { getUsers, approveUser, revokeUser, deleteUser, getUsageLogs, setUserPermission, type UsageLog } from '../api/auth'

interface AdminPageProps {
  onBack: () => void
}

interface User {
  username: string
  name: string
  title?: string
  phone?: string
  permission?: 'basic' | 'special'
  status: string
  created_at: string
  approved_at: string | null
  has_myauction_credentials?: boolean
  myauction_id_masked?: string
}

export default function AdminPage({ onBack }: AdminPageProps) {
  const [users, setUsers] = useState<User[]>([])
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([])
  const [tab, setTab] = useState<'users' | 'logs'>('users')
  const [loading, setLoading] = useState(true)
  const [logLoading, setLogLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const data = await getUsers()
      setUsers(data)
    } catch (e: any) {
      alert('사용자 목록 조회 실패: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchUsageLogs = async () => {
    setLogLoading(true)
    try {
      const data = await getUsageLogs(120)
      setUsageLogs(data)
    } catch (e: any) {
      alert('사용로그 조회 실패: ' + e.message)
    } finally {
      setLogLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])
  useEffect(() => {
    if (tab === 'logs') fetchUsageLogs()
  }, [tab])

  const handleAction = async (action: 'approve' | 'revoke' | 'delete', username: string) => {
    if (action === 'delete' && !confirm(`'${username}' 계정을 삭제하시겠습니까?`)) return
    setActionLoading(`${action}:${username}`)
    try {
      if (action === 'approve') await approveUser(username)
      else if (action === 'revoke') await revokeUser(username)
      else if (action === 'delete') await deleteUser(username)
      await fetchUsers()
    } catch (e: any) {
      alert('처리 실패: ' + e.message)
    } finally {
      setActionLoading('')
    }
  }

  const handlePermission = async (username: string, permission: 'basic' | 'special') => {
    setActionLoading(`permission:${username}`)
    try {
      await setUserPermission(username, permission)
      await fetchUsers()
    } catch (e: any) {
      alert('권한 변경 실패: ' + e.message)
    } finally {
      setActionLoading('')
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">대기</span>
      case 'approved': return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">승인</span>
      case 'revoked': return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">회수</span>
      default: return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>
    }
  }

  const permissionBadge = (permission?: string) => {
    if (permission === 'special') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">특별</span>
    }
    return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">일반</span>
  }

  const pendingCount = users.filter(u => u.status === 'pending').length
  const formatLogAction = (log: UsageLog) => {
    if (log.action === 'login') return '로그인'
    if (log.output_type === 'rights_certificate') return '권리분석 보증서 생성'
    if (log.output_type === 'auction_report') return '브리핑자료 생성'
    return log.detail || log.action
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">사원관리</h2>
            <p className="text-sm text-gray-500">
              총 {users.length}명
              {pendingCount > 0 && <span className="text-yellow-600 font-medium ml-2">({pendingCount}명 대기 중)</span>}
            </p>
          </div>
        </div>
        <button onClick={tab === 'logs' ? fetchUsageLogs : fetchUsers} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
          새로고침
        </button>
      </div>

      <div className="flex gap-2 rounded-xl bg-gray-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'users' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          사원관리
        </button>
        <button
          type="button"
          onClick={() => setTab('logs')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'logs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          사용로그
        </button>
      </div>

      {tab === 'logs' ? (
        logLoading ? (
          <div className="text-center py-12 text-gray-400">사용로그 로딩 중...</div>
        ) : usageLogs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">사용로그가 없습니다</p>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="grid grid-cols-[1.1fr_1fr_1fr_1.4fr] gap-3 px-5 py-3 text-xs font-semibold text-gray-500 bg-gray-50 border-b">
              <span>일시</span>
              <span>사용자</span>
              <span>작업</span>
              <span>상세</span>
            </div>
            <div className="divide-y divide-gray-100">
              {usageLogs.map((log) => (
                <div key={log.id} className="grid grid-cols-[1.1fr_1fr_1fr_1.4fr] gap-3 px-5 py-3 text-sm items-center">
                  <span className="text-gray-500">{new Date(log.created_at).toLocaleString('ko-KR')}</span>
                  <div>
                    <p className="font-medium text-gray-900">{log.name || log.username}</p>
                    <p className="text-xs text-gray-400">@{log.username}{log.title ? ` · ${log.title}` : ''}</p>
                  </div>
                  <span className="text-gray-800">{formatLogAction(log)}</span>
                  <div className="text-xs text-gray-500 truncate">
                    {log.task_id && <span>작업ID: {log.task_id}</span>}
                    {log.urls_count ? <span> · {log.urls_count}건</span> : null}
                    {log.url && <p className="truncate mt-0.5">{log.url}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : loading ? (
        <div className="text-center py-12 text-gray-400">로딩 중...</div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">가입 신청이 없습니다</p>
          <p className="text-sm mt-1">사용자가 앱에서 회원가입하면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 대기 중 먼저 표시 */}
          {users
            .sort((a, b) => {
              const order: Record<string, number> = { pending: 0, approved: 1, revoked: 2 }
              return (order[a.status] ?? 3) - (order[b.status] ?? 3)
            })
            .map(user => (
            <div key={user.username} className={`card flex items-center justify-between ${user.status === 'pending' ? 'border-l-4 border-l-yellow-400' : ''}`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center text-sm font-bold text-blue-600">
                  {(user.name || user.username).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{user.name || user.username}</span>
                    {statusBadge(user.status)}
                    {permissionBadge(user.permission)}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    @{user.username} &middot; 가입: {new Date(user.created_at).toLocaleDateString('ko-KR')}
                    {user.title && <span> &middot; 직책: {user.title}</span>}
                    {user.phone && <span> &middot; 전화: {user.phone}</span>}
                    {user.approved_at && <span> &middot; 승인: {new Date(user.approved_at).toLocaleDateString('ko-KR')}</span>}
                    {user.has_myauction_credentials && (
                      <span> &middot; 마이옥션: {user.myauction_id_masked || '저장됨'}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {user.status === 'pending' && (
                  <button
                    onClick={() => handleAction('approve', user.username)}
                    disabled={!!actionLoading}
                    className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm rounded-lg transition"
                  >
                    {actionLoading === `approve:${user.username}` ? '...' : '승인'}
                  </button>
                )}
                {user.status === 'approved' && (
                  <button
                    onClick={() => handleAction('revoke', user.username)}
                    disabled={!!actionLoading}
                    className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg transition"
                  >
                    {actionLoading === `revoke:${user.username}` ? '...' : '권한 회수'}
                  </button>
                )}
                {user.status === 'approved' && (
                  <button
                    onClick={() => handlePermission(user.username, user.permission === 'special' ? 'basic' : 'special')}
                    disabled={!!actionLoading}
                    className={`px-3 py-1.5 disabled:opacity-50 text-sm rounded-lg transition ${
                      user.permission === 'special'
                        ? 'bg-purple-100 hover:bg-purple-200 text-purple-700'
                        : 'bg-purple-500 hover:bg-purple-600 text-white'
                    }`}
                  >
                    {actionLoading === `permission:${user.username}`
                      ? '...'
                      : user.permission === 'special'
                      ? '특별 해제'
                      : '특별 부여'}
                  </button>
                )}
                {user.status === 'revoked' && (
                  <button
                    onClick={() => handleAction('approve', user.username)}
                    disabled={!!actionLoading}
                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm rounded-lg transition"
                  >
                    {actionLoading === `approve:${user.username}` ? '...' : '재승인'}
                  </button>
                )}
                <button
                  onClick={() => handleAction('delete', user.username)}
                  disabled={!!actionLoading}
                  className="px-3 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-600 text-sm rounded-lg transition"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
