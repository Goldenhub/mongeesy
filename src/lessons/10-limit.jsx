import books from '../data/books.js'

const lesson = {
  id: 10,
  title: 'limit() and skip() - Pagination',
  module: 'Module 1: Reading Data',
  description: 'Control how many results to return',

  explanation: (
    <>
      <p>
        <code>limit()</code> restricts how many documents are returned, and <code>skip()</code>
        &nbsp;skips over a number of documents before returning results:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.find().sort({ rating: -1 }).limit(3)`}
      </pre>
      <p>
        This returns only the top 3 highest-rated books. Combine with <code>skip()</code>
        for pagination:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.find().sort({ rating: -1 }).skip(3).limit(3)`}
      </pre>
      <p>
        This would be "page 2" - it skips the first 3 results and returns the next 3.
        Note: MongoDB cursor methods can be chained in any order.
      </p>
    </>
  ),

  task: 'Return the 5 cheapest books (hint: sort by price ascending, then limit to 5).',

  defaultQuery: 'db.books.find().sort({ price: 1 }).limit(5)',

  collections: {
    books,
  },

  expectedResult: [...books].sort((a, b) => a.price - b.price).slice(0, 5),
  orderBy: { price: 1 },

  hints: [
    'How do you get only the first N matching documents?',
    'Chain `.sort()` then `.limit()` on your query - the order of chaining matters',
  ],
}

export default lesson
