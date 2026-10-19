/* ============================================================================
 * dsh-startup-hub — Host half
 * ----------------------------------------------------------------------------
 * 启动动画切换器。
 *
 * 它不自己画动画，只做四件事：
 *   1) 扫描本机的动画版本目录（startup-variants / startup-animations /
 *      已安装的 dsh-startup-* 插件），读 package.json 得到名字与版本；
 *   2) 在 index.html 里按「当前选中的版本」注入首屏黑幕、样式、配置与运行时；
 *   3) 把选中版本的 lib/splash.css、lib/splash.js、lib/assets、asset-data.js
 *      通过自己的路由发出去（脚本里的 /dsh-startup/... 会改写成这里的前缀，
 *      这样多个动画包可以共用一套运行时而不抢同一组旧路由）；
 *   4) 提供 /api/state 与 /api/apply，给设置页列版本、切换、立即应用。
 *
 * 「应用」只是写一个 JSON 选择文件；下一个 index 请求就会用新版本渲染。
 * 设置页随后刷新页面即可看到，不需要重启 DSH。
 * ========================================================================== */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { readDefaultsFromSource } from './defaults.js'

const NS = 'dsh-startup-hub'
const ROUTE = '/dsh-startup-hub'

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const VARIANT_ROOTS = [
  path.join(DSH_HOME, 'skins', 'startup-variants'),
  path.join(DSH_HOME, 'skins', 'startup-animations'),
  path.join(DSH_HOME, 'plugins')
]
const SELECTION_FILE = path.join(DSH_HOME, 'startup-animation.json')
const CONFIG_FILE = path.join(DSH_HOME, 'dsh-startup.json')
const CONFIG_DIR = path.join(DSH_HOME, 'startup-hub', 'configs')
const LEGACY_MARKER = path.join(DSH_HOME, 'skins', 'startup-variants', '_active.txt')

const OFF = '@off'
const RANDOM = '@random'
const SELF_NAME = 'dsh-startup-hub'

/* ── 小工具 ─────────────────────────────────────────────────────────────── */

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return null
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch (err) {
    return false
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile()
  } catch (err) {
    return false
  }
}

function firstLine(text, limit) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length > limit ? s.slice(0, limit - 1) + '…' : s
}

/* ── 版本发现 ───────────────────────────────────────────────────────────── */

/**
 * 一个可播放的版本必须同时具备：
 *   - package.json（有 name）
 *   - lib/splash.js 与 lib/splash.css
 * 目录来源不同（动画库 / 已安装插件）但运行时文件结构相同。
 */
function readVariant(dir, source) {
  const lib = path.join(dir, 'lib')
  const js = path.join(lib, 'splash.js')
  const css = path.join(lib, 'splash.css')
  if (!isFile(js) || !isFile(css)) return null

  const pkg = readJson(path.join(dir, 'package.json'))
  if (!pkg || !pkg.name || pkg.name === SELF_NAME) return null

  const version = String(pkg.version || '0.0.0')
  const key = pkg.name + '@' + version
  let bytes = 0
  try {
    bytes = fs.statSync(js).size
  } catch (err) {
    bytes = 0
  }

  return {
    key,
    name: String(pkg.name),
    version,
    title: path.basename(dir),
    description: firstLine(pkg.description, 220),
    source,
    dir,
    lib,
    bytes,
    hasAssetData: isFile(path.join(lib, 'asset-data.js'))
  }
}

/** 按优先级扫描三个根目录；同名同版本的重复项以先出现的为准。 */
function listVariants() {
  const out = []
  const seen = new Set()

  for (let i = 0; i < VARIANT_ROOTS.length; i++) {
    const root = VARIANT_ROOTS[i]
    const source = i === 0 ? 'library' : i === 1 ? 'library' : 'installed'
    let entries = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch (err) {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const dir = path.join(root, entry.name)
      if (!isDir(dir)) continue
      const v = readVariant(dir, source)
      if (!v || seen.has(v.key)) continue
      seen.add(v.key)
      out.push(v)
    }
  }

  out.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  return out
}

/* ── 当前选择 ───────────────────────────────────────────────────────────── */

function readSelection() {
  const j = readJson(SELECTION_FILE)
  if (j && typeof j.active === 'string' && j.active) return j.active
  return ''
}

/** 老切换器留下的 _active.txt：第一次升级时把它迁移过来。 */
function legacySelection(variants) {
  let text = ''
  try {
    text = fs.readFileSync(LEGACY_MARKER, 'utf8').trim()
  } catch (err) {
    return ''
  }
  if (!text) return ''
  const hit = variants.find((v) => v.title === text || v.key === text)
  return hit ? hit.key : ''
}

function currentSelection(variants) {
  const saved = readSelection()
  if (saved) return saved
  return legacySelection(variants) || OFF
}

/** 解析当前选择。随机模式每次调用挑一个。 */
function resolveSelection(variants) {
  const selection = currentSelection(variants)
  if (selection === OFF) return { selection, variant: null }
  if (selection === RANDOM) {
    const variant = variants.length ? variants[Math.floor(Math.random() * variants.length)] : null
    return { selection, variant }
  }
  return { selection, variant: variants.find((v) => v.key === selection) || null }
}

/* ── 每个版本各自一份参数 ───────────────────────────────────────────────── */

/**
 * 动画包原本共用 ~/.dsh/dsh-startup.json。但不同动画的字段与默认文案并不相同，
 * 共用一份会把 A 的身份名/品牌字/主题带进 B。这里按版本分开存：
 *   - 老配置只归「当时正在用的那个版本」（_active.txt 里记的目录名）；
 *   - 其他版本没有自己的文件时用下面这份最小基础值，其余字段由动画自身的
 *     DEFAULTS 补齐。
 */
const CONFIG_BASE = { enabled: true, mode: 'session' }

function configFileFor(v) {
  const safe = (v.name + '@' + v.version).replace(/[^A-Za-z0-9._@-]/g, '_')
  return path.join(CONFIG_DIR, safe + '.json')
}

function readSharedConfig() {
  const j = readJson(CONFIG_FILE)
  return j && typeof j === 'object' && !Array.isArray(j) ? j : {}
}

function isLegacyHome(v) {
  try {
    return fs.readFileSync(LEGACY_MARKER, 'utf8').trim() === v.title
  } catch (err) {
    return false
  }
}

function readConfigFor(v) {
  if (!v) return { ...CONFIG_BASE }
  const own = readJson(configFileFor(v))
  if (own && typeof own === 'object' && !Array.isArray(own)) return Object.assign({}, CONFIG_BASE, own)
  if (isLegacyHome(v)) return Object.assign({}, CONFIG_BASE, readSharedConfig())
  return { ...CONFIG_BASE }
}

function writeConfigFor(v, patch) {
  const next = Object.assign({}, readConfigFor(v), patch && typeof patch === 'object' ? patch : {})
  writeJson(configFileFor(v), next)
  return next
}

function removeFile(file) {
  try {
    fs.unlinkSync(file)
  } catch (err) {
    /* 文件本来就不存在：当作已经恢复默认 */
  }
}

/**
 * 动画包的 splash.js 顶部有一份 DEFAULTS，设置页靠它显示「这个版本原本是
 * 什么样子」。不同动画的字段、品牌字、主题都不一样，不能拿一份写死的默认值
 * 冒充另一个版本。这里按 splash.js 的 mtime+size 缓存解析结果。
 */
const defaultsCache = new Map()

function readDefaults(v) {
  if (!v) return {}
  const file = path.join(v.lib, 'splash.js')
  const sig = fileSignature(file)
  const hit = defaultsCache.get(v.key)
  if (hit && hit.sig === sig) return hit.defaults

  let defaults = {}
  try {
    defaults = readDefaultsFromSource(fs.readFileSync(file, 'utf8')) || {}
  } catch (err) {
    defaults = {}
  }

  defaultsCache.set(v.key, { sig, defaults })
  return defaults
}

/* ── 运行时资源 ─────────────────────────────────────────────────────────── */

function fileSignature(file) {
  try {
    const st = fs.statSync(file)
    return String(Math.round(st.mtimeMs)) + '-' + String(st.size)
  } catch (err) {
    return '0-0'
  }
}

function assetBase(v) {
  return ROUTE + '/asset/' + encodeURIComponent(v.key) + '/'
}

/**
 * 动画包的 splash.js 里写死了 /dsh-startup/... 的旧路径。
 * 这里把它改写到本插件自己的前缀，并按版本隔离音频路径，避免多个版本抢路由、
 * 也避免浏览器拿另一个版本的缓存音频。
 */
function rewriteSplashJs(text, v) {
  const scriptUrl = ROUTE + '/splash.js?v=' + encodeURIComponent(v.key)
  return text
    .split('/dsh-startup/splash.js?t=')
    .join(scriptUrl + '&t=')
    .split('/dsh-startup/splash.js')
    .join(scriptUrl)
    .split('/dsh-startup/asset/')
    .join(assetBase(v))
}

/** 从请求里定位版本：优先 ?v=，其次路径里的 /asset/<key>/，最后当前选择。 */
function variantForRequest(req, variants) {
  let url
  try {
    url = new URL(req.url || '/', 'http://localhost')
  } catch (err) {
    url = null
  }

  const q = url ? url.searchParams.get('v') : ''
  if (q) {
    const hit = variants.find((v) => v.key === q)
    if (hit) return hit
  }

  const m = /^\/dsh-startup-hub\/asset\/([^/]+)\//.exec(url ? url.pathname : '')
  if (m) {
    let key = ''
    try {
      key = decodeURIComponent(m[1])
    } catch (err) {
      key = ''
    }
    const hit = variants.find((v) => v.key === key)
    if (hit) return hit
  }

  return resolveSelection(variants).variant
}

/* ── HTTP 辅助 ──────────────────────────────────────────────────────────── */

function sendJson(res, code, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(body.length)
  })
  res.end(body)
}

function sendText(res, type, text) {
  const body = Buffer.from(text, 'utf8')
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Content-Length': String(body.length)
  })
  res.end(body)
}

function sendFile(res, type, file) {
  let bytes
  try {
    bytes = fs.readFileSync(file)
  } catch (err) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Content-Length': String(bytes.length)
  })
  res.end(bytes)
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        req.destroy()
        resolve('')
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(''))
  })
}

/** 内联脚本里不能出现 `</script>`。 */
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '')
}

/* ── 首屏注入 ───────────────────────────────────────────────────────────── */

const CRITICAL_CSS = [
  'html.dsu-lock,html.dsu-lock body{overflow:hidden!important}',
  '#dsh-startup-root.dsu-boot{position:fixed;inset:0;z-index:2147483000;background:#000}'
].join('')

/** 与动画包自带的兜底逻辑同款：9 秒后无论发生什么都要把页面放出来。 */
const BOOTSTRAP_JS = `(function(){try{
var c=window.__DSH_STARTUP__||{};
var root=document.getElementById('dsh-startup-root');
var off=!c.enabled;
if(!off&&c.mode==='session'&&sessionStorage.getItem('dsh-startup-screen:shown')==='1')off=true;
if(!off&&c.mode==='daily'&&localStorage.getItem('dsh-startup-screen:day')===new Date().toISOString().slice(0,10))off=true;
if(off){window.__DSH_STARTUP_SKIP__=true;if(root&&root.parentNode)root.parentNode.removeChild(root);}
else{document.documentElement.classList.add('dsu-lock');setTimeout(function(){try{var r=document.getElementById('dsh-startup-root');if(r&&r.className&&r.className.indexOf('dsu-boot')!==-1){if(r.parentNode)r.parentNode.removeChild(r);document.documentElement.classList.remove('dsu-lock');if(document.body)document.body.style.overflow='';window.__DSH_STARTUP_FAILED__=true;}}catch(e){}},9000);}
}catch(e){} })()`

function buildIndexInjection(v, cfg, variants) {
  const sig = fileSignature(path.join(v.lib, 'splash.js'))
  const q = '?v=' + encodeURIComponent(v.key) + '&t=' + encodeURIComponent(sig)
  const head =
    '<link rel="stylesheet" href="' + ROUTE + '/splash.css' + q + '">' +
    '<style id="dsh-startup-critical">' + CRITICAL_CSS + '</style>'

  const scripts = []
  if (v.hasAssetData) scripts.push('<script defer src="' + ROUTE + '/asset-data.js' + q + '"></script>')
  scripts.push('<script defer src="' + ROUTE + '/splash.js' + q + '"></script>')

  const body =
    '<div id="dsh-startup-root" class="dsu-root dsu-boot"></div>' +
    '<script>window.__DSH_STARTUP_BOOT__="index";' +
    'window.__DSH_STARTUP_VERSION__=' + safeJson(v.version) + ';' +
    'window.__DSH_STARTUP_CONFIG_URL__=' + safeJson(ROUTE + '/config?v=' + encodeURIComponent(v.key)) + ';' +
    'window.__DSH_STARTUP__=' + safeJson(cfg) + ';' +
    BOOTSTRAP_JS + '</script>' +
    scripts.join('')

  return { head, body }
}

/* ── 插件 ───────────────────────────────────────────────────────────────── */

const name = NS
const inject = ['webServer', 'connection']

function resolveWebServer(ctx) {
  try {
    const viaGet = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
    if (viaGet) return viaGet
  } catch (err) {
    /* 取不到就当没有 */
  }
  return ctx.webServer
}

function hasRoutes(server) {
  return !!server && typeof server.register === 'function' && typeof server.tapIndex === 'function'
}

function apply(ctx) {
  const disposers = []
  const webServer = resolveWebServer(ctx)

  if (!hasRoutes(webServer)) {
    try {
      ctx.logger?.warn?.(
        '[' + NS + '] 当前 profile 没有可用的 webServer；启动动画由浏览器半侧自举。'
      )
    } catch (err) {
      /* 日志失败不影响加载 */
    }
    return
  }

  /** 浏览器信任栅栏：自定义路由必须过一遍，否则任意网页都能读写。 */
  function rejected(req, res) {
    try {
      const conn = (typeof ctx.get === 'function' ? ctx.get('connection') : undefined) || ctx.connection
      if (!conn || typeof conn.requestRejection !== 'function') return false
      const code = conn.requestRejection(req)
      if (code === undefined || code === null || code === false) return false
      res.statusCode = typeof code === 'number' ? code : 403
      res.end()
      return true
    } catch (err) {
      return false
    }
  }

  function registerRoute(route) {
    const inner = route && route.handler
    const wrapped = Object.assign({}, route, {
      handler: async (req, res) => {
        if (rejected(req, res)) return
        try {
          return await inner(req, res)
        } catch (err) {
          try {
            sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
          } catch (e) {
            /* 响应已经发出去就忽略 */
          }
        }
      }
    })
    return webServer.register(wrapped)
  }

  function publicVariant(v) {
    return {
      key: v.key,
      name: v.name,
      version: v.version,
      title: v.title,
      description: v.description,
      source: v.source,
      bytes: v.bytes,
      hasAssetData: v.hasAssetData
    }
  }

  /* ── 版本列表 / 当前状态 ─────────────────────────────────────────────── */

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE + '/api/state',
    handler: (req, res) => {
      const variants = listVariants()
      const { selection, variant } = resolveSelection(variants)
      sendJson(res, 200, {
        ok: true,
        active: variant ? variant.key : '',
        activeVariant: variant ? publicVariant(variant) : null,
        selection,
        variants: variants.map(publicVariant),
        config: readConfigFor(variant),
        defaults: readDefaults(variant),
        home: DSH_HOME,
        selectionFile: SELECTION_FILE
      })
    }
  }))

  /* ── 切换 / 应用 ─────────────────────────────────────────────────────── */

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE + '/api/apply',
    handler: async (req, res) => {
      if ((req.method || 'GET').toUpperCase() !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }

      const text = await readBody(req)
      let payload = {}
      try {
        payload = text ? JSON.parse(text) : {}
      } catch (err) {
        sendJson(res, 400, { ok: false, error: 'invalid json' })
        return
      }

      const key = String(payload.key || '').trim()
      const variants = listVariants()
      const allowed =
        key === OFF || key === RANDOM || variants.some((v) => v.key === key)
      if (!allowed) {
        sendJson(res, 400, { ok: false, error: 'unknown variant: ' + key })
        return
      }

      writeJson(SELECTION_FILE, {
        active: key,
        updatedAt: new Date().toISOString()
      })

      sendJson(res, 200, { ok: true, active: key })
    }
  }))

  /* ── 当前版本的参数：给动画运行时重播时拉最新值 ─────────────────────── */

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE + '/config',
    handler: async (req, res) => {
      const method = (req.method || 'GET').toUpperCase()
      const v = variantForRequest(req, listVariants())
      if (!v) {
        if (method === 'GET') {
          sendJson(res, 200, { ok: true, config: {}, defaults: {}, file: CONFIG_FILE })
          return
        }
        sendJson(res, 409, { ok: false, error: 'no active variant' })
        return
      }
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, config: readConfigFor(v), defaults: readDefaults(v), file: configFileFor(v) })
        return
      }
      if (method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const text = await readBody(req)
      let payload = {}
      try {
        payload = text ? JSON.parse(text) : {}
      } catch (err) {
        sendJson(res, 400, { ok: false, error: 'invalid json' })
        return
      }

      /* 恢复默认：把该版本自己的 DEFAULTS 整份写回。
         不删文件 —— 老版本可能还挂着共享的 ~/.dsh/dsh-startup.json，
         删掉后会被老配置重新填满，看起来像「恢复默认没生效」。 */
      if (payload && payload.action === 'reset') {
        const defaults = readDefaults(v)
        let next
        if (Object.keys(defaults).length) {
          next = writeConfigFor(v, defaults)
        } else {
          removeFile(configFileFor(v))
          next = readConfigFor(v)
        }
        sendJson(res, 200, {
          ok: true,
          config: next,
          defaults: defaults,
          file: configFileFor(v)
        })
        return
      }

      const patch = payload && typeof payload.patch === 'object' && payload.patch ? payload.patch : payload
      sendJson(res, 200, {
        ok: true,
        config: writeConfigFor(v, patch),
        defaults: readDefaults(v),
        file: configFileFor(v)
      })
    }
  }))

  /* ── 运行时文件 ─────────────────────────────────────────────────────── */

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE + '/splash.css',
    handler: (req, res) => {
      const v = variantForRequest(req, listVariants())
      if (!v) {
        res.writeHead(404)
        res.end()
        return
      }
      sendFile(res, 'text/css; charset=utf-8', path.join(v.lib, 'splash.css'))
    }
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE + '/splash.js',
    handler: (req, res) => {
      const v = variantForRequest(req, listVariants())
      if (!v) {
        res.writeHead(404)
        res.end()
        return
      }
      let text = ''
      try {
        text = fs.readFileSync(path.join(v.lib, 'splash.js'), 'utf8')
      } catch (err) {
        res.writeHead(404)
        res.end()
        return
      }
      sendText(res, 'application/javascript; charset=utf-8', rewriteSplashJs(text, v))
    }
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE + '/asset-data.js',
    handler: (req, res) => {
      const v = variantForRequest(req, listVariants())
      if (!v || !v.hasAssetData) {
        res.writeHead(404)
        res.end()
        return
      }
      sendFile(res, 'application/javascript; charset=utf-8', path.join(v.lib, 'asset-data.js'))
    }
  }))

  disposers.push(registerRoute({
    kind: 'prefix',
    path: ROUTE + '/asset',
    handler: (req, res) => {
      const v = variantForRequest(req, listVariants())
      const base = req.url || ''
      const file = path.basename(decodeURIComponent(base.split('?')[0]))
      if (!v || !/^[a-z0-9._-]+\.(mp3|ogg|wav|m4a)$/i.test(file) || file.includes('..')) {
        res.writeHead(404)
        res.end()
        return
      }
      const type = /\.mp3$/i.test(file)
        ? 'audio/mpeg'
        : /\.ogg$/i.test(file)
          ? 'audio/ogg'
          : /\.wav$/i.test(file)
            ? 'audio/wav'
            : 'audio/mp4'
      sendFile(res, type, path.join(v.lib, 'assets', file))
    }
  }))

  /* ── 首屏注入 ───────────────────────────────────────────────────────── */

  disposers.push(webServer.tapIndex((html) => {
    if (!html) return html
    /* 已经有别的启动动画注入了：不抢，避免两个黑幕叠在一起。 */
    if (html.includes('dsh-startup-root')) return html

    const variants = listVariants()
    const { variant } = resolveSelection(variants)
    if (!variant) return html

    const { head, body } = buildIndexInjection(variant, readConfigFor(variant), variants)

    let out = html
    if (out.includes('</head>')) out = out.replace('</head>', head + '</head>')
    else out = head + out

    if (out.includes('<body>')) out = out.replace('<body>', '<body>' + body)
    else if (out.includes('</body>')) out = out.replace('</body>', body + '</body>')
    else out = out + body
    return out
  }))

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch (err) {
        /* noop */
      }
    }
  })
}

export { apply, inject, name }
