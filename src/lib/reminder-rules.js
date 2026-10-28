// Decides whether a reminder is due. Pure so the page timer and the service
// worker's background sync make the same decision.

export const DEFAULT_REMINDER_SETTINGS = {
  enabled: false,
  intervalMinutes: 60,
  systemNotifications: true,
  inAppNotifications: true,
}

export const REMINDER_SYNC_TAG = 'mongeesy-reminders'

// Title and options for showNotification(), shared by page and service worker
export function reminderNotification(lesson) {
  return {
    title: 'Time to practice MongoDB!',
    options: {
      body: lesson ? `Try lesson: ${lesson.title}` : 'Open Mongeesy to continue your lessons',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'mongeesy-reminder',
      data: { lessonId: lesson?.id ?? null },
    },
  }
}

const NONE = { system: false, inApp: false }

// now, lastActivityAt, lastReminderAt: epoch ms (missing = never)
// visible: is a Mongeesy tab currently in front of the user
// Returns which kinds of reminder to show.
export function shouldRemind({ now, settings, lastActivityAt, lastReminderAt, visible }) {
  const s = { ...DEFAULT_REMINDER_SETTINGS, ...settings }
  if (!s.enabled) return NONE
  const interval = s.intervalMinutes * 60 * 1000
  // Someone (another tab, or the service worker) already reminded recently
  if (lastReminderAt && now - lastReminderAt < interval) return NONE
  // They've practiced recently; no need to nudge
  if (lastActivityAt && now - lastActivityAt < interval) return NONE
  return {
    // A system notification is pointless while they're looking at the app,
    // and an in-app popup is useless while they aren't; it waits until they're back
    system: s.systemNotifications && !visible,
    inApp: s.inAppNotifications && visible,
  }
}
