import { Collection } from './collection.js'
import { parseScript } from './mongosh-parser.js'
import { ParseError, QueryError, unknownMessage } from './errors.js'

const DB_METHODS = ['createCollection', 'getCollectionNames', 'getCollection', 'dropDatabase']
const COLLECTION_METHODS = [
  'find', 'findOne', 'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
  'countDocuments', 'estimatedDocumentCount', 'distinct', 'aggregate', 'drop',
]
const CURSOR_METHODS = ['sort', 'limit', 'skip', 'count', 'size', 'itcount', 'pretty', 'toArray']

export class Database {
  constructor(seedData = {}) {
    this.collections = {}
    this.seedData = seedData
    for (const [name, docs] of Object.entries(seedData)) {
      this.collections[name] = new Collection(name, docs)
    }
  }

  reset() {
    this.collections = {}
    for (const [name, docs] of Object.entries(this.seedData)) {
      this.collections[name] = new Collection(name, docs)
    }
  }

  // Plain { name: docs[] } copy of every collection, e.g. to check what a
  // write did or to carry playground data over to the next run
  getState() {
    return Object.fromEntries(
      Object.entries(this.collections).map(([name, coll]) => [name, structuredClone(coll.docs)])
    )
  }

  // Runs every statement in order and returns the last one's result
  execute(queryString) {
    const statements = parseScript(queryString)
    let last
    for (const statement of statements) {
      last = this.executeStatement(statement)
    }
    return last
  }

  executeStatement(parsed) {
    const { method, args } = parsed
    if (!parsed.collection) {
      if (parsed.chains.length) throw new QueryError(`db.${method}() can't be followed by .${parsed.chains[0].method}()`)
      return { result: this.runDbMethod(method, args), collection: null, method }
    }

    const name = parsed.collection
    const existing = this.collections[name]
    const coll = existing ?? new Collection(name, [])
    let result
    if (method === 'find') {
      result = this.runFind(coll, args, parsed.chains)
    } else {
      assertNoChains(method, parsed.chains)
      result = this.runCollectionMethod(coll, method, args)
    }
    // Like MongoDB, writing to a collection that doesn't exist creates it
    if (!existing && method !== 'drop' && coll.docs.length > 0) this.collections[name] = coll
    return { result, collection: name, method }
  }

  runDbMethod(method, args) {
    switch (method) {
      case 'createCollection': {
        const [name] = args
        if (typeof name !== 'string' || !name) throw new QueryError('createCollection() needs a collection name string, e.g. db.createCollection("reviews")')
        if (this.collections[name]) throw new QueryError(`Collection '${name}' already exists`)
        this.collections[name] = new Collection(name, [])
        return { ok: 1 }
      }
      case 'getCollectionNames':
        return Object.keys(this.collections).sort()
      case 'dropDatabase':
        this.collections = {}
        return { ok: 1 }
      default:
        throw new ParseError(unknownMessage('method', method, DB_METHODS, (s) => `db.${s}()`))
    }
  }

  runFind(coll, args, chains) {
    const [query, projection] = args
    const opts = { sort: undefined, skip: 0, limit: 0 }
    let terminal = null
    for (const chain of chains) {
      if (terminal) throw new QueryError(`.${terminal}() returns a number, so .${chain.method}() can't follow it`)
      const [arg] = chain.args
      switch (chain.method) {
        case 'sort':
          if (arg === undefined) throw new QueryError('.sort() needs an object like { price: 1 }')
          opts.sort = arg
          break
        case 'limit':
          if (typeof arg !== 'number' || !Number.isInteger(arg)) throw new QueryError('.limit() needs a whole number')
          opts.limit = arg
          break
        case 'skip':
          if (typeof arg !== 'number' || !Number.isInteger(arg) || arg < 0) throw new QueryError('.skip() needs a non-negative whole number')
          opts.skip = arg
          break
        case 'count':
        case 'size':
        case 'itcount':
          terminal = chain.method
          break
        case 'pretty':
        case 'toArray':
          break
        default:
          throw new ParseError(unknownMessage('cursor method', chain.method, CURSOR_METHODS, (s) => `.${s}()`))
      }
    }
    // cursor.count() ignores skip/limit unless you pass true; size() and itcount() apply them
    if (terminal === 'count' && chains.find((c) => c.method === 'count').args[0] !== true) {
      return coll.find(query, projection).length
    }
    const docs = coll.find(query, projection, opts)
    return terminal ? docs.length : docs
  }

  runCollectionMethod(coll, method, args) {
    switch (method) {
      case 'findOne': return coll.findOne(args[0], args[1])
      case 'insertOne': return coll.insertOne(args[0])
      case 'insertMany': return coll.insertMany(args[0])
      case 'updateOne': return coll.updateOne(args[0], args[1], args[2])
      case 'updateMany': return coll.updateMany(args[0], args[1], args[2])
      case 'replaceOne': return coll.replaceOne(args[0], args[1], args[2])
      case 'deleteOne': return coll.deleteOne(args[0])
      case 'deleteMany': return coll.deleteMany(args[0])
      case 'findOneAndUpdate': return coll.findOneAndUpdate(args[0], args[1], args[2])
      case 'findOneAndReplace': return coll.findOneAndReplace(args[0], args[1], args[2])
      case 'findOneAndDelete': return coll.findOneAndDelete(args[0], args[1])
      case 'countDocuments': return coll.countDocuments(args[0], args[1])
      case 'estimatedDocumentCount': return coll.estimatedDocumentCount()
      case 'distinct': return coll.distinct(args[0], args[1])
      case 'aggregate': return coll.aggregate(args[0], this.collections)
      case 'drop': {
        const existed = coll.name in this.collections
        delete this.collections[coll.name]
        return existed
      }
      default:
        throw new ParseError(unknownMessage('method', method, COLLECTION_METHODS, (s) => `db.${coll.name}.${s}()`))
    }
  }
}

function assertNoChains(method, chains) {
  if (chains.length === 0) return
  const next = chains[0].method
  if (method === 'aggregate' && chains.every((c) => c.method === 'toArray' || c.method === 'pretty')) return
  if (method === 'findOne') {
    throw new QueryError(`findOne() returns a single document, not a cursor, so .${next}() can't be chained. Use find().${next}(...) instead.`)
  }
  if (method === 'aggregate') {
    throw new QueryError(`.${next}() can't be chained on aggregate(). Use a pipeline stage instead, e.g. { $${next === 'count' ? 'count: "total"' : `${next}: ...`} }.`)
  }
  throw new QueryError(`${method}() doesn't return a cursor, so .${next}() can't be chained`)
}
