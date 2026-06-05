import { useState } from 'react'

const STORAGE_KEY = 'mongeesy-pwa-banner-dismissed'

let deferredPrompt = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e
}, { once: true })

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || (window.navigator).standalone === true
}

export default function PwaInstallBanner() {
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(STORAGE_KEY))

  const show = !dismissed && !isStandalone() && (isIOS() || !!deferredPrompt)

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem(STORAGE_KEY, '1')
      setDismissed(true)
    }
    deferredPrompt = null
  }

  if (!show) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 pb-6 pointer-events-none">
      <div className="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden pointer-events-auto">
        <div className="bg-gradient-to-r from-[#47A248] to-emerald-600 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white text-sm font-semibold">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.193 9.555c-1.264-5.58-4.252-7.414-4.573-8.745-.045-.21-.112-.417-.197-.61-.06-.153-.132-.324-.15-.518v-.019c-.023-.246-.09-.575-.09-.575l-.076-.305s-.33.157-.374.32c-.065.237-.064.476-.008.714.07.333.187.655.34.961.055.112.112.223.17.334-1.038 1.028-2.072 2.21-2.886 3.428-1.59 2.38-2.63 5.256-2.63 7.92 0 4.572 3.2 7.452 6.12 8.437.524.178.874.3.874.3l.05-.026c.677.315 1.443.54 2.243.66l.146.016c.374.033.748.05 1.122.05.374 0 .748-.017 1.122-.05l.146-.016c.8-.12 1.566-.345 2.242-.66l.05.025s.35-.12.875-.3c2.92-.985 6.12-3.865 6.12-8.437 0-2.664-1.082-5.498-2.67-7.878-.814-1.217-1.848-2.4-2.886-3.428z"/>
            </svg>
            Install Mongeesy
          </div>
          <button onClick={handleDismiss} className="text-white/70 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {deferredPrompt ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Install this app on your device for offline access and lesson reminders.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDismiss}
                  className="flex-1 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Not now
                </button>
                <button
                  onClick={handleInstall}
                  disabled={!deferredPrompt}
                  className="flex-1 px-3 py-2 text-xs font-medium text-white bg-[#47A248] rounded-lg hover:bg-[#3a8a3e] disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  Install
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                Install this app on your iPhone for the best experience:
              </p>
              <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5 list-decimal list-inside">
                <li>Tap the <strong className="text-slate-700 dark:text-slate-300">Share</strong> button <span className="text-base">⎙</span> in the bottom toolbar</li>
                <li>Scroll down and tap <strong className="text-slate-700 dark:text-slate-300">Add to Home Screen</strong></li>
                <li>Tap <strong className="text-slate-700 dark:text-slate-300">Add</strong> in the top-right corner</li>
              </ol>
              <button
                onClick={handleDismiss}
                className="mt-4 w-full px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Got it
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
