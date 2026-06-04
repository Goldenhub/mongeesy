import books from '../data/books.js'
import authors from '../data/authors.js'
import products from '../data/products.js'
import patrons from '../data/patrons.js'
import loans from '../data/loans.js'

export const PLAYGROUND_LESSON_ID = -1

export const allCollections = { books, authors, products, patrons, loans }

export const playgroundLesson = {
  id: PLAYGROUND_LESSON_ID,
  title: 'Playground',
  description: null,
  explanation: (
    <>
      <p>
        Write any MongoDB query and see results instantly. All collections are available
        for you to explore. There are no right answers here, just experimentation.
      </p>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 my-3">
        <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-1">
          Available Collections
        </p>
        <div className="text-sm text-blue-900 font-mono space-y-0.5">
          <div><span className="text-blue-600">books</span> &mdash; {books.length} documents</div>
          <div><span className="text-blue-600">authors</span> &mdash; {authors.length} documents</div>
          <div><span className="text-blue-600">products</span> &mdash; {products.length} documents</div>
          <div><span className="text-blue-600">patrons</span> &mdash; {patrons.length} documents</div>
          <div><span className="text-blue-600">loans</span> &mdash; {loans.length} documents</div>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Tip: try <code>db.books.find()</code>, <code>db.products.find()</code>,
        or <code>db.authors.findOne()</code> to get started.
      </p>
    </>
  ),
  defaultQuery: 'db.books.find()',
  collections: allCollections,
}
