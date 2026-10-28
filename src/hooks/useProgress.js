import { useState, useCallback, useEffect, useRef } from 'react'
import {
  initStorage, getAllLessons, putLesson, clearLessons, notify, subscribe,
  readLegacyProgress, requestPersistence,
} from '../lib/db.js'

// Progress lives in IndexedDB (see src/lib/db.js). This small localStorage
// copy lets the first render, and the landing page, show progress synchronously.
const CACHE_KEY = 'mongeesy-progress-cache'
const APP_VERSION = '3.0.0'

export function readCachedProgress() {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch { /* fall through to legacy */ }
  // First load after the move to IndexedDB: the old key is still there
  return readLegacyProgress()
}

function writeCache(lessons) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(lessons))
  } catch { /* storage full or blocked */ }
}

export function recordsToProgress(records) {
  return Object.fromEntries(records.map(({ id, ...state }) => [id, state]))
}

export async function loadProgress() {
  await initStorage()
  return recordsToProgress(await getAllLessons())
}

export function useProgress() {
  const [lessonStates, setLessonStates] = useState(readCachedProgress)
  const [ready, setReady] = useState(false)
  const latest = useRef(lessonStates)
  // Writes not yet confirmed by IndexedDB; re-applied over anything loaded so a
  // slower read can't roll back what the user just did
  const inFlight = useRef(new Map())

  const apply = useCallback((next) => {
    latest.current = next
    setLessonStates(next)
    writeCache(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const loaded = await loadProgress()
      if (cancelled) return
      for (const [id, state] of inFlight.current) loaded[id] = state
      apply(loaded)
    }
    load()
      .catch((err) => console.warn('Could not load progress', err))
      .finally(() => !cancelled && setReady(true))
    const unsubscribe = subscribe((msg) => {
      if (msg?.type === 'progress') load().catch(() => {})
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [apply])

  const updateLessonState = useCallback((lessonId, state) => {
    const id = String(lessonId)
    const record = { ...latest.current[id], ...state }
    apply({ ...latest.current, [id]: record })
    inFlight.current.set(id, record)
    initStorage()
      .then(() => putLesson({ ...record, id }))
      .then(() => {
        notify('progress')
        if (record.completed) requestPersistence()
      })
      .catch((err) => console.warn('Could not save progress', err))
      .finally(() => {
        if (inFlight.current.get(id) === record) inFlight.current.delete(id)
      })
  }, [apply])

  const resetProgress = useCallback(() => {
    inFlight.current.clear()
    apply({})
    clearLessons().then(() => notify('progress')).catch(() => {})
  }, [apply])

  const countCompleted = Object.values(lessonStates).filter((s) => s.completed).length

  const isCompleted = useCallback(
    (lessonId) => lessonStates[String(lessonId)]?.completed === true,
    [lessonStates]
  )

  return { lessonStates, countCompleted, isCompleted, updateLessonState, resetProgress, ready, appVersion: APP_VERSION }
}
