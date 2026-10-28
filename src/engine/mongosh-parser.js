// Parses mongosh-style statements without evaluating any JavaScript.
// Arguments may only be literals: objects, arrays, strings, numbers, booleans,
// null, regex literals and the shell's value helpers (new Date, ISODate,
// ObjectId, NumberInt...). Anything else is a ParseError.
import { ParseError } from './errors.js'

export { ParseError }

const IDENT_START = /[A-Za-z_$]/
const IDENT_PART = /[\w$]/

// Parse a whole editor buffer into statements. Statements are separated by
// `;` or simply follow each other (`db.a.insertOne(...)\ndb.a.find()`).
export function parseScript(source) {
  const p = new Parser(source)
  const statements = []
  while (!p.atEnd()) {
    statements.push(p.parseStatement())
    while (p.peek() === ';') p.i++
  }
  if (statements.length === 0) throw new ParseError('Query is empty')
  return statements
}

// Kept for callers that only care about a single statement
export function parseQuery(source) {
  return parseScript(source)[0]
}

// Parse one literal value, e.g. '{ a: 1 }'
export function evaluateArg(source) {
  const p = new Parser(source)
  const value = p.parseValue()
  if (!p.atEnd()) p.fail(`Unexpected ${p.describeNext()} after value`)
  return value
}

class Parser {
  constructor(src) {
    this.src = src
    this.i = 0
  }

  // --- low level ------------------------------------------------------------

  skipWs() {
    const s = this.src
    while (this.i < s.length) {
      const c = s[this.i]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ' ') {
        this.i++
      } else if (c === '/' && s[this.i + 1] === '/') {
        while (this.i < s.length && s[this.i] !== '\n') this.i++
      } else if (c === '/' && s[this.i + 1] === '*') {
        const end = s.indexOf('*/', this.i + 2)
        if (end === -1) this.fail('Unterminated /* comment')
        this.i = end + 2
      } else {
        break
      }
    }
  }

  peek() {
    this.skipWs()
    return this.src[this.i]
  }

  atEnd() {
    this.skipWs()
    return this.i >= this.src.length
  }

  expect(ch, context) {
    if (this.peek() !== ch) {
      this.fail(`Expected '${ch}'${context ? ` ${context}` : ''} but found ${this.describeNext()}`)
    }
    this.i++
  }

  describeNext() {
    this.skipWs()
    if (this.i >= this.src.length) return 'end of input'
    const rest = this.src.slice(this.i)
    const word = rest.match(/^[\w$]+/)
    return `'${word ? word[0] : rest[0]}'`
  }

  fail(message, at = this.i) {
    const before = this.src.slice(0, at)
    const line = before.split('\n').length
    const lineStart = before.lastIndexOf('\n') + 1
    const lineEnd = this.src.indexOf('\n', at)
    const lineText = this.src.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
    const col = at - lineStart
    throw new ParseError(
      `${message} (line ${line}, column ${col + 1})\n  ${lineText}\n  ${' '.repeat(col)}^`
    )
  }

  parseIdent() {
    this.skipWs()
    const start = this.i
    if (!IDENT_START.test(this.src[this.i] ?? '')) return null
    while (this.i < this.src.length && IDENT_PART.test(this.src[this.i])) this.i++
    return { name: this.src.slice(start, this.i), start }
  }

  // --- statements -----------------------------------------------------------

  parseStatement() {
    this.skipWs()
    const start = this.i
    const head = this.parseIdent()
    if (!head || head.name !== 'db') {
      const word = head?.name
      if (word === 'show' || word === 'use') {
        this.fail(`Shell helpers like '${word}' aren't supported here. Try db.getCollectionNames() to list collections.`, start)
      }
      if (word === 'const' || word === 'let' || word === 'var') {
        this.fail('Variables aren\'t supported. Write each query as db.collection.method(...)', start)
      }
      this.fail('Queries must start with db - for example db.books.find()', start)
    }
    this.expect('.', 'after db')

    const first = this.parseIdent()
    if (!first) this.fail(`Expected a collection name after 'db.' but found ${this.describeNext()}`)

    let collection = null
    let method
    let args
    if (this.peek() === '(' && first.name === 'getCollection') {
      const [name] = this.parseArgs('getCollection')
      if (typeof name !== 'string' || !name) this.fail('getCollection() needs a collection name string', first.start)
      collection = name
      this.expect('.', `after db.getCollection("${name}")`)
      const m = this.parseIdent()
      if (!m) this.fail(`Expected a method name but found ${this.describeNext()}`)
      method = m.name
      args = this.parseArgs(method)
    } else if (this.peek() === '(') {
      method = first.name
      args = this.parseArgs(method)
    } else {
      collection = first.name
      if (this.peek() !== '.') {
        this.fail(`Expected a method call like db.${collection}.find() but found ${this.describeNext()}`)
      }
      this.i++
      const m = this.parseIdent()
      if (!m) this.fail(`Expected a method name after 'db.${collection}.' but found ${this.describeNext()}`)
      method = m.name
      if (this.peek() !== '(') this.fail(`Expected '(' after ${method} - methods are called like ${method}(...)`)
      args = this.parseArgs(method)
    }

    const chains = []
    while (this.peek() === '.') {
      this.i++
      const m = this.parseIdent()
      if (!m) this.fail(`Expected a method name after '.' but found ${this.describeNext()}`)
      if (this.peek() !== '(') this.fail(`Expected '(' after ${m.name}`)
      chains.push({ method: m.name, args: this.parseArgs(m.name) })
    }

    const next = this.peek()
    if (next !== undefined && next !== ';' && !this.src.startsWith('db', this.i)) {
      this.fail(`Unexpected ${this.describeNext()} after the query`)
    }

    return { collection, method, args, chains, position: start }
  }

  parseArgs(method) {
    this.expect('(', `after ${method}`)
    const args = []
    while (this.peek() !== ')') {
      if (this.atEnd()) this.fail(`Missing ')' to close ${method}(`)
      args.push(this.parseValue())
      if (this.peek() === ',') {
        this.i++
      } else if (this.peek() !== ')') {
        this.fail(`Expected ',' or ')' in ${method}() arguments but found ${this.describeNext()}`)
      }
    }
    this.i++
    return args
  }

  // --- values ---------------------------------------------------------------

  parseValue() {
    const c = this.peek()
    if (c === undefined) this.fail('Expected a value but reached the end of the query')
    if (c === '{') return this.parseObject()
    if (c === '[') return this.parseArray()
    if (c === '"' || c === "'" || c === '`') return this.parseString()
    if (c === '/') return this.parseRegex()
    if (/[0-9.+-]/.test(c)) return this.parseNumber()
    if (IDENT_START.test(c)) return this.parseIdentValue()
    this.fail(`Unexpected ${this.describeNext()}`)
  }

  parseObject() {
    const open = this.i
    this.expect('{')
    const obj = {}
    while (this.peek() !== '}') {
      if (this.atEnd()) this.fail("Missing '}' to close this object", open)
      const keyAt = this.i
      let key
      const c = this.peek()
      if (c === '"' || c === "'" || c === '`') key = this.parseString()
      else if (/[0-9]/.test(c)) key = String(this.parseNumber())
      else {
        const id = this.parseIdent()
        if (!id) this.fail(`Expected a field name but found ${this.describeNext()}`)
        key = id.name
      }
      if (this.peek() !== ':') {
        this.fail(`Expected ':' after field name '${key}' but found ${this.describeNext()}`)
      }
      this.i++
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        this.fail(`Field '${key}' appears twice in the same object`, keyAt)
      }
      obj[key] = this.parseValue()
      if (this.atEnd()) this.fail("Missing '}' to close this object", open)
      if (this.peek() === ',') this.i++
      else if (this.peek() !== '}') this.fail(`Expected ',' or '}' but found ${this.describeNext()}`)
    }
    this.i++
    return obj
  }

  parseArray() {
    const open = this.i
    this.expect('[')
    const arr = []
    while (this.peek() !== ']') {
      if (this.atEnd()) this.fail("Missing ']' to close this array", open)
      arr.push(this.parseValue())
      if (this.atEnd()) this.fail("Missing ']' to close this array", open)
      if (this.peek() === ',') this.i++
      else if (this.peek() !== ']') this.fail(`Expected ',' or ']' but found ${this.describeNext()}`)
    }
    this.i++
    return arr
  }

  parseString() {
    this.skipWs()
    const start = this.i
    const quote = this.src[this.i++]
    let out = ''
    while (this.i < this.src.length) {
      const c = this.src[this.i++]
      if (c === quote) return out
      if (c === '\n' && quote !== '`') this.fail('Unterminated string', start)
      if (quote === '`' && c === '$' && this.src[this.i] === '{') {
        this.fail('Template expressions ${...} aren\'t supported - use a plain string', this.i - 1)
      }
      if (c !== '\\') {
        out += c
        continue
      }
      const e = this.src[this.i++]
      switch (e) {
        case 'n': out += '\n'; break
        case 't': out += '\t'; break
        case 'r': out += '\r'; break
        case 'b': out += '\b'; break
        case 'f': out += '\f'; break
        case 'v': out += '\v'; break
        case '0': out += '\0'; break
        case '\n': break
        case 'x': {
          const hex = this.src.slice(this.i, this.i + 2)
          if (!/^[0-9a-fA-F]{2}$/.test(hex)) this.fail('Invalid \\x escape', this.i - 2)
          out += String.fromCharCode(parseInt(hex, 16))
          this.i += 2
          break
        }
        case 'u': {
          let hex
          if (this.src[this.i] === '{') {
            const end = this.src.indexOf('}', this.i)
            hex = end === -1 ? '' : this.src.slice(this.i + 1, end)
            this.i = end + 1
          } else {
            hex = this.src.slice(this.i, this.i + 4)
            this.i += 4
          }
          if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) this.fail('Invalid \\u escape', this.i - 2)
          out += String.fromCodePoint(parseInt(hex, 16))
          break
        }
        case undefined: this.fail('Unterminated string', start); break
        default: out += e
      }
    }
    this.fail('Unterminated string - add the closing quote', start)
  }

  parseNumber() {
    this.skipWs()
    const start = this.i
    const m = this.src
      .slice(this.i)
      .match(/^[+-]?(?:0[xX][0-9a-fA-F]+|Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/)
    if (!m) this.fail(`Unexpected ${this.describeNext()}`)
    this.i += m[0].length
    if (IDENT_PART.test(this.src[this.i] ?? '')) this.fail(`Invalid number '${m[0]}${this.src[this.i]}'`, start)
    const text = m[0]
    const sign = text[0] === '-' ? -1 : 1
    const body = text.replace(/^[+-]/, '')
    if (body === 'Infinity') return sign * Infinity
    return sign * (/^0[xX]/.test(body) ? parseInt(body, 16) : Number(body))
  }

  parseRegex() {
    this.skipWs()
    const start = this.i
    let inClass = false
    let i = this.i + 1
    for (; i < this.src.length; i++) {
      const c = this.src[i]
      if (c === '\n') break
      if (c === '\\') { i++; continue }
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) break
    }
    if (this.src[i] !== '/') this.fail('Unterminated regular expression', start)
    const source = this.src.slice(start + 1, i)
    let end = i + 1
    while (end < this.src.length && /[a-z]/.test(this.src[end])) end++
    const flags = this.src.slice(i + 1, end)
    this.i = end
    try {
      return new RegExp(source, flags)
    } catch (err) {
      this.fail(`Invalid regular expression: ${err.message}`, start)
    }
  }

  parseIdentValue() {
    const id = this.parseIdent()
    switch (id.name) {
      case 'true': return true
      case 'false': return false
      case 'null': return null
      case 'undefined': return undefined
      case 'NaN': return NaN
      case 'Infinity': return Infinity
      case 'new': {
        const ctor = this.parseIdent()
        if (ctor?.name === 'Date' || ctor?.name === 'ISODate') return this.parseDateCall(ctor)
        if (ctor?.name === 'RegExp') return this.parseRegExpCall(ctor)
        if (ctor?.name === 'ObjectId') return this.parseObjectIdCall(ctor)
        this.fail(`'new ${ctor?.name ?? ''}' isn't supported. Supported: new Date(...), new RegExp(...), new ObjectId(...)`, id.start)
        break
      }
      case 'Date':
      case 'ISODate': return this.parseDateCall(id)
      case 'RegExp': return this.parseRegExpCall(id)
      case 'ObjectId': return this.parseObjectIdCall(id)
      case 'NumberInt':
      case 'NumberLong':
      case 'NumberDecimal':
      case 'Int32':
      case 'Long':
      case 'Double':
      case 'Decimal128': {
        const [v] = this.parseArgs(id.name)
        const n = Number(v)
        if (v === undefined || Number.isNaN(n)) this.fail(`${id.name}() needs a number`, id.start)
        return id.name === 'NumberInt' || id.name === 'Int32' || id.name === 'NumberLong' || id.name === 'Long' ? Math.trunc(n) : n
      }
    }
    if (this.peek() === '(' || this.peek() === '.') {
      this.fail(`'${id.name}' can't be called here. Only literal values (objects, arrays, strings, numbers, dates, regexes) are allowed as arguments.`, id.start)
    }
    this.fail(`Unknown value '${id.name}'. Did you forget quotes? Strings must be written like "${id.name}".`, id.start)
  }

  parseDateCall(id) {
    if (this.peek() === '.') {
      this.fail(`${id.name}.${this.src.slice(this.i + 1).match(/^\w*/)[0]}() isn't supported. Use new Date() or new Date("2025-01-01").`, id.start)
    }
    const args = this.parseArgs(id.name)
    let d
    if (args.length === 0) d = new Date()
    else if (args.length === 1 && (typeof args[0] === 'string' || typeof args[0] === 'number')) d = new Date(args[0])
    else if (args.every((a) => typeof a === 'number')) d = new Date(Date.UTC(...args))
    else this.fail(`${id.name}() needs a date string like "2025-03-01" or a timestamp`, id.start)
    if (Number.isNaN(d.getTime())) this.fail(`Invalid date: ${JSON.stringify(args[0])}`, id.start)
    return d
  }

  parseRegExpCall(id) {
    const [source, flags] = this.parseArgs(id.name)
    if (typeof source !== 'string' && !(source instanceof RegExp)) this.fail('RegExp() needs a pattern string', id.start)
    try {
      return new RegExp(source, flags)
    } catch (err) {
      this.fail(`Invalid regular expression: ${err.message}`, id.start)
    }
  }

  // ObjectIds are represented as their 24-character hex string
  parseObjectIdCall(id) {
    const [hex] = this.parseArgs(id.name)
    if (hex === undefined) return generateObjectId()
    if (typeof hex !== 'string' || !/^[0-9a-fA-F]{24}$/.test(hex)) {
      this.fail('ObjectId() needs a 24-character hex string', id.start)
    }
    return hex.toLowerCase()
  }
}

let oidCounter = Math.floor(Math.random() * 0xffffff)

export function generateObjectId() {
  const time = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0')
  const rand = Array.from({ length: 5 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')
  oidCounter = (oidCounter + 1) % 0xffffff
  return time + rand + oidCounter.toString(16).padStart(6, '0')
}
