import { initStorage, getKv, setKv, KV, notify, LEGACY_KEYS } from './db.js'
import { shouldRemind, reminderNotification, DEFAULT_REMINDER_SETTINGS, REMINDER_SYNC_TAG } from './reminder-rules.js'

// How often an open tab checks whether a reminder is due. The interval the
// user picks is enforced by shouldRemind(), not by this timer.
const CHECK_EVERY_MS = 60 * 1000
const ACTIVITY_THROTTLE_MS = 30 * 1000

// Settings live in IndexedDB so the service worker can read them. The old
// localStorage key is kept as a synchronous copy for the first render.
export function loadSettings() {
  try {
    const stored = localStorage.getItem(LEGACY_KEYS.reminderSettings)
    return stored ? { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_REMINDER_SETTINGS }
  } catch {
    return { ...DEFAULT_REMINDER_SETTINGS }
  }
}

export async function loadSettingsAsync() {
  await initStorage()
  const stored = await getKv(KV.reminderSettings)
  return { ...DEFAULT_REMINDER_SETTINGS, ...stored }
}

export async function saveSettings(settings) {
  try {
    localStorage.setItem(LEGACY_KEYS.reminderSettings, JSON.stringify(settings))
  } catch { /* storage full or blocked */ }
  await initStorage()
  await setKv(KV.reminderSettings, settings)
  notify('settings')
}

let lastActivityWrite = 0

// Called when the user does something in a lesson; reminders are skipped
// while they practice
export function markActivity() {
  const now = Date.now()
  if (now - lastActivityWrite < ACTIVITY_THROTTLE_MS) return
  lastActivityWrite = now
  initStorage().then(() => setKv(KV.lastActivityAt, now)).catch(() => {})
}

export function setNextLessonHint(lesson) {
  initStorage()
    .then(() => setKv(KV.nextLesson, lesson ? { id: lesson.id, title: lesson.title } : null))
    .catch(() => {})
}

let timerId = null
let subscribers = []
let stopVisibilityCheck = () => {}

export function start(settings, getSuggestedLesson) {
  stop()
  syncBackgroundReminders(settings)
  if (!settings.enabled) return

  let checking = false
  const check = async () => {
    if (checking) return
    checking = true
    try {
      // The lock makes sure only one open tab decides and fires at a time
      const decide = () => fireIfDue(settings, getSuggestedLesson)
      if (navigator.locks?.request) await navigator.locks.request('mongeesy-reminder', decide)
      else await decide()
    } catch { /* storage or notification failure; try again next tick */ } finally {
      checking = false
    }
  }
  timerId = setInterval(check, CHECK_EVERY_MS)
  document.addEventListener('visibilitychange', check)
  stopVisibilityCheck = () => document.removeEventListener('visibilitychange', check)
}

// Only stops this tab's timer. Background reminders stay registered while
// the user has them enabled, even after the tab closes.
export function stop() {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
  stopVisibilityCheck()
  stopVisibilityCheck = () => {}
}

async function fireIfDue(settings, getSuggestedLesson) {
  await initStorage()
  const [lastActivityAt, lastReminderAt] = await Promise.all([getKv(KV.lastActivityAt), getKv(KV.lastReminderAt)])
  const visible = document.visibilityState === 'visible'
  const due = shouldRemind({ now: Date.now(), settings, lastActivityAt, lastReminderAt, visible })
  const system = due.system && getPermissionStatus() === 'granted'
  if (!system && !due.inApp) return

  await setKv(KV.lastReminderAt, Date.now())
  const lesson = typeof getSuggestedLesson === 'function' ? getSuggestedLesson() : null
  if (system) await showSystemNotification(lesson)
  if (due.inApp) subscribers.forEach((cb) => { try { cb(lesson) } catch { /* ignore */ } })
}

export function subscribe(cb) {
  subscribers.push(cb)
  return () => {
    subscribers = subscribers.filter(s => s !== cb)
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'default') {
    return await Notification.requestPermission()
  }
  return Notification.permission
}

export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export function isNotificationSupported() {
  return 'Notification' in window
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

// Through the service worker when there is one: Android Chrome doesn't allow
// `new Notification()`, and clicks then route in-app via src/sw.js
async function showSystemNotification(lesson) {
  const { title, options } = reminderNotification(lesson)
  const reg = await getRegistration()
  if (reg) {
    await reg.showNotification(title, options)
    return
  }
  try {
    const notif = new Notification(title, options)
    notif.onclick = () => {
      notif.close()
      window.focus()
      window.location.href = options.data.lessonId != null ? `/learn/${options.data.lessonId}` : '/learn'
    }
  } catch { /* notifications not allowed in this context */ }
}

async function syncBackgroundReminders(settings) {
  const reg = await getRegistration()
  if (!reg || !('periodicSync' in reg)) return
  try {
    const wanted = settings.enabled && settings.systemNotifications && getPermissionStatus() === 'granted'
    if (!wanted) {
      const tags = await reg.periodicSync.getTags()
      if (tags.includes(REMINDER_SYNC_TAG)) await reg.periodicSync.unregister(REMINDER_SYNC_TAG)
      return
    }
    // Chromium only grants this to installed apps it considers engaged
    const permission = await navigator.permissions?.query({ name: 'periodic-background-sync' }).catch(() => null)
    if (permission && permission.state !== 'granted') return
    await reg.periodicSync.register(REMINDER_SYNC_TAG, { minInterval: settings.intervalMinutes * 60 * 1000 })
  } catch { /* periodic sync not available */ }
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

export const SUPPORT_MESSAGES = {
  'background': 'Reminders arrive while Mongeesy is open. When it\'s closed, your browser may also send one, as often as it allows (usually a few times a day at most).',
  'install-for-background': 'Reminders arrive while Mongeesy is open in a tab. Install Mongeesy as an app to also get them when it\'s closed.',
  'open-tab': 'Reminders arrive while Mongeesy is open in a tab. This browser can\'t send them when it\'s closed.',
  'ios-install': 'On iPhone and iPad, add Mongeesy to your Home Screen to get notifications. In-app reminders still work here.',
  'in-app': 'This browser doesn\'t support notifications, so you\'ll only get in-app reminders while Mongeesy is open.',
}

// What reminders this browser can actually deliver; one of SUPPORT_MESSAGES' keys
export async function getReminderSupport() {
  if (!('Notification' in window)) return isIOS() && !isStandalone() ? 'ios-install' : 'in-app'
  const reg = await getRegistration()
  if (reg && 'periodicSync' in reg) return isStandalone() ? 'background' : 'install-for-background'
  return 'open-tab'
}

export const INTERVAL_OPTIONS = [
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 240, label: 'Every 4 hours' },
  { value: 1440, label: 'Once a day' },
]
