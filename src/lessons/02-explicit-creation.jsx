const lesson = {
  id: 2,
  title: 'Explicit Creation with createCollection()',
  module: 'Introduction',
  description: 'Use db.createCollection() when you need control over collection options',

  explanation: (
    <>
      <p>
        While implicit creation works for most cases, sometimes you need explicit control over a
        collection's configuration. That is where <code>db.createCollection()</code> comes in.
      </p>

      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.createCollection("reviews")`}
      </pre>

      <p>
        This is a <strong>db-level method</strong> - notice it is called directly on <code>db</code>,
        not on a collection. The first argument is the collection name, and an optional second argument
        lets you pass configuration options:
      </p>

      <pre className="bg-slate-100 text-slate-800 p-3 rounded-lg text-sm overflow-x-auto my-3">
{`db.createCollection("logs", {
  capped: true,
  size: 1048576,
  max: 5000
})`}
      </pre>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-1">
            Implicit Creation
          </p>
          <ul className="text-sm text-blue-900 space-y-1 list-disc list-inside">
            <li>Happens automatically on first insert</li>
            <li>Default collection settings</li>
            <li>Best for prototyping and most apps</li>
            <li>No extra typing needed</li>
          </ul>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">
            Explicit Creation
          </p>
          <ul className="text-sm text-amber-900 space-y-1 list-disc list-inside">
            <li>Requires <code>createCollection()</code> call</li>
            <li>Supports options: capped, size, max, validator</li>
            <li>Best for logging, validation, fixed-size stores</li>
            <li>Returns <code>{'{'} ok: 1 {'}'}</code> on success</li>
          </ul>
        </div>
      </div>

      <p>
        One common use for explicit creation is <strong>capped collections</strong>. These are
        fixed-size collections that automatically overwrite the oldest documents when they reach
        their size limit - ideal for logs, metrics, or any circular-buffer use case.
      </p>
    </>
  ),

  howItWorks: (
    <>
      <p>
        <code>createCollection</code> tells MongoDB to allocate the collection's metadata and
        storage up front. With a capped collection, MongoDB pre-allocates the specified storage space
        and maintains a circular cursor. When new documents are inserted, they are appended until the
        size cap is reached, then the oldest documents are silently overwritten.
      </p>
      <p>
        The <code>validator</code> option lets you attach a query expression that every document must
        satisfy. This is MongoDB's built-in way to enforce a schema without giving up the
        flexibility of the document model.
      </p>
    </>
  ),

  realWorldUse: (
    <p>
      Capped collections are perfect for application logs, event streams, and real-time analytics
      where you only care about the most recent N records. Schema validation with
      <code>$jsonSchema</code> is useful in production APIs where you want the database to enforce
      data quality, catching bad data at the database level rather than relying solely on application
      logic.
    </p>
  ),

  commonMistakes: (
    <>
      <p>
        <strong>Calling createCollection on every startup.</strong> Many developers write scripts that
        call <code>createCollection</code> every time the app boots. The collection already exists
        after the first run, so the call fails. Use <code>createCollection</code> in setup/migration
        scripts, not in application start-up code.
      </p>
      <p>
        <strong>Over-engineering with explicit creation.</strong> For most collections, implicit
        creation is perfectly fine. Only reach for <code>createCollection</code> when you genuinely
        need capped collections or schema validation.
      </p>
      <p>
        <strong>Forgetting that some options are create-only.</strong> Settings like <code>capped</code>,
        <code>size</code>, and <code>max</code> can only be set at creation time. You cannot convert
        an existing collection to a capped one (you would have to create a new one and migrate data).
      </p>
    </>
  ),

  syntaxBreakdown: {
    query: 'db.createCollection("reviews")',
    parts: [
      { label: 'db', description: 'The database object - entry point to all MongoDB operations' },
      { label: 'createCollection', description: 'A db-level method that creates a collection with optional configuration' },
      { label: '"reviews"', description: 'The name of the collection to create' },
    ],
  },

  task: 'Create a collection called "reviews" explicitly using db.createCollection().',

  defaultQuery: 'db.createCollection("reviews")',

  collections: {},

  expectedResult: [{ ok: 1 }],
  expectedCollections: ['reviews'],

  hints: [
    'Use createCollection() directly on the db object',
    'Pass the collection name as a string argument',
    'Try: `db.createCollection("reviews")`',
  ],
}

export default lesson
