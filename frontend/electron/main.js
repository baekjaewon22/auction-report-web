const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')

let mainWindow = null
let pythonProcess = null
const BACKEND_PORT = 8001
const isDev = !app.isPackaged

// ============================================================
// Python 백엔드 서버 관리
// ============================================================
function getPythonPath() {
  if (isDev) {
    return path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')
  }
  return path.join(process.resourcesPath, 'backend', 'python', 'python.exe')
}

function getBackendDir() {
  if (isDev) {
    return path.join(__dirname, '..', '..', 'backend')
  }
  return path.join(process.resourcesPath, 'backend')
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath()
    const backendDir = getBackendDir()

    console.log(`[Electron] Python: ${pythonPath}`)
    console.log(`[Electron] Backend: ${backendDir}`)

    pythonProcess = spawn(pythonPath, [
      '-m', 'uvicorn', 'app.main:app',
      '--host', '127.0.0.1',
      '--port', String(BACKEND_PORT),
    ], {
      cwd: backendDir,
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
    title: '경매 보고서 자동화',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#f8fafc',
    show: false,
  })

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
// 앱 라이프사이클
// ============================================================
app.whenReady().then(async () => {
  try {
    console.log('[Electron] 백엔드 시작 중...')
    await startBackend()
    createWindow()
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
