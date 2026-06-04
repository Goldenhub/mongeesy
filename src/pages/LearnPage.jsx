import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import MainPanel from '../components/MainPanel.jsx'
import { useProgress } from '../hooks/useProgress.js'
import { Database } from '../engine/query-engine.js'
import { ParseError } from '../engine/mongosh-parser.js'
import { compareResults } from '../utils/compare-results.js'
import { captureLessonStarted, captureQueryRun, captureLessonCompleted, captureError, captureModuleCompleted, captureAllLessonsCompleted, captureQueryReset, captureException, capturePlaygroundOpened } from '../lib/phuglytics.js'
import { getModuleForLesson } from '../utils/modules.js'
import lessons from '../lessons/index.js'
import { PLAYGROUND_LESSON_ID, playgroundLesson } from '../lib/playground.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
const modKey = isMac ? '\u2318' : 'Ctrl'
const placeholderText = `// Enter your MongoDB query here, then press ${modKey}+Enter or click RUN`

export default function LearnPage() {
  const { lessonId: lessonIdParam } = useParams()
  const navigate = useNavigate()
  const initialLessonId = lessonIdParam
    ? (lessonIdParam === 'playground' ? PLAYGROUND_LESSON_ID : Number(lessonIdParam))
    : (lessons[0]?.id ?? null)

  const [currentLessonId, setCurrentLessonId] = useState(initialLessonId)
  const [query, setQuery] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [yourResult, setYourResult] = useState(null)
  const [match, setMatch] = useState(null)
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const dbRef = useRef(null)
  const { lessonStates, countCompleted, updateLessonState } = useProgress()
  const isSandbox = currentLessonId === PLAYGROUND_LESSON_ID

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsNarrow(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const currentLesson = isSandbox ? playgroundLesson : (lessons.find((l) => l.id === currentLessonId) ?? null)

  useEffect(() => {
    if (currentLesson) {
      if (isSandbox) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setQuery(currentLesson.defaultQuery)
        setYourResult(null)
        setMatch(null)
        setError(null)
        dbRef.current = new Database(currentLesson.collections)
        capturePlaygroundOpened()
      } else {
        const saved = lessonStates[String(currentLessonId)]
        setQuery(saved?.lastCode || (currentLesson.id === 0 ? currentLesson.defaultQuery : placeholderText))
        setYourResult(null)
        setMatch(null)
        setError(null)
        dbRef.current = new Database(currentLesson.collections)
        captureLessonStarted(currentLesson)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLessonId])

  const handleSelectLesson = useCallback((id) => {
    setCurrentLessonId(id)
    setYourResult(null)
    setMatch(null)
    setError(null)
    if (isNarrow) setSidebarOpen(false)
    navigate(id === PLAYGROUND_LESSON_ID ? '/learn/playground' : `/learn/${id}`, { replace: true })
  }, [isNarrow, navigate])

  const handleQueryChange = useCallback((val) => {
    setQuery(val)
    setError(null)
  }, [])

  const handleRun = useCallback(() => {
    if (!currentLesson) return
    dbRef.current = new Database(currentLesson.collections)
    setIsRunning(true)
    setError(null)

    setTimeout(() => {
      try {
        const { result } = dbRef.current.execute(query)
        const resultArray = Array.isArray(result) ? result : [result]
        setYourResult(resultArray)

        if (isSandbox) {
          setMatch(null)
          setIsRunning(false)
          return
        }

        const resultMatch = compareResults(resultArray, currentLesson.expectedResult)
        const collectionMatch = !currentLesson.expectedCollections
          || currentLesson.expectedCollections.every((name) => !!dbRef.current.collections[name])
        const isMatch = resultMatch && collectionMatch
        setMatch(isMatch)

        const key = String(currentLesson.id)
        const prev = lessonStates[key]
        const attempts = (prev?.attempts ?? 0) + 1

        captureQueryRun(currentLesson.id, isMatch, attempts)

        if (isMatch) {
          const wasAlreadyCompleted = lessonStates[key]?.completed === true
          updateLessonState(currentLesson.id, {
            completed: true,
            completedAt: new Date().toISOString(),
            lastCode: query,
            attempts,
          })
          captureLessonCompleted(currentLesson.id, attempts)

          if (!wasAlreadyCompleted) {
            const moduleForLesson = getModuleForLesson(currentLesson.id, lessons.length)
            if (moduleForLesson) {
              const allModuleDone = Array.from(
                { length: moduleForLesson.end - moduleForLesson.start + 1 },
                (_, i) => i + moduleForLesson.start
              ).every((id) => id === currentLesson.id || lessonStates[String(id)]?.completed === true)
              if (allModuleDone) {
                captureModuleCompleted(moduleForLesson.name, currentLesson.id)
              }
            }

            const newCount = countCompleted + 1
            if (newCount === lessons.length) {
              const totalAttempts = Object.values(lessonStates).reduce((sum, s) => sum + (s.attempts || 0), 0) + attempts
              captureAllLessonsCompleted(totalAttempts, lessons.length)
            }
          }
        } else {
          updateLessonState(currentLesson.id, {
            completed: false,
            lastCode: query,
            attempts,
          })
        }
      } catch (err) {
        const message = err instanceof ParseError
          ? err.message
          : `Error: ${err.message ?? 'Something went wrong'}`
        captureError(currentLesson.id, message)
        captureException(err)
        setError(message)
        setYourResult(null)
        setMatch(null)
      } finally {
        setIsRunning(false)
      }
    }, 100)
  }, [query, currentLesson, lessonStates, countCompleted, updateLessonState, isSandbox])

  const handleNextLesson = useCallback(() => {
    if (isSandbox) return
    const next = lessons.find((l) => l.id === currentLessonId + 1)
    if (next) handleSelectLesson(next.id)
  }, [currentLessonId, handleSelectLesson, isSandbox])

  const handleReset = useCallback(() => {
    if (currentLesson) {
      dbRef.current = new Database(currentLesson.collections)
      setQuery(isSandbox ? currentLesson.defaultQuery : '')
      setYourResult(null)
      setMatch(null)
      setError(null)
      captureQueryReset(currentLesson.id)
    }
  }, [currentLesson, isSandbox])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1 -ml-1"
            title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {sidebarOpen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            )}
          </button>
          <Link to="/" className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm hover:opacity-70 transition-opacity">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#47A248">
              <path d="M17.193 9.555c-1.264-5.58-4.252-7.414-4.573-8.745-.045-.21-.112-.417-.197-.61-.06-.153-.132-.324-.15-.518v-.019c-.023-.246-.09-.575-.09-.575l-.076-.305s-.33.157-.374.32c-.065.237-.064.476-.008.714.07.333.187.655.34.961.055.112.112.223.17.334-1.038 1.028-2.072 2.21-2.886 3.428-1.59 2.38-2.63 5.256-2.63 7.92 0 4.572 3.2 7.452 6.12 8.437.524.178.874.3.874.3l.05-.026c.677.315 1.443.54 2.243.66l.146.016c.374.033.748.05 1.122.05.374 0 .748-.017 1.122-.05l.146-.016c.8-.12 1.566-.345 2.242-.66l.05.025s.35-.12.875-.3c2.92-.985 6.12-3.865 6.12-8.437 0-2.664-1.082-5.498-2.67-7.878-.814-1.217-1.848-2.4-2.886-3.428z"/>
            </svg>
            Mongeesy
          </Link>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <a
            href="https://github.com/Goldenhub/mongeesy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-[#47A248] transition-colors"
            title="Star on GitHub"
          >
            <svg className="w-3.5 h-3.5" style={{ animation: 'star-attention 4s ease-in-out infinite' }} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
            </svg>
            Star
          </a>
          <span>
            {countCompleted}/{lessons.length} completed
          </span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">Free &bull; No signup &bull; In-browser</span>
          <ThemeToggle />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative bg-white dark:bg-slate-900">
        {isNarrow && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-10"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div
          className={`${
            isNarrow
              ? `fixed inset-y-0 left-0 z-20 transition-transform duration-200 ease-in-out ${
                  sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`
              : `transition-all duration-200 ease-in-out shrink-0 overflow-hidden ${
                  sidebarOpen ? 'w-72' : 'w-0'
                }`
          }`}
        >
          <Sidebar
            lessons={lessons}
            currentLessonId={currentLessonId}
            lessonStates={lessonStates}
            onSelectLesson={handleSelectLesson}
          />
        </div>
        {currentLesson ? (
          <MainPanel
            key={currentLesson.id}
            lesson={currentLesson}
            query={query}
            onQueryChange={handleQueryChange}
            onRun={handleRun}
            onReset={handleReset}
            isRunning={isRunning}
            yourResult={yourResult}
            match={match}
            error={error}
            modKey={modKey}
            onNextLesson={handleNextLesson}
            lessonStates={lessonStates}
            countCompleted={countCompleted}
            totalLessons={lessons.length}
            isSandbox={isSandbox}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            No lessons available
          </div>
        )}
      </div>
    </div>
  )
}
