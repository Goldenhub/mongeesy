const SETTINGS_KEY = 'mongeesy-reminder-settings'
const LAST_REMINDER_KEY = 'mongeesy-last-reminder'

const DEFAULTS = {
  enabled: false,
  intervalMinutes: 60,
  systemNotifications: true,
  inAppNotifications: true,
}

export function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

let timerId = null
let subscribers = []

export function start(settings, getSuggestedLesson) {
  stop()
  if (!settings.enabled) return

  const ms = settings.intervalMinutes * 60 * 1000

  if (settings.systemNotifications && 'Notification' in window && Notification.permission === 'granted') {
    registerPeriodicSync(settings.intervalMinutes)
  }

  function fire() {
    const lesson = typeof getSuggestedLesson === 'function' ? getSuggestedLesson() : null

    if (settings.systemNotifications && 'Notification' in window && Notification.permission === 'granted') {
      showSystemNotification(lesson)
    }

    if (settings.inAppNotifications) {
      subscribers.forEach(cb => { try { cb(lesson) } catch { /* ignore */ } })
    }

    localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()))
  }

  const last = localStorage.getItem(LAST_REMINDER_KEY)
  if (last && Date.now() - Number(last) >= ms) {
    setTimeout(fire, 5000)
  }

  timerId = setInterval(fire, ms)
}

export function stop() {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
  unregisterPeriodicSync()
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

function showSystemNotification(lesson) {
  new Notification('Time to practice MongoDB!', {
    body: lesson ? `Try lesson: ${lesson.title}` : 'Continue your MongoDB lessons',
    icon: '/pwa-192x192.png',
    tag: 'mongeesy-reminder',
    data: { lessonId: lesson?.id ?? null },
  })
}

async function registerPeriodicSync(intervalMinutes) {
  if (!('periodicSync' in navigator.serviceWorker)) return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.periodicSync.register('mongeesy-reminders', {
      minInterval: intervalMinutes * 60 * 1000,
    })
  } catch { /* periodic sync not available */ }
}

async function unregisterPeriodicSync() {
  if (!('periodicSync' in navigator.serviceWorker)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const tags = await reg.periodicSync.getTags()
    if (tags.includes('mongeesy-reminders')) {
      await reg.periodicSync.unregister('mongeesy-reminders')
    }
  } catch { /* periodic sync not available */ }
}

export async function isPeriodicSyncSupported() {
  return 'periodicSync' in navigator.serviceWorker &&
    await navigator.serviceWorker.ready.then(r => 'periodicSync' in r)
}

export const INTERVAL_OPTIONS = [
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 240, label: 'Every 4 hours' },
  { value: 1440, label: 'Once a day' },
]
