export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof RegExp)
}

export function deepEqual(a, b) {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags
  }
  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false
      return a.every((item, i) => deepEqual(item, b[i]))
    }
    const keysA = Object.keys(a).filter((k) => a[k] !== undefined)
    const keysB = Object.keys(b).filter((k) => b[k] !== undefined)
    if (keysA.length !== keysB.length) return false
    return keysA.every((key) => keysB.includes(key) && deepEqual(a[key], b[key]))
  }
  return false
}

// BSON comparison order: null/missing < numbers < strings < objects < arrays
// < booleans < dates < regexes
export function typeRank(v) {
  if (v == null) return 1
  if (typeof v === 'number') return 2
  if (typeof v === 'string') return 3
  if (v instanceof Date) return 8
  if (v instanceof RegExp) return 9
  if (Array.isArray(v)) return 5
  if (typeof v === 'object') return 4
  if (typeof v === 'boolean') return 7
  return 10
}

// MongoDB-style comparator: orders by BSON type first, then by value.
// null and missing sort first in ascending order.
export function compareValues(a, b) {
  const ra = typeRank(a)
  const rb = typeRank(b)
  if (ra !== rb) return ra < rb ? -1 : 1
  switch (ra) {
    case 1: return 0
    case 2: case 3: return a < b ? -1 : a > b ? 1 : 0
    case 7: return a === b ? 0 : a ? 1 : -1
    case 8: return a.getTime() - b.getTime()
    case 9: return compareValues(a.source, b.source)
    case 5: {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const c = compareValues(a[i], b[i])
        if (c !== 0) return c
      }
      return a.length - b.length
    }
    case 4: {
      const ea = Object.entries(a)
      const eb = Object.entries(b)
      for (let i = 0; i < Math.min(ea.length, eb.length); i++) {
        const k = compareValues(ea[i][0], eb[i][0])
        if (k !== 0) return k
        const v = compareValues(ea[i][1], eb[i][1])
        if (v !== 0) return v
      }
      return ea.length - eb.length
    }
    default: return 0
  }
}

// Order-independent, type-preserving key: { b: 1, a: d } and { a: d, b: 1 }
// produce the same string, and a Date never collides with its ISO string.
export function canonicalKey(v, { nullForMissing = false } = {}) {
  return JSON.stringify(canonical(v, nullForMissing))
}

function canonical(v, nullForMissing) {
  if (v === undefined) return nullForMissing ? null : { $undefined: true }
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v
  if (typeof v === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? 0 : v) : { $number: String(v) }
  if (v instanceof Date) return { $date: v.getTime() }
  if (v instanceof RegExp) return { $regex: v.source, $options: v.flags }
  if (Array.isArray(v)) return v.map((x) => canonical(x, nullForMissing))
  if (typeof v === 'object') {
    return Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => [k, canonical(v[k], nullForMissing)])
  }
  return String(v)
}

export function getNestedValue(doc, path) {
  const parts = path.split('.')
  let val = doc
  for (const part of parts) {
    if (val == null || typeof val !== 'object') return undefined
    val = val[part]
  }
  return val
}

export function setNestedValue(doc, path, value) {
  const parts = path.split('.')
  let current = doc
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === null || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {}
    }
    current = current[parts[i]]
  }
  current[parts[parts.length - 1]] = value
  return doc
}

export function unsetNestedValue(doc, path) {
  const parts = path.split('.')
  let current = doc
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === null || typeof current[parts[i]] !== 'object') return doc
    current = current[parts[i]]
  }
  delete current[parts[parts.length - 1]]
  return doc
}

// Every value a query path can refer to, following MongoDB's implicit array
// traversal: "items.n" on { items: [{ n: 1 }, { n: 2 }] } yields [1, 2].
// A missing value is reported as undefined so null / $exists checks work.
export function getPathValues(value, path) {
  return collectPathValues(value, typeof path === 'string' ? path.split('.') : path)
}

function collectPathValues(value, parts) {
  if (parts.length === 0) return [value]
  if (value === null || typeof value !== 'object' || value instanceof Date || value instanceof RegExp) {
    return [undefined]
  }
  const [head, ...rest] = parts
  if (Array.isArray(value)) {
    const out = []
    if (/^\d+$/.test(head)) out.push(...collectPathValues(value[Number(head)], rest))
    for (const el of value) {
      if (isPlainObject(el)) out.push(...collectPathValues(el, parts))
    }
    return out.length ? out : [undefined]
  }
  return collectPathValues(value[head], rest)
}

// Truthiness as used by aggregation expressions ($cond, $expr, $filter...)
export function isTruthy(v) {
  return v !== null && v !== undefined && v !== false && v !== 0
}
