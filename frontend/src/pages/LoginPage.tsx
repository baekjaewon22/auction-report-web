import { useState, useRef, useEffect } from 'react'
import { login, register } from '../api/auth'

interface LoginPageProps {
  onLogin: (role: string) => void
}

// ============================================================
// Canvas: AI 매트릭스 코드 + 데이터 스트림 + 홀로그램 HUD
// ============================================================
function AIMatrixCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let w = 0, h = 0

    function resize() {
      w = canvas!.width = window.innerWidth
      h = canvas!.height = window.innerHeight
    }

    // ── 매트릭스 코드 레인 ──
    const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789{}[]()<>=/\\|;:,.+-*&^%$#@!~`αβγδεζηθλμξπρστφψωΣΔΩ∞∫≈≠√∂∇⟨⟩'
    const FONT_SIZE = 14
    let columns = 0
    let drops: number[] = []
    let dropSpeeds: number[] = []
    let dropColors: number[] = [] // 0=blue, 1=purple, 2=cyan

    function initMatrix() {
      columns = Math.floor(w / FONT_SIZE)
      drops = Array.from({ length: columns }, () => Math.random() * -100)
      dropSpeeds = Array.from({ length: columns }, () => 0.3 + Math.random() * 1.2)
      dropColors = Array.from({ length: columns }, () => Math.floor(Math.random() * 3))
    }

    // ── 떠다니는 코드 블록 ──
    interface CodeBlock {
      x: number; y: number; vx: number; vy: number
      lines: string[]; opacity: number; scale: number
    }
    const codeBlocks: CodeBlock[] = []
    const CODE_SNIPPETS = [
      ['def analyze(data):', '  model = AI.load()', '  return model.predict(data)'],
      ['async fetch(url) {', '  const res = await api.get(url)', '  return res.data', '}'],
      ['class NeuralNet:', '  def forward(self, x):', '    return self.layers(x)'],
      ['const encrypt = (key) => {', '  return crypto.hash(key)', '}'],
      ['SELECT * FROM reports', 'WHERE status = "approved"', 'ORDER BY created_at DESC'],
      ['import torch.nn as nn', 'model = nn.Sequential(', '  nn.Linear(256, 128),', '  nn.ReLU()', ')'],
      ['@app.route("/api/auth")', 'def authenticate():', '  token = jwt.encode(payload)'],
      ['for node in network:', '  node.compute()', '  node.propagate()'],
      ['pipeline.stage("extract")', 'pipeline.stage("transform")', 'pipeline.stage("load")'],
      ['git commit -m "deploy v2.1"', 'docker build -t ai-core .', 'kubectl apply -f deploy.yaml'],
    ]

    function initCodeBlocks() {
      codeBlocks.length = 0
      for (let i = 0; i < 12; i++) {
        codeBlocks.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.2,
          lines: CODE_SNIPPETS[Math.floor(Math.random() * CODE_SNIPPETS.length)],
          opacity: 0.03 + Math.random() * 0.06,
          scale: 0.7 + Math.random() * 0.5,
        })
      }
    }

    // ── 데이터 파이프라인 (수평 이동 데이터) ──
    interface DataStream {
      y: number; speed: number; chars: string; offset: number
      color: string; opacity: number
    }
    const dataStreams: DataStream[] = []

    function initDataStreams() {
      dataStreams.length = 0
      for (let i = 0; i < 8; i++) {
        const len = 30 + Math.floor(Math.random() * 60)
        let chars = ''
        for (let j = 0; j < len; j++) {
          chars += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
        }
        dataStreams.push({
          y: 50 + Math.random() * (h - 100),
          speed: 1 + Math.random() * 3,
          chars,
          offset: Math.random() * w,
          color: ['59,130,246', '139,92,246', '6,182,212'][Math.floor(Math.random() * 3)],
          opacity: 0.08 + Math.random() * 0.12,
        })
      }
    }

    // ── HUD 요소 ──
    function drawHUD(time: number) {
      // 좌측 상단 상태
      ctx!.font = '10px monospace'
      ctx!.fillStyle = 'rgba(59,130,246,0.15)'
      const hudLines = [
        `> SYSTEM STATUS: ONLINE`,
        `> NEURAL_NET: ACTIVE [${Math.floor(80 + Math.sin(time) * 15)}%]`,
        `> ENCRYPTION: AES-256-GCM`,
        `> NODES: ${Math.floor(120 + Math.sin(time * 1.3) * 30)} CONNECTED`,
        `> LATENCY: ${Math.floor(12 + Math.sin(time * 2) * 8)}ms`,
        `> AUTH_PROTOCOL: JWT/RSA-4096`,
      ]
      hudLines.forEach((line, i) => {
        ctx!.fillText(line, 20, 30 + i * 16)
      })

      // 우측 상단 데이터
      ctx!.fillStyle = 'rgba(139,92,246,0.12)'
      const rightLines = [
        `MEMORY: ${Math.floor(60 + Math.sin(time * 0.7) * 20)}%`,
        `GPU: ${Math.floor(45 + Math.sin(time * 1.1) * 25)}%`,
        `THROUGHPUT: ${Math.floor(1200 + Math.sin(time * 0.9) * 400)}MB/s`,
      ]
      rightLines.forEach((line, i) => {
        const tw = ctx!.measureText(line).width
        ctx!.fillText(line, w - tw - 20, 30 + i * 16)
      })

      // 좌측 하단 로그
      ctx!.fillStyle = 'rgba(6,182,212,0.1)'
      const logLines = [
        `[${new Date().toISOString().slice(11, 19)}] AUTH_CHECK OK`,
        `[${new Date().toISOString().slice(11, 19)}] MODEL_SYNC COMPLETE`,
      ]
      logLines.forEach((line, i) => {
        ctx!.fillText(line, 20, h - 30 + i * 14)
      })
    }

    // ── 중앙 홀로그램 서클 ──
    function drawCoreHologram(time: number) {
      const cx = w * 0.5
      const cy = h * 0.32

      // 외곽 링들
      for (let r = 0; r < 4; r++) {
        const radius = 60 + r * 30
        const rot = time * (0.2 + r * 0.1) * (r % 2 === 0 ? 1 : -1)

        ctx!.save()
        ctx!.translate(cx, cy)
        ctx!.rotate(rot)

        ctx!.strokeStyle = `rgba(${r % 2 === 0 ? '59,130,246' : '139,92,246'},${0.06 - r * 0.01})`
        ctx!.lineWidth = 0.5
        ctx!.setLineDash([2 + r * 3, 5 + r * 4])
        ctx!.beginPath()
        ctx!.arc(0, 0, radius, 0, Math.PI * 2)
        ctx!.stroke()
        ctx!.setLineDash([])

        // 링 위의 데이터 포인트
        for (let i = 0; i < 6 + r * 2; i++) {
          const angle = (Math.PI * 2 / (6 + r * 2)) * i
          const px = radius * Math.cos(angle)
          const py = radius * Math.sin(angle)
          ctx!.fillStyle = `rgba(59,130,246,${0.2 + Math.sin(time * 3 + i) * 0.15})`
          ctx!.beginPath()
          ctx!.arc(px, py, 1.5, 0, Math.PI * 2)
          ctx!.fill()
        }

        ctx!.restore()
      }

      // 코어 글로우
      const pulseR = 40 + Math.sin(time * 2) * 10
      const coreGrad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, pulseR)
      coreGrad.addColorStop(0, 'rgba(100,80,255,0.12)')
      coreGrad.addColorStop(0.5, 'rgba(59,130,246,0.05)')
      coreGrad.addColorStop(1, 'transparent')
      ctx!.fillStyle = coreGrad
      ctx!.beginPath()
      ctx!.arc(cx, cy, pulseR, 0, Math.PI * 2)
      ctx!.fill()
    }

    // ── 메인 렌더 ──
    function draw() {
      // 반투명 클리어 (잔상 효과)
      ctx!.fillStyle = 'rgba(6,8,24,0.12)'
      ctx!.fillRect(0, 0, w, h)

      const time = Date.now() * 0.001

      // 매트릭스 코드 레인
      ctx!.font = `${FONT_SIZE}px monospace`
      for (let i = 0; i < columns; i++) {
        const char = CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
        const x = i * FONT_SIZE
        const y = drops[i] * FONT_SIZE

        // 헤드 (밝은 색)
        const colors = [
          ['rgba(59,130,246,', 'rgba(30,64,175,'],
          ['rgba(139,92,246,', 'rgba(88,28,135,'],
          ['rgba(6,182,212,', 'rgba(8,145,178,'],
        ]
        const [bright, dim] = colors[dropColors[i]]

        ctx!.fillStyle = bright + '0.7)'
        ctx!.fillText(char, x, y)

        // 트레일 (어두운 색)
        for (let t = 1; t < 15; t++) {
          const trailY = y - t * FONT_SIZE
          if (trailY < 0) break
          const trailChar = CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
          ctx!.fillStyle = dim + `${Math.max(0, 0.3 - t * 0.02)})`
          ctx!.fillText(trailChar, x, trailY)
        }

        drops[i] += dropSpeeds[i]
        if (drops[i] * FONT_SIZE > h && Math.random() > 0.98) {
          drops[i] = 0
          dropSpeeds[i] = 0.3 + Math.random() * 1.2
          dropColors[i] = Math.floor(Math.random() * 3)
        }
      }

      // 떠다니는 코드 블록
      ctx!.font = '11px monospace'
      for (const block of codeBlocks) {
        block.x += block.vx
        block.y += block.vy
        if (block.x < -200) block.x = w + 100
        if (block.x > w + 200) block.x = -100
        if (block.y < -100) block.y = h + 50
        if (block.y > h + 100) block.y = -50

        ctx!.save()
        ctx!.globalAlpha = block.opacity
        ctx!.fillStyle = 'rgba(180,200,255,1)'

        // 코드 블록 배경
        const lineH = 15
        const maxW = Math.max(...block.lines.map(l => l.length)) * 7
        ctx!.fillStyle = 'rgba(20,25,60,0.4)'
        ctx!.fillRect(block.x - 4, block.y - 4, maxW + 8, block.lines.length * lineH + 8)
        ctx!.strokeStyle = 'rgba(59,130,246,0.15)'
        ctx!.lineWidth = 0.5
        ctx!.strokeRect(block.x - 4, block.y - 4, maxW + 8, block.lines.length * lineH + 8)

        block.lines.forEach((line, i) => {
          // 구문 강조 느낌
          if (line.includes('def ') || line.includes('class ') || line.includes('const ') || line.includes('async ')) {
            ctx!.fillStyle = 'rgba(139,92,246,0.9)'
          } else if (line.includes('return ') || line.includes('import ')) {
            ctx!.fillStyle = 'rgba(6,182,212,0.9)'
          } else {
            ctx!.fillStyle = 'rgba(160,180,220,0.8)'
          }
          ctx!.fillText(line, block.x, block.y + i * lineH + 12)
        })
        ctx!.restore()
      }

      // 수평 데이터 스트림
      ctx!.font = '10px monospace'
      for (const ds of dataStreams) {
        ds.offset += ds.speed
        if (ds.offset > w + ds.chars.length * 7) {
          ds.offset = -ds.chars.length * 7
        }

        for (let i = 0; i < ds.chars.length; i++) {
          const cx = ds.offset + i * 7
          if (cx < -10 || cx > w + 10) continue
          const fade = Math.sin((i / ds.chars.length) * Math.PI)
          ctx!.fillStyle = `rgba(${ds.color},${ds.opacity * fade})`
          ctx!.fillText(ds.chars[i], cx, ds.y)
        }
      }

      // 중앙 홀로그램
      drawCoreHologram(time)

      // HUD
      drawHUD(time)

      // 비네팅
      const vig = ctx!.createRadialGradient(w/2, h/2, w * 0.25, w/2, h/2, w * 0.7)
      vig.addColorStop(0, 'transparent')
      vig.addColorStop(1, 'rgba(0,0,10,0.5)')
      ctx!.fillStyle = vig
      ctx!.fillRect(0, 0, w, h)

      animId = requestAnimationFrame(draw)
    }

    resize()
    initMatrix()
    initCodeBlocks()
    initDataStreams()

    // 첫 프레임: 완전 클리어
    ctx.fillStyle = 'rgb(6,8,24)'
    ctx.fillRect(0, 0, w, h)

    draw()

    const onResize = () => { resize(); initMatrix(); initDataStreams() }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" />
}

// ============================================================
// 로그인 페이지
// ============================================================
export default function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [myauctionId, setMyauctionId] = useState('')
  const [myauctionPw, setMyauctionPw] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const result = await login(username, password)
        onLogin(result.role)
      } else {
        await register(username, password, name, title, phone, myauctionId, myauctionPw)
        setSuccess('가입 신청 완료! 관리자 승인을 기다려주세요.')
        setMode('login')
      }
    } catch (e: any) {
      setError(e.message || '요청 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative select-none" style={{ background: 'rgb(6,8,24)' }}>
      <AIMatrixCanvas />

      <div className="w-full max-w-md relative z-10">
        {/* 타이틀 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            경매 보고서 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400">자동화</span>
          </h1>
          <p className="text-slate-500 mt-2 text-xs font-mono tracking-[0.3em] uppercase">
            {mode === 'login' ? '// Secure Authentication' : '// Create New Account'}
          </p>
        </div>

        {/* 카드 */}
        <div className="bg-[rgba(10,12,35,0.85)] backdrop-blur-2xl rounded-2xl p-8 shadow-2xl border border-white/[0.06] relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
          <div className="absolute top-0 left-0 bottom-0 w-[1px] bg-gradient-to-b from-blue-500/20 via-transparent to-purple-500/20" />
          <div className="absolute top-0 right-0 bottom-0 w-[1px] bg-gradient-to-b from-purple-500/20 via-transparent to-blue-500/20" />

          {/* 탭 */}
          <div className="flex mb-6 bg-white/[0.03] rounded-xl p-1 border border-white/5">
            <button onClick={() => { setMode('login'); setError(''); setSuccess('') }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === 'login' ? 'bg-gradient-to-r from-blue-600/80 to-blue-700/80 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300'}`}>
              로그인
            </button>
            <button onClick={() => { setMode('register'); setError(''); setSuccess('') }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === 'register' ? 'bg-gradient-to-r from-purple-600/80 to-purple-700/80 text-white shadow-lg shadow-purple-600/20' : 'text-slate-500 hover:text-slate-300'}`}>
              회원가입
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1.5 font-mono tracking-[0.2em] uppercase">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="성명" required
                    className="w-full px-4 py-3 bg-white/[0.08] border border-white/[0.12] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all text-sm" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1.5 font-mono tracking-[0.2em] uppercase">Title</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="직책" required
                      className="w-full px-4 py-3 bg-white/[0.08] border border-white/[0.12] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all text-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-1.5 font-mono tracking-[0.2em] uppercase">Phone</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="전화번호" required
                      className="w-full px-4 py-3 bg-white/[0.08] border border-white/[0.12] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all text-sm" />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="block text-[10px] text-slate-500 mb-1.5 font-mono tracking-[0.2em] uppercase">ID</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
                </svg>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="아이디 입력" required
                  className="w-full pl-10 pr-4 py-3 bg-white/[0.08] border border-white/[0.12] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1.5 font-mono tracking-[0.2em] uppercase">Password</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 입력" required
                  className="w-full pl-10 pr-4 py-3 bg-white/[0.08] border border-white/[0.12] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all text-sm" />
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1.5 font-mono tracking-[0.2em] uppercase">MyAuction ID</label>
                  <input
                    type="text"
                    value={myauctionId}
                    onChange={e => setMyauctionId(e.target.value)}
                    placeholder="마이옥션 아이디"
                    required
                    className="w-full px-4 py-3 bg-white/[0.08] border border-white/[0.12] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1.5 font-mono tracking-[0.2em] uppercase">MyAuction PW</label>
                  <input
                    type="password"
                    value={myauctionPw}
                    onChange={e => setMyauctionPw(e.target.value)}
                    placeholder="마이옥션 비밀번호"
                    required
                    className="w-full px-4 py-3 bg-white/[0.08] border border-white/[0.12] rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all text-sm"
                  />
                </div>
              </>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/15 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-500/10 border border-green-500/15 rounded-xl px-4 py-3 text-green-400 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {success}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-40 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2 mt-6 text-sm">
              {loading && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading ? (mode === 'login' ? '인증 중...' : '신청 중...') : (mode === 'login' ? '로그인' : '가입 신청')}
            </button>
          </form>

          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/20 to-transparent" />
        </div>

        <div className="flex items-center justify-center gap-6 mt-6">
          <span className="text-[9px] text-slate-600 font-mono tracking-[0.3em] uppercase">AI Technology</span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span className="text-[9px] text-slate-600 font-mono tracking-[0.3em] uppercase">v1.0.0</span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span className="text-[9px] text-slate-600 font-mono tracking-[0.3em] uppercase">Encrypted</span>
        </div>
      </div>
    </div>
  )
}
