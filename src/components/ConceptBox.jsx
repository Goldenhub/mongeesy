export function HowItWorks({ children }) {
  return (
    <details className="group mt-4">
      <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 select-none">
        <svg className="w-4 h-4 text-indigo-500 shrink-0 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
          <path d="M6 3l5 5-5 5" />
        </svg>
        How it works
      </summary>
      <div className="mt-2 px-4 py-3 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 space-y-2">
        {children}
      </div>
    </details>
  )
}

export function RealWorldUse({ children }) {
  return (
    <details className="group mt-4">
      <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 select-none">
        <svg className="w-4 h-4 text-amber-500 shrink-0 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
          <path d="M6 3l5 5-5 5" />
        </svg>
        Real-world use
      </summary>
      <div className="mt-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 space-y-2">
        {children}
      </div>
    </details>
  )
}

export function CommonMistakes({ children }) {
  return (
    <details className="group mt-4">
      <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 select-none">
        <svg className="w-4 h-4 text-red-500 shrink-0 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
          <path d="M6 3l5 5-5 5" />
        </svg>
        Common mistakes
      </summary>
      <div className="mt-2 px-4 py-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 space-y-2">
        {children}
      </div>
    </details>
  )
}

export function SyntaxBreakdown({ query, parts }) {
  return (
    <details className="group mt-4">
      <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 select-none">
        <svg className="w-4 h-4 text-emerald-500 shrink-0 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
          <path d="M6 3l5 5-5 5" />
        </svg>
        Syntax breakdown
      </summary>
      <div className="mt-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm">
        <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 mb-3 overflow-x-auto whitespace-pre-wrap">{query}</pre>
        <div className="space-y-2">
          {parts.map((part, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap min-w-20">{part.label}</span>
              <span className="text-xs text-slate-600 dark:text-slate-400">{part.description}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  )
}

export function DataFlow({ stages }) {
  return (
    <details className="group mt-4">
      <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 select-none">
        <svg className="w-4 h-4 text-sky-500 shrink-0 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
          <path d="M6 3l5 5-5 5" />
        </svg>
        Pipeline data flow
      </summary>
      <div className="mt-2 px-4 py-3 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-lg text-sm">
        <div className="flex flex-wrap items-center gap-1">
          {stages.map((stage, i) => (
            <span key={i}>
              {i > 0 && <span className="text-sky-300 dark:text-sky-600 mx-1 text-xs">→</span>}
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-slate-800 border border-sky-300 dark:border-sky-700 rounded text-xs font-mono text-sky-800 dark:text-sky-300">
                {stage}
              </span>
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Documents flow left to right through each stage. Each stage transforms the data before passing it to the next.
        </p>
      </div>
    </details>
  )
}
