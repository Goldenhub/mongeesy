# Mongeesy

An interactive, in-browser MongoDB playground. Write real MongoDB queries against real data and get instant feedback — no setup, no signup, no cloud.

## Features

- **Real MongoDB queries** — Type real `find()`, `aggregate()`, `sort()`, `group()`, `lookup()` syntax. A custom query engine runs it all in your browser.
- **Immediate feedback** — See your result side-by-side with the expected output. Know instantly if you got it right.
- **35 progressive lessons** — Start with `find()` and work up to `$bucket`, `$facet`, and `$lookup`. Five modules covering reading, aggregation, writes, advanced queries, and analytical patterns.
- **Hints that guide** — Progressive hints for each lesson that point you in the right direction without giving away the answer.
- **No signup, no cost** — Everything runs client-side. No account, no email, no credit card.
- **Progress that persists** — Completed lessons, last query, and attempt counts are saved to localStorage automatically.
- **Dark mode** — Full light/dark theme toggle, persisted to localStorage, with flash-free initialisation.
- **Completion experience** — Finishing all lessons triggers a multi-wave confetti burst and a modal with stats and next-step resources.
- **Analytics** — Optional PostHog integration tracks lesson completions, query attempts, hint usage, and drop-off to help improve the curriculum.

## Tech Stack

| Tool                | Purpose                      |
| ------------------- | ---------------------------- |
| **React 19**        | UI framework                 |
| **Vite 8**          | Dev server and bundler       |
| **Tailwind CSS v4** | Utility-first styling        |
| **React Router v7** | Client-side routing          |
| **Monaco Editor**   | In-browser code editor       |
| **PostHog**         | Product analytics (optional) |
| **canvas-confetti** | Celebration animations       |
| **Vitest**          | Unit testing                 |
| **ESLint**          | Linting                      |

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal (usually `http://localhost:5173`).

### Environment Variables

| Variable                   | Required | Default                    | Description                           |
| -------------------------- | -------- | -------------------------- | ------------------------------------- |
| `VITE_PUBLIC_POSTHOG_KEY`  | No       | —                          | PostHog project API key for analytics |
| `VITE_PUBLIC_POSTHOG_HOST` | No       | `https://us.i.posthog.com` | PostHog instance host                 |

Analytics is a no-op when the key is not set, so you can develop without it.

> **Note:** `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` (without `PUBLIC_`) are also accepted for compatibility.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the Vite dev server with HMR   |
| `npm run build`   | Build for production into `dist/`    |
| `npm run preview` | Preview the production build locally |
| `npm run lint`    | Run ESLint across all source files   |
| `npm run test`    | Run unit tests with Vitest           |

## Project Structure

```
src/
├── components/       # React components (Sidebar, MainPanel, QueryEditor, etc.)
├── data/             # Sample MongoDB collections (books, products, authors, etc.)
├── engine/           # Custom MongoDB query engine
│   ├── query-engine.js     # Database class — high-level operations
│   ├── pipeline-engine.js  # Aggregation pipeline executor
│   ├── mongosh-parser.js   # MongoDB shell syntax parser
│   ├── operators.js        # Query and expression operators
│   ├── collection.js       # Collection class with CRUD operations
│   └── utils.js            # Shared engine utilities (deepEqual, compareValues)
├── hooks/            # Custom React hooks (useProgress)
├── lib/              # Shared utilities
│   ├── phuglytics.js       # PostHog analytics wrapper
│   ├── ThemeContext.jsx     # Dark/light theme provider, useTheme hook, ThemeToggle component
│   └── playground.jsx      # Free-form playground lesson definition
├── lessons/          # 35 lesson files (one per concept)
├── pages/            # LandingPage and LearnPage
└── utils/            # Helpers (modules, comparison, table formatting)
```

## How It Works

1. **Read the explanation** — Each lesson introduces one concept with a clear example.
2. **Write the query** — Type the MongoDB query from scratch in the Monaco editor.
3. **Run and compare** — Press `Cmd+Enter` (or `Ctrl+Enter`) to execute. See your result next to the expected output.

The query engine parses MongoDB shell syntax, executes against in-memory collections, and compares results using deep equality. All data is pre-loaded sample datasets — no network requests needed.

## Architecture

The custom MongoDB query engine is split into six modules in `src/engine/`, each with a single responsibility:

### `mongosh-parser.js`
Tokenizes MongoDB shell syntax (`db.books.find({ ... }).sort({ ... })`) into structured command objects. Handles nested parentheses, string literals, regex patterns, and chained methods. Uses `new Function` to evaluate raw JS argument strings into real objects.

### `operators.js`
Evaluates query filters against documents. Supports all major operators:

- **Comparison:** `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- **Array:** `$in`, `$nin`, `$all`, `$size`, `$elemMatch`
- **Element:** `$exists`, `$type`
- **Evaluation:** `$regex` (with `$options`), `$mod`, `$where`, `$expr`
- **Logical:** `$and`, `$or`, `$nor`, `$not` (field-level)

`{ field: null }` matches both explicit `null` and missing fields, matching real MongoDB semantics. Resolves dotted field paths like `address.city`.

### `collection.js`
In-memory document array with CRUD methods: `find`, `insertOne`, `updateMany`, `deleteOne`, `distinct`, `aggregate`. Applies projections (including dotted-path inclusion/exclusion), and update operators:

- **Field:** `$set`, `$unset`, `$inc`, `$mul`, `$min`, `$max`, `$currentDate`, `$rename`
- **Array:** `$push` (with `$each`/`$position`/`$slice`/`$sort` modifiers), `$pop`, `$pull`, `$pullAll`, `$addToSet`
- **Bitwise:** `$bit`

### `pipeline-engine.js`
Aggregation pipeline executor. Stages are applied sequentially against cloned documents:

| Stage | Description |
|---|---|
| `$match` | Filter documents |
| `$project` | Include/exclude/compute fields (dotted-path aware) |
| `$addFields` / `$set` | Add computed fields |
| `$unset` | Remove fields |
| `$group` | Group and accumulate (`$sum`, `$avg`, `$min`, `$max`, `$push`, `$addToSet`, `$first`, `$last`, `$count`, `$stdDevPop`, `$stdDevSamp`) |
| `$sort` | Order documents (null/missing sort last for ascending) |
| `$limit` / `$skip` | Pagination |
| `$count` | Count documents into a named field |
| `$unwind` | Flatten arrays (supports `preserveNullAndEmptyArrays`, `includeArrayIndex`) |
| `$lookup` | Join collections — equality form and pipeline form (with `let`/`$$vars`) |
| `$replaceRoot` / `$replaceWith` | Replace each document with an expression |
| `$bucket` | Range-based bucketing |
| `$facet` | Multiple parallel sub-pipelines |
| `$sample` | Random document sample |

Expression operators available in `$addFields`, `$project`, `$group`, etc.:

- **Arithmetic:** `$add`, `$subtract`, `$multiply`, `$divide`, `$mod`, `$abs`, `$ceil`, `$floor`, `$round`, `$sqrt`, `$pow`, `$log`, `$ln`, `$log10`, `$trunc`, `$exp`
- **String:** `$concat`, `$split`, `$toLower`, `$toUpper`, `$trim`, `$ltrim`, `$rtrim`, `$substr`, `$substrCP`, `$strLenCP`, `$indexOfCP`, `$regexMatch`, `$regexFind`, `$regexFindAll`
- **Array:** `$arrayElemAt`, `$concatArrays`, `$filter`, `$map`, `$reduce`, `$size`, `$slice`, `$reverseArray`, `$in`, `$indexOfArray`, `$isArray`, `$range`, `$first`, `$last`, `$zip`
- **Date:** `$year`, `$month`, `$dayOfMonth`, `$hour`, `$minute`, `$second`, `$millisecond`, `$dayOfWeek`, `$dayOfYear`, `$week`, `$isoWeek`, `$isoWeekYear`, `$isoDayOfWeek`, `$dateToString`, `$dateFromString`, `$toDate`
- **Type:** `$type`, `$isArray`, `$isNumber`, `$toString`, `$toInt`, `$toLong`, `$toDouble`, `$toBool`
- **Set:** `$setUnion`, `$setIntersection`, `$setDifference`, `$setEquals`, `$setIsSubset`
- **Object:** `$mergeObjects`, `$objectToArray`, `$arrayToObject`, `$getField`, `$setField`
- **Conditional:** `$cond`, `$ifNull`, `$switch`
- **Other:** `$let`, `$literal`, `$rand`

### `utils.js`
Shared engine utilities: `deepEqual` (key-order-insensitive structural equality used for `$addToSet`, `$pull`, `$all`, set operators) and `compareValues` (MongoDB-style sort comparator that places `null`/missing last).

### `query-engine.js`
Top-level `Database` class. On `execute(query)`:
1. Parses the query string via `mongosh-parser.js`
2. Evaluates arguments to real JS values
3. Dispatches to the right `Collection` method
4. Applies chained cursor methods (`.sort()`, `.limit()`, `.skip()`, `.count()`)
5. Returns `{ result, collection, method }`

Also handles `db.createCollection()` and implicit collection creation on `insertOne`/`insertMany`.

All data lives in memory — no network, no server. Documents are deep-cloned to prevent mutation. The `$lookup` stage references other collections via a shared collections map.

## Analytics

PostHog analytics is built in but disabled by default. Set `VITE_PUBLIC_POSTHOG_KEY` in `.env` to enable.

The following events are tracked when analytics is active:

| Event                   | When                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `$pageview`             | Every page navigation                                           |
| `cta_clicked`           | Click on any "Start learning" / CTA button on the landing page  |
| `lesson_started`        | User opens a lesson                                             |
| `query_run`             | User executes a query (includes `matched` and `total_attempts`) |
| `lesson_completed`      | User gets the correct answer                                    |
| `module_completed`      | All lessons in a module are finished                            |
| `all_lessons_completed` | All 35 lessons are finished                                     |
| `query_error`           | Query throws a parse or execution error                         |
| `query_reset`           | User presses the Reset button                                   |
| `hint_viewed`           | User opens a hint or navigates between hints                    |
| `playground_opened`     | User enters the free-form playground mode                       |
| `collections_panel_opened` | User opens the collections panel on mobile                   |
| `result_view_toggled`   | User switches between Table and JSON result view (includes `view`) |

No personal data is collected. Events are associated with a random anonymous ID stored in localStorage.

## Dark Mode

Theme toggling is managed by `src/lib/ThemeContext.jsx`. The `ThemeProvider` wraps the entire app in `App.jsx` and exposes `useTheme()` and a ready-made `<ThemeToggle />` button component.

- Preference is stored in `localStorage` under `mongeesy-theme`
- Defaults to the OS `prefers-color-scheme` when no preference is stored
- A flash-prevention inline script in `index.html` applies the `dark` class before React hydrates
- Tailwind v4 class-based dark mode is configured via `@custom-variant dark` in `src/index.css`

To consume the theme in a component:

```js
import { useTheme } from '../lib/ThemeContext.jsx'

const { theme, toggle } = useTheme() // theme: 'light' | 'dark'
```

## Landing Page

`src/pages/LandingPage.jsx` is the marketing page. Notable features:

- **Animated demo** — An auto-playing typewriter animation in the hero types a MongoDB query, triggers a "running" state, and fades in the result. Plays once on load.
- **Resume banner** — Returning users see a personalised chip ("Welcome back — X/35 lessons done") and a styled Continue button with a progress bar, both linking directly to their next uncompleted lesson. Computed from localStorage on mount via a `useState` lazy initialiser.
- **Section headings** — Each section has a small green uppercase label above the heading and a short green accent bar below, applied consistently across all five sections.
- **FAQ accordion** — Five common questions above the final CTA, implemented with controlled `useState` per item.

## Adding Lessons

Each lesson is a standalone JSX file in `src/lessons/` that exports a lesson object. Here's the pattern:

```js
// src/lessons/33-new-concept.jsx
import books from '../data/books.js'

const lesson = {
  id: 33,                           // unique, sequential ID
  title: '$newOperator - Concept',   // short title
  module: 'Module 3: Modifying Data', // module name (used for display)
  description: 'One-line summary',

  explanation: (                     // JSX rendered as the main lesson content
    <>
      <p>Explanation of the concept with <code>code examples</code>.</p>
    </>
  ),

  // Optional — expandable detail boxes:
  howItWorks: <p>Deep dive into mechanics.</p>,
  realWorldUse: <p>Production use case.</p>,
  commonMistakes: <p>Pitfalls to avoid.</p>,
  syntaxBreakdown: {                 // Shows a labeled code breakdown
    query: 'db.books.find({...})',
    parts: [
      { label: 'find()', description: 'What this part does' },
    ],
  },
  dataFlow: ['Collection', '$stage1', '$stage2', 'Result'],

  task: 'Description of what the user should write.',

  defaultQuery: 'db.books.find()',   // pre-filled query that passes the lesson

  collections: { books },            // collection name → data mapping

  expectedResult: [{ ... }],         // array of documents the correct query returns

  hints: [                           // progressive hints, shown one at a time
    'First hint — vague pointer',
    'Second hint — more specific',
    'Third hint — nearly the answer',
  ],
}

export default lesson
```

### Registering a new lesson

1. Create the lesson file in `src/lessons/` (e.g. `32-new-concept.jsx`).
2. Import and add it to the array in `src/lessons/index.js`.
3. If the lesson starts a new module, add its starting lesson ID to `MODULE_NAMES` in `src/utils/modules.js`.
4. Run `npm run test` to verify the default query passes.

### Lesson fields reference

| Field             | Required | Description                                                  |
| ----------------- | -------- | ------------------------------------------------------------ |
| `id`              | yes      | Unique integer. Must match the order in the `lessons` array. |
| `title`           | yes      | Short display name.                                          |
| `module`          | yes      | Module name shown in the header.                             |
| `description`     | yes      | One-line summary for meta/SEO.                               |
| `explanation`     | yes      | JSX — the main teaching content.                             |
| `task`            | yes      | What the user needs to do.                                   |
| `defaultQuery`    | yes      | The query string that passes the lesson. Used by tests.      |
| `collections`     | yes      | Object mapping collection names to their data arrays.        |
| `expectedResult`  | yes      | Array of documents the correct query produces.               |
| `expectedCollections` | no   | Array of collection names that must exist in the database after the query runs. Use this when the correct answer is verified by side-effect (e.g. `createCollection`) rather than return value alone. |
| `hints`           | no       | Array of progressive hint strings.                           |
| `howItWorks`      | no       | JSX — expandable "How it works" box.                         |
| `realWorldUse`    | no       | JSX — expandable "Real-world use" box.                       |
| `commonMistakes`  | no       | JSX — expandable "Common mistakes" box.                      |
| `syntaxBreakdown` | no       | Object with `query` string and `parts` array.                |
| `dataFlow`        | no       | Array of stage name strings for pipeline visualization.      |

## Testing

```bash
npm run test
```

The test suite lives in `src/lessons/lessons.test.js` and has two sections:

**Lesson smoke tests** — one test per lesson (35 total). For each lesson:
1. Creates a fresh in-memory database with the lesson's collections.
2. Executes the lesson's `defaultQuery`.
3. Compares the result against `expectedResult` using order-insensitive deep equality.

**Engine edge-case tests** — targeted unit tests for specific operator behaviors including null semantics, sort stability, `$unwind` edge cases, update modifiers, expression operators, and `$lookup` pipeline form.

When adding a new lesson, write the `defaultQuery` and `expectedResult` first, then run `npm run test` to confirm they match before building the UI content.

## License

MIT
