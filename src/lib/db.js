// IndexedDB storage shared by the page and the service worker, so background
// reminders can read settings and progress. No window access at module level.
//
// Stores:
//   lessons  { id, completed, completedAt, lastCode, attempts }, one per lesson
//            so two tabs saving different lessons never overwrite each other
//   kv       small values, keyed by the KV names below
//
// When IndexedDB can't be opened (some private modes) the same API is backed by
// localStorage, or by memory inside a worker.

const DB_NAME = 'mongeesy'
const DB_VERSION = 1
const FALLBACK_KEY = 'mongeesy-db-fallback'
const CHANNEL_NAME = 'mongeesy'

export const KV = {
  reminderSettings: 'reminderSettings',
  lastActivityAt: 'lastActivityAt',
  lastReminderAt: 'lastReminderAt',
  nextLesson: 'nextLesson',
  migrated: 'migratedFromLocalStorage',
}

// Keys the app used before IndexedDB. Left in place for one release so a
// rollback still finds the user's progress.
export const LEGACY_KEYS = {
  progress: 'mongeesy-progress',
  oldProgress: 'mongodb-easy-progress',
  reminderSettings: 'mongeesy-reminder-settings',
  lastReminder: 'mongeesy-last-reminder',
}

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    let req
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      return resolve(null)
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('lessons')) db.createObjectStore('lessons', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
    }
    req.onsuccess = () => {
      const db = req.result
      // Let a newer version of the app upgrade the schema from another tab
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => resolve(null)
  })
  return dbPromise
}

function run(db, storeName, mode, op) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const req = op(tx.objectStore(storeName))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// --- fallback backend -------------------------------------------------------

let memory = { lessons: {}, kv: {} }

function hasLocalStorage() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch {
    return false
  }
}

function readFallback() {
  if (!hasLocalStorage()) return memory
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY)) ?? { lessons: {}, kv: {} }
  } catch {
    return { lessons: {}, kv: {} }
  }
}

function writeFallback(data) {
  memory = data
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(data))
  } catch { /* storage full or blocked */ }
}

// --- public API ---------------------------------------------------------------

export async function getAllLessons() {
  const db = await openDb()
  if (!db) return Object.values(readFallback().lessons)
  return run(db, 'lessons', 'readonly', (s) => s.getAll())
}

export async function putLessons(records) {
  const db = await openDb()
  if (!db) {
    const data = readFallback()
    for (const r of records) data.lessons[r.id] = r
    return writeFallback(data)
  }
  return run(db, 'lessons', 'readwrite', (s) => {
    for (const r of records) s.put(r)
  })
}

export function putLesson(record) {
  return putLessons([record])
}

export async function clearLessons() {
  const db = await openDb()
  if (!db) return writeFallback({ ...readFallback(), lessons: {} })
  return run(db, 'lessons', 'readwrite', (s) => s.clear())
}

export async function getKv(key) {
  const db = await openDb()
  if (!db) return readFallback().kv[key]
  return run(db, 'kv', 'readonly', (s) => s.get(key))
}

export async function setKv(key, value) {
  const db = await openDb()
  if (!db) {
    const data = readFallback()
    data.kv[key] = value
    return writeFallback(data)
  }
  return run(db, 'kv', 'readwrite', (s) => s.put(value, key))
}

export async function isUsingFallback() {
  return (await openDb()) === null
}

// --- cross-tab notifications ----------------------------------------------------

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null

// Tell other tabs something changed; this tab already has the new state
export function notify(type) {
  try {
    channel?.postMessage({ type })
  } catch { /* channel closed */ }
}

export function subscribe(callback) {
  if (!channel) return () => {}
  const handler = (event) => callback(event.data)
  channel.addEventListener('message', handler)
  return () => channel.removeEventListener('message', handler)
}

// --- legacy localStorage progress -------------------------------------------

// Turns any stored progress format into { [lessonId]: state }:
//   - an array of completed ids (oldest format)
//   - { version: '1.0.0', lessons } where lessons 1-32 were renumbered to 3-34
//     when the two introduction lessons were added
//   - { version: '2.0.0', lessons }
export function parseLegacyProgress(raw) {
  if (!raw) return {}
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (Array.isArray(parsed)) {
    return Object.fromEntries(parsed.map((id) => [
      String(id),
      { completed: true, completedAt: null, lastCode: '', attempts: 0 },
    ]))
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.lessons) return {}
  if (parsed.version === '1.0.0') {
    const lessons = {}
    for (const [key, state] of Object.entries(parsed.lessons)) {
      const num = Number(key)
      lessons[num >= 1 && num <= 32 ? String(num + 2) : key] = state
    }
    return lessons
  }
  return { ...parsed.lessons }
}

export function readLegacyProgress() {
  if (!hasLocalStorage()) return {}
  try {
    return parseLegacyProgress(localStorage.getItem(LEGACY_KEYS.oldProgress) ?? localStorage.getItem(LEGACY_KEYS.progress))
  } catch {
    return {}
  }
}

async function migrateFromLocalStorage() {
  if (!hasLocalStorage() || (await getKv(KV.migrated))) return
  const lessons = readLegacyProgress()
  const records = Object.entries(lessons).map(([id, state]) => ({ ...state, id }))
  if (records.length) await putLessons(records)

  try {
    const settings = localStorage.getItem(LEGACY_KEYS.reminderSettings)
    if (settings && (await getKv(KV.reminderSettings)) === undefined) {
      await setKv(KV.reminderSettings, JSON.parse(settings))
    }
    const last = Number(localStorage.getItem(LEGACY_KEYS.lastReminder))
    if (last) await setKv(KV.lastReminderAt, last)
  } catch { /* malformed legacy value */ }

  await setKv(KV.migrated, Date.now())
}

let initPromise = null

// Opens the database and migrates old localStorage data once. Safe to call
// from anywhere; every caller gets the same promise.
export function initStorage() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await migrateFromLocalStorage()
      } catch (err) {
        console.warn('Could not migrate saved progress', err)
      }
    })()
  }
  return initPromise
}

// Asks the browser not to evict our data under storage pressure. Firefox shows
// a prompt for this, so it's only called once the user has progress worth keeping.
export async function requestPersistence() {
  try {
    const storage = globalThis.navigator?.storage
    if (storage?.persist && !(await storage.persisted?.())) await storage.persist()
  } catch { /* not supported */ }
}
