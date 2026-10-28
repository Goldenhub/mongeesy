import { Database } from './query-engine.js'
import { serializeError } from './errors.js'

// Runs a query against a fresh copy of `seed` and reports the outcome as
// plain data: { ok, result, state } or { ok: false, error }.
export function executeQuery(seed, query) {
  try {
    const db = new Database(seed)
    const { result } = db.execute(query)
    return { ok: true, result, state: db.getState() }
  } catch (err) {
    return { ok: false, error: serializeError(err) }
  }
}
