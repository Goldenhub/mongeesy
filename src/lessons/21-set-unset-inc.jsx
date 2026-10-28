import books from '../data/books.js'

const lesson = {
  id: 21,
  title: '$set, $unset, and $inc Operators',
  module: 'Module 3: Modifying Data',
  description: 'Use field update operators for precise modifications',

  explanation: (
    <>
      <p>
        MongoDB provides several operators for updating specific fields without replacing
        the entire document:
      </p>
      <ul className="space-y-1 my-2">
        <li><code>$set</code> - sets a field to a value (creates it if it doesn't exist)</li>
        <li><code>$unset</code> - removes a field from the document</li>
        <li><code>$inc</code> - increments (or decrements) a numeric field</li>
        <li><code>$mul</code> - multiplies a numeric field</li>
        <li><code>$rename</code> - renames a field</li>
      </ul>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.updateOne(
  { title: "Clean Code" },
  {
    $set: { rating: 4.6 },
    $inc: { copies: 5 }
  }
)`}
      </pre>
      <p>
        You can combine multiple operators in a single update. The example above both
        sets a new rating and increments the copies.
      </p>
    </>
  ),

  task: 'For the book "1984", use $inc to increase its copies by 3 and $set a new field called "featured" to true.',

  defaultQuery: 'db.books.updateOne({ title: "1984" }, { $inc: { copies: 3 }, $set: { featured: true } })',

  collections: {
    books,
  },

  expectedResult: [{ acknowledged: true, insertedId: null, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }],
  expectedState: {
    books: books.map((b) => (b.title === '1984' ? { ...b, copies: b.copies + 3, featured: true } : b)),
  },

  hints: [
    'How can you increment a numeric field and add a new field in one update?',
    'Combine `$inc` and `$set` in a single update object passed to `updateOne()`',
  ],
}

export default lesson
