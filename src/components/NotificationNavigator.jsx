import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// src/sw.js posts NAVIGATE_LESSON when a reminder notification is clicked and
// a Mongeesy window is already open; route there without reloading the page
export default function NotificationNavigator() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE_LESSON' && typeof event.data.path === 'string') {
        navigate(event.data.path)
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [navigate])

  return null
}
