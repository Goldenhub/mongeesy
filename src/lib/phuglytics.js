import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN
const ENABLED = !!KEY
const OFFLINE_QUEUE_KEY = 'mongeesy-analytics-queue'
const MAX_QUEUE = 500

export function initAnalytics() {
  if (!ENABLED) return
  posthog.init(KEY, {
    api_host: 'https://mongeesy.vercel.app/tt',
    capture_pageview: false,
    persistence: 'localStorage',
  })
  window.addEventListener('online', flushOfflineQueue)
  if (navigator.onLine) flushOfflineQueue()
}

function capture(event, properties = {}) {
  if (!navigator.onLine) {
    queueOffline(event, properties)
    return
  }
  posthog.capture(event, properties)
}

function queueOffline(event, properties) {
  try {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]')
    queue.push({ event, properties, ts: Date.now() })
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE)
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
  } catch { /* queue full or unavailable */ }
}

function flushOfflineQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY)
    if (!raw) return
    const queue = JSON.parse(raw)
    if (queue.length === 0) return
    for (const item of queue) {
      posthog.capture(item.event, item.properties)
    }
    localStorage.removeItem(OFFLINE_QUEUE_KEY)
  } catch { /* failed to flush */ }
}

export function capturePageview() {
  if (!ENABLED) return
  capture('$pageview')
}

export function captureCtaClicked(label, location) {
  if (!ENABLED) return
  capture('cta_clicked', { cta_label: label, cta_location: location })
}

export function captureLessonStarted(lesson) {
  if (!ENABLED || !lesson) return
  capture('lesson_started', {
    lesson_id: lesson.id,
    lesson_title: lesson.title,
    lesson_module: lesson.module,
  })
}

export function captureQueryRun(lessonId, matched, attempts) {
  if (!ENABLED) return
  capture('query_run', { lesson_id: lessonId, matched, total_attempts: attempts })
}

export function captureLessonCompleted(lessonId, attempts) {
  if (!ENABLED) return
  capture('lesson_completed', { lesson_id: lessonId, total_attempts: attempts })
}

export function captureError(lessonId, errorMessage) {
  if (!ENABLED) return
  capture('query_error', { lesson_id: lessonId, error_message: errorMessage })
}

export function captureHintViewed(lessonId, hintIndex, totalHints) {
  if (!ENABLED) return
  capture('hint_viewed', { lesson_id: lessonId, hint_index: hintIndex, total_hints: totalHints })
}

export function captureModuleCompleted(moduleName, lessonId) {
  if (!ENABLED) return
  capture('module_completed', { module_name: moduleName, lesson_id: lessonId })
}

export function captureAllLessonsCompleted(totalAttempts, totalLessons) {
  if (!ENABLED) return
  capture('all_lessons_completed', { total_attempts: totalAttempts, total_lessons: totalLessons })
}

export function captureQueryReset(lessonId) {
  if (!ENABLED) return
  capture('query_reset', { lesson_id: lessonId })
}

export function capturePlaygroundOpened() {
  if (!ENABLED) return
  capture('playground_opened')
}

export function captureCollectionsPanelOpened() {
  if (!ENABLED) return
  capture('collections_panel_opened')
}

export function captureResultViewToggled(view) {
  if (!ENABLED) return
  capture('result_view_toggled', { view })
}

export function captureException(error) {
  if (!ENABLED) return
  if (!navigator.onLine) {
    queueOffline('$exception', { error: error?.message ?? String(error) })
    return
  }
  posthog.captureException(error)
}
