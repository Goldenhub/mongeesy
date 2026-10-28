import { canonicalKey, deepEqual, compareValues, getNestedValue } from '../engine/utils.js'

// Order-insensitive comparison of two result lists. Nested objects compare
// regardless of key order; nested arrays still compare in order.
export function compareResults(userDocs, expectedDocs) {
  if (!Array.isArray(userDocs) || !Array.isArray(expectedDocs)) {
    return deepEqual(userDocs, expectedDocs)
  }
  if (userDocs.length !== expectedDocs.length) return false

  const normalizedUser = userDocs.map((d) => canonicalKey(d)).sort()
  const normalizedExpected = expectedDocs.map((d) => canonicalKey(d)).sort()

  return normalizedUser.every((u, i) => u === normalizedExpected[i])
}

export function deepEqualResults(actual, expected) {
  return deepEqual(actual, expected)
}

export function isSortedBy(docs, sortSpec) {
  const entries = Object.entries(sortSpec)
  for (let i = 1; i < docs.length; i++) {
    for (const [field, order] of entries) {
      const cmp = compareValues(getNestedValue(docs[i - 1], field), getNestedValue(docs[i], field)) * order
      if (cmp < 0) break
      if (cmp > 0) return false
    }
  }
  return true
}

// Grades a lesson attempt. `state` is every collection's documents after the
// query ran, so write lessons can check what actually changed.
//
// Lesson fields used:
//   expectedResult       what the query must return (any order)
//   orderBy              the result must also be sorted this way, e.g. { price: 1 }
//   expectedState        { collection: docs[] } the data must look like afterwards
//   expectedCollections  collection names that must exist afterwards
export function checkAnswer(lesson, resultArray, state = {}) {
  if (lesson.expectedResult !== undefined) {
    if (!compareResults(resultArray, lesson.expectedResult)) return { passed: false, reason: 'result' }
    if (lesson.orderBy && !isSortedBy(resultArray, lesson.orderBy)) return { passed: false, reason: 'order' }
  }
  if (lesson.expectedCollections && !lesson.expectedCollections.every((name) => name in state)) {
    return { passed: false, reason: 'collections' }
  }
  if (lesson.expectedState) {
    for (const [name, docs] of Object.entries(lesson.expectedState)) {
      if (!compareResults(state[name] ?? [], docs)) return { passed: false, reason: 'state' }
    }
  }
  return { passed: true, reason: null }
}
