/**
 * 인증 API 클라이언트
 * Cloudflare Workers 인증 서버와 통신
 */

// TODO: 배포 후 실제 Workers URL로 변경
const AUTH_BASE_URL = localStorage.getItem('auth_server_url') || 'https://auction-auth.xmcnvb743210.workers.dev'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

interface LoginResponse {
  token: string
  role: string
  username: string
  name?: string
  title?: string
  phone?: string
  permission?: 'basic' | 'special'
  has_myauction_credentials?: boolean
  myauction_id_masked?: string
}

interface VerifyResponse {
  valid: boolean
  username?: string
  role?: string
  name?: string
  title?: string
  phone?: string
  permission?: 'basic' | 'special'
  error?: string
}

export interface User {
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

export interface UserProfile {
  username: string
  role: string
  name: string
  title: string
  phone: string
  permission: 'basic' | 'special'
}

export interface UsageLog {
  id: string
  created_at: string
  username: string
  role: string
  name: string
  title?: string
  phone?: string
  action: string
  output_type?: string
  task_id?: string
  detail?: string
  url?: string
  urls_count?: number
}

export interface MyAuctionCredentials {
  has_credentials: boolean
  myauction_id: string
  myauction_pw: string
  myauction_id_masked?: string
  updated_at?: string | null
}

// ============================================================
// 토큰 관리
// ============================================================
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): { username: string; role: string; name: string; title?: string; phone?: string; permission?: 'basic' | 'special' } | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function saveAuth(token: string, username: string, role: string, name?: string, title?: string, phone?: string, permission?: 'basic' | 'special') {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify({
    username,
    role,
    name: name || username,
    title: title || '',
    phone: phone || '',
    permission: role === 'admin' ? 'special' : (permission || 'basic'),
  }))
}

export function saveUserProfile(profile: Partial<UserProfile> & { username?: string; role?: string }) {
  const current = getUser()
  const next = {
    username: profile.username || current?.username || '',
    role: profile.role || current?.role || 'user',
    name: profile.name || current?.name || profile.username || current?.username || '',
    title: profile.title ?? current?.title ?? '',
    phone: profile.phone ?? current?.phone ?? '',
    permission: profile.permission ?? current?.permission ?? (profile.role === 'admin' || current?.role === 'admin' ? 'special' : 'basic'),
  }
  localStorage.setItem(USER_KEY, JSON.stringify(next))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

// ============================================================
// API 호출
// ============================================================
async function authFetch(path: string, options: RequestInit = {}) {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${AUTH_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

// ============================================================
// 로컬 테스트 계정 (Workers 배포 전까지 사용)
// TODO: Workers 배포 후 제거
// ============================================================
const LOCAL_TEST_ACCOUNTS: Record<string, { password: string; name: string; title: string; phone: string; role: string; permission: 'basic' | 'special' }> = {
  admin: { password: '1230', name: '관리자', title: '관리자', phone: '', role: 'admin', permission: 'special' },
  test: { password: 'test1234', name: '테스트유저', title: '담당자', phone: '', role: 'user', permission: 'basic' },
}

function isAuthServerAvailable(): boolean {
  return AUTH_BASE_URL !== '' && !AUTH_BASE_URL.includes('YOUR_SUBDOMAIN')
}

// 회원가입
export async function register(
  username: string,
  password: string,
  name: string | undefined,
  title: string,
  phone: string,
  myauctionId: string,
  myauctionPw: string,
) {
  if (!isAuthServerAvailable()) {
    throw new Error('인증 서버 미연결 상태입니다. 관리자에게 문의하세요.')
  }
  return authFetch('/api/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      name,
      title,
      phone,
      myauction_id: myauctionId,
      myauction_pw: myauctionPw,
    }),
  })
}

// 로그인
export async function login(username: string, password: string): Promise<LoginResponse> {
  // 로컬 테스트 모드
  if (!isAuthServerAvailable()) {
    const account = LOCAL_TEST_ACCOUNTS[username]
    if (!account || account.password !== password) {
      throw new Error('아이디 또는 비밀번호가 틀렸습니다')
    }
    const token = `local_${username}_${Date.now()}`
    saveAuth(token, username, account.role, account.name, account.title, account.phone, account.permission)
    return { token, role: account.role, username, name: account.name, title: account.title, phone: account.phone, permission: account.permission }
  }

  const data = await authFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  saveAuth(data.token, data.username, data.role, data.name, data.title, data.phone, data.permission)
  return data
}

// 토큰 검증
export async function verify(): Promise<VerifyResponse> {
  // 로컬 토큰이면 검증 스킵
  const token = getToken()
  if (token && token.startsWith('local_')) {
    const user = getUser()
    return { valid: true, username: user?.username, role: user?.role, name: user?.name, title: user?.title, phone: user?.phone, permission: user?.permission }
  }

  try {
    const result = await authFetch('/api/verify', { method: 'GET' })
    if (result.valid) {
      saveUserProfile({
        username: result.username,
        role: result.role,
        name: result.name,
        title: result.title,
        phone: result.phone,
        permission: result.permission,
      })
    }
    return result
  } catch {
    clearAuth()
    return { valid: false, error: '인증 실패' }
  }
}

export async function getProfile(): Promise<UserProfile> {
  if (!isAuthServerAvailable()) {
    const user = getUser()
    return {
      username: user?.username || '',
      role: user?.role || 'user',
      name: user?.name || '',
      title: user?.title || '',
      phone: user?.phone || '',
      permission: user?.permission || (user?.role === 'admin' ? 'special' : 'basic'),
    }
  }
  const profile = await authFetch('/api/me/profile', { method: 'GET' })
  saveUserProfile(profile)
  return profile
}

export async function updateProfile(name: string, title: string, phone: string): Promise<UserProfile> {
  const profile = await authFetch('/api/me/profile', {
    method: 'POST',
    body: JSON.stringify({ name, title, phone }),
  })
  saveUserProfile(profile)
  return profile
}

// 로그아웃
export function logout() {
  clearAuth()
}

export async function getMyAuctionCredentials(): Promise<MyAuctionCredentials> {
  if (!isAuthServerAvailable()) {
    return { has_credentials: false, myauction_id: '', myauction_pw: '' }
  }
  return authFetch('/api/me/myauction', { method: 'GET' })
}

export async function updateMyAuctionCredentials(myauctionId: string, myauctionPw: string) {
  return authFetch('/api/me/myauction', {
    method: 'POST',
    body: JSON.stringify({ myauction_id: myauctionId, myauction_pw: myauctionPw }),
  })
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return authFetch('/api/me/password', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  })
}

// ============================================================
// 관리자 API
// ============================================================
export async function getUsers(): Promise<User[]> {
  const data = await authFetch('/api/admin/users', { method: 'GET' })
  return data.users
}

export async function approveUser(username: string) {
  return authFetch('/api/admin/approve', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}

export async function revokeUser(username: string) {
  return authFetch('/api/admin/revoke', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}

export async function deleteUser(username: string) {
  return authFetch('/api/admin/user', {
    method: 'DELETE',
    body: JSON.stringify({ username }),
  })
}

export async function setUserPermission(username: string, permission: 'basic' | 'special') {
  return authFetch('/api/admin/permission', {
    method: 'POST',
    body: JSON.stringify({ username, permission }),
  })
}

export async function recordUsageLog(payload: {
  action: string
  output_type?: string
  task_id?: string
  detail?: string
  url?: string
  urls_count?: number
}) {
  if (!isAuthServerAvailable()) return null
  try {
    return await authFetch('/api/me/usage-log', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch {
    return null
  }
}

export async function getUsageLogs(limit = 100): Promise<UsageLog[]> {
  const data = await authFetch(`/api/admin/usage-logs?limit=${limit}`, { method: 'GET' })
  return data.logs || []
}
