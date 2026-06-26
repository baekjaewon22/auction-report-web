const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const { autoUpdater } = require('electron-updater')

let mainWindow = null
let pythonProcess = null
const BACKEND_PORT = 8001
const isDev = !app.isPackaged

// ============================================================
// Python 백엔드 서버 관리
// ============================================================
function findBackendExe() {
  const fs = require('fs')
  const exeDir = path.dirname(process.execPath)
  const candidates = [
    // 1) 번들된 backend.exe (프로덕션)
    path.join(process.resourcesPath || '', 'backend', 'backend.exe'),
    // 2) EXE 옆 resources
    path.join(exeDir, 'resources', 'backend', 'backend.exe'),
  ]
  console.log('[Electron] backend.exe 탐색:')
  for (const p of candidates) {
    try {
      const exists = fs.existsSync(p)
      console.log(`  ${exists ? 'O' : 'X'} ${p}`)
      if (exists) return p
    } catch {}
  }
  return null // EXE 못 찾으면 Python fallback
}

function findPythonFallback() {
  const fs = require('fs')
  const exeDir = path.dirname(process.execPath)
  const candidates = [
    path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe'),
    path.join(exeDir, '..', '..', '.venv', 'Scripts', 'python.exe'),
    'python',
  ]
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p } catch {}
  }
  return 'python'
}

function findBackendDir() {
  const fs = require('fs')
  const candidates = [
    path.join(__dirname, '..', '..', 'backend'),
    path.join(process.resourcesPath || '', 'backend'),
  ]
  for (const p of candidates) {
    try { if (fs.existsSync(path.join(p, 'app', 'main.py'))) return p } catch {}
  }
  return candidates[0]
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendExe = findBackendExe()

    let cmd, args, cwd

    if (backendExe) {
      // 프로덕션: backend.exe 직접 실행
      console.log(`[Electron] backend.exe: ${backendExe}`)
      cmd = backendExe
      args = [String(BACKEND_PORT)]
      cwd = path.dirname(backendExe)
    } else {
      // 개발: Python + uvicorn
      const pythonPath = findPythonFallback()
      const backendDir = findBackendDir()
      console.log(`[Electron] Python fallback: ${pythonPath}`)
      console.log(`[Electron] Backend dir: ${backendDir}`)
      cmd = pythonPath
      args = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)]
      cwd = backendDir
    }

    pythonProcess = spawn(cmd, args, {
      cwd,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })

    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`)
    })

    pythonProcess.stderr.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`)
    })

    pythonProcess.on('error', (err) => {
      console.error(`[Backend] 시작 실패:`, err)
      reject(err)
    })

    pythonProcess.on('close', (code) => {
      console.log(`[Backend] 종료: code=${code}`)
      pythonProcess = null
    })

    const startTime = Date.now()
    const checkServer = () => {
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          console.log('[Electron] 백엔드 준비 완료')
          resolve()
        }
      })
      req.on('error', () => {
        if (Date.now() - startTime > 30000) {
          reject(new Error('백엔드 서버 시작 타임아웃'))
        } else {
          setTimeout(checkServer, 500)
        }
      })
      req.end()
    }
    setTimeout(checkServer, 1000)
  })
}

function stopBackend() {
  if (pythonProcess) {
    console.log('[Electron] 백엔드 종료')
    try {
      spawn('taskkill', ['/PID', String(pythonProcess.pid), '/T', '/F'])
    } catch {}
    pythonProcess = null
  }
}

// ============================================================
// 메인 윈도우
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    maximizable: false,
    title: '경매 보고서 자동화',
    autoHideMenuBar: true,
    menuBarVisible: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#080a1e',
    show: false,
  })
  // 메뉴바 완전 제거
  mainWindow.setMenuBarVisibility(false)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ============================================================
// IPC
// ============================================================
ipcMain.handle('select-file', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: options?.filters || [{ name: 'Excel', extensions: ['xlsx'] }],
    properties: ['openFile'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('get-app-version', () => app.getVersion())

// ============================================================
// 자동 업데이트
// ============================================================
function setupAutoUpdater() {
  if (isDev) return // 개발 모드에서는 스킵

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log(`[Updater] 새 버전 발견: ${info.version}`)
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '업데이트 알림',
      message: `새 버전(v${info.version})이 있습니다.\n다운로드하시겠습니까?`,
      buttons: ['다운로드', '나중에'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate()
      }
    })
  })

  autoUpdater.on('update-downloaded', () => {
    console.log('[Updater] 다운로드 완료')
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '업데이트 준비 완료',
      message: '업데이트가 다운로드되었습니다.\n지금 재시작하시겠습니까?',
      buttons: ['재시작', '나중에'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        stopBackend()
        autoUpdater.quitAndInstall()
      }
    })
  })

  autoUpdater.on('error', (err) => {
    console.log(`[Updater] 에러: ${err.message}`)
  })

  // 시작 5초 후 업데이트 체크
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 5000)
}

// ============================================================
// 앱 라이프사이클
// ============================================================
app.whenReady().then(async () => {
  try {
    console.log('[Electron] 백엔드 시작 중...')
    await startBackend()
    createWindow()
    setupAutoUpdater()
  } catch (err) {
    console.error('[Electron] 시작 실패:', err)
    dialog.showErrorBox('시작 실패', `백엔드 서버를 시작하지 못했습니다.\n${err.message}`)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  stopBackend()
  app.quit()
})

app.on('before-quit', () => {
  stopBackend()
})
