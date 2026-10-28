const lesson = {
  id: 1,
  title: 'Implicit Collection Creation',
  module: 'Introduction',
  description: 'Create collections simply by inserting data into them',

  explanation: (
    <>
      <p>
        In MongoDB, you rarely need to create a collection ahead of time. Just <strong>select</strong> a
        collection by name and start writing data - MongoDB creates it automatically.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 my-4">
        <h3 className="text-sm font-bold text-blue-900 mb-2">Selecting a Collection</h3>
        <p className="text-sm text-blue-800">
          You select a collection using the <code>db.collectionName</code> syntax. The <code>db</code>
           refers to your current database, and the name after the dot is the collection. There is no
          "USE collection" statement - you just reference it directly in your query.
        </p>
      </div>

      <p>
        This behaviour is called <strong>implicit creation</strong>. When you call <code>insertOne()</code>
        or <code>insertMany()</code> on a collection that does not exist yet, MongoDB creates it for you
        before inserting the document:
      </p>

      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`// The "movies" collection does not exist yet.
// This single line creates it AND inserts the document:
db.movies.insertOne({ title: "Inception", year: 2010, rating: 8.8 })`}
      </pre>

      <p>
        This is fundamentally different from SQL, where you must run <code>CREATE TABLE</code> before
        you can insert any data. MongoDB's flexible schema means you can start storing data
        immediately and let the database handle the housekeeping.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 my-4">
        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">
          Key Point
        </p>
        <p className="text-sm text-amber-900">
          Merely <em>referencing</em> a collection (e.g. <code>db.movies.find()</code>) does
          <strong> not</strong> create it. The collection is only created when the first document
          is inserted. A read on a non-existent collection simply returns an empty result.
        </p>
      </div>
    </>
  ),

  howItWorks: (
    <>
      <p>
        When MongoDB receives an <code>insertOne</code> or <code>insertMany</code> command, it checks
        whether the target collection exists in the database metadata. If it doesn't, MongoDB
        atomically creates the collection (with a default configuration) and then inserts the
        document(s). The entire operation is transparent - you get back the inserted document
        with its auto-generated <code>_id</code> as if the collection had always existed.
      </p>
      <p>
        This lazy-creation strategy is part of what makes MongoDB so easy to prototype with. You never
        have to break your flow to define a schema or run a DDL statement.
      </p>
    </>
  ),

  realWorldUse: (
    <p>
      Implicit creation shines during rapid prototyping and agile development. When you are
      experimenting with a new feature, you can just start writing documents and the database adapts.
      It is also useful in microservice architectures where each service might own its own collections
      - the service can create them on first use without needing a separate setup step.
    </p>
  ),

  commonMistakes: (
    <>
      <p>
        <strong>Typo in collection name.</strong> Writing <code>db.movi es.insertOne(...)</code> or
        <code>db.movie.insertOne(...)</code> silently creates a second collection instead of inserting
        into the intended one. Always double-check your collection names.
      </p>
      <p>
        <strong>Thinking you must call createCollection first.</strong> Many developers coming from SQL
        assume collections need to be declared upfront. In MongoDB, 90 % of collections are
        created implicitly - only use <code>createCollection</code> when you need specific options.
      </p>
      <p>
        <strong>Assuming reading creates.</strong> Running <code>db.nonexistent.find()</code> does
        <em>not</em> create the collection - it just returns an empty array.
      </p>
    </>
  ),

  syntaxBreakdown: {
    query: 'db.movies.insertOne({ title: "Inception", year: 2010, rating: 8.8 })',
    parts: [
      { label: 'db', description: 'The database object - entry point to all MongoDB operations' },
      { label: 'movies', description: 'The collection name - if it does not exist, MongoDB creates it implicitly' },
      { label: 'insertOne({...})', description: 'Inserts a document and triggers implicit creation if the collection is new' },
    ],
  },

  task: 'Insert a document into the "movies" collection to create it implicitly. The collection does not exist yet - your insert will create it.',

  defaultQuery: 'db.movies.insertOne({ title: "Inception", year: 2010, rating: 8.8 })',

  collections: {},

  // Graded on the data written, so any valid insert of this document passes
  expectedState: { movies: [{ _id: 1, title: 'Inception', year: 2010, rating: 8.8 }] },

  hints: [
    'You need to insert a document into a collection that does not exist yet',
    'Use insertOne() on the "movies" collection',
    'Try: `db.movies.insertOne({ title: "Inception", year: 2010, rating: 8.8 })`',
  ],
}

export default lesson
