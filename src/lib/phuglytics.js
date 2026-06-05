import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN
const HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST 
const ENABLED = !!KEY

export function initAnalytics() {
  if (!ENABLED) return
  posthog.init(KEY, {
    api_host: 'https://mongeesy.vercel.app/ph',
    capture_pageview: false,
    persistence: 'localStorage',
  })
}

export function capturePageview() {
  if (!ENABLED) return
  posthog.capture('$pageview')
}

export function captureCtaClicked(label, location) {
  if (!ENABLED) return
  posthog.capture('cta_clicked', {
    cta_label: label,
    cta_location: location,
  })
}

export function captureLessonStarted(lesson) {
  if (!ENABLED || !lesson) return
  posthog.capture('lesson_started', {
    lesson_id: lesson.id,
    lesson_title: lesson.title,
    lesson_module: lesson.module,
  })
}

export function captureQueryRun(lessonId, matched, attempts) {
  if (!ENABLED) return
  posthog.capture('query_run', {
    lesson_id: lessonId,
    matched,
    total_attempts: attempts,
  })
}

export function captureLessonCompleted(lessonId, attempts) {
  if (!ENABLED) return
  posthog.capture('lesson_completed', {
    lesson_id: lessonId,
    total_attempts: attempts,
  })
}

export function captureError(lessonId, errorMessage) {
  if (!ENABLED) return
  posthog.capture('query_error', {
    lesson_id: lessonId,
    error_message: errorMessage,
  })
}

export function captureHintViewed(lessonId, hintIndex, totalHints) {
  if (!ENABLED) return
  posthog.capture('hint_viewed', {
    lesson_id: lessonId,
    hint_index: hintIndex,
    total_hints: totalHints,
  })
}

export function captureModuleCompleted(moduleName, lessonId) {
  if (!ENABLED) return
  posthog.capture('module_completed', {
    module_name: moduleName,
    lesson_id: lessonId,
  })
}

export function captureAllLessonsCompleted(totalAttempts, totalLessons) {
  if (!ENABLED) return
  posthog.capture('all_lessons_completed', {
    total_attempts: totalAttempts,
    total_lessons: totalLessons,
  })
}

export function captureQueryReset(lessonId) {
  if (!ENABLED) return
  posthog.capture('query_reset', {
    lesson_id: lessonId,
  })
}

export function capturePlaygroundOpened() {
  if (!ENABLED) return
  posthog.capture('playground_opened')
}

export function captureCollectionsPanelOpened() {
  if (!ENABLED) return
  posthog.capture('collections_panel_opened')
}

export function captureResultViewToggled(view) {
  if (!ENABLED) return
  posthog.capture('result_view_toggled', { view })
}

export function captureException(error) {
  if (!ENABLED) return
  posthog.captureException(error)
}
