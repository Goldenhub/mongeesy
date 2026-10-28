import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { getKv, setKv, KV } from './lib/db.js'
import { shouldRemind, reminderNotification, REMINDER_SYNC_TAG } from './lib/reminder-rules.js'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Every app route (/learn/20, /learn/playground...) is the same SPA shell, so
// deep links and reloads work offline. /tt is the analytics proxy.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [/^\/tt\//],
}))

// A new version waits until the user accepts the "update available" prompt
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

async function windowClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
}

// Background reminders (Chromium, installed app only). The browser decides
// how often this runs; we still apply the user's settings and skip the
// reminder if they practiced recently or a tab already reminded them.
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== REMINDER_SYNC_TAG) return
  event.waitUntil((async () => {
    const [settings, lastActivityAt, lastReminderAt, lesson, windows] = await Promise.all([
      getKv(KV.reminderSettings),
      getKv(KV.lastActivityAt),
      getKv(KV.lastReminderAt),
      getKv(KV.nextLesson),
      windowClients(),
    ])
    const visible = windows.some((c) => c.visibilityState === 'visible')
    const due = shouldRemind({ now: Date.now(), settings, lastActivityAt, lastReminderAt, visible })
    if (!due.system) return
    await setKv(KV.lastReminderAt, Date.now())
    const { title, options } = reminderNotification(lesson)
    await self.registration.showNotification(title, options)
  })())
})

self.addEventListener('notificationclick', (event) => {
  const lessonId = event.notification.data?.lessonId
  event.notification.close()
  const path = lessonId != null ? `/learn/${lessonId}` : '/learn'

  event.waitUntil((async () => {
    const windows = await windowClients()
    const client = windows.find((c) => new URL(c.url).origin === self.location.origin)
    if (!client) {
      await self.clients.openWindow(path)
      return
    }
    await client.focus()
    // The app routes in place, without a reload (see NotificationNavigator in App.jsx)
    client.postMessage({ type: 'NAVIGATE_LESSON', path })
  })())
})
