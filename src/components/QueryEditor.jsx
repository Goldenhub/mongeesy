import { useRef, useCallback, useEffect } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { useTheme } from '../lib/useTheme.js'

const DEFAULT_HEIGHT = 180

export default function QueryEditor({ value, onChange, onRun, onReset, isRunning, modKey }) {
  const editorRef = useRef(null)
  const isPlaceholder = useRef(false)
  const onRunRef = useRef(onRun)
  const PLACEHOLDER = `// Enter your MongoDB query here, then press ${modKey}+Enter or click RUN`
  const { theme } = useTheme()

  useEffect(() => { onRunRef.current = onRun }, [onRun])
  useEffect(() => {
    isPlaceholder.current = value === PLACEHOLDER
  }, [value, PLACEHOLDER])

  const handleMount = useCallback((editor) => {
    editorRef.current = editor
    editor.focus()
    editor.getAction('editor.action.formatDocument')?.run()

    editor.addAction({
      id: 'run-query',
      label: `Run Query (${modKey}+Enter)`,
      keybindings: [2048 | 3],
      run: () => onRunRef.current(),
    })

    editor.onKeyDown((e) => {
      if (isPlaceholder.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
        isPlaceholder.current = false
        editor.setValue('')
      }
    })
  }, [modKey])

  const handleEditorChange = useCallback((val) => {
    if (isPlaceholder.current && val !== PLACEHOLDER) {
      isPlaceholder.current = false
      const cleaned = val.startsWith(PLACEHOLDER) ? val.slice(PLACEHOLDER.length) : val
      onChange(cleaned)
      return
    }
    isPlaceholder.current = val === PLACEHOLDER
    onChange(val ?? '')
  }, [onChange, PLACEHOLDER])

  return (
    <div className="border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-3 py-1.5 border-b border-slate-300 dark:border-slate-600">
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">mongodb&gt;</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">{modKey}+Enter to run</span>
      </div>

      <MonacoEditor
        height={DEFAULT_HEIGHT}
        language="javascript"
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        value={value}
        onChange={handleEditorChange}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 8,
          lineNumbersMinChars: 0,
          scrollBeyondLastLine: false,
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          tabSize: 2,
          padding: { top: 8, bottom: 8 },
          suggestOnTriggerCharacters: false,
          quickSuggestions: false,
          autoClosingBrackets: 'never',
          autoClosingQuotes: 'never',
          formatOnPaste: false,
          renderLineHighlight: 'none',
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            vertical: 'hidden',
            horizontal: 'hidden',
          },
          overviewRulerLanes: 0,
          wordWrap: 'on',
        }}
      />

      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 border-t border-slate-300 dark:border-slate-600">
        <button
          onClick={onRun}
          disabled={isRunning}
          className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
            isRunning
              ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
              : 'bg-[#47A248] text-white hover:bg-[#3a8a3e] active:bg-[#2d7231]'
          }`}
        >
          {isRunning ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Running...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M4 2.5v11l9-5.5z" />
              </svg>
              Run
            </>
          )}
        </button>
        <button
          onClick={onReset}
          className="px-3 py-1.5 rounded-md text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
