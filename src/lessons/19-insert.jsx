import books from '../data/books.js'

const lesson = {
  id: 19,
  title: 'insertOne() and insertMany()',
  module: 'Module 3: Modifying Data',
  description: 'Add new documents to a collection',

  explanation: (
    <>
      <p>
        Use <code>insertOne()</code> to add a single document, or <code>insertMany()</code>
        &nbsp;to add multiple documents at once:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.insertOne({
  title: "New Book",
  author: "You",
  genre: "fiction",
  pages: 300,
  rating: 4.0,
  price: 14.99,
  copies: 1,
  published_year: 2025
})`}
      </pre>
      <p>
        MongoDB automatically generates an <code>_id</code> field if you don't provide one.
        The result is an acknowledgement like <code>{'{ acknowledged: true, insertedId: 11 }'}</code> that
        tells you the new <code>_id</code>. (In real MongoDB the generated <code>_id</code> is an ObjectId;
        this sandbox uses the next number so results stay readable.)
      </p>
      <p>
        To insert several documents at once, pass an array to <code>insertMany()</code>:
      </p>
      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.books.insertMany([
  { title: "Book A", author: "Author A", genre: "fiction", pages: 200, rating: 3.5, price: 9.99, copies: 2, published_year: 2024 },
  { title: "Book B", author: "Author B", genre: "technology", pages: 400, rating: 4.0, price: 24.99, copies: 5, published_year: 2024 }
])`}
      </pre>
    </>
  ),

  task: 'Insert a new book with title "The Hidden Language", author "Jane Doe", genre "technology", pages 350, rating 4.2, price 27.99, copies 3, published_year 2025.',

  defaultQuery: 'db.books.insertOne({ title: "The Hidden Language", author: "Jane Doe", genre: "technology", pages: 350, rating: 4.2, price: 27.99, copies: 3, published_year: 2025 })',

  collections: {
    books,
  },

  expectedState: {
    books: [...books, { _id: 11, title: "The Hidden Language", author: "Jane Doe", genre: "technology", pages: 350, rating: 4.2, price: 27.99, copies: 3, published_year: 2025 }],
  },

  hints: [
    'Which method adds a new document to a collection?',
    'Use `insertOne()` with an object containing all the required fields',
  ],
}

export default lesson
