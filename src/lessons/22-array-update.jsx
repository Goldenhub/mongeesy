import patrons from '../data/patrons.js'

const lesson = {
  id: 22,
  title: 'Array Update Operators - $push, $pop, $pull',
  module: 'Module 3: Modifying Data',
  description: 'Modify array fields with dedicated operators',

  explanation: (
    <>
      <p>
        MongoDB has special operators for modifying array fields:
      </p>
      <ul className="space-y-1 my-2">
        <li><code>$push</code> - adds an element to the end of an array</li>
        <li><code>$pop</code> - removes the first (-1) or last (1) element</li>
        <li><code>$pull</code> - removes all elements that match a condition</li>
        <li><code>$addToSet</code> - adds an element only if it doesn't already exist</li>
      </ul>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.patrons.updateOne(
  { name: "Alice Johnson" },
  { $push: { borrowed_books: 11 } }
)`}
      </pre>
      <p>
        This adds the book <code>_id</code> 11 to Alice's <code>borrowed_books</code> array.
        To remove a specific value, use <code>$pull</code>:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.patrons.updateOne(
  { name: "Alice Johnson" },
  { $pull: { borrowed_books: 5 } }
)`}
      </pre>
      <p>
        This removes the value 5 from Alice's array.
      </p>
    </>
  ),

  task: 'Push the book _id 12 into the borrowed_books array of the patron "Carol Williams".',

  defaultQuery: 'db.patrons.updateOne({ name: "Carol Williams" }, { $push: { borrowed_books: 12 } })',

  collections: {
    patrons,
  },

  expectedResult: [{ acknowledged: true, insertedId: null, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }],
  expectedState: {
    patrons: patrons.map((p) => (p.name === 'Carol Williams' ? { ...p, borrowed_books: [...p.borrowed_books, 12] } : p)),
  },

  hints: [
    'Which operator adds an element to an array field?',
    'Use `$push` with the value you want to add - it appends to the array',
  ],
}

export default lesson
