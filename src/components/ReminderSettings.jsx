import { useState } from 'react'
import { requestNotificationPermission, getPermissionStatus, INTERVAL_OPTIONS } from '../lib/reminderService.js'

export default function ReminderSettings({ settings, onSave, onClose }) {
  const [enabled, setEnabled] = useState(settings.enabled)
  const [intervalMinutes, setIntervalMinutes] = useState(settings.intervalMinutes)
  const [systemNotifications, setSystemNotifications] = useState(settings.systemNotifications)
  const [inAppNotifications, setInAppNotifications] = useState(settings.inAppNotifications)
  const [notifStatus, setNotifStatus] = useState(() => getPermissionStatus())
  const [saved, setSaved] = useState(false)

  async function handleRequestPermission() {
    const result = await requestNotificationPermission()
    setNotifStatus(result)
  }

  function handleSave() {
    onSave({
      enabled,
      intervalMinutes,
      systemNotifications: systemNotifications && notifStatus === 'granted',
      inAppNotifications,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#47A248]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Reminders</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable reminders</span>
            <div
              onClick={() => setEnabled((e) => !e)}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                enabled ? 'bg-[#47A248]' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </label>

          {enabled && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Remind me
                </label>
                <select
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#47A248]"
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">System notifications</span>
                    {notifStatus !== 'granted' && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {notifStatus === 'denied' ? 'Blocked in browser settings' : 'Not granted'}
                      </p>
                    )}
                  </div>
                  <div
                    onClick={() => {
                      if (notifStatus === 'granted') {
                        setSystemNotifications((s) => !s)
                      } else {
                        handleRequestPermission()
                      }
                    }}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                      systemNotifications && notifStatus === 'granted' ? 'bg-[#47A248]' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                        systemNotifications && notifStatus === 'granted' ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">In-app popup</span>
                  <div
                    onClick={() => setInAppNotifications((s) => !s)}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                      inAppNotifications ? 'bg-[#47A248]' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                        inAppNotifications ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#47A248] rounded-lg hover:bg-[#3a8a3e] active:bg-[#2d7231] transition-colors"
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
