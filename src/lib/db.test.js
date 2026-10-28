import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
    get length() { return data.size },
    key: (i) => [...data.keys()][i] ?? null,
  }
}

// db.js keeps its connection in module state, so each test loads a fresh copy
// against a fresh fake IndexedDB
async function loadDb({ storage = {}, indexedDB = new IDBFactory() } = {}) {
  vi.resetModules()
  vi.stubGlobal('indexedDB', indexedDB)
  vi.stubGlobal('localStorage', memoryStorage(storage))
  return import('./db.js')
}

const byId = (records) => Object.fromEntries(records.map(({ id, ...rest }) => [id, rest]))

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('migration from localStorage', () => {
  it('moves current-format progress into per-lesson records', async () => {
    const db = await loadDb({
      storage: {
        'mongeesy-progress': JSON.stringify({
          version: '2.0.0',
          lessons: { 3: { completed: true, attempts: 2, lastCode: 'db.books.find()' }, 9: { completed: false, attempts: 1 } },
        }),
      },
    })
    await db.initStorage()
    expect(byId(await db.getAllLessons())).toEqual({
      3: { completed: true, attempts: 2, lastCode: 'db.books.find()' },
      9: { completed: false, attempts: 1 },
    })
    // Left in place for one release so a rollback still works
    expect(localStorage.getItem('mongeesy-progress')).not.toBeNull()
  })

  it('handles the oldest array format', async () => {
    const db = await loadDb({ storage: { 'mongodb-easy-progress': JSON.stringify([1, 4]) } })
    await db.initStorage()
    const lessons = byId(await db.getAllLessons())
    expect(Object.keys(lessons).sort()).toEqual(['1', '4'])
    expect(lessons[1].completed).toBe(true)
  })

  it('renumbers v1.0.0 lessons shifted by the introduction lessons', async () => {
    const db = await loadDb({
      storage: { 'mongeesy-progress': JSON.stringify({ version: '1.0.0', lessons: { 0: { completed: true }, 1: { completed: true }, 32: { completed: true } } }) },
    })
    await db.initStorage()
    expect(Object.keys(byId(await db.getAllLessons())).sort()).toEqual(['0', '3', '34'])
  })

  it('moves reminder settings and the last reminder time', async () => {
    const settings = { enabled: true, intervalMinutes: 120, systemNotifications: false, inAppNotifications: true }
    const db = await loadDb({
      storage: {
        'mongeesy-reminder-settings': JSON.stringify(settings),
        'mongeesy-last-reminder': '1700000000000',
      },
    })
    await db.initStorage()
    expect(await db.getKv(db.KV.reminderSettings)).toEqual(settings)
    expect(await db.getKv(db.KV.lastReminderAt)).toBe(1700000000000)
  })

  it('runs only once, so later IndexedDB changes are not overwritten', async () => {
    const indexedDB = new IDBFactory()
    const storage = { 'mongeesy-progress': JSON.stringify({ version: '2.0.0', lessons: { 3: { completed: false } } }) }
    let db = await loadDb({ storage, indexedDB })
    await db.initStorage()
    await db.putLesson({ id: '3', completed: true })

    db = await loadDb({ storage, indexedDB })
    await db.initStorage()
    expect(byId(await db.getAllLessons())[3].completed).toBe(true)
  })

  it('ignores corrupt saved data', async () => {
    const db = await loadDb({ storage: { 'mongeesy-progress': '{not json' } })
    await db.initStorage()
    expect(await db.getAllLessons()).toEqual([])
  })
})

describe('lesson records', () => {
  it('saving one lesson never overwrites another (two tabs)', async () => {
    const indexedDB = new IDBFactory()
    const tabA = await loadDb({ indexedDB })
    await tabA.putLesson({ id: '5', completed: true })
    const tabB = await loadDb({ indexedDB })
    await tabB.putLesson({ id: '6', completed: true })
    expect(Object.keys(byId(await tabA.getAllLessons())).sort()).toEqual(['5', '6'])
  })

  it('clearLessons removes progress but keeps settings', async () => {
    const db = await loadDb()
    await db.putLesson({ id: '1', completed: true })
    await db.setKv(db.KV.nextLesson, { id: 2, title: 'x' })
    await db.clearLessons()
    expect(await db.getAllLessons()).toEqual([])
    expect(await db.getKv(db.KV.nextLesson)).toEqual({ id: 2, title: 'x' })
  })
})

describe('without IndexedDB', () => {
  it('falls back to localStorage and still migrates', async () => {
    const db = await loadDb({
      indexedDB: null, // undefined would pick up loadDb's default
      storage: { 'mongeesy-progress': JSON.stringify({ version: '2.0.0', lessons: { 7: { completed: true } } }) },
    })
    await db.initStorage()
    expect(await db.isUsingFallback()).toBe(true)
    await db.putLesson({ id: '8', completed: true })
    await db.setKv(db.KV.lastActivityAt, 123)
    expect(Object.keys(byId(await db.getAllLessons())).sort()).toEqual(['7', '8'])
    expect(await db.getKv(db.KV.lastActivityAt)).toBe(123)
    expect(JSON.parse(localStorage.getItem('mongeesy-db-fallback')).lessons[8].completed).toBe(true)
  })
})
