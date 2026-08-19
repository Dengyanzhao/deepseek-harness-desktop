# DeepSeek Harness Desktop (Windows)

将 DeepSeek AI 官方的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI 封装为 Windows 桌面应用的 Electron 外壳。

> ⚠️ **非官方项目**。本仓库与 DeepSeek AI 无隶属关系,DeepSeek 名称与鲸鱼图标版权归 DeepSeek 所有。DeepSeek Harness 官方未发布桌面客户端,这是社区自用封装。

## 特性

- 🪟 标准原生窗口控件(最小化 / 最大化 / 关闭)
- 🗔 系统托盘常驻,点关闭最小化到托盘,托盘菜单可退出
- 🚀 **完全便携**:内置 Node.js 运行时与完整 dsh 依赖,对方电脑**无需安装 Node、无需联网下载**,首次启动自动解压
- 🔒 沙盒化渲染(webPreferences 启用 contextIsolation / sandbox)

## 下载

前往 [Releases](https://github.com/OWNER/deepseek-harness-desktop/releases) 下载:

| 文件 | 说明 |
|---|---|
| `DeepSeek Harness Setup x.y.z.exe` | NSIS 安装版(推荐) |
| `DeepSeek Harness x.y.z.exe` | 便携版(免安装,双击即用) |

> Windows SmartScreen 可能提示"未知发布者"(未签名),选择「更多信息 → 仍要运行」。

## 使用

1. 运行安装包(或便携版),首次启动约 1-2 分钟解压内置运行时,之后秒开
2. 在 **Models 页面**粘贴你的 DeepSeek / OpenCode API Key
3. 开始使用

## 开发与构建

```bash
npm install
npm start          # 开发模式运行
npm run dist       # 打包 NSIS 安装版 + 便携版(需先准备 node-runtime/ 与 dsh-runtime.zip)
```

打包依赖 `node-runtime/node.exe`(Node 便携版)与 `dsh-runtime.zip`(完整 dsh 依赖),二者体积大不入库,按需自行准备。

## 免责声明

- DeepSeek Harness 是具备本地代码执行能力的 agent 框架,仅供学习/研究/测试使用
- 本项目无商业代码签名,请核对仓库后自行评估使用
