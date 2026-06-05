import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'mongeesy-reminders') {
    event.waitUntil(
      self.registration.showNotification('Time to practice MongoDB!', {
        body: 'Open Mongeesy to continue your lessons',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'mongeesy-reminder',
        data: { lessonId: null },
      })
    )
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_REMINDER') {
    const { title, body, lessonId } = event.data
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'mongeesy-reminder',
      data: { lessonId },
    })
  }
})

self.addEventListener('notificationclick', (event) => {
  const lessonId = event.notification.data?.lessonId
  event.notification.close()

  const url = lessonId ? `/learn/${lessonId}` : '/'

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
