import { executeQuery } from './execute-query.js'

export const QUERY_TIMEOUT_MS = 3000

let worker = null
let nextId = 0
const pending = new Map()
// Set once the worker has answered at least once, i.e. its script loaded
let workerStarted = false
// The worker script couldn't load (e.g. its file vanished after a deploy);
// run on the main thread for the rest of this page's life
let workerUnavailable = false

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./query-worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    workerStarted = true
    const entry = pending.get(data.id)
    if (!entry) return
    pending.delete(data.id)
    clearTimeout(entry.timer)
    entry.resolve(data.outcome)
  }
  worker.onerror = (event) => {
    event.preventDefault?.()
    if (!workerStarted) {
      fallBackToMainThread()
      return
    }
    failAll(event.message || 'The query engine crashed')
  }
  return worker
}

function fallBackToMainThread() {
  workerUnavailable = true
  console.warn('Query worker failed to start; running queries on the main thread instead')
  for (const entry of pending.values()) {
    clearTimeout(entry.timer)
    entry.resolve(executeQuery(entry.seed, entry.query))
  }
  pending.clear()
  worker?.terminate()
  worker = null
}

function failAll(message) {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer)
    entry.resolve({ ok: false, error: { name: 'Error', message, userFacing: false } })
  }
  pending.clear()
  worker?.terminate()
  worker = null
}

// Runs off the main thread so a runaway query (a catastrophic regex, a huge
// $range) can be stopped instead of freezing the tab.
export function runQuery(seed, query, { timeoutMs = QUERY_TIMEOUT_MS } = {}) {
  if (typeof Worker === 'undefined' || workerUnavailable) return Promise.resolve(executeQuery(seed, query))

  return new Promise((resolve) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      failAll('Query worker restarted after a timeout')
      resolve({
        ok: false,
        error: {
          name: 'TimeoutError',
          message: `Your query ran for more than ${timeoutMs / 1000} seconds and was stopped. Check for a regex or expression that does far more work than needed.`,
          userFacing: true,
        },
      })
    }, timeoutMs)
    pending.set(id, { resolve, timer, seed, query })
    try {
      getWorker().postMessage({ id, seed, query })
    } catch (err) {
      pending.delete(id)
      clearTimeout(timer)
      resolve(executeQuery(seed, query))
      console.warn('Query worker unavailable, ran on the main thread instead', err)
    }
  })
}
