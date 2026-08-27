// DeepSeek Harness 桌面封装(完全便携版)
// 职责:定位/解压内置 dsh 运行时 -> 用内置 node 拉起 dsh web 服务 -> 标准窗口加载 UI -> 关闭最小化到托盘
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const HOST = '127.0.0.1';
const PORT = 3080;
// 用 localhost 访问:官方 FAQ 提示 API 信任校验对 localhost 更友好(127.0.0.1 可能 403)
const APP_URL = `http://localhost:${PORT}`;

let mainWindow = null;
let tray = null;
let dshProc = null;
let isQuitting = false;

// ---------- 单实例 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // 禁用系统代理:渲染进程只需连 localhost,走代理会拦截 fetch/WebSocket 导致 Failed to fetch
  app.commandLine.appendSwitch('no-proxy-server');
  app.on('second-instance', () => showMainWindow());
  app.whenReady().then(onReady);
}

function iconPath() {
  return path.join(__dirname, 'assets', 'icon.ico');
}

// ---------- 运行时定位 ----------
function nodeBin() {
  // 打包后优先用内置 node.exe(免装 Node),否则回退系统 node(开发时)
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, 'node-runtime', 'node.exe');
    if (fs.existsSync(p)) return p;
  }
  return 'node';
}

function userDataRuntime() {
  return path.join(app.getPath('userData'), 'dsh-runtime');
}

function dshEntry(runtimeDir) {
  return path.join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
}

function builtinZip() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'dsh-runtime.zip')
    : path.join(__dirname, 'dsh-runtime.zip');
}

// 解压内置 dsh 运行时 zip 到用户数据目录(首次启动)
// 用 .NET ZipFile 而非 Expand-Archive(后者会丢大量文件)
function extractRuntime(cb) {
  const zip = builtinZip();
  const dest = app.getPath('userData');
  const rt = path.join(dest, 'dsh-runtime');
  const cmd = [
    `Remove-Item -LiteralPath "${rt}" -Recurse -Force -ErrorAction SilentlyContinue;`,
    `Add-Type -AssemblyName System.IO.Compression.FileSystem;`,
    `[System.IO.Compression.ZipFile]::ExtractToDirectory("${zip}", "${dest}")`,
  ].join(' ');
  const ps = spawn('powershell', ['-NoProfile', '-Command', cmd], { windowsHide: true, stdio: 'ignore' });
  ps.on('exit', () => cb());
  ps.on('error', () => cb());
}

function spawnDsh(runtimeDir) {
  const nb = nodeBin();
  const args = [
    dshEntry(runtimeDir),
    '--profile', 'web',
    '--no-open',
    '--host', HOST,
    '--port', String(PORT),
    '--trusted-host', 'localhost',
  ];
  const opts = {
    cwd: app.getPath('home'),
    env: { ...process.env, BROWSER: 'none', NO_BROWSER: '1' },
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  };
  dshProc = nb === 'node'
    ? spawn(nb, args, { ...opts, shell: true })
    : spawn(nb, args, opts);
  dshProc.on('exit', () => { dshProc = null; });
  dshProc.on('error', (err) => console.error('[dsh] 启动失败:', err));
}

function startServer() {
  const ud = userDataRuntime();
  if (fs.existsSync(dshEntry(ud))) {
    spawnDsh(ud);
  } else {
    extractRuntime(() => {
      if (fs.existsSync(dshEntry(ud))) {
        spawnDsh(ud);
      } else {
        console.error('[dsh] 运行时解压失败');
      }
    });
  }
}

// 轮询等待本地服务就绪(首次解压运行时可能较慢,最多约 10 分钟)
function waitForServer(onReady, attempts = 0) {
  const req = http.get(APP_URL, (res) => {
    res.resume();
    onReady();
  });
  req.on('error', () => {
    if (attempts < 600) {
      setTimeout(() => waitForServer(onReady, attempts + 1), 1000);
    } else {
      onReady(); // 超时也尝试加载,窗口内会显示连接失败
    }
  });
  req.setTimeout(1500, () => req.destroy());
}

// ---------- 主窗口 ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 560,
    title: 'DeepSeek Harness',
    icon: iconPath(),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // 先显示启动画面,带动画和 Logo,服务就绪后再加载正式 UI
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(135deg,#0d1117 0%,#161b22 100%);color:#e6edf3;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;user-select:none;overflow:hidden}
.logo{font-size:72px;line-height:1;animation:fadeIn 0.8s ease-out}
.logo-text{font-size:28px;font-weight:600;margin-top:20px;letter-spacing:0.5px;animation:fadeIn 0.8s ease-out 0.2s both}
.subtitle{font-size:14px;color:#8b949e;margin-top:8px;animation:fadeIn 0.8s ease-out 0.4s both}
.spinner{margin-top:40px;width:32px;height:32px;border:3px solid #30363d;border-top-color:#58a6ff;border-radius:50%;animation:spin .8s linear infinite,fadeIn 0.8s ease-out 0.6s both}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>
<div class="logo">🐋</div>
<div class="logo-text">DeepSeek Harness</div>
<div class="subtitle">正在启动…</div>
<div class="spinner"></div>
</body>
</html>`));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  waitForServer(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(APP_URL);
    }
  });

  // 点关闭 = 最小化到托盘(而不是退出)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function showMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

// ---------- 系统托盘 ----------
function createTray() {
  const icon = nativeImage.createFromPath(iconPath());
  tray = new Tray(icon);
  tray.setToolTip('DeepSeek Harness');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 DeepSeek Harness', click: showMainWindow },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function onReady() {
  startServer();
  createTray();
  createWindow();
}

// ---------- 退出时清理 dsh 子进程 ----------
app.on('before-quit', () => {
  isQuitting = true;
  if (dshProc) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(dshProc.pid), '/T', '/F'], { windowsHide: true });
      } else {
        dshProc.kill('SIGTERM');
      }
    } catch (e) { /* 忽略 */ }
  }
});
