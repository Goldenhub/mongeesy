function inferType(val) {
  if (val === null || val === undefined) return 'null'
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]'
    const elemTypes = [...new Set(val.map((v) => typeof v === 'object' && v !== null ? 'object' : typeof v))]
    return `Array<${elemTypes.join('|')}>`
  }
  if (typeof val === 'object') return 'object'
  return typeof val
}

function inferSchema(docs) {
  if (!docs || docs.length === 0) return []
  const keys = new Map()
  for (const doc of docs) {
    for (const [key, val] of Object.entries(doc)) {
      if (!keys.has(key)) {
        keys.set(key, { type: inferType(val), sample: val })
      }
    }
  }
  return Array.from(keys.entries())
}

export default function SchemaViewer({ collections }) {
  if (!collections || Object.keys(collections).length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Available Collections</h3>
      {Object.entries(collections).map(([name, docs]) => (
        <details key={name} open className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <summary className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#47A248">
              <path d="M17.193 9.555c-1.264-5.58-4.252-7.414-4.573-8.745-.045-.21-.112-.417-.197-.61-.06-.153-.132-.324-.15-.518v-.019c-.023-.246-.09-.575-.09-.575l-.076-.305s-.33.157-.374.32c-.065.237-.064.476-.008.714.07.333.187.655.34.961.055.112.112.223.17.334-1.038 1.028-2.072 2.21-2.886 3.428-1.59 2.38-2.63 5.256-2.63 7.92 0 4.572 3.2 7.452 6.12 8.437.524.178.874.3.874.3l.05-.026c.677.315 1.443.54 2.243.66l.146.016c.374.033.748.05 1.122.05.374 0 .748-.017 1.122-.05l.146-.016c.8-.12 1.566-.345 2.242-.66l.05.025s.35-.12.875-.3c2.92-.985 6.12-3.865 6.12-8.437 0-2.664-1.082-5.498-2.67-7.878-.814-1.217-1.848-2.4-2.886-3.428z"/>
            </svg>
            <span className="font-semibold">{name}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">({docs.length} docs)</span>
          </summary>
          <div className="px-3 py-2 text-xs font-mono space-y-1 bg-white dark:bg-slate-900">
            <div className="text-slate-400 dark:text-slate-500 mb-1">Schema:</div>
            {inferSchema(docs).map(([key, { type, sample }]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-slate-800 dark:text-slate-200 font-medium">{key}</span>
                <span className="text-slate-400 dark:text-slate-500">{type}</span>
                {sample !== undefined && (
                  <span className="text-slate-400 dark:text-slate-500 truncate max-w-48">
                    e.g. {typeof sample === 'object' ? JSON.stringify(sample) : String(sample)}
                  </span>
                )}
              </div>
            ))}
            <details className="mt-2">
              <summary className="text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 text-xs">
                Preview data
              </summary>
              <pre className="mt-1 p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs overflow-x-auto text-slate-700 dark:text-slate-300">
                {JSON.stringify(docs.slice(0, 3), null, 2)}
                {docs.length > 3 ? '\n  ...' : ''}
              </pre>
            </details>
          </div>
        </details>
      ))}
    </div>
  )
}
