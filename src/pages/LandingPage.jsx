import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { captureCtaClicked } from '../lib/phuglytics.js'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { Database } from '../engine/query-engine.js'
import books from '../data/books.js'
import lessons from '../lessons/index.js'

const features = [
  {
    title: 'Real MongoDB queries',
    desc: 'Type real MongoDB syntax - find, aggregate, sort, group, lookup. Your browser runs a custom query engine. No setup, no cloud.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#47A248" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
  {
    title: 'Immediate feedback',
    desc: 'Run your query and see your result side-by-side with the expected output. Know instantly if you got it right and what to fix if you did not.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#47A248" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: '35 progressive lessons',
    desc: 'Start with find() and work up to $bucket, $facet, and $lookup. Each lesson builds on the last. No gaps, no jumps.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#47A248" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    ),
  },
  {
    title: 'Hints that guide, not give away',
    desc: 'Stuck? Progressive hints point you in the right direction without handing you the answer. Multiple hints per lesson, each one a little clearer.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#47A248" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
  },
  {
    title: 'No signup, no cost',
    desc: 'Everything runs in your browser. No account, no email, no credit card. Just open the page and start writing queries.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#47A248" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75V11.25a2.25 2.25 0 012.25-2.25h1.5A2.25 2.25 0 0115 11.25v1.5m-6 0a2.25 2.25 0 002.25 2.25h1.5A2.25 2.25 0 0015 12.75m-6 0H9m6 0h.75M12 3v.75M5.25 3.75h13.5M3 9.75h.75M3 14.25h.75M3 18.75h.75M20.25 3.75h.75M20.25 9.75h.75M20.25 14.25h.75M20.25 18.75h.75" />
      </svg>
    ),
  },
  {
    title: 'Progress that persists',
    desc: 'Your progress, completed lessons, and last query are saved automatically. Close the tab and come back. You will pick up right where you left off.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#47A248" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-2.77.896m0 0a6.022 6.022 0 01-2.77-.896" />
      </svg>
    ),
  },
]

const modules = [
  { name: 'Getting Started', range: '0-2', desc: 'What is MongoDB?, implicit vs explicit collection creation, selecting collections.' },
  { name: 'Reading Data', range: '3-10', desc: 'find(), projections, filters, comparison and logical operators, sorting, pagination.' },
  { name: 'Aggregation Pipeline', range: '11-18', desc: '$match, $project, $group, $sort, $limit, $unwind, $addFields, $count.' },
  { name: 'Writing Data', range: '19-23', desc: 'insert, update, delete, array update operators ($push, $pop, $pull).' },
  { name: 'Advanced Queries', range: '24-29', desc: '$regex, $exists, $expr, $elemMatch, $lookup, $cond, $ifNull, dates.' },
  { name: 'Power User', range: '30-34', desc: '$slice, $bucket, $facet, embedding vs referencing. Real-world patterns.' },
]

const steps = [
  {
    num: '01',
    title: 'Read the explanation',
    desc: 'Each lesson introduces one MongoDB concept with a clear example. The syntax is shown, the rules are explained, and you see the expected output.',
  },
  {
    num: '02',
    title: 'Write the query',
    desc: 'Type the MongoDB query from scratch in the editor. No copy-paste, no fill-in-the-blank. You write the whole thing yourself.',
  },
  {
    num: '03',
    title: 'Run and compare',
    desc: 'Press Cmd/Ctrl+Enter and see your result alongside the expected output. If they match, you pass. If not, tweak and try again.',
  },
]

const faqs = [
  {
    q: 'Do I need MongoDB installed?',
    a: 'No. The entire query engine runs in your browser using JavaScript. There is no server, no database, and no setup required. Just open the page and start typing.',
  },
  {
    q: 'Is this for complete beginners?',
    a: 'Yes. Lessons start from the very basics. What a collection is, how documents work. And build up progressively. If you have used SQL before, you will move quickly through the early lessons.',
  },
  {
    q: 'How is my progress saved?',
    a: 'Your completed lessons, attempt counts, and last query are automatically saved to your browser\'s localStorage. No account needed. It persists across sessions as long as you use the same browser.',
  },
  {
    q: 'How long does it take to complete?',
    a: 'Most people finish in 2-4 hours spread across a few sessions. You can move as fast or as slow as you need. There is no timer or deadline.',
  },
  {
    q: 'How accurate is the engine compared to real MongoDB?',
    a: 'Very close for the operators and patterns covered in the lessons. The engine implements the full set of commonly-used query, aggregation, and update operators. Some advanced features like geospatial queries and full-text search are not available since they require server-side infrastructure.',
  },
  {
    q: 'Can I use it offline? Can I install it on my phone?',
    a: 'Yes! After your first visit, the app caches everything and works offline. On Android or desktop Chrome you can install it as a standalone app via the install banner. On iPhone, open the Share menu and tap Add to Home Screen. You can also enable lesson reminders that work even when the app is closed.',
  },
]

function execQuery(query) {
  try {
    const db = new Database({ books })
    const { result } = db.execute(query)
    return Array.isArray(result) ? result : [result]
  } catch {
    return []
  }
}

const DEMO = (() => {
  const query = `db.books.find({ rating: { $gt: 4.5 } })`
  return { query, result: execQuery(query) }
})()

function AnimatedDemo() {
  const [charIdx, setCharIdx] = useState(0)
  const [phase, setPhase] = useState('typing') // typing | running | showing

  const demo = DEMO

  useEffect(() => {
    let t
    if (phase === 'typing') {
      if (charIdx < demo.query.length) {
        t = setTimeout(() => setCharIdx((c) => c + 1), 35 + Math.random() * 30)
      } else {
        t = setTimeout(() => setPhase('running'), 500)
      }
    } else if (phase === 'running') {
      t = setTimeout(() => setPhase('showing'), 650)
    }
    return () => clearTimeout(t)
  }, [phase, charIdx, demo.query.length])

  const displayedQuery = demo.query.slice(0, charIdx)
  const isRunning = phase === 'running'
  const resultVisible = phase === 'showing'

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden shadow-xl border border-slate-800">
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800/50 border-b border-slate-700">
        <div className="w-3 h-3 rounded-full bg-red-500/80" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
        <div className="w-3 h-3 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-slate-400 font-mono">mongosh - books collection</span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-2 min-h-5">
          <span className="text-green-400 font-mono text-xs mt-0.5 shrink-0 select-none">$</span>
          <span className="text-slate-300 font-mono text-xs leading-relaxed break-all">
            {displayedQuery}
            {phase === 'typing' && (
              <span className="inline-block w-0.5 h-3 bg-slate-300 ml-px align-middle animate-pulse" />
            )}
          </span>
        </div>

        <div className="mt-3">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all duration-150 ${
            isRunning
              ? 'bg-[#47A248] text-white shadow-lg shadow-green-900/30 scale-95'
              : 'bg-slate-800 text-slate-500'
          }`}>
            {isRunning ? (
              <>
                <span className="w-2.5 h-2.5 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
                Running...
              </>
            ) : 'Run'}
          </div>
        </div>
      </div>

      <div className={`border-t border-slate-700 transition-opacity duration-500 ${
        resultVisible ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className="overflow-auto max-h-48">
          <pre className="px-5 py-3 text-xs text-slate-300 font-mono leading-relaxed">
            {JSON.stringify(demo.result.length === 1 ? demo.result[0] : demo.result, null, 2)}
          </pre>
        </div>
        <div className="px-5 py-1.5 text-xs text-slate-600 border-t border-slate-800 font-mono">
          {demo.result.length} document{demo.result.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

function useResumeInfo() {
  const [info] = useState(() => {
    try {
      const stored = localStorage.getItem('mongeesy-progress')
      if (!stored) return null
      const data = JSON.parse(stored)
      if (!data?.lessons) return null
      const completedIds = new Set(
        Object.entries(data.lessons)
          .filter(([, s]) => s.completed)
          .map(([id]) => Number(id))
      )
      if (completedIds.size === 0) return null
      const firstUncompleted = lessons.find((l) => !completedIds.has(l.id))
      const resumeLesson = firstUncompleted ?? lessons[lessons.length - 1]
      return { count: completedIds.size, total: lessons.length, lessonId: resumeLesson.id, lessonTitle: resumeLesson.title }
    } catch {
      return null
    }
  })
  return info
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <span className="text-sm font-medium text-slate-900 dark:text-white pr-4">{q}</span>
        <svg
          className={`w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-700 pt-3">
          {a}
        </div>
      )}
    </div>
  )
}

export default function LandingPage() {
  const resumeInfo = useResumeInfo()

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#47A248">
              <path d="M17.193 9.555c-1.264-5.58-4.252-7.414-4.573-8.745-.045-.21-.112-.417-.197-.61-.06-.153-.132-.324-.15-.518v-.019c-.023-.246-.09-.575-.09-.575l-.076-.305s-.33.157-.374.32c-.065.237-.064.476-.008.714.07.333.187.655.34.961.055.112.112.223.17.334-1.038 1.028-2.072 2.21-2.886 3.428-1.59 2.38-2.63 5.256-2.63 7.92 0 4.572 3.2 7.452 6.12 8.437.524.178.874.3.874.3l.05-.026c.677.315 1.443.54 2.243.66l.146.016c.374.033.748.05 1.122.05.374 0 .748-.017 1.122-.05l.146-.016c.8-.12 1.566-.345 2.242-.66l.05.025s.35-.12.875-.3c2.92-.985 6.12-3.865 6.12-8.437 0-2.664-1.082-5.498-2.67-7.878-.814-1.217-1.848-2.4-2.886-3.428z"/>
            </svg>
            Mongeesy
          </Link>
          <div className="flex items-center gap-4">
            <a href="#features" className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hidden sm:inline">Features</a>
            <a href="#curriculum" className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hidden sm:inline">Curriculum</a>
            <Link to="/learn/playground" className="text-xs text-[#47A248] hover:text-[#3a8a3e] hidden sm:inline font-medium">Playground</Link>
            <a
              href="https://github.com/Goldenhub/mongeesy"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-[#47A248] transition-colors"
              title="Star on GitHub"
            >
              <svg className="w-3.5 h-3.5" style={{ animation: 'star-attention 4s ease-in-out infinite' }} viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
              </svg>
              Star
            </a>
            <ThemeToggle />
            <Link to="/learn" onClick={() => captureCtaClicked('Start learning', 'header')} className="text-xs font-medium text-white bg-[#47A248] hover:bg-[#3a8a3e] px-3 py-1.5 rounded-md transition-colors whitespace-nowrap">
              Start learning
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-16 sm:pt-28 sm:pb-20 bg-white dark:bg-slate-900">
        <div className="text-center">
          {resumeInfo ? (
            <Link
              to={`/learn/${resumeInfo.lessonId}`}
              onClick={() => captureCtaClicked('Resume banner', 'hero')}
              className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700 mb-6 hover:bg-green-100 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
                <path d="M3 8l3 3 7-7" />
              </svg>
              Welcome back - {resumeInfo.count}/{resumeInfo.total} lessons done &bull; Continue →
            </Link>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700 mb-6">
              Interactive playground &bull; No signup &bull; In-browser
            </div>
          )}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight">
            Learn MongoDB in{' '}
            <span className="text-[#47A248]">your browser</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            An interactive MongoDB playground with 35 guided lessons. Type real queries,
            explore collections, see results instantly - works offline, no signup needed.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-2 sm:px-0">
            <Link
              to="/learn/playground"
              onClick={() => captureCtaClicked('Open Playground', 'hero')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#47A248] text-white font-medium rounded-lg hover:bg-[#3a8a3e] transition-colors text-sm whitespace-nowrap"
            >
              Open Playground
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </Link>
            {resumeInfo ? (
              <Link
                to={`/learn/${resumeInfo.lessonId}`}
                onClick={() => captureCtaClicked('Continue lessons', 'hero')}
                className="w-full sm:w-auto relative overflow-hidden inline-flex items-center justify-center gap-2 px-6 py-3 bg-linear-to-br from-green-50 to-emerald-100 text-green-900 font-medium rounded-lg border border-green-200 hover:border-green-300 hover:from-green-100 hover:to-emerald-200 transition-all text-sm whitespace-nowrap shadow-sm"
              >
                <svg className="w-3.5 h-3.5 text-[#47A248] shrink-0" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M4 2.5v11l9-5.5z" />
                </svg>
                Continue
                <span className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full font-mono leading-none">{resumeInfo.count}/{resumeInfo.total}</span>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-100">
                  <div className="h-full bg-[#47A248]" style={{ width: `${(resumeInfo.count / resumeInfo.total) * 100}%` }} />
                </div>
              </Link>
            ) : (
              <Link
                to="/learn"
                onClick={() => captureCtaClicked('Start lessons', 'hero')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-slate-600 font-medium rounded-lg border border-slate-300 hover:border-slate-400 hover:text-slate-800 transition-colors text-sm whitespace-nowrap"
              >
                Start lessons
              </Link>
            )}
          </div>
        </div>

        <div className="mt-14 max-w-3xl mx-auto">
          <AnimatedDemo />
        </div>

        <div className="mt-10 flex items-center justify-center gap-6 sm:gap-10 text-center">
          {[
            { value: '35', label: 'lessons' },
            { value: '6', label: 'modules' },
            { value: '$0', label: 'forever' },
            { value: '\u2713', label: 'works offline' },
          ].map((stat, i, arr) => (
            <React.Fragment key={stat.label}>
              <div className="px-3 sm:px-5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 min-w-18">
                <div className="text-2xl sm:text-3xl font-bold text-[#47A248] tracking-tight">{stat.value}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{stat.label}</div>
              </div>
              {i < arr.length - 1 && <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 hidden sm:block" />}
            </React.Fragment>
          ))}
        </div>
      </section>

      <section id="features" className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold text-[#47A248] uppercase tracking-widest">Features</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-2">Everything you need to learn MongoDB</h2>
            <div className="w-10 h-0.5 bg-[#47A248] rounded-full mx-auto mt-3" />
          </div>
          <p className="text-sm text-slate-500 text-center max-w-xl mx-auto -mt-6 mb-10">
            No videos. No slides. Just you, the editor, and real MongoDB queries against real data.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                <div className="mb-3">{f.icon}</div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">{f.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-12">
            <span className="text-xs font-semibold text-[#47A248] uppercase tracking-widest">Process</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-2">How it works</h2>
            <div className="w-10 h-0.5 bg-[#47A248] rounded-full mx-auto mt-3" />
          </div>
          <div className="space-y-8">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-start gap-5">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#47A248]/10 text-[#47A248] font-bold text-sm shrink-0">
                  {s.num}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">{s.title}</h3>
                    {i < steps.length - 1 && <div className="hidden sm:block flex-1 h-px bg-slate-200 ml-2" />}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              to="/learn"
              onClick={() => captureCtaClicked('Start learning now', 'how_it_works')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#47A248] text-white font-medium rounded-lg hover:bg-[#3a8a3e] transition-colors text-sm whitespace-nowrap"
            >
              Start learning
            </Link>
          </div>
        </div>
      </section>

      <section id="curriculum" className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold text-[#47A248] uppercase tracking-widest">Curriculum</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-2">35 lessons across 6 modules</h2>
            <div className="w-10 h-0.5 bg-[#47A248] rounded-full mx-auto mt-3" />
          </div>
          <p className="text-sm text-slate-500 text-center max-w-lg mx-auto -mt-6 mb-10">
            Start at lesson 0 and progress through, or jump to a topic you need.
          </p>
          <div className="space-y-3">
            {modules.map((m) => (
              <div key={m.name} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{m.name}</h3>
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-500">Lessons {m.range}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{m.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              to="/learn"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#47A248] hover:text-[#3a8a3e] transition-colors"
            >
              See all lessons
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold text-[#47A248] uppercase tracking-widest">FAQ</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-2">Common questions</h2>
            <div className="w-10 h-0.5 bg-[#47A248] rounded-full mx-auto mt-3" />
          </div>
          <p className="text-sm text-slate-500 text-center -mt-6 mb-10">Everything you might be wondering before you start.</p>
          <div className="space-y-2">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <span className="text-xs font-semibold text-[#47A248] uppercase tracking-widest">Get started</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-2 mb-3">Ready to start writing MongoDB queries?</h2>
          <div className="w-10 h-0.5 bg-[#47A248] rounded-full mx-auto mt-3 mb-3" />
          <p className="text-sm text-slate-500 mb-8 max-w-lg mx-auto">
            No setup. No signup. Works offline and on your phone.
          </p>
          <Link
            to="/learn"
            onClick={() => captureCtaClicked('Start the first lesson', 'footer_cta')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#47A248] text-white font-medium rounded-lg hover:bg-[#3a8a3e] transition-colors text-sm whitespace-nowrap"
          >
            Start learning
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-1 py-3 sm:h-14">
          <span className="text-xs text-slate-400 dark:text-slate-500">Mongeesy - a free, in-browser MongoDB playground</span>
          <span className="text-xs text-slate-40 text-center">
            Created by <a href="https://github.com/goldenhub" target="_blank" rel="noopener noreferrer" className="text-[#47A248] underline hover:brightness-75">goldenhub</a>
            {' '}&bull;{' '}
            <a href="https://linkedin.com/in/goldenazubuike" target="_blank" rel="noopener noreferrer" className="text-[#47A248] underline hover:brightness-75">LinkedIn</a>
            {' '}&bull;{' '}Not affiliated with MongoDB Inc.
          </span>
        </div>
      </footer>
    </div>
  )
}
