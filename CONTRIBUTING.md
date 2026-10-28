# Contributing to Mongeesy

Thanks for helping make MongoDB easier to learn. Bug reports, new lessons, engine fixes and docs improvements are all welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`). Analytics stays off unless you set a PostHog key, so you don't need any environment variables.

The service worker (offline mode, update prompt, background reminders) only runs in production builds. To try those locally:

```bash
npm run build && npm run preview
```

## Before you open a pull request

Run the same checks as CI (`.github/workflows/ci.yml`):

```bash
npm run lint
npm test
npm run build
```

- Keep pull requests small and focused on one change.
- Add or update tests for behaviour you change.
- Write commit messages in the style the history already uses: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`.

## Where things live

| Area | Location | Notes |
| --- | --- | --- |
| Query engine | `src/engine/` | The parser, filters, updates and aggregation. Add tests to `src/engine/engine.test.js`. Behaviour should match real MongoDB; when it can't, explain why in a comment. |
| Lessons | `src/lessons/` | One file per lesson. See [Adding Lessons](README.md#adding-lessons) in the README, including `expectedState` for write lessons and `orderBy` for sort lessons. Every lesson's `defaultQuery` must pass in `src/lessons/lessons.test.js`. |
| Grading | `src/utils/compare-results.js` | `checkAnswer()` decides whether an attempt is correct. |
| Storage | `src/lib/db.js` | IndexedDB progress and settings, shared with the service worker. |
| Offline and reminders | `src/sw.js`, `src/lib/reminderService.js`, `src/lib/reminder-rules.js` | |

## Reporting a bug

Open an issue with:

- the lesson (or the playground) and the exact query you ran
- what Mongeesy returned
- what you expected, ideally what real MongoDB (`mongosh`) returns for the same query and data
- your browser and operating system

For an engine bug, a minimal query against the sample data that shows the difference is the most useful thing you can include.

## Suggesting a lesson

Open an issue describing the concept, the task you'd give the learner, and the query that solves it. Lessons work best when they teach one idea, use the existing sample collections in `src/data/`, and have an answer that can be checked automatically.

## License

Mongeesy is released under the [MIT License](LICENSE). By contributing, you agree that your contributions are licensed under it too.
