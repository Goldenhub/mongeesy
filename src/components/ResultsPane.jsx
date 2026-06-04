import { useState } from 'react'
import { captureResultViewToggled } from '../lib/phuglytics.js'

function DocTable({ docs, label }) {
  if (!docs || docs.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400 italic">
        {label === 'Your Result' ? 'Run a query to see results' : 'Expected result shown here'}
      </div>
    )
  }

  const columns = Object.keys(docs[0])

  return (
    <div className="overflow-auto max-h-72">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-700 sticky top-0">
            {columns.map((col) => (
              <th key={col} className="px-3 py-1.5 text-left font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc, i) => (
            <tr key={i} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
              {columns.map((col) => (
                <td key={col} className="px-3 py-1 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {formatCell(doc[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-1 text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 border-t border-slate-300 dark:border-slate-600">
        {docs.length} document{docs.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

function DocJson({ docs, label }) {
  if (!docs || docs.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400 italic">
        {label === 'Your Result' ? 'Run a query to see results' : 'Expected result shown here'}
      </div>
    )
  }
  return (
    <div className="overflow-auto max-h-72">
      <pre className="p-3 text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed">
        {JSON.stringify(docs.length === 1 ? docs[0] : docs, null, 2)}
      </pre>
      <div className="px-3 py-1 text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 border-t border-slate-300 dark:border-slate-600">
        {docs.length} document{docs.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

function formatCell(val) {
  if (val === null || val === undefined) return <span className="text-slate-400 italic">null</span>
  if (typeof val === 'boolean') return <span className="text-amber-600 dark:text-amber-400">{String(val)}</span>
  if (typeof val === 'number') return <span className="text-blue-600 dark:text-blue-400">{val}</span>
  if (Array.isArray(val)) {
    if (val.length === 0) return <span className="text-slate-400">[]</span>
    return (
      <details className="inline-block">
        <summary className="cursor-pointer text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">[{val.length}]</summary>
        <pre className="mt-1 p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs">{JSON.stringify(val, null, 2)}</pre>
      </details>
    )
  }
  if (typeof val === 'object') return <pre className="inline text-xs">{JSON.stringify(val)}</pre>
  return String(val)
}

function CompareBadge({ match }) {
  if (match === undefined) return null
  return match ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-medium">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 16 16">
        <path d="M3 8l3 3 7-7" />
      </svg>
      Matches expected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 font-medium">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 16 16">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
      Doesn't match
    </span>
  )
}

function ViewToggle({ view, onChange }) {
  return (
    <div className="flex items-center bg-slate-200 dark:bg-slate-700 rounded-md p-0.5 text-xs">
      <button
        onClick={() => onChange('table')}
        className={`px-2 py-0.5 rounded font-medium transition-colors ${
          view === 'table'
            ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
      >
        Table
      </button>
      <button
        onClick={() => onChange('json')}
        className={`px-2 py-0.5 rounded font-medium transition-colors ${
          view === 'json'
            ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
      >
        JSON
      </button>
    </div>
  )
}

function Panel({ label, docs, view }) {
  return (
    <div className="border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 border-b border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </div>
      {view === 'json' ? (
        <DocJson docs={docs} label={label} />
      ) : (
        <DocTable docs={docs} label={label} />
      )}
    </div>
  )
}

export default function ResultsPane({ yourResult, expectedResult, match, isSandbox }) {
  const [view, setView] = useState('table')
  const handleViewChange = (v) => { setView(v); captureResultViewToggled(v) }

  if (isSandbox) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Results</h3>
          <ViewToggle view={view} onChange={handleViewChange} />
        </div>
        <Panel label="Your Result" docs={yourResult} view={view} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Results</h3>
        <CompareBadge match={match} />
        <ViewToggle view={view} onChange={handleViewChange} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Panel label="Your Result" docs={yourResult} view={view} />
        <Panel label="Expected Result" docs={expectedResult} view={view} />
      </div>
    </div>
  )
}
