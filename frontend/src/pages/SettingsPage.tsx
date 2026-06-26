import { useEffect, useState } from 'react'
import { changePassword, getMyAuctionCredentials, getProfile, updateMyAuctionCredentials, updateProfile } from '../api/auth'

interface SettingsPageProps {
  onBack: () => void
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profileTitle, setProfileTitle] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [myauctionId, setMyauctionId] = useState('')
  const [myauctionPw, setMyauctionPw] = useState('')
  const [loadingCredentials, setLoadingCredentials] = useState(true)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [savingPassword, setSavingPassword] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingMyauction, setSavingMyauction] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingCredentials(true)
      setLoadingProfile(true)
      try {
        const [profile, credentials] = await Promise.all([
          getProfile(),
          getMyAuctionCredentials(),
        ])
        if (cancelled) return
        setProfileName(profile.name || '')
        setProfileTitle(profile.title || '')
        setProfilePhone(profile.phone || '')
        if (credentials.has_credentials) {
          setMyauctionId(credentials.myauction_id)
          setMyauctionPw(credentials.myauction_pw)
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || '마이옥션 계정 조회 실패')
      } finally {
        if (!cancelled) {
          setLoadingCredentials(false)
          setLoadingProfile(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const savePassword = async () => {
    setError('')
    setMessage('')
    if (!currentPassword || !newPassword) {
      setError('현재 비밀번호와 새 비밀번호를 입력해주세요.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호 확인이 일치하지 않습니다.')
      return
    }
    setSavingPassword(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('비밀번호가 변경되었습니다.')
    } catch (e: any) {
      setError(e.message || '비밀번호 변경 실패')
    } finally {
      setSavingPassword(false)
    }
  }

  const saveProfile = async () => {
    setError('')
    setMessage('')
    if (!profileName.trim() || !profileTitle.trim() || !profilePhone.trim()) {
      setError('성명, 직책, 전화번호를 입력해주세요.')
      return
    }
    setSavingProfile(true)
    try {
      await updateProfile(profileName, profileTitle, profilePhone)
      setMessage('회원정보가 저장되었습니다.')
    } catch (e: any) {
      setError(e.message || '회원정보 저장 실패')
    } finally {
      setSavingProfile(false)
    }
  }

  const saveMyauction = async () => {
    setError('')
    setMessage('')
    if (!myauctionId.trim() || !myauctionPw.trim()) {
      setError('마이옥션 아이디와 비밀번호를 입력해주세요.')
      return
    }
    setSavingMyauction(true)
    try {
      await updateMyAuctionCredentials(myauctionId, myauctionPw)
      setMessage('마이옥션 계정이 저장되었습니다.')
    } catch (e: any) {
      setError(e.message || '마이옥션 계정 저장 실패')
    } finally {
      setSavingMyauction(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <p className="text-sm text-gray-500">계정 및 자동화 설정</p>
            <h2 className="text-2xl font-bold text-gray-900">기본설정관리</h2>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-800">회원정보</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">성명</label>
            <input type="text" className="input-field" value={profileName} onChange={(e) => setProfileName(e.target.value)} disabled={loadingProfile} />
          </div>
          <div>
            <label className="label">직책</label>
            <input type="text" className="input-field" value={profileTitle} onChange={(e) => setProfileTitle(e.target.value)} disabled={loadingProfile} />
          </div>
          <div>
            <label className="label">전화번호</label>
            <input type="tel" className="input-field" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} disabled={loadingProfile} />
          </div>
        </div>
        <button type="button" className="btn-secondary mt-4" onClick={saveProfile} disabled={savingProfile || loadingProfile}>
          {savingProfile ? '저장 중...' : '회원정보 저장'}
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-800">비밀번호 변경</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">현재 비밀번호</label>
            <input type="password" className="input-field" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">새 비밀번호</label>
            <input type="password" className="input-field" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">새 비밀번호 확인</label>
            <input type="password" className="input-field" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn-secondary mt-4" onClick={savePassword} disabled={savingPassword}>
          {savingPassword ? '변경 중...' : '비밀번호 변경'}
        </button>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-800">마이옥션 계정</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">마이옥션 아이디</label>
            <input
              type="text"
              className="input-field"
              value={myauctionId}
              onChange={(e) => setMyauctionId(e.target.value)}
              disabled={loadingCredentials}
            />
          </div>
          <div>
            <label className="label">마이옥션 비밀번호</label>
            <input
              type="password"
              className="input-field"
              value={myauctionPw}
              onChange={(e) => setMyauctionPw(e.target.value)}
              disabled={loadingCredentials}
            />
          </div>
        </div>
        <button type="button" className="btn-secondary mt-4" onClick={saveMyauction} disabled={savingMyauction || loadingCredentials}>
          {savingMyauction ? '저장 중...' : '마이옥션 계정 저장'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
      )}
      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">{message}</div>
      )}
    </div>
  )
}
