export function deepEqual(a, b) {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
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

// MongoDB-style sort comparator: null/undefined sort last for ascending
export function compareValues(a, b) {
  const aNil = a == null
  const bNil = b == null
  if (aNil && bNil) return 0
  if (aNil) return 1
  if (bNil) return -1
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (a < b) return -1
  if (a > b) return 1
  return 0
}
