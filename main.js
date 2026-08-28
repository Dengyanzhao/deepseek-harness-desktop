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

  // 先显示启动画面(深海声呐主题),服务就绪后再加载正式 UI
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(180deg,#0a1626 0%,#050a12 60%,#030507 100%);color:#e6edf3;font-family:system-ui,'Segoe UI',sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;user-select:none}
.scene{position:relative;width:220px;height:220px;display:flex;align-items:center;justify-content:center}
.wave{position:absolute;width:120px;height:120px;border-radius:50%;border:1px solid rgba(88,166,255,0.5);animation:sonar 3.6s ease-out infinite;opacity:0}
.wave:nth-child(2){animation-delay:1.2s}
.wave:nth-child(3){animation-delay:2.4s}
@keyframes sonar{0%{transform:scale(0.5);opacity:0.7}100%{transform:scale(2.6);opacity:0}}
.whale{font-size:64px;animation:swim 5s ease-in-out infinite;filter:drop-shadow(0 6px 24px rgba(20,90,180,0.55))}
@keyframes swim{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-12px) rotate(3deg)}}
.bubbles{position:absolute;bottom:0;left:0;right:0;height:42vh;pointer-events:none}
.bub{position:absolute;bottom:0;border-radius:50%;background:rgba(120,180,255,0.22);animation:rise linear infinite}
@keyframes rise{0%{transform:translateY(0);opacity:0}15%{opacity:0.7}100%{transform:translateY(-44vh);opacity:0}}
.title{margin-top:8px;font-size:24px;font-weight:600;letter-spacing:3px}
.title span{opacity:0;animation:tin 0.5s ease-out forwards}
@keyframes tin{to{opacity:1}}
.status{margin-top:14px;font-size:12px;color:#3d4a63;letter-spacing:2px;animation:blink 2.4s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:0.35}50%{opacity:1}}
</style></head><body>
<div class="bubbles" id="bub"></div>
<div class="scene">
<div class="wave"></div><div class="wave"></div><div class="wave"></div>
<div class="whale">🐋</div>
</div>
<div class="title" id="t"></div>
<div class="status">正在启动 · DEEP DIVE</div>
<script>
var s='DeepSeek Harness',h='';for(var i=0;i<s.length;i++){h+='<span style="animation-delay:'+(0.3+i*0.08)+'s">'+(s[i]==' '?'&nbsp;':s[i])+'</span>'}
document.getElementById('t').innerHTML=h;
var b='';for(var i=0;i<9;i++){b+='<div class="bub" style="left:'+(8+i*10+Math.random()*6)+'%;animation-duration:'+(6+Math.random()*6)+'s;animation-delay:'+(Math.random()*7)+'s;width:'+(3+Math.random()*5)+'px;height:'+(3+Math.random()*5)+'px"></div>'}
document.getElementById('bub').innerHTML=b;
</script>
</body></html>`));
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
