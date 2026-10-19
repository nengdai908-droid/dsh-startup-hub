/**
 * dsh-startup-hub — Client half
 * ---------------------------------------------------------------------------
 * 设置页「启动动画」分三段：
 *   1) 版本列表：点「应用」写选择并刷新页面，下一次 index 请求用新版本播放；
 *   2) 其他方式：每次随机 / 关闭；
 *   3) 详细设置：按版本编辑动画自己的参数（播放、身份、交互、语音、视觉、文案），
 *      保存到该版本独立的配置文件，点「立即预览」现场重播。
 *
 * 另外补一层桌面端自举：如果页面没有被 Host 注入启动界面（例如 Electron 用
 * file:// + IPC 下发前端），这里按同一份状态自己拉样式和运行时。
 */
window.__ModuleLoader__.load({
  id: 'dsh-startup-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect

    const API = '/dsh-startup-hub/api'
    const BOOT = '/dsh-startup-hub'
    const OFF = '@off'
    const RANDOM = '@random'

    /* ── 样式 ───────────────────────────────────────────────────────────── */

    const CSS = [
      '.sah-root{max-width:820px;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary);font-size:13px}',
      '.sah-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      '.sah-title{font-size:14px;font-weight:650;letter-spacing:.01em}',
      '.sah-sub{margin-top:4px;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-tertiary)}',
      '.sah-headActions{display:flex;gap:8px;flex-wrap:wrap}',
      '.sah-ghost{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:8px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer}',
      '.sah-ghost:hover:not(:disabled){border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.sah-ghost:disabled{opacity:.45;cursor:default}',
      '.sah-current{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:8px 12px}',
      '.sah-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent)}',
      '.sah-dot.off{background:var(--dsw-alias-state-idle-primary);box-shadow:none}',
      '.sah-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}',
      '.sah-card{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:12px;min-width:0;transition:border-color .15s ease,box-shadow .15s ease}',
      '.sah-card:hover{border-color:var(--dsw-alias-border-l2)}',
      '.sah-card.on{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent)}',
      '.sah-cardTop{display:flex;align-items:flex-start;gap:10px;min-width:0}',
      '.sah-mark{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}',
      '.sah-cardText{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}',
      '.sah-cardTitle{font-size:13px;font-weight:620;display:flex;align-items:center;gap:7px;min-width:0}',
      '.sah-cardTitle span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.sah-ver{font-family:ui-monospace,Consolas,monospace;font-size:10px;font-weight:500;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border-radius:5px;padding:1px 5px;flex:none}',
      '.sah-cardDesc{font-size:11px;line-height:1.55;color:var(--dsw-alias-label-tertiary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:32px}',
      '.sah-badge{flex:none;font-size:10px;line-height:1;padding:4px 7px;border-radius:999px;background:var(--dsw-alias-brand-primary);color:#fff}',
      '.sah-cardFoot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}',
      '.sah-meta{font-size:10px;line-height:1.5;color:var(--dsw-alias-label-tertiary);min-width:0;word-break:break-all}',
      '.sah-btn{flex:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:5px 13px;font:inherit;font-size:12px;cursor:pointer}',
      '.sah-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.sah-btn:disabled{opacity:.5;cursor:default}',
      '.sah-btn.on{border-color:transparent;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary)}',
      '.sah-btn.primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}',
      '.sah-btn.primary:hover:not(:disabled){color:#fff;opacity:.9}',
      '.sah-divider{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:2px}',
      '.sah-divider:before,.sah-divider:after{content:"";height:1px;flex:1;background:var(--dsw-alias-border-l1)}',
      '.sah-modes{display:flex;flex-direction:column;gap:8px}',
      '.sah-mode{display:flex;align-items:center;gap:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:10px 12px}',
      '.sah-mode.on{border-color:var(--dsw-alias-brand-primary)}',
      '.sah-modeIcon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:none;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.sah-modeText{flex:1;min-width:0}',
      '.sah-modeTitle{font-size:12px;font-weight:600}',
      '.sah-modeDesc{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.sah-msg{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);border-left:2px solid var(--dsw-alias-brand-primary);padding-left:9px}',
      '.sah-ok{font-size:12px;line-height:1.6;color:var(--dsw-alias-state-success-primary)}',
      '.sah-err{font-size:12px;line-height:1.6;color:var(--dsw-alias-state-error-primary)}',
      '.sah-loading{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.sah-empty{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-tertiary);border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;padding:14px}',
      '.sah-settings{display:flex;flex-direction:column;gap:12px;min-width:0}',
      '.sah-group{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:12px;min-width:0}',
      '.sah-groupTitle{font-size:12px;font-weight:650;letter-spacing:.02em;color:var(--dsw-alias-label-primary)}',
      '.sah-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.sah-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.sah-hint{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}',
      '.sah-input{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:5px 8px;font:inherit;font-size:12px;outline:none}',
      '.sah-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.sah-input.mono{font-family:ui-monospace,Consolas,monospace;font-size:11px}',
      '.sah-grow{flex:1 1 auto;width:auto}',
      '.sah-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}',
      '.sah-check{display:flex;align-items:flex-start;gap:8px;cursor:pointer;min-width:0}',
      '.sah-check input{margin:2px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary)}',
      '.sah-checkText{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.sah-checkLabel{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.sah-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '@media(max-width:640px){.sah-two{grid-template-columns:1fr}}',
      '.sah-range{flex:1 1 200px;min-width:120px;accent-color:var(--dsw-alias-brand-primary)}',
      '.sah-value{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);min-width:44px;text-align:right}',
      '.sah-color{width:42px;height:26px;flex:none;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);cursor:pointer}',
      '.sah-actionsBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.sah-file{font-family:ui-monospace,Consolas,monospace;font-size:10px;line-height:1.5;color:var(--dsw-alias-label-tertiary);word-break:break-all}'
    ].join('\n')

    /* ── 小工具 ─────────────────────────────────────────────────────────── */

    function hueOf(key) {
      let n = 0
      for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) >>> 0
      return n % 360
    }

    function fmtBytes(bytes) {
      const n = Number(bytes) || 0
      if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
      if (n >= 1024) return Math.round(n / 1024) + ' KB'
      return n + ' B'
    }

    function clearBootMarkers() {
      try {
        window.sessionStorage.removeItem('dsh-startup-screen:shown')
      } catch (err) {
        /* 忽略 */
      }
      try {
        window.localStorage.removeItem('dsh-startup-screen:day')
      } catch (err) {
        /* 忽略 */
      }
    }

    /* 刷新页面时换掉缓存键。
       DSH 的 index 响应没有 cache-control，浏览器会按启发式缓存它；直接 reload
       可能拿到旧 index，而里面登记的插件 bundle rev 早已失效 —— 插件脚本 404，
       web boot 判定「entry did not activate」后整个客户端起不来。
       加一个一次性查询参数，强制服务端重新给一份 index。 */
    function reloadFresh(delay) {
      window.setTimeout(function () {
        try {
          var url = new URL(window.location.href)
          url.searchParams.set('dsh_boot', String(Date.now()))
          window.location.replace(url.href)
        } catch (err) {
          window.location.reload()
        }
      }, typeof delay === 'number' ? delay : 400)
    }

    function labelOf(entry) {
      if (!entry) return ''
      return entry.title || (entry.name + ' v' + entry.version)
    }

    function playIcon() {
      return h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': true },
        h('path', { d: 'M8 5v14l11-7z', fill: 'currentColor' }))
    }

    function shuffleIcon() {
      return h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, 'aria-hidden': true },
        h('path', {
          d: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round'
        }))
    }

    function powerIcon() {
      return h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, 'aria-hidden': true },
        h('path', {
          d: 'M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round'
        }))
    }

    /* ── 桌面端自举（Host 没注入时兜底） ────────────────────────────────── */

    let bootStarted = false

    /* ── 首屏遮罩（移植自本地修法）─────────────────────────────────────
       桌面端拿不到 Host 的 index 注入时，启动界面只能靠浏览器半侧自举：
         模块加载 → fetch /state → 拉 splash.css / splash.js
       这几百毫秒里工作台已经画出来了 —— 表现就是"工作台先出、动画后盖"。
       这块遮罩在 factory 求值时**同步**挂上（不等 apply、不等网络），
       启动界面接管后淡出；不播 / 失败 / 9 秒兜底都会撤掉。 */
    var CURTAIN_ID = 'dsh-startup-curtain'

    function dropCurtain(instant) {
      try {
        var c = document.getElementById(CURTAIN_ID)
        if (!c) return
        if (instant) { if (c.parentNode) c.parentNode.removeChild(c); return }
        c.style.transition = 'opacity 240ms linear'
        c.style.opacity = '0'
        setTimeout(function () { try { if (c.parentNode) c.parentNode.removeChild(c) } catch (e) {} }, 300)
      } catch (e) {}
    }

    function earlyCurtain() {
      try {
        if (typeof document === 'undefined') return
        if (window.__DSH_STARTUP_BOOT__) return
        if (window.__DSH_STARTUP__) return
        if (document.getElementById('dsh-startup-root')) return
        if (document.getElementById(CURTAIN_ID)) return
        var c = document.createElement('div')
        c.id = CURTAIN_ID
        c.setAttribute('aria-hidden', 'true')
        c.style.cssText = 'position:fixed;inset:0;z-index:2147482999;background:#000;' +
          'pointer-events:none;opacity:1;transition:opacity 240ms linear'
        ;(document.body || document.documentElement).appendChild(c)
        setTimeout(function () { dropCurtain(false) }, 9000)
      } catch (e) {}
    }

    earlyCurtain()

    function selfBoot() {
      if (bootStarted) return
      bootStarted = true
      try {
        if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) return
        if (window.__DSH_STARTUP_BOOT__ || window.__DSH_STARTUP__) return
        if (document.getElementById('dsh-startup-root')) return
        if (window.__DSH_STARTUP_FAILED__ === true) return

        fetch(API + '/state', { headers: { Accept: 'application/json' }, cache: 'no-store' })
          .then((r) => r.json())
          .then((j) => {
            if (!j || !j.ok || !j.activeVariant) { dropCurtain(true); return }
            const av = j.activeVariant
            const cfg = j.config && typeof j.config === 'object' ? j.config : {}
            if (cfg.enabled === false) { dropCurtain(true); return }

            const today = new Date().toISOString().slice(0, 10)
            try {
              if (cfg.mode === 'session' && window.sessionStorage.getItem('dsh-startup-screen:shown') === '1') { dropCurtain(true); return }
              if (cfg.mode === 'daily' && window.localStorage.getItem('dsh-startup-screen:day') === today) { dropCurtain(true); return }
            } catch (err) {
              /* 隐私模式下读取失败：照常播放 */
            }

            window.__DSH_STARTUP_BOOT__ = 'client'
            window.__DSH_STARTUP_VERSION__ = av.version
            window.__DSH_STARTUP_CONFIG_URL__ = BOOT + '/config?v=' + encodeURIComponent(av.key)
            window.__DSH_STARTUP__ = cfg

            const root = document.createElement('div')
            root.id = 'dsh-startup-root'
            root.className = 'dsu-root dsu-boot'
            document.body.appendChild(root)
            /* 遮罩等到样式表真正加载完再撤（见下面 link.onload），否则这里会露出一帧工作台 */

            const q = '?v=' + encodeURIComponent(av.key)
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = BOOT + '/splash.css' + q
            ;(document.head || document.documentElement).appendChild(link)
            link.addEventListener('load', function () {
              try { requestAnimationFrame(function () { dropCurtain(false) }) } catch (e) { dropCurtain(false) }
            })
            link.addEventListener('error', function () { dropCurtain(true) })

            if (av.hasAssetData) {
              const data = document.createElement('script')
              data.src = BOOT + '/asset-data.js' + q
              ;(document.head || document.documentElement).appendChild(data)
            }

            const script = document.createElement('script')
            script.src = BOOT + '/splash.js' + q + '&t=' + Date.now()
            script.async = false
            ;(document.head || document.documentElement).appendChild(script)

            window.setTimeout(() => {
              try {
                const el = document.getElementById('dsh-startup-root')
                if (el && el.className && el.className.indexOf('dsu-boot') !== -1) {
                  if (el.parentNode) el.parentNode.removeChild(el)
                  document.documentElement.classList.remove('dsu-lock')
                  if (document.body) document.body.style.overflow = ''
                  window.__DSH_STARTUP_FAILED__ = true
                  dropCurtain(true)
                }
              } catch (err) {
                /* 兜底本身不许再抛 */
              }
            }, 9000)
          })
          .catch(() => {
            /* 桌面端拿不到 HTTP：安静退出，不挡页面 */
            dropCurtain(true)
          })
      } catch (err) {
        /* 自举是兜底，绝不许把宿主带崩 */
      }
    }

    /* ── 从动画包 splash.js 读 DEFAULTS ───────────────────────────────────
       Host 新版会直接在 /config 里带回 defaults；旧版 Host 没有这个字段，
       设置页就自己把该版本的 splash.js 拉下来解析一次（结果按版本缓存）。
       只做字面量解析，不执行动画包代码。 */

    const fallbackDefaultsCache = new Map()

    function stripComments(src) {
      let out = ''
      let i = 0
      const n = src.length
      while (i < n) {
        const c = src[i]
        const d = src[i + 1]
        if (c === '"' || c === "'" || c === '`') {
          let j = i + 1
          out += c
          while (j < n) {
            const ch = src[j]
            if (ch === '\\') {
              out += ch + (src[j + 1] || '')
              j += 2
              continue
            }
            out += ch
            if (ch === c) {
              j += 1
              break
            }
            j += 1
          }
          i = j
          continue
        }
        if (c === '/' && d === '/') {
          while (i < n && src[i] !== '\n') i += 1
          out += '\n'
          continue
        }
        if (c === '/' && d === '*') {
          i += 2
          while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1
          i += 2
          out += ' '
          continue
        }
        out += c
        i += 1
      }
      return out
    }

    function matchBraces(text, start) {
      let depth = 0
      let i = start
      const n = text.length
      while (i < n) {
        const c = text[i]
        if (c === '"' || c === "'" || c === '`') {
          const q = c
          i += 1
          while (i < n) {
            if (text[i] === '\\') {
              i += 2
              continue
            }
            i += 1
            if (text[i - 1] === q) break
          }
          continue
        }
        if (c === '{') depth += 1
        else if (c === '}') {
          depth -= 1
          if (depth === 0) return text.slice(start, i + 1)
        }
        i += 1
      }
      return ''
    }

    function parseObjectLiteral(src) {
      let i = 0
      const n = src.length

      function ws() {
        while (i < n && /\s/.test(src[i])) i += 1
      }

      function fail(what) {
        throw new Error('parse defaults: ' + what)
      }

      function readString() {
        const q = src[i]
        i += 1
        let s = ''
        while (i < n) {
          const c = src[i]
          if (c === '\\') {
            const e = src[i + 1]
            i += 2
            s += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e
            continue
          }
          i += 1
          if (c === q) return s
          s += c
        }
        fail('unterminated string')
      }

      function readWord() {
        const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i))
        if (!m) fail('unexpected token')
        i += m[0].length
        return m[0]
      }

      function readValue() {
        ws()
        const c = src[i]

        if (c === '{') {
          i += 1
          const obj = {}
          ws()
          if (src[i] === '}') {
            i += 1
            return obj
          }
          for (;;) {
            ws()
            const key = src[i] === '"' || src[i] === "'" ? readString() : readWord()
            ws()
            if (src[i] !== ':') fail('expected :')
            i += 1
            obj[key] = readValue()
            ws()
            if (src[i] === ',') {
              i += 1
              ws()
              if (src[i] === '}') {
                i += 1
                return obj
              }
              continue
            }
            if (src[i] === '}') {
              i += 1
              return obj
            }
            fail('expected , or }')
          }
        }

        if (c === '[') {
          i += 1
          const arr = []
          ws()
          if (src[i] === ']') {
            i += 1
            return arr
          }
          for (;;) {
            arr.push(readValue())
            ws()
            if (src[i] === ',') {
              i += 1
              ws()
              if (src[i] === ']') {
                i += 1
                return arr
              }
              continue
            }
            if (src[i] === ']') {
              i += 1
              return arr
            }
            fail('expected , or ]')
          }
        }

        if (c === '"' || c === "'") return readString()

        if (c === '-' || c === '+' || (c >= '0' && c <= '9') || c === '.') {
          const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))
          if (!m) fail('bad number')
          i += m[0].length
          return Number(m[0])
        }

        const word = readWord()
        if (word === 'true') return true
        if (word === 'false') return false
        if (word === 'null') return null
        if (word === 'undefined') return undefined
        return word
      }

      return readValue()
    }

    function defaultsFromSource(source) {
      if (typeof source !== 'string' || !source) return null
      let text
      try {
        text = stripComments(source)
      } catch (err) {
        return null
      }
      const m = /\bDEFAULTS\s*=\s*\{/.exec(text)
      if (!m) return null
      const literal = matchBraces(text, m.index + m[0].length - 1)
      if (!literal) return null
      try {
        const parsed = parseObjectLiteral(literal)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
        return parsed
      } catch (err) {
        return null
      }
    }

    function loadFallbackDefaults(key) {
      if (fallbackDefaultsCache.has(key)) return Promise.resolve(fallbackDefaultsCache.get(key))
      return fetch(BOOT + '/splash.js?v=' + encodeURIComponent(key), { cache: 'no-cache' })
        .then(function (r) { return r.text() })
        .then(function (text) {
          const parsed = defaultsFromSource(text) || {}
          fallbackDefaultsCache.set(key, parsed)
          return parsed
        })
        .catch(function () { return {} })
    }

    /* ── 设置项定义 ───────────────────────────────────────────────────────
       字段名与动画包 splash.js 的 DEFAULTS 完全一致；某个版本没有的字段
       （例如旧动画没有 autoPlay / mascot / eventWindow）不会显示。 */

    function pct(v) {
      return Math.round((Number(v) || 0) * 100) + '%'
    }

    const VOICES = [
      ['', '自动（优先神经网络女声）-US'],
      ['zhixing-cn', '智性少女音-CN'],
      ['calmlady-jp', '清冷优雅-日语'],
      ['pessimistic-ru', '清冷脆弱-俄语'],
      ['announcer-kr', '威严铿锵宣示-朝鲜语']
    ]

    const FIELDS = {
      enabled: { label: '启用启动动画', type: 'check', hint: '关闭后直接进主界面，不再显示启动界面。' },
      mode: {
        label: '播放时机',
        type: 'select',
        options: [['session', '每个浏览器会话一次'], ['daily', '每天一次'], ['always', '每次打开都播放']]
      },
      speed: {
        label: '速度倍率',
        type: 'range',
        min: 0.35,
        max: 3,
        step: 0.05,
        fmt: function (v) { return Number(v).toFixed(2) + '×' },
        hint: '0.35 慢放 · 1 原速 · 3 快放。'
      },
      theme: {
        label: '主题',
        type: 'select',
        options: [['light', '浅色 · 暖白档案底板'], ['dark', '深色 · 暗底板']]
      },
      identity: { label: '身份名称', type: 'text', hint: '终幕「欢迎 xxx 访问」与第二步身份卡上的名字。' },
      identityId: { label: '身份编号', type: 'text', mono: true, hint: '显示在第二步身份卡上，建议用数字。' },
      accessLevel: { label: '权限等级', type: 'text', mono: true },
      identityPassword: {
        label: '身份密码',
        type: 'password',
        hint: '设置后第二步「身份资料确认」要输对密码才能继续；留空 = 不启用。'
      },
      autoPlay: {
        label: '自动播放',
        type: 'autoplay',
        hint: '完全自动播放：整段不用任何操作。仅需点击一次进入：开头等一次，之后全自动。不自动播放：第 1、2 步都停下来等确认。'
      },
      allowSkip: { label: '允许跳过', type: 'check', hint: '右上角显示 SKIP，按 Esc 也能直接进主界面。' },
      voice: { label: '女声播报', type: 'check', hint: '文字出现的同一时刻念出来，动画会等这句话念完再走下一步。' },
      voiceName: { label: '音色', type: 'voice' },
      voiceVolume: { label: '播报音量', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
      voiceCue: { label: '播报前提示音', type: 'check', hint: '念台词前先响两声轻提示。' },
      sound: { label: '界面音效', type: 'check', hint: '咔哒 / 双音确认 / 过场噪声扫频 / 结尾和声钟，全部现场合成，不含音频文件。' },
      soundVolume: { label: '音效音量', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
      mascot: {
        label: '人物立绘',
        type: 'select',
        numeric: true,
        options: [['0', '长征（水手服）'], ['1', '长征（中山装）'], ['2', '长征（J装）'], ['3', '长征（最美好的主唱）'], ['-1', '空（不显示立绘）']],
        hint: '动画右下角的人物形象。'
      },
      eventWindow: {
        label: '降世事件窗口 · 每次播放都弹出',
        type: 'check',
        hint: '默认关闭：装好后的首次启动会弹一次。勾选后每次动画结束都弹，按 Enter 或点击按钮进入主界面。'
      },
      accent: { label: '主色', type: 'color' },
      glitchB: { label: '故障色', type: 'color' },
      brand1: { label: '左上 · 主标题', type: 'text' },
      brand2: { label: '左上 · 副标题', type: 'text' },
      brand3a: { label: '左上 · 产品行（左）', type: 'text' },
      brand3b: { label: '左上 · 产品行（右）', type: 'text' },
      orgZh: { label: '黑幕 · 中文', type: 'text' },
      orgEn: { label: '黑幕 · 英文', type: 'text', mono: true },
      orgSub: { label: '黑幕 · 小字', type: 'text', mono: true },
      welcomeBox: { label: '终幕 · 黑框', type: 'text' },
      footer: { label: '右下 · 页脚', type: 'text', mono: true }
    }

    /* 分组与顺序照搬原来的设置页；数组 = 同一行两项。 */
    const GROUPS = [
      { title: '播放', fields: ['enabled', 'mode', 'speed'] },
      { title: '身份资料', fields: ['identity', ['identityId', 'accessLevel'], 'identityPassword'] },
      { title: '交互', fields: ['autoPlay', 'allowSkip'] },
      { title: '语音与音效', fields: ['voice', 'voiceName', 'voiceVolume', 'voiceCue', 'sound', 'soundVolume'] },
      { title: '视觉', fields: ['theme', 'mascot', 'eventWindow', ['accent', 'glitchB']] },
      { title: '文案', fields: [['brand1', 'brand2'], ['brand3a', 'brand3b'], ['orgZh', 'orgEn'], ['orgSub', 'welcomeBox'], 'footer'] }
    ]

    /* ── 详细设置 ───────────────────────────────────────────────────────── */

    function SettingsEditor(props) {
      const variants = props.variants || []
      const [target, setTarget] = useState(props.activeKey || (variants[0] ? variants[0].key : ''))
      const [draft, setDraft] = useState(null)
      const [defaults, setDefaults] = useState({})
      const [file, setFile] = useState('')
      const [busy, setBusy] = useState('')
      const [notice, setNotice] = useState('')
      const [error, setError] = useState('')
      const [hostReset, setHostReset] = useState(false)

      useEffect(function () {
        if (!target && props.activeKey) setTarget(props.activeKey)
      }, [props.activeKey])

      useEffect(function () {
        if (!target) return
        let alive = true
        setBusy('load')
        setError('')
        setNotice('')
        setDraft(null)
        fetch(BOOT + '/config?v=' + encodeURIComponent(target), {
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || !j.ok) throw new Error((j && j.error) || 'bad response')
            const fromHost = j.defaults && typeof j.defaults === 'object' && Object.keys(j.defaults).length
              ? j.defaults
              : null

            function settle(defs) {
              if (!alive) return
              setDefaults(defs && typeof defs === 'object' ? defs : {})
              setDraft(j.config && typeof j.config === 'object' ? j.config : {})
              setFile(j.file || '')
              setHostReset(!!fromHost)
              setBusy('')
            }

            if (fromHost) {
              settle(fromHost)
              return null
            }
            /* 旧版 Host 不带 defaults：自己解析该版本的 splash.js */
            return loadFallbackDefaults(target).then(settle)
          })
          .catch(function (e) {
            if (!alive) return
            setBusy('')
            setError('读取该版本设置失败：' + String((e && e.message) || e))
          })
        return function () { alive = false }
      }, [target])

      if (!variants.length) return null

      function hasKey(key) {
        return !!(draft && Object.prototype.hasOwnProperty.call(draft, key)) ||
          !!(defaults && Object.prototype.hasOwnProperty.call(defaults, key))
      }

      function hasDefault(key) {
        return !!(defaults && Object.prototype.hasOwnProperty.call(defaults, key))
      }

      function valueOf(key) {
        if (draft && Object.prototype.hasOwnProperty.call(draft, key) && draft[key] !== undefined) return draft[key]
        return defaults[key]
      }

      function set(key, value) {
        setNotice('')
        setDraft(function (d) { return Object.assign({}, d, { [key]: value }) })
      }

      function autoPlayMode() {
        const ap = valueOf('autoPlay')
        if (ap === 'full' || ap === 'once' || ap === 'off') return ap
        const ri = valueOf('requireInteraction')
        return (ri === false || ri === 'false' || ri === 0) ? 'full' : 'off'
      }

      function visible(key) {
        if (key === 'autoPlay') {
          if (hasDefault('autoPlay')) return true
          /* 默认值没解析出来（旧 Host + 解析失败）时，只能按配置里有没有这个字段判断 */
          return !Object.keys(defaults).length && hasKey('autoPlay')
        }
        if (key === 'mascot' || key === 'eventWindow') return hasKey(key)
        if (key === 'identityPassword') return hasKey(key)
        if (key === 'voiceName' || key === 'voiceVolume' || key === 'voiceCue') return hasKey(key) && !!valueOf('voice')
        if (key === 'soundVolume') return hasKey(key) && !!valueOf('sound')
        return hasKey(key)
      }

      function previewVoice() {
        try {
          const name = valueOf('voiceName') || ''
          let base = 'line-1'
          if (name === 'zhixing-cn') base = 'line-cn-1'
          else if (name === 'calmlady-jp') base = 'line-jp-1'
          else if (name === 'pessimistic-ru') base = 'line-ru-1'
          else if (name === 'announcer-kr') base = 'line-kr-1'
          const audio = new Audio(BOOT + '/asset/' + encodeURIComponent(target) + '/' + base + '.mp3')
          audio.volume = Math.min(1, Math.max(0, Number(valueOf('voiceVolume')) || 0.9))
          audio.play().catch(function () {})
        } catch (err) {
          /* 试听失败不影响设置 */
        }
      }

      function save() {
        if (!draft) return Promise.resolve(false)
        setBusy('save')
        setError('')
        setNotice('')
        const patch = Object.assign({}, draft)
        if (hasDefault('autoPlay')) patch.requireInteraction = autoPlayMode() === 'off'
        return fetch(BOOT + '/config?v=' + encodeURIComponent(target), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ patch: patch })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || !j.ok) throw new Error((j && j.error) || 'save failed')
            setDraft(j.config && typeof j.config === 'object' ? j.config : {})
            if (j.defaults) setDefaults(j.defaults)
            setBusy('')
            setNotice('已保存。')
            return true
          })
          .catch(function (e) {
            setBusy('')
            setError('保存失败：' + String((e && e.message) || e))
            return false
          })
      }

      function reset() {
        if (!hostReset && !Object.keys(defaults).length) {
          setError('这个版本没有读到默认值，暂不能恢复默认。')
          return
        }
        setBusy('reset')
        setError('')
        setNotice('')
        /* 新版 Host 支持直接删文件；旧版 Host 就把该版本自己的默认值整份写回去。 */
        const body = hostReset ? { action: 'reset' } : { patch: Object.assign({}, defaults) }
        fetch(BOOT + '/config?v=' + encodeURIComponent(target), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body)
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || !j.ok) throw new Error((j && j.error) || 'reset failed')
            setDraft(j.config && typeof j.config === 'object' ? j.config : {})
            if (j.defaults && Object.keys(j.defaults).length) setDefaults(j.defaults)
            setBusy('')
            setNotice('已恢复该版本的默认值。')
          })
          .catch(function (e) {
            setBusy('')
            setError('恢复默认失败：' + String((e && e.message) || e))
          })
      }

      function preview() {
        const active = props.activeKey === target
        save().then(function (ok) {
          if (!ok) return
          if (active) {
            const api = window.__DSH_STARTUP_API__
            if (api && typeof api.replay === 'function') {
              try {
                api.replay()
                setNotice('已保存，正在重播当前动画…')
                return
              } catch (err) {
                /* 落到刷新兜底 */
              }
            }
            clearBootMarkers()
            setNotice('已保存，正在刷新页面…')
            reloadFresh(400)
            return
          }
          fetch(API + '/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ key: target })
          })
            .then(function (r) { return r.json() })
            .then(function (j) {
              if (!j || !j.ok) throw new Error((j && j.error) || 'apply failed')
              clearBootMarkers()
              setNotice('已切到该版本，正在刷新页面…')
              reloadFresh(400)
            })
            .catch(function (e) {
              setError('切换失败：' + String((e && e.message) || e))
            })
        })
      }

      function renderField(key) {
        const meta = FIELDS[key]
        if (!meta || !visible(key)) return null
        const value = valueOf(key)

        if (meta.type === 'check') {
          return h('label', { className: 'sah-check', key: key },
            h('input', {
              type: 'checkbox',
              checked: !!value,
              onChange: function (e) { set(key, e.target.checked) }
            }),
            h('span', { className: 'sah-checkText' },
              h('span', { className: 'sah-checkLabel' }, meta.label),
              meta.hint ? h('span', { className: 'sah-hint' }, meta.hint) : null
            )
          )
        }

        let control = null

        if (meta.type === 'select' || meta.type === 'autoplay') {
          const isAuto = meta.type === 'autoplay'
          const options = isAuto
            ? [['full', '完全自动播放'], ['once', '仅需点击一次进入'], ['off', '不自动播放']]
            : meta.options
          control = h('select', {
            className: 'sah-input',
            value: isAuto ? autoPlayMode() : String(value),
            onChange: function (e) {
              const next = meta.numeric ? Number(e.target.value) : e.target.value
              if (isAuto) {
                set('autoPlay', next)
                set('requireInteraction', next === 'off')
              } else {
                set(key, next)
              }
            }
          }, options.map(function (opt) {
            return h('option', { value: opt[0], key: opt[0] }, opt[1])
          }))
        } else if (meta.type === 'range') {
          const n = Number(value)
          control = h('div', { className: 'sah-row' },
            h('input', {
              className: 'sah-range',
              type: 'range',
              min: meta.min,
              max: meta.max,
              step: meta.step,
              value: isFinite(n) ? n : meta.min,
              onChange: function (e) { set(key, Number(e.target.value)) }
            }),
            h('span', { className: 'sah-value' }, meta.fmt(n))
          )
        } else if (meta.type === 'color') {
          control = h('div', { className: 'sah-row' },
            h('input', {
              className: 'sah-color',
              type: 'color',
              value: /^#[0-9a-fA-F]{6}$/.test(String(value)) ? String(value) : '#000000',
              onChange: function (e) { set(key, e.target.value) }
            }),
            h('input', {
              className: 'sah-input mono sah-grow',
              value: String(value == null ? '' : value),
              onChange: function (e) { set(key, e.target.value) }
            })
          )
        } else if (meta.type === 'voice') {
          control = h('div', { className: 'sah-row' },
            h('select', {
              className: 'sah-input sah-grow',
              value: String(value || ''),
              onChange: function (e) { set(key, e.target.value) }
            }, VOICES.map(function (opt) {
              return h('option', { value: opt[0], key: opt[0] }, opt[1])
            })),
            h('button', { className: 'sah-ghost', type: 'button', onClick: previewVoice }, '试听')
          )
        } else if (meta.type === 'password') {
          control = h('input', {
            className: 'sah-input',
            type: 'password',
            value: String(value == null ? '' : value),
            placeholder: '留空则不启用密码',
            onChange: function (e) { set(key, e.target.value) }
          })
        } else {
          control = h('input', {
            className: 'sah-input' + (meta.mono ? ' mono' : ''),
            value: String(value == null ? '' : value),
            onChange: function (e) { set(key, e.target.value) }
          })
        }

        return h('div', { className: 'sah-field', key: key },
          h('label', { className: 'sah-label' }, meta.label),
          control,
          meta.hint ? h('div', { className: 'sah-hint' }, meta.hint) : null
        )
      }

      const children = []

      children.push(
        h('div', { className: 'sah-field', key: 'target' },
          h('label', { className: 'sah-label' }, '编辑哪个版本'),
          h('select', {
            className: 'sah-input',
            value: target,
            onChange: function (e) { setTarget(e.target.value) }
          }, variants.map(function (v) {
            return h('option', { value: v.key, key: v.key }, labelOf(v) + ' · v' + v.version)
          })),
          h('div', { className: 'sah-hint' }, '每个版本各存一份参数，换版本不会把品牌字和主题带过去。')
        )
      )

      if (busy === 'load') {
        children.push(h('div', { className: 'sah-loading', key: 'loading' }, '正在读取该版本设置…'))
      }

      if (error) children.push(h('div', { className: 'sah-err', key: 'err' }, error))

      if (draft) {
        GROUPS.forEach(function (group) {
          const rows = []
          group.fields.forEach(function (entry) {
            if (Array.isArray(entry)) {
              const pair = entry.map(function (k) { return renderField(k) })
              if (pair.some(Boolean)) rows.push(h('div', { className: 'sah-two', key: entry.join('-') }, pair))
            } else {
              const row = renderField(entry)
              if (row) rows.push(row)
            }
          })
          if (!rows.length) return
          children.push(
            h('div', { className: 'sah-group', key: group.title },
              h('div', { className: 'sah-groupTitle' }, group.title),
              rows
            )
          )
        })

        children.push(
          h('div', { className: 'sah-actionsBar', key: 'actions' },
            h('button', {
              className: 'sah-btn primary',
              type: 'button',
              disabled: !!busy,
              onClick: save
            }, busy === 'save' ? '保存中…' : '保存'),
            h('button', {
              className: 'sah-btn',
              type: 'button',
              disabled: !!busy,
              onClick: reset
            }, busy === 'reset' ? '恢复中…' : '恢复默认'),
            h('button', {
              className: 'sah-btn',
              type: 'button',
              disabled: !!busy,
              onClick: preview
            }, props.activeKey === target ? '立即预览' : '应用并预览'),
            notice ? h('span', { className: 'sah-ok' }, notice) : null
          )
        )

        if (file) children.push(h('div', { className: 'sah-file', key: 'file' }, '配置文件：' + file))
      }

      return h('div', { className: 'sah-settings' }, children)
    }

    /* ── 设置面板 ───────────────────────────────────────────────────────── */

    function Panel() {
      const [state, setState] = useState({ loading: true, error: '', data: null })
      const [busy, setBusy] = useState('')
      const [msg, setMsg] = useState('')

      function load() {
        setState({ loading: true, error: '', data: null })
        fetch(API + '/state', { headers: { Accept: 'application/json' }, cache: 'no-store' })
          .then((r) => r.json())
          .then((j) => {
            if (!j || !j.ok) throw new Error((j && j.error) || 'bad response')
            setState({ loading: false, error: '', data: j })
          })
          .catch((e) => setState({ loading: false, error: '读取版本列表失败：' + String((e && e.message) || e), data: null }))
      }

      useEffect(load, [])

      function applyKey(key) {
        setBusy(key)
        setMsg('')
        setState((s) => ({ loading: false, error: '', data: s.data }))
        fetch(API + '/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ key })
        })
          .then((r) => r.json())
          .then((j) => {
            if (!j || !j.ok) throw new Error((j && j.error) || 'unknown')
            clearBootMarkers()
            setMsg('已切换，正在刷新页面播放…')
            reloadFresh(500)
          })
          .catch((e) => {
            setBusy('')
            setMsg('')
            setState((s) => ({
              loading: false,
              data: s.data,
              error: '切换失败：' + String((e && e.message) || e)
            }))
          })
      }

      function replay() {
        const api = window.__DSH_STARTUP_API__
        if (api && typeof api.replay === 'function') {
          try {
            api.replay()
            setMsg('正在重播当前动画…')
            return
          } catch (err) {
            /* 落到刷新兜底 */
          }
        }
        clearBootMarkers()
        setMsg('正在刷新页面播放…')
        reloadFresh(300)
      }

      const data = state.data
      const selection = data ? data.selection : ''
      const activeVariant = data ? data.activeVariant : null
      const currentText =
        selection === OFF
          ? '关闭'
          : selection === RANDOM
            ? '每次随机'
            : activeVariant
              ? labelOf(activeVariant)
              : '保存的版本已不在本机'

      const children = []

      children.push(h('style', { key: 'css' }, CSS))

      children.push(
        h('div', { className: 'sah-head', key: 'head' },
          h('div', null,
            h('div', { className: 'sah-title' }, '启动动画'),
            h('div', { className: 'sah-sub' },
              '选一个版本，点「应用」后立即刷新播放；下面的详细设置按版本各存一份。')
          ),
          h('div', { className: 'sah-headActions' },
            h('button', { className: 'sah-ghost', onClick: load, disabled: state.loading || !!busy }, '刷新列表'),
            activeVariant
              ? h('button', { className: 'sah-ghost', onClick: replay, disabled: !!busy }, '重播当前')
              : null
          )
        )
      )

      if (data) {
        children.push(
          h('div', { className: 'sah-current', key: 'current' },
            h('span', { className: 'sah-dot' + (selection === OFF ? ' off' : '') }),
            h('span', null, '当前：' + currentText)
          )
        )
      }

      if (state.loading) {
        children.push(h('div', { className: 'sah-loading', key: 'loading' }, '正在读取动画版本…'))
      }

      if (state.error) {
        children.push(h('div', { className: 'sah-err', key: 'err' }, state.error))
      }

      if (data && Array.isArray(data.variants) && data.variants.length) {
        children.push(
          h('div', { className: 'sah-grid', key: 'grid' },
            data.variants.map((v) => {
              const on = selection === v.key
              const hue = hueOf(v.key)
              return h('div', { className: 'sah-card' + (on ? ' on' : ''), key: v.key },
                h('div', { className: 'sah-cardTop' },
                  h('div', {
                    className: 'sah-mark',
                    style: {
                      background: 'linear-gradient(135deg, hsl(' + hue + ' 72% 56%), hsl(' + ((hue + 46) % 360) + ' 66% 42%))'
                    }
                  }, playIcon()),
                  h('div', { className: 'sah-cardText' },
                    h('div', { className: 'sah-cardTitle' },
                      h('span', null, labelOf(v)),
                      h('span', { className: 'sah-ver' }, 'v' + v.version)
                    ),
                    h('div', { className: 'sah-cardDesc' }, v.description || v.name)
                  ),
                  on ? h('span', { className: 'sah-badge' }, '使用中') : null
                ),
                h('div', { className: 'sah-cardFoot' },
                  h('span', { className: 'sah-meta' },
                    v.name + ' · ' + fmtBytes(v.bytes) + (v.source === 'installed' ? ' · 已安装' : ' · 动画库')
                  ),
                  h('button', {
                    className: 'sah-btn' + (on ? ' on' : ''),
                    disabled: on || !!busy || state.loading,
                    onClick: () => applyKey(v.key)
                  }, on ? '已启用' : busy === v.key ? '切换中…' : '应用')
                )
              )
            })
          )
        )
      } else if (data && !state.loading && !state.error) {
        children.push(
          h('div', { className: 'sah-empty', key: 'empty' },
            '没有找到可播放的动画版本。把整个动画包目录放进 ',
            h('code', null, '%USERPROFILE%\\.dsh\\skins\\startup-variants\\'),
            ' 后点「刷新列表」。')
        )
      }

      if (data) {
        children.push(h('div', { className: 'sah-divider', key: 'div' }, '其他方式'))

        const modes = [
          {
            key: RANDOM,
            title: '每次随机',
            desc: '每次启动从可用版本里随机挑一个。',
            icon: shuffleIcon
          },
          {
            key: OFF,
            title: '关闭启动动画',
            desc: '启动时直接进入工作台。',
            icon: powerIcon
          }
        ]

        children.push(
          h('div', { className: 'sah-modes', key: 'modes' },
            modes.map((mode) => {
              const on = selection === mode.key
              return h('div', { className: 'sah-mode' + (on ? ' on' : ''), key: mode.key },
                h('div', { className: 'sah-modeIcon' }, mode.icon()),
                h('div', { className: 'sah-modeText' },
                  h('div', { className: 'sah-modeTitle' }, mode.title),
                  h('div', { className: 'sah-modeDesc' }, mode.desc)
                ),
                h('button', {
                  className: 'sah-btn' + (on ? ' on' : ''),
                  disabled: on || !!busy || state.loading,
                  onClick: () => applyKey(mode.key)
                }, on ? '已启用' : busy === mode.key ? '切换中…' : '应用')
              )
            })
          )
        )
      }

      if (data && Array.isArray(data.variants) && data.variants.length) {
        children.push(h('div', { className: 'sah-divider', key: 'div2' }, '详细设置'))
        children.push(h(SettingsEditor, {
          key: 'settings',
          variants: data.variants,
          activeKey: activeVariant ? activeVariant.key : ''
        }))
      }

      if (msg) children.push(h('div', { className: 'sah-msg', key: 'msg' }, msg))

      return h('div', { className: 'sah-root' }, children)
    }

    /* ── 注册 ───────────────────────────────────────────────────────────── */

    const inject = ['slots']

    function apply(ctx) {
      selfBoot()
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'startup-hub', order: 27, label: '启动动画' },
        Panel
      ))
    }

    return {
      inject,
      apply
    }
  }
})
