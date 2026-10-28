import { describe, it, expect } from 'vitest'
import { Database } from './query-engine.js'
import { parseScript, evaluateArg } from './mongosh-parser.js'
import { executeQuery } from './execute-query.js'
import { compareResults } from '../utils/compare-results.js'
import { compareValues } from './utils.js'

const DOCS = [
  { _id: 1, name: 'Ann', tags: ['a', 'b'], items: [{ n: 'x', q: 2 }, { n: 'y', q: 5 }], score: 10 },
  { _id: 2, name: 'Ben', tags: ['c'], items: [{ n: 'z', q: 1 }], score: null },
  { _id: 3, name: 'Cat', tags: [], score: 'n/a' },
  { _id: 4, name: 'Dan' },
]

function run(query, seed = { c: DOCS }) {
  return new Database(seed).execute(query).result
}

const ids = (docs) => docs.map((d) => d._id)

function expectError(query, pattern, seed) {
  expect(() => run(query, seed)).toThrow(pattern)
}

describe('parser safety', () => {
  it('does not execute JavaScript in arguments', () => {
    globalThis.__pwned = false
    expectError('db.c.find((() => { globalThis.__pwned = true; return {} })())', /Unexpected/)
    expect(globalThis.__pwned).toBe(false)
  })

  it('rejects function calls and identifiers as values', () => {
    expectError('db.c.find({ a: alert(1) })', /can't be called here/)
    expectError('db.c.find({ name: Ann })', /Did you forget quotes/)
  })

  it('rejects template interpolation', () => {
    expectError('db.c.find({ name: `${1}` })', /Template expressions/)
  })

  it('rejects $where', () => {
    expectError('db.c.find({ $where: "this.score > 1" })', /\$where is not supported/)
  })

  it('handles parentheses, quotes and braces inside strings', () => {
    const db = new Database({ c: [{ _id: 1, t: 'a)b' }, { _id: 2, t: 'x{"y"}' }] })
    expect(ids(db.execute('db.c.find({ t: "a)b" })').result)).toEqual([1])
    expect(ids(db.execute("db.c.find({ t: 'x{\"y\"}' })").result)).toEqual([2])
  })

  it('parses literals and shell helpers', () => {
    expect(evaluateArg('{ a: 1, "b.c": [true, null, -2.5e1], d: \'q\', }')).toEqual({ a: 1, 'b.c': [true, null, -25], d: 'q' })
    expect(evaluateArg('new Date("2025-03-01")')).toEqual(new Date('2025-03-01'))
    expect(evaluateArg('ISODate("2025-03-01T10:00:00Z")')).toEqual(new Date('2025-03-01T10:00:00Z'))
    expect(evaluateArg('ObjectId("507F1F77BCF86CD799439011")')).toBe('507f1f77bcf86cd799439011')
    expect(evaluateArg('NumberInt(5)')).toBe(5)
    expect(evaluateArg('/a\\/b[/]/gi')).toEqual(/a\/b[/]/gi)
  })

  it('reports where a syntax error is', () => {
    expectError('db.c.find({ a: 1 ', /Missing '}'.*line 1/s)
    expectError('db.c.find({ a: 1 })\n  .sort({ a: 1 ', /line 2/)
  })

  it('skips comments and treats an empty buffer as empty', () => {
    expect(run('// a comment\ndb.c.find({ _id: 1 }) /* trailing */')).toHaveLength(1)
    expectError('// Enter your MongoDB query here', /Query is empty/)
  })

  it('rejects text after a query', () => {
    expectError('db.c.find() garbage', /Unexpected 'garbage'/)
  })

  it('splits multiple statements', () => {
    expect(parseScript('db.a.find(); db.b.find()\ndb.c.find()')).toHaveLength(3)
  })

  it('supports getCollection()', () => {
    expect(run('db.getCollection("c").find({ _id: 2 })')).toHaveLength(1)
  })
})

describe('error messages', () => {
  it('suggests misspelled methods', () => {
    expectError('db.c.fnd()', /Did you mean db\.c\.find\(\)/)
    expectError('db.c.find().sortt({ a: 1 })', /Did you mean \.sort\(\)/)
    expectError('db.creatCollection("x")', /Did you mean db\.createCollection\(\)/)
  })

  it('suggests misspelled operators and stages', () => {
    expectError('db.c.find({ score: { $gtt: 5 } })', /Did you mean \$gt\?/)
    expectError('db.c.aggregate([{ $mtch: {} }])', /Did you mean \$match\?/)
    expectError('db.c.aggregate([{ $project: { x: { $toUppr: "$name" } } }])', /Did you mean \$toUpper\?/)
    expectError('db.c.updateOne({}, { $sett: { a: 1 } })', /Did you mean \$set\?/)
  })

  it('explains invalid write shapes', () => {
    expectError('db.c.updateOne({ _id: 1 }, { score: 5 })', /must use operators like \$set/)
    expectError('db.c.deleteMany()', /needs a filter/)
    expectError('db.c.insertOne({ _id: 1 })', /duplicate key/)
    expectError('db.c.updateOne({ _id: 1 }, { $inc: { name: 1 } })', /Cannot apply \$inc to 'name'/)
    expectError('db.c.updateOne({ _id: 1 }, { $push: { name: "x" } })', /needs 'name' to be an array/)
  })

  it('rejects chaining on non-cursors', () => {
    expectError('db.c.findOne().sort({ a: 1 })', /findOne\(\) returns a single document/)
    expectError('db.c.aggregate([]).limit(1)', /Use a pipeline stage/)
    expectError('db.c.find().count().limit(1)', /returns a number/)
  })

  it('reports runaway work as an error rather than hanging', () => {
    expectError('db.c.aggregate([{ $project: { r: { $range: [0, 1e9] } } }])', /more than 100,000/)
  })

  it('marks user errors as user-facing and serializes them', () => {
    const outcome = executeQuery({ c: DOCS }, 'db.c.find({ a: { $bad: 1 } })')
    expect(outcome.ok).toBe(false)
    expect(outcome.error.userFacing).toBe(true)
  })
})

describe('filter semantics', () => {
  it('matches a value inside an array field', () => {
    expect(ids(run('db.c.find({ tags: "a" })'))).toEqual([1])
    expect(ids(run('db.c.find({ tags: { $in: ["c", "zzz"] } })'))).toEqual([2])
    expect(ids(run('db.c.find({ tags: ["a", "b"] })'))).toEqual([1])
  })

  it('walks dotted paths into arrays of documents', () => {
    expect(ids(run('db.c.find({ "items.n": "z" })'))).toEqual([2])
    expect(ids(run('db.c.find({ "items.q": { $gt: 4 } })'))).toEqual([1])
    expect(ids(run('db.c.find({ "items.0.n": "x" })'))).toEqual([1])
  })

  it('$ne and $nin exclude arrays containing the value', () => {
    expect(ids(run('db.c.find({ tags: { $ne: "a" } })'))).toEqual([2, 3, 4])
    expect(ids(run('db.c.find({ tags: { $nin: ["a", "c"] } })'))).toEqual([3, 4])
  })

  it('compares only within the same BSON type', () => {
    expect(ids(run('db.c.find({ score: { $gt: 0 } })'))).toEqual([1])
    expect(ids(run('db.c.find({ score: { $gte: "a" } })'))).toEqual([3])
    expect(ids(run('db.c.find({ score: { $lt: 100 } })'))).toEqual([1])
  })

  it('regex only matches strings', () => {
    expect(ids(run('db.c.find({ score: /n/ })'))).toEqual([3])
    expect(ids(run('db.c.find({ tags: /^[ab]$/ })'))).toEqual([1])
  })

  it('$expr no longer skips the rest of the filter', () => {
    expect(run('db.c.find({ $expr: { $eq: [1, 1] }, _id: 999 })')).toEqual([])
  })

  it('$expr supports the full expression language', () => {
    expect(ids(run('db.c.find({ $expr: { $gt: [{ $size: { $ifNull: ["$tags", []] } }, 1] } })'))).toEqual([1])
    expectError('db.c.find({ $expr: { $nope: [1, 2] } })', /Unknown expression operator/)
  })

  it('matches embedded documents exactly', () => {
    const seed = { c: [{ _id: 1, a: { x: 1, y: 2 } }, { _id: 2, a: { x: 1 } }] }
    expect(ids(run('db.c.find({ a: { x: 1 } })', seed))).toEqual([2])
  })

  it('$elemMatch works with operator-only conditions on scalars', () => {
    const seed = { c: [{ _id: 1, v: [1, 8] }, { _id: 2, v: [4, 6] }] }
    expect(ids(run('db.c.find({ v: { $elemMatch: { $gt: 3, $lt: 7 } } })', seed))).toEqual([2])
  })
})

describe('BSON ordering', () => {
  it('orders mixed types like MongoDB', () => {
    const vals = [true, 'b', new Date(0), 2, null, { a: 1 }, [1]]
    expect([...vals].sort(compareValues)).toEqual([null, 2, 'b', { a: 1 }, [1], true, new Date(0)])
  })
})

describe('cursor chains', () => {
  const seed = { c: [{ v: 3, _id: 1 }, { v: 1, _id: 2 }, { v: 2, _id: 3 }] }

  it('always sorts before limiting', () => {
    expect(run('db.c.find().limit(2).sort({ v: 1 })', seed).map((d) => d.v)).toEqual([1, 2])
  })

  it('applies skip before limit', () => {
    expect(run('db.c.find().limit(1).skip(1).sort({ v: 1 })', seed).map((d) => d.v)).toEqual([2])
  })

  it('treats limit(0) as no limit', () => {
    expect(run('db.c.find().limit(0)', seed)).toHaveLength(3)
  })

  it('sorts on a field removed by the projection', () => {
    expect(run('db.c.find({}, { _id: 1 }).sort({ v: -1 })', seed)).toEqual([{ _id: 1 }, { _id: 3 }, { _id: 2 }])
  })

  it('count() ignores limit; size() applies it', () => {
    expect(run('db.c.find().limit(1).count()', seed)).toBe(3)
    expect(run('db.c.find().limit(1).size()', seed)).toBe(1)
  })

  it('rejects mixed inclusion/exclusion projections', () => {
    expectError('db.c.find({}, { v: 1, x: 0 })', /Can't mix inclusion and exclusion/, seed)
  })
})

describe('writes', () => {
  it('insertOne returns a mongosh-style acknowledgement', () => {
    expect(run('db.c.insertOne({ name: "Eve" })')).toEqual({ acknowledged: true, insertedId: 5 })
    expect(run('db.c.insertMany([{ a: 1 }, { a: 2 }])')).toEqual({ acknowledged: true, insertedIds: { 0: 5, 1: 6 } })
  })

  it('generates ObjectId-style ids once ids are not numeric', () => {
    const { insertedId } = run('db.c.insertOne({ a: 1 })', { c: [{ _id: 'abc' }] })
    expect(insertedId).toMatch(/^[0-9a-f]{24}$/)
  })

  it('only counts documents that actually changed', () => {
    expect(run('db.c.updateOne({ _id: 1 }, { $set: { score: 10 } })')).toMatchObject({ matchedCount: 1, modifiedCount: 0 })
    expect(run('db.c.updateMany({}, { $set: { score: 10 } })')).toMatchObject({ matchedCount: 4, modifiedCount: 3 })
  })

  it('upserts with fields from the filter', () => {
    const db = new Database({ c: DOCS })
    const res = db.execute('db.c.updateOne({ name: "Zed" }, { $set: { score: 1 }, $setOnInsert: { fresh: true } }, { upsert: true })').result
    expect(res).toEqual({ acknowledged: true, insertedId: 5, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 })
    expect(db.execute('db.c.findOne({ name: "Zed" })').result).toEqual({ _id: 5, name: 'Zed', score: 1, fresh: true })
  })

  it('refuses to change _id', () => {
    expectError('db.c.updateOne({ _id: 1 }, { $set: { _id: 9 } })', /immutable field '_id'/)
  })

  it('supports replaceOne and findOneAnd*', () => {
    const db = new Database({ c: DOCS })
    expect(db.execute('db.c.replaceOne({ _id: 2 }, { name: "B2" })').result).toMatchObject({ matchedCount: 1, modifiedCount: 1 })
    expect(db.execute('db.c.findOne({ _id: 2 })').result).toEqual({ _id: 2, name: 'B2' })
    expect(db.execute('db.c.findOneAndUpdate({ _id: 1 }, { $inc: { score: 5 } }, { returnDocument: "after" })').result.score).toBe(15)
    expect(db.execute('db.c.findOneAndDelete({ _id: 4 })').result.name).toBe('Dan')
    expect(db.execute('db.c.countDocuments()').result).toBe(3)
  })

  it('runs statements in order so you can write then read', () => {
    expect(run('db.c.deleteMany({ score: { $exists: false } })\ndb.c.countDocuments({})')).toBe(3)
  })

  it('creates a collection on first write and supports drop', () => {
    const db = new Database({})
    db.execute('db.fresh.find()')
    expect(db.execute('db.getCollectionNames()').result).toEqual([])
    db.execute('db.fresh.insertOne({ a: 1 })')
    expect(db.execute('db.getCollectionNames()').result).toEqual(['fresh'])
    expect(db.execute('db.fresh.drop()').result).toBe(true)
    expect(db.getState()).toEqual({})
  })

  it('distinct unwinds arrays', () => {
    expect(run('db.c.distinct("tags")')).toEqual(['a', 'b', 'c'])
  })

  it('$pull with an operator condition', () => {
    const db = new Database({ c: [{ _id: 1, v: [1, 5, 9] }] })
    db.execute('db.c.updateOne({ _id: 1 }, { $pull: { v: { $gte: 5 } } })')
    expect(db.getState().c[0].v).toEqual([1])
  })
})

describe('aggregation', () => {
  it('$sum ignores non-numbers instead of counting them', () => {
    expect(run('db.c.aggregate([{ $group: { _id: null, s: { $sum: "$score" }, n: { $sum: 1 } } }])')).toEqual([{ _id: null, s: 10, n: 4 }])
  })

  it('$min/$max ignore nulls and $avg of nothing is null', () => {
    const seed = { c: [{ v: null }, { v: 3 }, {}, { v: 1 }] }
    expect(run('db.c.aggregate([{ $group: { _id: null, lo: { $min: "$v" }, hi: { $max: "$v" }, none: { $avg: "$nope" } } }])', seed))
      .toEqual([{ _id: null, lo: 1, hi: 3, none: null }])
  })

  it('$stdDevPop / $stdDevSamp follow the operator, not the field name', () => {
    const seed = { c: [{ v: 2 }, { v: 4 }] }
    expect(run('db.c.aggregate([{ $group: { _id: null, a: { $stdDevPop: "$v" }, b: { $stdDevSamp: "$v" } } }])', seed))
      .toEqual([{ _id: null, a: 1, b: Math.round(Math.SQRT2 * 1e10) / 1e10 }])
  })

  it('groups by dates as dates and by objects regardless of key order', () => {
    const d = new Date('2025-01-01')
    const seed = { c: [{ d, a: 1, b: 2 }, { d, a: 1, b: 2 }] }
    const [byDate] = run('db.c.aggregate([{ $group: { _id: "$d", n: { $sum: 1 } } }])', seed)
    expect(byDate._id).toBeInstanceOf(Date)
    expect(byDate.n).toBe(2)
    expect(run('db.c.aggregate([{ $group: { _id: { a: "$a", b: "$b" }, n: { $sum: 1 } } }])', seed)).toEqual([{ _id: { a: 1, b: 2 }, n: 2 }])
  })

  it('groups missing and null together', () => {
    expect(run('db.c.aggregate([{ $group: { _id: "$score", n: { $sum: 1 } } }])').find((g) => g._id === null).n).toBe(2)
  })

  it('$lookup matches array local fields and missing values', () => {
    const seed = {
      orders: [{ _id: 1, items: [10, 11] }, { _id: 2 }],
      products: [{ _id: 10 }, { _id: 11 }, { _id: 12, sku: null }],
    }
    const r = run('db.orders.aggregate([{ $lookup: { from: "products", localField: "items", foreignField: "_id", as: "p" } }])', seed)
    expect(ids(r[0].p)).toEqual([10, 11])
    const r2 = run('db.orders.aggregate([{ $lookup: { from: "products", localField: "sku", foreignField: "sku", as: "p" } }])', seed)
    expect(r2[1].p).toHaveLength(3) // missing sku matches null/missing in every product
  })

  it('$lookup results are copies, not references to the foreign collection', () => {
    const seed = { a: [{ _id: 1, k: 1 }], b: [{ _id: 1, k: 1, tag: 'x' }] }
    const db = new Database(seed)
    const [doc] = db.execute('db.a.aggregate([{ $lookup: { from: "b", localField: "k", foreignField: "k", as: "m" } }])').result
    doc.m[0].tag = 'changed'
    expect(db.getState().b[0].tag).toBe('x')
  })

  it('$lookup let variables survive values that start with $', () => {
    const seed = { a: [{ _id: 1, price: '$5' }], b: [{ _id: 1, price: '$5' }, { _id: 2, price: '$6' }] }
    const r = run('db.a.aggregate([{ $lookup: { from: "b", let: { p: "$price" }, pipeline: [{ $match: { $expr: { $eq: ["$price", "$$p"] } } }], as: "m" } }])', seed)
    expect(ids(r[0].m)).toEqual([1])
  })

  it('$bucket omits empty buckets and rejects unplaceable values without a default', () => {
    const seed = { c: [{ v: 1 }, { v: 25 }] }
    expect(run('db.c.aggregate([{ $bucket: { groupBy: "$v", boundaries: [0, 10, 20, 30] } }])', seed))
      .toEqual([{ _id: 0, count: 1 }, { _id: 20, count: 1 }])
    expectError('db.c.aggregate([{ $bucket: { groupBy: "$v", boundaries: [0, 10] } }])', /no default/, seed)
  })

  it('$count on no documents returns nothing', () => {
    expect(run('db.c.aggregate([{ $match: { _id: 99 } }, { $count: "n" }])')).toEqual([])
  })

  it('$unwind treats a scalar as a one-element array and requires $', () => {
    expect(run('db.c.aggregate([{ $match: { _id: 1 } }, { $unwind: "$name" }])')).toHaveLength(1)
    expectError('db.c.aggregate([{ $unwind: "tags" }])', /starts with \$/)
  })

  it('arithmetic with null returns null; dividing by zero is an error', () => {
    expect(run('db.c.aggregate([{ $match: { _id: 2 } }, { $project: { x: { $add: ["$score", 1] } } }])')).toEqual([{ _id: 2, x: null }])
    expectError('db.c.aggregate([{ $project: { x: { $divide: [1, 0] } } }])', /divide by zero/)
  })

  it('$concat returns null for missing parts and rejects numbers', () => {
    expect(run('db.c.aggregate([{ $match: { _id: 4 } }, { $project: { x: { $concat: ["$name", "$nope"] } } }])')).toEqual([{ _id: 4, x: null }])
    expectError('db.c.aggregate([{ $project: { x: { $concat: ["a", 1] } } }])', /only joins strings/)
  })

  it('$toDate converts invalid input to an error, not Invalid Date', () => {
    expectError('db.c.aggregate([{ $project: { x: { $toDate: "nope" } } }])', /Can't convert/)
  })

  it('$convert honours onError', () => {
    expect(run('db.c.aggregate([{ $match: { _id: 3 } }, { $project: { x: { $convert: { input: "$score", to: "int", onError: -1 } } } }])'))
      .toEqual([{ _id: 3, x: -1 }])
  })

  it('$$ROOT and $$NOW are available', () => {
    const [r] = run('db.c.aggregate([{ $match: { _id: 4 } }, { $project: { _id: 0, doc: "$$ROOT", now: { $type: "$$NOW" } } }])')
    expect(r).toEqual({ doc: { _id: 4, name: 'Dan' }, now: 'date' })
  })

  it('$sortByCount groups and sorts', () => {
    const seed = { c: [{ g: 'a' }, { g: 'b' }, { g: 'b' }] }
    expect(run('db.c.aggregate([{ $sortByCount: "$g" }])', seed)).toEqual([{ _id: 'b', count: 2 }, { _id: 'a', count: 1 }])
  })
})

describe('dates', () => {
  const seed = { e: [{ _id: 1, ts: new Date('2024-03-15T23:30:00Z') }] }

  it('$dateToString replaces every token and honours timezone', () => {
    const [r] = run(`db.e.aggregate([{ $project: {
      utc: { $dateToString: { format: "%Y-%m-%d %H:%M %Y", date: "$ts" } },
      ny: { $dateToString: { format: "%Y-%m-%d %H:%M %z", date: "$ts", timezone: "America/New_York" } },
      plus: { $dateToString: { format: "%d %H:%M", date: "$ts", timezone: "+05:30" } }
    } }])`, seed)
    expect(r.utc).toBe('2024-03-15 23:30 2024')
    expect(r.ny).toBe('2024-03-15 19:30 -0400')
    expect(r.plus).toBe('16 05:00')
  })

  it('$dateFromString honours format and timezone', () => {
    const [r] = run(`db.e.aggregate([{ $project: {
      a: { $dateFromString: { dateString: "15/03/2024 10:05", format: "%d/%m/%Y %H:%M" } },
      b: { $dateFromString: { dateString: "2024-03-15T10:00:00", timezone: "+02:00" } },
      c: { $dateFromString: { dateString: "garbage", onError: "bad" } }
    } }])`, seed)
    expect(r.a).toEqual(new Date('2024-03-15T10:05:00Z'))
    expect(r.b).toEqual(new Date('2024-03-15T08:00:00Z'))
    expect(r.c).toBe('bad')
  })
})

describe('result comparison', () => {
  it('ignores key order in nested objects', () => {
    expect(compareResults([{ a: { x: 1, y: 2 } }], [{ a: { y: 2, x: 1 } }])).toBe(true)
  })

  it('distinguishes dates from their string form', () => {
    expect(compareResults([{ d: new Date(0) }], [{ d: new Date(0).toISOString() }])).toBe(false)
  })
})
