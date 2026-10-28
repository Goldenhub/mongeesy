import books from '../data/books.js'

const sortedBooks = [...books].sort((a, b) => a.price - b.price)

const lesson = {
  id: 9,
  title: 'sort() - Ordering Results',
  module: 'Module 1: Reading Data',
  description: 'Sort query results with .sort()',

  explanation: (
    <>
      <p>
        The <code>sort()</code> cursor method orders your results by one or more fields.
        Pass an object with field names and direction:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.find().sort({ price: 1 })`}
      </pre>
      <p>
        Use <code>1</code> for ascending (A→Z, smallest→largest) and <code>-1</code> for
        descending (Z→A, largest→smallest):
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.find().sort({ rating: -1, title: 1 })`}
      </pre>
      <p>
        The second example sorts by rating descending first, then by title ascending for
        books with the same rating. Cursor methods like <code>sort()</code>, <code>limit()</code>,
        and <code>skip()</code> can be chained after <code>find()</code>.
      </p>
    </>
  ),

  task: 'Return all books sorted by price in ascending order (cheapest first).',

  defaultQuery: 'db.books.find().sort({ price: 1 })',

  collections: {
    books,
  },

  expectedResult: sortedBooks,
  orderBy: { price: 1 },

  hints: [
    'How do you sort results by a field in ascending order?',
    'Chain `.sort()` on the query with the field name and direction (1 for ascending)',
  ],
}

export default lesson
