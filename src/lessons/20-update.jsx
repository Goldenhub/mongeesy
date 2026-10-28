import books from '../data/books.js'

const lesson = {
  id: 20,
  title: 'updateOne() and updateMany()',
  module: 'Module 3: Modifying Data',
  description: 'Modify existing documents in a collection',

  explanation: (
    <>
      <p>
        Use <code>updateOne()</code> to modify the first document that matches a filter,
        or <code>updateMany()</code> to modify all matching documents:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.updateOne(
  { title: "1984" },
  { $set: { copies: 25 } }
)`}
      </pre>
      <p>
        The first argument is the <strong>filter</strong> (which documents to update), and
        the second is the <strong>update</strong> (what to change). The result object tells
        you how many documents matched and were modified.
      </p>
      <p>
        To update every document that matches, use <code>updateMany()</code>:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.updateMany(
  { genre: "fiction" },
  { $inc: { copies: 1 } }
)`}
      </pre>
      <p>
        This adds 1 to the <code>copies</code> field of every fiction book.
        Always use update operators like <code>$set</code> or <code>$inc</code> -
        replacing the whole document is rarely what you want.
      </p>
    </>
  ),

  task: 'Update the book "Moby Dick" to have a rating of 4.5 using $set.',

  defaultQuery: 'db.books.updateOne({ title: "Moby Dick" }, { $set: { rating: 4.5 } })',

  collections: {
    books,
  },

  expectedResult: [{ acknowledged: true, insertedId: null, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }],
  expectedState: {
    books: books.map((b) => (b.title === 'Moby Dick' ? { ...b, rating: 4.5 } : b)),
  },

  hints: [
    'Which method updates fields in an existing document?',
    'Use `updateOne()` with a filter to find the book and `$set` to change the rating',
  ],
}

export default lesson
