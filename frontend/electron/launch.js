// Electron 런처: ELECTRON_RUN_AS_NODE 환경변수를 제거하고 electron.exe 실행
const { spawn } = require('child_process')
const path = require('path')

const electronPath = require('electron')
const appPath = path.join(__dirname, '..')

// ELECTRON_RUN_AS_NODE 제거 (VSCode 터미널 환경 대응)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, [appPath], {
  stdio: 'inherit',
  env,
})

child.on('close', (code) => process.exit(code || 0))
