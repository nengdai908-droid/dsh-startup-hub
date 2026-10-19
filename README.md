# dsh-startup-hub

DSH 启动动画中心：一个设置页，列出本机所有启动动画版本，点一下就换，立即生效；
每个版本的播放、身份、交互、语音、视觉、文案参数都能单独改。

## 它解决什么

原来的做法是「二选一装包」：`dsh-startup-screen` 和 `dsh-startup-secret` 抢同一组
`/dsh-startup/*` 路由和同一个首屏注入位置，只能启用其中一个；换版本要改 profile、
退出 DSH、再重启。

这个插件独占首屏注入，但不带任何动画本体。它按当前选择，把目标版本的
`splash.css` / `splash.js` / `assets` 通过自己的 `/dsh-startup-hub/*` 路由发出去，
并把动画脚本里写死的 `/dsh-startup/...` 改写到该前缀。于是多个动画包可以同时留在
本机，切换只是改一个 JSON，下一次页面加载就用新版本。

## 用法

1. 设置 →「启动动画」。
2. 在版本卡片上点「应用」，页面自动刷新并播放一次；不需要重启 DSH。
3. 「每次随机」「关闭启动动画」也在同一页。
4. 页面下半部分是「详细设置」：先选要编辑的版本，改完点「保存」或「立即预览」。

## 详细设置

字段直接对应动画包 `splash.js` 里的 `DEFAULTS`，某个版本没有的字段不会显示：

| 分组 | 内容 |
|---|---|
| 播放 | 启用、播放时机（会话一次 / 每天一次 / 每次都播）、速度倍率 |
| 身份资料 | 身份名称、身份编号、权限等级、身份密码 |
| 交互 | 自动播放三档（完全自动 / 点一次 / 不自动）、允许跳过 |
| 语音与音效 | 女声播报、音色（5 种内置真声，可试听）、播报音量、提示音、界面音效、音效音量 |
| 视觉 | 主题、人物立绘、降世事件窗口、主色、故障色 |
| 文案 | 左上标题/副标题/产品行、黑幕中英文与小字、终幕黑框、页脚 |

每个版本的参数存在自己的文件里，换版本不会把品牌字和主题带过去。
「恢复默认」写入的是该版本自己的 `DEFAULTS`，不会被旧的共享配置重新覆盖。

旧版 Host 的 `/config` 不带 `defaults` 字段时，设置页会自己拉该版本的
`splash.js` 解析一次 DEFAULTS（只做字面量解析，不执行动画代码），所以只刷新页面
也能用；Host 升级后直接复用接口返回的默认值，不再重复拉 1.4 MB 的脚本。

## 版本从哪来

按顺序扫描，去重（同包名同版本只留第一个）：

| 目录 | 来源标记 |
|---|---|
| `%USERPROFILE%\.dsh\skins\startup-variants\*\` | 动画库 |
| `%USERPROFILE%\.dsh\skins\startup-animations\*\` | 动画库 |
| `%USERPROFILE%\.dsh\plugins\dsh-startup-*\` | 已安装 |

每个版本目录需要满足：

```
<版本目录>/
  package.json        # 至少有 name / version / description
  lib/splash.js
  lib/splash.css
  lib/assets/         # 可选，splash.js 用到的 mp3
  lib/asset-data.js   # 可选，内联音频的动画包
```

把新动画包整个目录丢进 `startup-variants`，回设置页点「刷新列表」即可。

## 状态文件

- 选择：`%USERPROFILE%\.dsh\startup-animation.json`
- 每个版本的参数：`%USERPROFILE%\.dsh\startup-hub\configs\<包名>@<版本>.json`

首次启动时如果存在旧的 `startup-variants\_active.txt`，会按目录名自动迁移一次；
老版共享的 `~/.dsh/dsh-startup.json` 只作为那个「当时正在用的版本」的初始参数，
不会把它的身份名、品牌字、主题带到另一个动画里。其他版本没有自己的参数文件时，
用 `{ enabled: true, mode: 'session' }` 加动画自身的默认值。

## 安装

**从插件市场装（推荐）**：DSH 里打开「插件」页 → 市场，搜 `dsh-startup-hub`，点安装，重启一次 DSH。

**命令行**（独立 DSH / 非桌面版）：

```bash
dsh plugin --profile <你的 profile> add dsh-startup-hub
```

> DSH 桌面版的 `desktop` profile 由应用独占，命令行会被拒绝
> （`profile "desktop" is managed exclusively by the Electron application`）。
> 桌面版请走插件页或市场。

**从源码装**：

```bash
git clone https://github.com/<your-name>/dsh-startup-hub
cd dsh-startup-hub
dsh plugin --profile <你的 profile> add link:$PWD
```

装完重启 DSH，在 **设置 →「启动动画」** 里使用。本机还没有动画版本时，
往 `~/.dsh/skins/startup-variants/<名字>/` 放一个动画包（结构见上一节），
回设置页点「刷新列表」。

## 它会读写什么

- **只读**扫描：`~/.dsh/skins/startup-variants/`、`~/.dsh/skins/startup-animations/`、
  `~/.dsh/plugins/dsh-startup-*/`——只用来列版本，不改动它们；
- **写**：`~/.dsh/startup-animation.json`（当前选择）、
  `~/.dsh/startup-hub/configs/<包名>@<版本>.json`（每个版本的参数）；
- **不访问外网**：只和本机 DSH 自己的 HTTP 路由（`/dsh-startup-hub/*`）以及上面这些文件打交道；
- Host 侧**不执行动画脚本里的代码**，只做字面量解析取默认值。

## 兼容

- 首屏注入走 `webServer.tapIndex`，每个 index 响应都会重新渲染，所以切完刷新就生效。
- 桌面端没有 Host 注入时，浏览器半侧会按同一份状态自举，失败则安静放行，不锁黑屏。
- 动画运行时的 9 秒兜底、跳过、会话/每日一次等逻辑保持原样。
