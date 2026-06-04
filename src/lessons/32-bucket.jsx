import books from '../data/books.js'

const boundaries = [0, 300, 500, 700, 1400]
const buckets = boundaries.slice(0, -1).map((min) => ({
  _id: min,
  count: 0,
  titles: [],
  avgRating: 0,
}))
const defaultBucket = { _id: 'other', count: 0, titles: [], avgRating: 0 }
for (const b of books) {
  let placed = false
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (b.pages >= boundaries[i] && b.pages < boundaries[i + 1]) {
      buckets[i].count++
      buckets[i].titles.push(b.title)
      buckets[i].avgRating += b.rating
      placed = true
      break
    }
  }
  if (!placed) {
    defaultBucket.count++
    defaultBucket.titles.push(b.title)
    defaultBucket.avgRating += b.rating
  }
}
const expected = [...buckets, defaultBucket].map((b) => ({
  _id: b._id,
  count: b.count,
  titles: b.titles,
  avgRating: b.count > 0 ? Math.round((b.avgRating / b.count) * 1e10) / 1e10 : 0,
}))

const lesson = {
  id: 32,
  title: '$bucket - Categorize into Groups',
  module: 'Module 5: Power User',
  description: 'Group documents into ranges with $bucket',

  explanation: (
    <>
      <p>
        The <code>$bucket</code> stage categorizes documents into groups (buckets) based
        on a numeric expression and boundaries:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.aggregate([
  {
    $bucket: {
      groupBy: "$pages",
      boundaries: [0, 200, 400, 600, 800, 1000, 1400],
      default: "other",
      output: {
        count: { $sum: 1 },
        titles: { $push: "$title" },
        avgRating: { $avg: "$rating" }
      }
    }
  }
])`}
      </pre>
      <p>
        Each document is placed into the first bucket where <code>groupBy</code> is
        &nbsp;<code>&gt;= boundary[i]</code> and <code>&lt; boundary[i+1]</code>.
        The <code>output</code> defines accumulators for each bucket (like in
        &nbsp;<code>$group</code>). The <code>default</code> bucket catches documents that
        don't fall into any boundary.
      </p>
    </>
  ),

  howItWorks: (
    <>
      <p><code>$bucket</code> is like <code>$group</code> but with predefined ranges instead of dynamic grouping keys. MongoDB checks each document's <code>groupBy</code> value and places it in the first bucket where <code>min ≤ value &lt; max</code>.</p>
      <p>The <code>boundaries</code> array defines the bucket edges: <code>[0, 300, 500, 700, 1400]</code> creates 4 buckets: [0-300), [300-500), [500-700), [700-1400). Each bucket gets its own accumulated <code>output</code> values.</p>
      <p className="font-semibold text-indigo-700">Key insight: Buckets are <strong>non-overlapping</strong> (a document can only be in one bucket) and <strong>ordered</strong> (MongoDB checks boundaries in order). The <code>default</code> bucket catches any document that doesn't fit.</p>
    </>
  ),

  realWorldUse: (
    <p><code>$bucket</code> is perfect for creating histograms and distribution reports. Real examples: grouping customers by total spending tiers ($0-100, $100-500, $500+), grouping orders by item count, or bucketing response times into performance categories (fast, medium, slow).</p>
  ),

  commonMistakes: (
    <>
      <p><strong>Overlapping boundaries.</strong> Make sure your boundaries don't overlap in confusing ways. A document always goes into the first bucket whose range it falls within.</p>
      <p><strong>Documents outside all boundaries.</strong> Always provide a <code>default</code> bucket to catch edge cases, or your query might silently drop data. In this lesson, any book with pages ≥ 1400 would be dropped without a default.</p>
    </>
  ),

  dataFlow: ['books', '$bucket (categorize by pages)', 'Result'],

  task: 'Bucket books by pages into ranges: [0, 300, 500, 700, 1400]. Output the count, titles, and avgRating for each bucket.',

  defaultQuery: 'db.books.aggregate([\n  {\n    $bucket: {\n      groupBy: "$pages",\n      boundaries: [0, 300, 500, 700, 1400],\n      default: "other",\n      output: {\n        count: { $sum: 1 },\n        titles: { $push: "$title" },\n        avgRating: { $avg: "$rating" }\n      }\n    }\n  }\n])',

  collections: {
    books,
  },

  expectedResult: expected,

  hints: [
    'Which stage categorizes documents into predefined numeric ranges?',
    'Use `$bucket` with `groupBy`, `boundaries`, and `output` to define the ranges and accumulators',
  ],
}

export default lesson
