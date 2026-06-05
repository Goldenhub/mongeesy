import { useEffect, useState } from 'react'

export default function ReminderToast({ lesson, onDismiss, onOpen }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 300)
    return () => clearTimeout(show)
  }, [])

  useEffect(() => {
    if (!visible) return
    const auto = setTimeout(() => handleDismiss(), 15000)
    return () => clearTimeout(auto)
  }, [visible])

  function handleDismiss() {
    setLeaving(true)
    setTimeout(onDismiss, 300)
  }

  if (!lesson) return null

  return (
    <div
      className={`fixed bottom-6 left-6 right-6 z-40 sm:left-auto sm:right-6 sm:w-full sm:max-w-sm transition-all duration-300 ease-out ${
        visible && !leaving ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-r from-[#47A248] to-emerald-600 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            Time to practice!
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
            {lesson.title
              ? `Try lesson: "${lesson.title}"`
              : 'Continue your MongoDB lessons'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Later
            </button>
            <button
              onClick={() => onOpen(lesson)}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-[#47A248] rounded-lg hover:bg-[#3a8a3e] transition-colors text-center"
            >
              Open Lesson
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
