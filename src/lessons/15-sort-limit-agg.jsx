import books from '../data/books.js'

const expected = [...books]
  .sort((a, b) => b.rating - a.rating)
  .slice(0, 3)
  .map((b) => ({ title: b.title, rating: b.rating }))
  .sort((a, b) => b.rating - a.rating)

const lesson = {
  id: 15,
  title: '$sort and $limit in Aggregation',
  module: 'Module 2: Aggregation',
  description: 'Order and paginate within a pipeline',

  explanation: (
    <>
      <p>
        The aggregation pipeline has its own <code>$sort</code> and <code>$limit</code>
        &nbsp;stages. They work just like the cursor methods, but inside a pipeline:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.aggregate([
  { $sort: { rating: -1 } },
  { $limit: 3 },
  { $project: { title: 1, rating: 1 } }
])`}
      </pre>
      <p>
        This pipeline sorts all books by rating descending, keeps only the top 3, then
        projects just the title and rating fields.
      </p>
      <p>
        Stage order matters: <code>$sort</code> before <code>$limit</code> gives you the
        top N; reversing them gives you the first N documents in their original order.
      </p>
    </>
  ),

  task: 'Return the 3 highest-rated books, showing only title and rating.',

  defaultQuery: 'db.books.aggregate([\n  { $sort: { rating: -1 } },\n  { $limit: 3 },\n  { $project: { title: 1, rating: 1, _id: 0 } }\n])',

  collections: {
    books,
  },

  expectedResult: expected,
  orderBy: { rating: -1 },

  hints: [
    'How do you get only the top results after sorting in an aggregation?',
    'Chain `$sort` then `$limit` in your pipeline, then `$project` to pick fields',
  ],
}

export default lesson
