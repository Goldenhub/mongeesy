// Bundles Monaco with the app instead of letting @monaco-editor/react fetch it
// from a CDN at runtime, so the editor is precached and works offline.
//
// Only the editor core and JavaScript syntax highlighting are included. The
// TypeScript language service (several MB) isn't: the editor has suggestions
// turned off, and the query parser reports syntax errors on Run.
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { loader } from '@monaco-editor/react'

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

loader.config({ monaco })
