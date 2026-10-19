/**
 * 从一个动画包的 splash.js 里读出它自己的 DEFAULTS 对象。
 *
 * 每个动画包都在 splash.js 顶部写死了 `var DEFAULTS = { ... }`，设置页需要
 * 这份默认值才能显示「这个版本原本长什么样」，而不是拿另一个版本的品牌字 /
 * 主题去冒充。这里不执行动画包代码，只做字面量解析：先去掉注释，截出对象，
 * 再用一个只认 string / number / boolean / null / array / object 的递归解析器
 * 读成普通 JS 对象。遇到看不懂的写法返回 null，由调用方退回空对象。
 *
 * 支持写法：单双引号字符串与转义、行注释 //、块注释、尾逗号、嵌套对象/数组、
 * 未加引号的键。不支持：模板字符串插值、函数、变量引用 —— 这些都是有意为之，
 * DEFAULTS 只是数据。
 */

/** 去掉注释，但保留字符串内容原样（含引号与转义）。 */
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

/** 从 `{` 开始配对括号，忽略字符串里的花括号。 */
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

/** 解析一个纯数据对象字面量；不支持则抛错。 */
export function parseObjectLiteral(src) {
  let i = 0
  const n = src.length

  function ws() {
    while (i < n && /\s/.test(src[i])) i += 1
  }

  function fail(what) {
    throw new Error('parse defaults: ' + what + ' at ' + i)
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
        if (e === 'n') s += '\n'
        else if (e === 't') s += '\t'
        else if (e === 'r') s += '\r'
        else if (e === 'b') s += '\b'
        else if (e === 'f') s += '\f'
        else s += e
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

  const value = readValue()
  ws()
  return value
}

/** 从 splash.js 源码取出 DEFAULTS；找不到或解析失败返回 null。 */
export function readDefaultsFromSource(source) {
  if (typeof source !== 'string' || !source) return null

  let text
  try {
    text = stripComments(source)
  } catch (err) {
    return null
  }

  const m = /\bDEFAULTS\s*=\s*\{/.exec(text)
  if (!m) return null

  const start = m.index + m[0].length - 1
  const literal = matchBraces(text, start)
  if (!literal) return null

  try {
    const parsed = parseObjectLiteral(literal)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch (err) {
    return null
  }
}
