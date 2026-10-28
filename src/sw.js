import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Written by setNextLessonHint() in src/lib/reminderService.js
const NEXT_LESSON_CACHE = 'mongeesy-meta'
const NEXT_LESSON_URL = '/__mongeesy/next-lesson'

async function readNextLesson() {
  try {
    const cache = await caches.open(NEXT_LESSON_CACHE)
    const res = await cache.match(NEXT_LESSON_URL)
    return res ? await res.json() : null
  } catch {
    return null
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'mongeesy-reminders') {
    event.waitUntil(
      readNextLesson().then((lesson) =>
        self.registration.showNotification('Time to practice MongoDB!', {
          body: lesson ? `Try lesson: ${lesson.title}` : 'Open Mongeesy to continue your lessons',
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'mongeesy-reminder',
          data: { lessonId: lesson?.id ?? null },
        })
      )
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  const lessonId = event.notification.data?.lessonId
  event.notification.close()

  const url = lessonId != null ? `/learn/${lessonId}` : '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.origin === self.location.origin && 'navigate' in client) {
            return client.navigate(url).then(() => client.focus())
          }
        }
        return self.clients.openWindow(self.location.origin + url)
      })
  )
})
