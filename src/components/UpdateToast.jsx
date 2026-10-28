import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_MS = 60 * 60 * 1000

// Registers the service worker and offers new versions instead of swapping
// them in under an open page (which could break files the page still needs)
export default function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => {})
      }, UPDATE_CHECK_MS)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed top-4 left-4 right-4 z-50 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-sm" role="status">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
        <p className="flex-1 text-sm text-slate-700 dark:text-slate-300">
          A new version of Mongeesy is available.
        </p>
        <button
          onClick={() => setNeedRefresh(false)}
          className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Later
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          className="px-3 py-1.5 text-xs font-medium text-white bg-[#47A248] rounded-lg hover:bg-[#3a8a3e] transition-colors"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
