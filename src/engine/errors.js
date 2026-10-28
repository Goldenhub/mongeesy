// Errors caused by the user's query. Their messages are written for learners
// and shown as-is; anything else reaching the UI is an engine bug.
export class ParseError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ParseError'
    this.userFacing = true
  }
}

export class QueryError extends Error {
  constructor(message) {
    super(message)
    this.name = 'QueryError'
    this.userFacing = true
  }
}

// Plain-object form that survives postMessage from the query worker
export function serializeError(err) {
  return {
    name: err?.name ?? 'Error',
    message: err?.message ?? String(err),
    userFacing: err?.userFacing === true,
  }
}

export function formatError(err) {
  if (err?.userFacing) return err.message
  if (err?.name === 'RangeError' && /call stack|array length|Invalid array/i.test(err.message)) {
    return 'Your query produced a result that is too large to compute. Try narrowing it down.'
  }
  return `Something went wrong inside Mongeesy while running your query (${err?.message ?? 'unknown error'}). This is likely a bug in the in-browser engine, not in your query.`
}

export function suggest(name, candidates) {
  let best = null
  let bestDist = Infinity
  for (const c of candidates) {
    const d = levenshtein(name.toLowerCase(), c.toLowerCase())
    if (d < bestDist) {
      best = c
      bestDist = d
    }
  }
  const limit = Math.max(1, Math.floor(name.length / 3))
  return bestDist <= limit ? best : null
}

export function unknownMessage(kind, name, candidates, format = (s) => s) {
  const guess = suggest(name, candidates)
  return `Unknown ${kind} ${format(name)}.${guess ? ` Did you mean ${format(guess)}?` : ''}`
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}
