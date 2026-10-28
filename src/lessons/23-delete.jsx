import books from '../data/books.js'

const lesson = {
  id: 23,
  title: 'deleteOne() and deleteMany()',
  module: 'Module 3: Modifying Data',
  description: 'Remove documents from a collection',

  explanation: (
    <>
      <p>
        Use <code>deleteOne()</code> to remove the first document matching a filter,
        or <code>deleteMany()</code> to remove all matching documents:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.deleteOne({ title: "Moby Dick" })`}
      </pre>
      <p>
        The result shows how many documents were deleted. Be careful - there's no undo!
        Always test your filter with <code>find()</code> first to make sure you're
        deleting the right documents.
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.deleteMany({ genre: "technology" })`}
      </pre>
      <p>
        <strong>Warning:</strong> <code>deleteMany(&#123;&#125;)</code> with an empty filter
        removes <em>all</em> documents from the collection. Use it carefully!
      </p>
    </>
  ),

  task: 'Delete the book with title "The Pragmatic Programmer".',

  defaultQuery: 'db.books.deleteOne({ title: "The Pragmatic Programmer" })',

  collections: {
    books,
  },

  expectedResult: [{ acknowledged: true, deletedCount: 1 }],
  expectedState: {
    books: books.filter((b) => b.title !== 'The Pragmatic Programmer'),
  },

  hints: [
    'Which method removes a document from a collection?',
    'Use `deleteOne()` with a filter on the title field',
  ],
}

export default lesson
