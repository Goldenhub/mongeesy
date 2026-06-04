import { useMemo } from 'react'
import { getModuleBoundaries } from '../utils/modules.js'
import { PLAYGROUND_LESSON_ID } from '../lib/playground.jsx'

export default function Sidebar({ lessons, currentLessonId, lessonStates, onSelectLesson }) {
  const moduleBoundaries = useMemo(() => getModuleBoundaries(lessons.length), [lessons.length])

  function moduleCompleted(lessonStates, start, end) {
    for (let id = start; id <= end; id++) {
      if (!lessonStates[String(id)]?.completed) return false
    }
    return true
  }

  const totalCompleted = lessons
    ? Object.values(lessonStates).filter((s) => s.completed).length
    : 0

  return (
    <aside className="w-72 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 flex flex-col h-full select-none shrink-0 border-r border-slate-200 dark:border-slate-700">
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-700">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
          Mongeesy
        </h1>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          {totalCompleted}/{lessons.length} lessons completed
        </p>
        <div className="mt-2 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#47A248] rounded-full transition-all duration-300"
            style={{ width: `${(totalCompleted / lessons.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => onSelectLesson(PLAYGROUND_LESSON_ID)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentLessonId === PLAYGROUND_LESSON_ID
              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
              : 'bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 hover:text-indigo-700 dark:hover:text-indigo-300'
          }`}
        >
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 bg-indigo-200 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.5 1.5a.5.5 0 01.5.5v3.5h3.5a.5.5 0 010 1H7v3.5a.5.5 0 01-1 0V6.5H2.5a.5.5 0 010-1H6V2a.5.5 0 01.5-.5z"/>
              <path d="M13 7.5a.5.5 0 01.5.5v5.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5V9a.5.5 0 011 0v4h9V8a.5.5 0 01.5-.5z"/>
            </svg>
          </span>
          <span className="truncate">Open Playground</span>
          <span className="ml-auto text-xs bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-mono">free</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-2">
        {lessons.filter((l) => l.module === 'Introduction').length > 0 && (
          <div>
            <div className="px-4 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Introduction
            </div>
            {lessons.filter((l) => l.module === 'Introduction').map((lesson) => {
              const state = lessonStates[String(lesson.id)]
              const done = state?.completed === true
              const active = lesson.id === currentLessonId
              return (
                <button
                  key={lesson.id}
                  onClick={() => onSelectLesson(lesson.id)}
                  className={`w-full text-left px-4 py-1.5 flex items-center gap-2 text-sm transition-colors ${
                    active
                      ? 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-400 border-l-2 border-[#47A248]'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200 border-l-2 border-transparent'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                    done ? 'bg-[#47A248] text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    {done ? '✓' : '★'}
                  </span>
                  <span className="truncate">{lesson.title}</span>
                </button>
              )
            })}
          </div>
        )}
        {moduleBoundaries.map(({ start, end, name }) => (
          <div key={start}>
            <div className="px-4 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>{name}</span>
              <span className={`text-xs font-normal ${moduleCompleted(lessonStates, start, end) ? 'text-[#47A248]' : 'text-slate-400 dark:text-slate-500'}`}>
                {lessons.slice(start, end + 1).filter((l) => lessonStates[String(l.id)]?.completed).length}/{end - start + 1}
              </span>
            </div>
            {lessons.slice(start, end + 1).map((lesson) => {
              const state = lessonStates[String(lesson.id)]
              const done = state?.completed === true
              const active = lesson.id === currentLessonId
              return (
                <button
                  key={lesson.id}
                  onClick={() => onSelectLesson(lesson.id)}
                  className={`w-full text-left px-4 py-1.5 flex items-center gap-2 text-sm transition-colors ${
                    active
                      ? 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-400 border-l-2 border-[#47A248]'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200 border-l-2 border-transparent'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                    done ? 'bg-[#47A248] text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    {done ? '✓' : lesson.id}
                  </span>
                  <span className="truncate">{lesson.title}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-400 dark:text-slate-500 text-center">
        by <a href="https://github.com/goldenhub" target="_blank" rel="noopener noreferrer" className="text-[#47A248] underline hover:brightness-75">goldenhub</a>
      </div>
    </aside>
  )
}
