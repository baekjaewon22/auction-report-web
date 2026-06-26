/**
 * 경매 보고서 자동화 - 인증 API (Cloudflare Workers + KV)
 *
 * API:
 *   POST /api/register     - 회원가입 신청
 *   POST /api/login        - 로그인 (토큰 발급)
 *   GET  /api/verify        - 토큰 검증
 *   GET  /api/me/profile    - 가입자 프로필 조회
 *   POST /api/me/profile    - 가입자 프로필 수정
 *   POST /api/me/password   - 앱 로그인 비밀번호 변경
 *   GET  /api/me/myauction  - 저장된 마이옥션 계정 조회
 *   POST /api/me/myauction  - 마이옥션 계정 저장/수정
 *   POST /api/me/usage-log  - 사용로그 기록
 *   GET  /api/admin/users   - 사용자 목록 (관리자)
 *   GET  /api/admin/usage-logs - 전체 사용로그 조회 (관리자)
 *   POST /api/admin/approve - 사용자 승인 (관리자)
 *   POST /api/admin/revoke  - 권한 회수 (관리자)
 *   POST /api/admin/permission - 특별 권한 설정 (관리자)
 *   DELETE /api/admin/user  - 사용자 삭제 (관리자)
 */

// ============================================================
// 암호화 유틸
// ============================================================
async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0))
}

function encodeJson(value) {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(value)))
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(base64ToBytes(value)))
}

async function createToken(payload, secret) {
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' })
  const body = encodeJson(payload)
  const data = `${header}.${body}`

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))

  return `${data}.${signature}`
}

async function verifyToken(token, secret) {
  try {
    const [header, body, signature] = token.split('.')
    const data = `${header}.${body}`

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )

    const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data))

    if (!valid) return null

    const payload = decodeJson(body)

    // 만료 체크
    if (payload.exp && Date.now() > payload.exp) return null

    return payload
  } catch {
    return null
  }
}

async function credentialKey(secret) {
  const encoder = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptText(text, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await credentialKey(secret)
  const encoded = new TextEncoder().encode(text)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return {
    iv: bytesToBase64(iv),
    value: bytesToBase64(encrypted),
  }
}

async function decryptText(record, secret) {
  if (!record || !record.iv || !record.value) return ''
  const key = await credentialKey(secret)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
    key,
    base64ToBytes(record.value)
  )
  return new TextDecoder().decode(decrypted)
}

function credentialSecret(env) {
  return env.MYA_CREDENTIAL_SECRET || env.JWT_SECRET
}

// ============================================================
// 응답 헬퍼
// ============================================================
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

function cors() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

// ============================================================
// 관리자 인증
// ============================================================
async function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.replace('Bearer ', '')
  if (!token) return false

  const payload = await verifyToken(token, env.JWT_SECRET)
  return payload && payload.role === 'admin'
}

async function authPayload(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.replace('Bearer ', '')
  if (!token) return null
  return verifyToken(token, env.JWT_SECRET)
}

function sanitizeUsername(username) {
  return String(username || '').trim()
}

function maskAccountId(value) {
  const text = String(value || '')
  if (text.length <= 2) return text ? `${text[0]}*` : ''
  return `${text.slice(0, 2)}${'*'.repeat(Math.min(text.length - 2, 6))}`
}

function cleanText(value) {
  return String(value || '').trim()
}

function publicUserProfile(username, user, role = 'user') {
  const permission = role === 'admin' ? 'special' : (user && user.permission) || 'basic'
  return {
    username,
    role,
    name: cleanText(user && user.name) || username,
    title: cleanText(user && user.title),
    phone: cleanText(user && user.phone),
    permission,
  }
}

async function getCurrentUserRecord(payload, env) {
  if (!payload) return null
  if (payload.role === 'admin') {
    const rawProfile = await env.USERS.get('admin:profile')
    const profile = rawProfile ? JSON.parse(rawProfile) : {}
    return publicUserProfile(payload.sub, {
      name: profile.name || '관리자',
      title: profile.title || '',
      phone: profile.phone || '',
    }, 'admin')
  }

  const raw = await env.USERS.get(`user:${payload.sub}`)
  if (!raw) return null
  const user = JSON.parse(raw)
  return publicUserProfile(payload.sub, user, 'user')
}

async function appendUsageLog(env, item) {
  const id = `${Date.now()}_${crypto.randomUUID()}`
  const log = {
    id,
    created_at: new Date().toISOString(),
    ...item,
  }
  await env.USERS.put(`usage:${id}`, JSON.stringify(log))

  const indexRaw = await env.USERS.get('index:usage_logs')
  const index = indexRaw ? JSON.parse(indexRaw) : []
  index.unshift(id)
  const kept = index.slice(0, 300)
  await env.USERS.put('index:usage_logs', JSON.stringify(kept))

  for (const stale of index.slice(300)) {
    await env.USERS.delete(`usage:${stale}`)
  }
  return log
}

// ============================================================
// 라우트 핸들러
// ============================================================

// 회원가입
async function handleRegister(request, env) {
  const { username, password, name, title, phone, myauction_id, myauction_pw } = await request.json()
  const cleanUsername = sanitizeUsername(username)

  if (!cleanUsername || !password) {
    return json({ error: '아이디와 비밀번호를 입력하세요' }, 400)
  }
  if (!cleanText(name) || !cleanText(title) || !cleanText(phone)) {
    return json({ error: '성명, 직책, 전화번호를 입력하세요' }, 400)
  }
  if (!myauction_id || !myauction_pw) {
    return json({ error: '마이옥션 아이디와 비밀번호를 입력하세요' }, 400)
  }

  // 중복 체크
  const existing = await env.USERS.get(`user:${cleanUsername}`)
  if (existing) {
    return json({ error: '이미 존재하는 아이디입니다' }, 409)
  }

  const pwHash = await hashPassword(password)
  const user = {
    username: cleanUsername,
    name: cleanText(name),
    title: cleanText(title),
    phone: cleanText(phone),
    permission: 'basic',
    pw_hash: pwHash,
    status: 'pending', // pending → approved → revoked
    created_at: new Date().toISOString(),
    approved_at: null,
    myauction: {
      id: String(myauction_id).trim(),
      pw_enc: await encryptText(String(myauction_pw), credentialSecret(env)),
      updated_at: new Date().toISOString(),
    },
  }

  await env.USERS.put(`user:${cleanUsername}`, JSON.stringify(user))

  // 사용자 목록 인덱스 업데이트
  const indexRaw = await env.USERS.get('index:users')
  const index = indexRaw ? JSON.parse(indexRaw) : []
  if (!index.includes(cleanUsername)) {
    index.push(cleanUsername)
    await env.USERS.put('index:users', JSON.stringify(index))
  }

  return json({ message: '가입 신청 완료. 관리자 승인을 기다려주세요.' })
}

// 로그인
async function handleLogin(request, env) {
  const { username, password } = await request.json()
  const cleanUsername = sanitizeUsername(username)

  if (!cleanUsername || !password) {
    return json({ error: '아이디와 비밀번호를 입력하세요' }, 400)
  }

  // 관리자 로그인
  if (cleanUsername === env.ADMIN_ID) {
    const adminPwHash = await hashPassword(password)
    const storedAdminPwHash = await env.USERS.get('admin:pw_hash')
    if (adminPwHash !== (storedAdminPwHash || env.ADMIN_PW_HASH)) {
      return json({ error: '비밀번호가 틀렸습니다' }, 401)
    }

    const token = await createToken({
      sub: cleanUsername,
      role: 'admin',
      name: '관리자',
      permission: 'special',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7일
    }, env.JWT_SECRET)

    const profile = await getCurrentUserRecord({ sub: cleanUsername, role: 'admin' }, env)
    await appendUsageLog(env, {
      username: cleanUsername,
      role: 'admin',
      name: profile.name,
      title: profile.title,
      phone: profile.phone,
      action: 'login',
      output_type: '',
      detail: '관리자 로그인',
    })

    return json({ token, ...profile, has_myauction_credentials: false })
  }

  // 일반 사용자 로그인
  const raw = await env.USERS.get(`user:${cleanUsername}`)
  if (!raw) {
    return json({ error: '존재하지 않는 계정입니다' }, 401)
  }

  const user = JSON.parse(raw)
  const pwHash = await hashPassword(password)

  if (pwHash !== user.pw_hash) {
    return json({ error: '비밀번호가 틀렸습니다' }, 401)
  }

  if (user.status === 'pending') {
    return json({ error: '관리자 승인 대기 중입니다' }, 403)
  }

  if (user.status === 'revoked') {
    return json({ error: '이용 권한이 회수되었습니다' }, 403)
  }

  const token = await createToken({
    sub: cleanUsername,
    role: 'user',
    name: user.name,
    title: user.title || '',
    phone: user.phone || '',
    permission: user.permission || 'basic',
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24시간
  }, env.JWT_SECRET)

  await appendUsageLog(env, {
    username: cleanUsername,
    role: 'user',
    name: user.name,
    title: user.title || '',
    phone: user.phone || '',
    permission: user.permission || 'basic',
    action: 'login',
    output_type: '',
    detail: '로그인',
  })

  return json({
    token,
    role: 'user',
    username: cleanUsername,
    name: user.name,
    title: user.title || '',
    phone: user.phone || '',
    permission: user.permission || 'basic',
    has_myauction_credentials: !!(user.myauction && user.myauction.id && user.myauction.pw_enc),
    myauction_id_masked: maskAccountId(user.myauction && user.myauction.id),
  })
}

// 토큰 검증
async function handleVerify(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.replace('Bearer ', '')

  if (!token) {
    return json({ valid: false, error: '토큰 없음' }, 401)
  }

  const payload = await verifyToken(token, env.JWT_SECRET)
  if (!payload) {
    return json({ valid: false, error: '토큰 만료 또는 무효' }, 401)
  }

  // 사용자 상태 재확인 (관리자가 중간에 회수했을 수 있음)
  if (payload.role !== 'admin') {
    const raw = await env.USERS.get(`user:${payload.sub}`)
    if (!raw) {
      return json({ valid: false, error: '삭제된 계정' }, 401)
    }
    const user = JSON.parse(raw)
    if (user.status !== 'approved') {
      return json({ valid: false, error: '승인되지 않은 계정' }, 403)
    }
  }

  const profile = await getCurrentUserRecord(payload, env)
  return json({
    valid: true,
    username: payload.sub,
    role: payload.role,
    name: profile ? profile.name : payload.name,
    title: profile ? profile.title : payload.title,
    phone: profile ? profile.phone : payload.phone,
  })
}

// 가입자 프로필 조회
async function handleGetProfile(request, env) {
  const payload = await authPayload(request, env)
  if (!payload) {
    return json({ error: '사용자 인증 필요' }, 401)
  }
  const profile = await getCurrentUserRecord(payload, env)
  if (!profile) {
    return json({ error: '삭제된 계정' }, 404)
  }
  return json(profile)
}

// 가입자 프로필 수정
async function handleUpdateProfile(request, env) {
  const payload = await authPayload(request, env)
  if (!payload) {
    return json({ error: '사용자 인증 필요' }, 401)
  }

  const { name, title, phone } = await request.json()
  if (!cleanText(name) || !cleanText(title) || !cleanText(phone)) {
    return json({ error: '성명, 직책, 전화번호를 입력하세요' }, 400)
  }

  if (payload.role === 'admin') {
    const profile = {
      name: cleanText(name),
      title: cleanText(title),
      phone: cleanText(phone),
      updated_at: new Date().toISOString(),
    }
    await env.USERS.put('admin:profile', JSON.stringify(profile))
    return json(publicUserProfile(payload.sub, profile, 'admin'))
  }

  const raw = await env.USERS.get(`user:${payload.sub}`)
  if (!raw) {
    return json({ error: '삭제된 계정' }, 404)
  }

  const user = JSON.parse(raw)
  if (user.status !== 'approved') {
    return json({ error: '승인되지 않은 계정' }, 403)
  }
  user.name = cleanText(name)
  user.title = cleanText(title)
  user.phone = cleanText(phone)
  user.profile_updated_at = new Date().toISOString()
  await env.USERS.put(`user:${payload.sub}`, JSON.stringify(user))

  return json(publicUserProfile(payload.sub, user, 'user'))
}

// 앱 로그인 비밀번호 변경
async function handleChangePassword(request, env) {
  const payload = await authPayload(request, env)
  if (!payload) {
    return json({ error: '사용자 인증 필요' }, 401)
  }

  const { current_password, new_password } = await request.json()
  if (!current_password || !new_password) {
    return json({ error: '현재 비밀번호와 새 비밀번호를 입력하세요' }, 400)
  }
  if (String(new_password).length < 4) {
    return json({ error: '새 비밀번호는 4자 이상이어야 합니다' }, 400)
  }

  const currentHash = await hashPassword(current_password)
  const newHash = await hashPassword(new_password)

  if (payload.role === 'admin') {
    const storedAdminPwHash = await env.USERS.get('admin:pw_hash')
    if (currentHash !== (storedAdminPwHash || env.ADMIN_PW_HASH)) {
      return json({ error: '현재 비밀번호가 틀렸습니다' }, 401)
    }
    await env.USERS.put('admin:pw_hash', newHash)
    return json({ message: '비밀번호가 변경되었습니다' })
  }

  const raw = await env.USERS.get(`user:${payload.sub}`)
  if (!raw) {
    return json({ error: '삭제된 계정' }, 404)
  }

  const user = JSON.parse(raw)
  if (user.status !== 'approved') {
    return json({ error: '승인되지 않은 계정' }, 403)
  }
  if (currentHash !== user.pw_hash) {
    return json({ error: '현재 비밀번호가 틀렸습니다' }, 401)
  }

  user.pw_hash = newHash
  user.password_updated_at = new Date().toISOString()
  await env.USERS.put(`user:${payload.sub}`, JSON.stringify(user))

  return json({ message: '비밀번호가 변경되었습니다' })
}

// 저장된 마이옥션 계정 조회
async function handleGetMyAuction(request, env) {
  const payload = await authPayload(request, env)
  if (!payload) {
    return json({ error: '사용자 인증 필요' }, 401)
  }

  if (payload.role === 'admin') {
    const rawAccount = await env.USERS.get('admin:myauction')
    const account = rawAccount ? JSON.parse(rawAccount) : {}
    if (!account.id || !account.pw_enc) {
      return json({ has_credentials: false, myauction_id: '', myauction_pw: '' })
    }
    return json({
      has_credentials: true,
      myauction_id: account.id,
      myauction_id_masked: maskAccountId(account.id),
      myauction_pw: await decryptText(account.pw_enc, credentialSecret(env)),
      updated_at: account.updated_at || null,
    })
  }

  const raw = await env.USERS.get(`user:${payload.sub}`)
  if (!raw) {
    return json({ error: '삭제된 계정' }, 404)
  }

  const user = JSON.parse(raw)
  if (user.status !== 'approved') {
    return json({ error: '승인되지 않은 계정' }, 403)
  }

  const account = user.myauction || {}
  if (!account.id || !account.pw_enc) {
    return json({ has_credentials: false, myauction_id: '', myauction_pw: '' })
  }

  return json({
    has_credentials: true,
    myauction_id: account.id,
    myauction_id_masked: maskAccountId(account.id),
    myauction_pw: await decryptText(account.pw_enc, credentialSecret(env)),
    updated_at: account.updated_at || null,
  })
}

// 마이옥션 계정 저장/수정
async function handleUpdateMyAuction(request, env) {
  const payload = await authPayload(request, env)
  if (!payload) {
    return json({ error: '사용자 인증 필요' }, 401)
  }

  const { myauction_id, myauction_pw } = await request.json()
  if (!myauction_id || !myauction_pw) {
    return json({ error: '마이옥션 아이디와 비밀번호를 입력하세요' }, 400)
  }

  if (payload.role === 'admin') {
    const account = {
      id: String(myauction_id).trim(),
      pw_enc: await encryptText(String(myauction_pw), credentialSecret(env)),
      updated_at: new Date().toISOString(),
    }
    await env.USERS.put('admin:myauction', JSON.stringify(account))
    return json({
      message: '마이옥션 계정 저장 완료',
      has_credentials: true,
      myauction_id_masked: maskAccountId(account.id),
    })
  }

  const raw = await env.USERS.get(`user:${payload.sub}`)
  if (!raw) {
    return json({ error: '삭제된 계정' }, 404)
  }

  const user = JSON.parse(raw)
  if (user.status !== 'approved') {
    return json({ error: '승인되지 않은 계정' }, 403)
  }

  user.myauction = {
    id: String(myauction_id).trim(),
    pw_enc: await encryptText(String(myauction_pw), credentialSecret(env)),
    updated_at: new Date().toISOString(),
  }
  await env.USERS.put(`user:${payload.sub}`, JSON.stringify(user))

  return json({
    message: '마이옥션 계정 저장 완료',
    has_credentials: true,
    myauction_id_masked: maskAccountId(user.myauction.id),
  })
}

// 사용자 목록 (관리자)
async function handleAdminUsers(request, env) {
  if (!await isAdmin(request, env)) {
    return json({ error: '관리자 권한 필요' }, 403)
  }

  const indexRaw = await env.USERS.get('index:users')
  const index = indexRaw ? JSON.parse(indexRaw) : []

  const users = []
  for (const username of index) {
    const raw = await env.USERS.get(`user:${username}`)
    if (raw) {
      const user = JSON.parse(raw)
      users.push({
        username: user.username,
        name: user.name,
        title: user.title || '',
        phone: user.phone || '',
        permission: user.permission || 'basic',
        status: user.status,
        created_at: user.created_at,
        approved_at: user.approved_at,
        has_myauction_credentials: !!(user.myauction && user.myauction.id && user.myauction.pw_enc),
        myauction_id_masked: maskAccountId(user.myauction && user.myauction.id),
      })
    }
  }

  return json({ users })
}

// 특별 권한 설정 (관리자)
async function handleAdminPermission(request, env) {
  if (!await isAdmin(request, env)) {
    return json({ error: '관리자 권한 필요' }, 403)
  }

  const { username, permission } = await request.json()
  const nextPermission = permission === 'special' ? 'special' : 'basic'
  const raw = await env.USERS.get(`user:${username}`)
  if (!raw) {
    return json({ error: '존재하지 않는 사용자' }, 404)
  }

  const user = JSON.parse(raw)
  user.permission = nextPermission
  user.permission_updated_at = new Date().toISOString()
  await env.USERS.put(`user:${username}`, JSON.stringify(user))

  return json({
    message: `${username} 권한이 ${nextPermission === 'special' ? '특별' : '일반'}로 변경되었습니다.`,
    username,
    permission: nextPermission,
  })
}

// 사용로그 기록
async function handleUsageLog(request, env) {
  const payload = await authPayload(request, env)
  if (!payload) {
    return json({ error: '사용자 인증 필요' }, 401)
  }
  const profile = await getCurrentUserRecord(payload, env)
  if (!profile) {
    return json({ error: '삭제된 계정' }, 404)
  }

  const body = await request.json()
  const log = await appendUsageLog(env, {
    username: profile.username,
    role: profile.role,
    name: profile.name,
    title: profile.title,
    phone: profile.phone,
    action: cleanText(body.action) || 'report_start',
    output_type: cleanText(body.output_type),
    task_id: cleanText(body.task_id),
    detail: cleanText(body.detail),
    url: cleanText(body.url),
    urls_count: Number(body.urls_count || 0),
  })
  return json({ log })
}

// 전체 사용로그 조회 (관리자)
async function handleAdminUsageLogs(request, env) {
  if (!await isAdmin(request, env)) {
    return json({ error: '관리자 권한 필요' }, 403)
  }

  const url = new URL(request.url)
  const limit = Math.max(1, Math.min(300, Number(url.searchParams.get('limit') || 100)))
  const indexRaw = await env.USERS.get('index:usage_logs')
  const index = indexRaw ? JSON.parse(indexRaw) : []
  const logs = []
  for (const id of index.slice(0, limit)) {
    const raw = await env.USERS.get(`usage:${id}`)
    if (raw) logs.push(JSON.parse(raw))
  }
  return json({ logs })
}

// 사용자 승인 (관리자)
async function handleAdminApprove(request, env) {
  if (!await isAdmin(request, env)) {
    return json({ error: '관리자 권한 필요' }, 403)
  }

  const { username } = await request.json()
  const raw = await env.USERS.get(`user:${username}`)
  if (!raw) {
    return json({ error: '존재하지 않는 사용자' }, 404)
  }

  const user = JSON.parse(raw)
  user.status = 'approved'
  user.approved_at = new Date().toISOString()
  await env.USERS.put(`user:${username}`, JSON.stringify(user))

  return json({ message: `${username} 승인 완료` })
}

// 권한 회수 (관리자)
async function handleAdminRevoke(request, env) {
  if (!await isAdmin(request, env)) {
    return json({ error: '관리자 권한 필요' }, 403)
  }

  const { username } = await request.json()
  const raw = await env.USERS.get(`user:${username}`)
  if (!raw) {
    return json({ error: '존재하지 않는 사용자' }, 404)
  }

  const user = JSON.parse(raw)
  user.status = 'revoked'
  await env.USERS.put(`user:${username}`, JSON.stringify(user))

  return json({ message: `${username} 권한 회수 완료` })
}

// 사용자 삭제 (관리자)
async function handleAdminDelete(request, env) {
  if (!await isAdmin(request, env)) {
    return json({ error: '관리자 권한 필요' }, 403)
  }

  const { username } = await request.json()
  await env.USERS.delete(`user:${username}`)

  // 인덱스에서 제거
  const indexRaw = await env.USERS.get('index:users')
  const index = indexRaw ? JSON.parse(indexRaw) : []
  const newIndex = index.filter(u => u !== username)
  await env.USERS.put('index:users', JSON.stringify(newIndex))

  return json({ message: `${username} 삭제 완료` })
}

// ============================================================
// 메인 라우터
// ============================================================
export default {
  async fetch(request, env) {
    try {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // CORS preflight
    if (method === 'OPTIONS') return cors()

    // 라우팅
    if (path === '/api/register' && method === 'POST') return handleRegister(request, env)
    if (path === '/api/login' && method === 'POST') return handleLogin(request, env)
    if (path === '/api/verify' && method === 'GET') return handleVerify(request, env)
    if (path === '/api/me/profile' && method === 'GET') return handleGetProfile(request, env)
    if (path === '/api/me/profile' && method === 'POST') return handleUpdateProfile(request, env)
    if (path === '/api/me/password' && method === 'POST') return handleChangePassword(request, env)
    if (path === '/api/me/myauction' && method === 'GET') return handleGetMyAuction(request, env)
    if (path === '/api/me/myauction' && method === 'POST') return handleUpdateMyAuction(request, env)
    if (path === '/api/me/usage-log' && method === 'POST') return handleUsageLog(request, env)

    if (path === '/api/admin/users' && method === 'GET') return handleAdminUsers(request, env)
    if (path === '/api/admin/usage-logs' && method === 'GET') return handleAdminUsageLogs(request, env)
    if (path === '/api/admin/approve' && method === 'POST') return handleAdminApprove(request, env)
    if (path === '/api/admin/revoke' && method === 'POST') return handleAdminRevoke(request, env)
    if (path === '/api/admin/permission' && method === 'POST') return handleAdminPermission(request, env)
    if (path === '/api/admin/user' && method === 'DELETE') return handleAdminDelete(request, env)

    return json({ error: 'Not Found' }, 404)
    } catch (err) {
      return json({ error: err.message || 'Internal Server Error' }, 500)
    }
  },
}
