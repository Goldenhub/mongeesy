import { describe, it, expect } from 'vitest'
import { Database } from '../engine/query-engine.js'
import { compareResults } from '../utils/compare-results.js'
import lessons from './index.js'

describe('all lessons', () => {
  lessons.forEach((lesson) => {
    it(`lesson ${lesson.id}: ${lesson.title}`, () => {
      const db = new Database(lesson.collections)
      const { result } = db.execute(lesson.defaultQuery)
      const resultArray = Array.isArray(result) ? result : [result]
      const match = compareResults(resultArray, lesson.expectedResult)
      if (!match) {
        expect(resultArray).toEqual(lesson.expectedResult)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Engine edge-case tests
// ---------------------------------------------------------------------------

const PEOPLE = [
  { _id: 1, name: 'Alice', age: 30, score: null, tags: ['a', 'b', 'c'], address: { city: 'NY', zip: '10001' } },
  { _id: 2, name: 'Bob', age: 17, score: 80, tags: ['b', 'd'], address: { city: 'LA', zip: '90001' } },
  { _id: 3, name: 'Carol', age: 25, score: 95, tags: ['a'], address: { city: 'NY', zip: '10002' } },
  { _id: 4, name: 'Dan' }, // missing: age, score, tags, address
]

const ORDERS = [
  { _id: 1, customerId: 10, amount: 50 },
  { _id: 2, customerId: 11, amount: 200 },
  { _id: 3, customerId: 10, amount: 150 },
]

const CUSTOMERS = [
  { _id: 10, name: 'Alice Corp' },
  { _id: 11, name: 'Bob LLC' },
]

function db(collections) {
  return new Database(collections)
}

function run(database, query) {
  const { result } = database.execute(query)
  return Array.isArray(result) ? result : [result]
}

// --- createCollection name check ----------------------------------------------

describe('createCollection validation', () => {
  it('wrong collection name does not satisfy expectedCollections', () => {
    const d = new Database({})
    d.execute('db.createCollection("wrongName")')
    const hasReviews = !!d.collections['reviews']
    expect(hasReviews).toBe(false)
  })

  it('correct collection name satisfies expectedCollections', () => {
    const d = new Database({})
    d.execute('db.createCollection("reviews")')
    const hasReviews = !!d.collections['reviews']
    expect(hasReviews).toBe(true)
  })
})

// --- $eq: null / null shorthand ------------------------------------------------

describe('$eq: null semantics', () => {
  it('shorthand { field: null } matches null value', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.find({ score: null })')
    expect(r.map((p) => p._id).sort()).toEqual([1, 4])
  })

  it('shorthand { field: null } matches missing field', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.find({ age: null })')
    expect(r.map((p) => p._id).sort()).toEqual([4])
  })

  it('{ field: { $eq: null } } matches null and missing', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.find({ score: { $eq: null } })')
    expect(r.map((p) => p._id).sort()).toEqual([1, 4])
  })
})

// --- $not (field-level) -------------------------------------------------------

describe('$not operator', () => {
  it('$not on $gt excludes matching docs', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.find({ age: { $not: { $gt: 20 } } })')
    // age > 20: Alice(30), Carol(25) → $not: Bob(17), Dan(missing age matches)
    expect(r.map((p) => p._id).sort()).toEqual([2, 4])
  })

  it('$not on $regex works', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.find({ name: { $not: /^A/ } })')
    expect(r.map((p) => p.name).sort()).toEqual(['Bob', 'Carol', 'Dan'])
  })
})

// --- $all, $size, $mod --------------------------------------------------------

describe('array/misc filter operators', () => {
  it('$all matches docs where array contains all values', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, "db.people.find({ tags: { $all: ['a', 'b'] } })")
    expect(r.map((p) => p._id)).toEqual([1])
  })

  it('$size matches array of exact length', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.find({ tags: { $size: 2 } })')
    expect(r.map((p) => p._id)).toEqual([2])
  })

  it('$mod filters by modulo', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.find({ age: { $mod: [5, 0] } })')
    // 30 % 5 === 0 (Alice), 25 % 5 === 0 (Carol)
    expect(r.map((p) => p._id).sort()).toEqual([1, 3])
  })
})

// --- $regex + $options --------------------------------------------------------

describe('$regex with $options string', () => {
  it('case-insensitive match via $options', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, "db.people.find({ name: { $regex: 'alice', $options: 'i' } })")
    expect(r.map((p) => p._id)).toEqual([1])
  })
})

// --- $avg skipping nulls ------------------------------------------------------

describe('$avg skips null and missing values', () => {
  it('averages only numeric values', () => {
    const d = db({ people: PEOPLE })
    // score: null(1), 80(2), 95(3), missing(4) → avg of 80+95 = 175/2 = 87.5
    const r = run(d, 'db.people.aggregate([{ $group: { _id: null, avg: { $avg: "$score" } } }])')
    expect(r[0].avg).toBeCloseTo(87.5, 5)
  })
})

// --- $unwind ------------------------------------------------------------------

describe('$unwind', () => {
  it('default: missing field produces no docs', () => {
    const d = db({ people: PEOPLE })
    // Dan has no tags
    const r = run(d, 'db.people.aggregate([{ $match: { _id: 4 } }, { $unwind: "$tags" }])')
    expect(r).toHaveLength(0)
  })

  it('preserveNullAndEmptyArrays: true passes doc through when field missing', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.aggregate([{ $match: { _id: 4 } }, { $unwind: { path: "$tags", preserveNullAndEmptyArrays: true } }])')
    expect(r).toHaveLength(1)
    expect(r[0]._id).toBe(4)
  })

  it('preserveNullAndEmptyArrays: true passes doc through when array empty', () => {
    const d = db({ items: [{ _id: 1, arr: [] }] })
    const r = run(d, 'db.items.aggregate([{ $unwind: { path: "$arr", preserveNullAndEmptyArrays: true } }])')
    expect(r).toHaveLength(1)
  })

  it('includeArrayIndex adds index field', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.aggregate([{ $match: { _id: 1 } }, { $unwind: { path: "$tags", includeArrayIndex: "idx" } }])')
    expect(r.map((x) => x.idx)).toEqual([0, 1, 2])
  })
})

// --- Nested projection --------------------------------------------------------

describe('nested field projection', () => {
  it('include dotted path returns nested key', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, "db.people.find({ _id: 1 }, { 'address.city': 1 })")
    expect(r[0]).toEqual({ _id: 1, address: { city: 'NY' } })
  })

  it('exclude dotted path removes nested key only', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, "db.people.find({ _id: 1 }, { 'address.zip': 0 })")
    expect(r[0].address).toEqual({ city: 'NY' })
    expect(r[0].address.zip).toBeUndefined()
  })
})

// --- $addToSet dedup ----------------------------------------------------------

describe('$addToSet object deduplication', () => {
  it('deduplicates objects regardless of key order', () => {
    const d = db({ items: [
      { _id: 1, val: { a: 1, b: 2 } },
      { _id: 2, val: { b: 2, a: 1 } },
    ] })
    const r = run(d, 'db.items.aggregate([{ $group: { _id: null, vals: { $addToSet: "$val" } } }])')
    expect(r[0].vals).toHaveLength(1)
  })
})

// --- Update operators ---------------------------------------------------------

describe('update operators', () => {
  it('$min updates only when new value is less', () => {
    const d = db({ people: PEOPLE })
    run(d, "db.people.updateOne({ _id: 2 }, { $min: { age: 20 } })")
    const r = run(d, 'db.people.find({ _id: 2 })')
    expect(r[0].age).toBe(17) // 17 < 20, no change
    run(d, "db.people.updateOne({ _id: 2 }, { $min: { age: 10 } })")
    const r2 = run(d, 'db.people.find({ _id: 2 })')
    expect(r2[0].age).toBe(10)
  })

  it('$max updates only when new value is greater', () => {
    const d = db({ people: PEOPLE })
    run(d, "db.people.updateOne({ _id: 2 }, { $max: { age: 10 } })")
    expect(run(d, 'db.people.find({ _id: 2 })')[0].age).toBe(17) // no change
    run(d, "db.people.updateOne({ _id: 2 }, { $max: { age: 25 } })")
    expect(run(d, 'db.people.find({ _id: 2 })')[0].age).toBe(25)
  })

  it('$push with $each appends multiple items', () => {
    const d = db({ people: PEOPLE })
    run(d, "db.people.updateOne({ _id: 3 }, { $push: { tags: { $each: ['x', 'y'] } } })")
    const tags = run(d, 'db.people.find({ _id: 3 })')[0].tags
    expect(tags).toEqual(['a', 'x', 'y'])
  })

  it('$push with $each + $slice retains last n items', () => {
    const d = db({ people: PEOPLE })
    run(d, "db.people.updateOne({ _id: 1 }, { $push: { tags: { $each: ['x', 'y'], $slice: 3 } } })")
    const tags = run(d, 'db.people.find({ _id: 1 })')[0].tags
    expect(tags).toHaveLength(3)
    expect(tags).toEqual(['a', 'b', 'c'])
  })

  it('$push with $each + $sort sorts after push', () => {
    const d = db({ people: PEOPLE })
    run(d, "db.people.updateOne({ _id: 2 }, { $push: { tags: { $each: ['a'], $sort: 1 } } })")
    const tags = run(d, 'db.people.find({ _id: 2 })')[0].tags
    expect(tags).toEqual([...tags].sort())
  })

  it('$pullAll removes all matching values', () => {
    const d = db({ people: PEOPLE })
    run(d, "db.people.updateOne({ _id: 1 }, { $pullAll: { tags: ['a', 'c'] } })")
    expect(run(d, 'db.people.find({ _id: 1 })')[0].tags).toEqual(['b'])
  })
})

// --- Pipeline stages: $replaceRoot, $set, $unset ----------------------------

describe('new pipeline stages', () => {
  it('$replaceRoot replaces doc with nested sub-doc', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.aggregate([{ $match: { _id: 1 } }, { $replaceRoot: { newRoot: "$address" } }])')
    expect(r[0]).toEqual({ city: 'NY', zip: '10001' })
  })

  it('$set adds computed fields (alias for $addFields)', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, "db.people.aggregate([{ $match: { _id: 2 } }, { $set: { doubled: { $multiply: ['$age', 2] } } }])")
    expect(r[0].doubled).toBe(34)
  })

  it('$unset removes a field', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.aggregate([{ $match: { _id: 1 } }, { $unset: "score" }])')
    expect(r[0].score).toBeUndefined()
  })

  it('$unset removes multiple fields', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, "db.people.aggregate([{ $match: { _id: 1 } }, { $unset: ['score', 'tags'] }])")
    expect(r[0].score).toBeUndefined()
    expect(r[0].tags).toBeUndefined()
  })
})

// --- Sort order correctness ---------------------------------------------------

describe('sort order (order-sensitive)', () => {
  it('find().sort ascending returns docs in correct order', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.find({ age: { $exists: true } }).sort({ age: 1 })')
    expect(r.map((p) => p.age)).toEqual([17, 25, 30])
  })

  it('find().sort descending returns docs in correct order', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.find({ age: { $exists: true } }).sort({ age: -1 })')
    expect(r.map((p) => p.age)).toEqual([30, 25, 17])
  })

  it('sort places null/missing last for ascending', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, 'db.people.find().sort({ age: 1 })')
    expect(r[r.length - 1]._id).toBe(4) // Dan has no age
  })
})

// --- Expression operators: $concat, $filter, $dateToString, $switch ----------

describe('aggregation expressions', () => {
  it('$concat joins strings', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, "db.people.aggregate([{ $match: { _id: 1 } }, { $addFields: { label: { $concat: ['Hello ', '$name'] } } }])")
    expect(r[0].label).toBe('Hello Alice')
  })

  it('$filter returns matching array elements', () => {
    const d = db({ nums: [{ _id: 1, vals: [1, 2, 3, 4, 5] }] })
    const r = run(d, "db.nums.aggregate([{ $addFields: { big: { $filter: { input: '$vals', as: 'v', cond: { $gt: ['$$v', 3] } } } } }])")
    expect(r[0].big).toEqual([4, 5])
  })

  it('$map transforms array elements', () => {
    const d = db({ nums: [{ _id: 1, vals: [1, 2, 3] }] })
    const r = run(d, "db.nums.aggregate([{ $addFields: { doubled: { $map: { input: '$vals', as: 'v', in: { $multiply: ['$$v', 2] } } } } }])")
    expect(r[0].doubled).toEqual([2, 4, 6])
  })

  it('$dateToString formats a date', () => {
    const d = db({ events: [{ _id: 1, ts: new Date('2024-03-15T10:30:00Z') }] })
    const r = run(d, "db.events.aggregate([{ $addFields: { day: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } } } }])")
    expect(r[0].day).toBe('2024-03-15')
  })

  it('$switch returns matched branch', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, `db.people.aggregate([
      { $match: { _id: { $in: [1, 2, 3] } } },
      { $addFields: { group: { $switch: {
        branches: [
          { case: { $gte: ['$age', 18] }, then: 'adult' }
        ],
        default: 'minor'
      } } } }
    ])`)
    const map = Object.fromEntries(r.map((x) => [x._id, x.group]))
    expect(map[1]).toBe('adult')
    expect(map[2]).toBe('minor')
    expect(map[3]).toBe('adult')
  })

  it('$reduce folds an array', () => {
    const d = db({ nums: [{ _id: 1, vals: [1, 2, 3, 4] }] })
    const r = run(d, "db.nums.aggregate([{ $addFields: { total: { $reduce: { input: '$vals', initialValue: 0, in: { $add: ['$$value', '$$this'] } } } } }])")
    expect(r[0].total).toBe(10)
  })

  it('$concatArrays merges arrays', () => {
    const d = db({ items: [{ _id: 1, a: [1, 2], b: [3, 4] }] })
    const r = run(d, "db.items.aggregate([{ $addFields: { merged: { $concatArrays: ['$a', '$b'] } } }])")
    expect(r[0].merged).toEqual([1, 2, 3, 4])
  })

  it('$arrayElemAt accesses element by index', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, "db.people.aggregate([{ $match: { _id: 1 } }, { $addFields: { first: { $arrayElemAt: ['$tags', 0] }, last: { $arrayElemAt: ['$tags', -1] } } }])")
    expect(r[0].first).toBe('a')
    expect(r[0].last).toBe('c')
  })

  it('$mergeObjects merges two objects', () => {
    const d = db({ people: PEOPLE })
    const r = run(d, "db.people.aggregate([{ $match: { _id: 1 } }, { $replaceRoot: { newRoot: { $mergeObjects: ['$address', { country: 'US' }] } } }])")
    expect(r[0]).toEqual({ city: 'NY', zip: '10001', country: 'US' })
  })

  it('math: $abs, $ceil, $floor, $round', () => {
    const d = db({ n: [{ _id: 1, v: -3.7 }] })
    const r = run(d, "db.n.aggregate([{ $addFields: { a: { $abs: '$v' }, c: { $ceil: '$v' }, f: { $floor: '$v' }, r: { $round: ['$v', 0] } } }])")
    expect(r[0].a).toBe(3.7)
    expect(r[0].c).toBe(-3)
    expect(r[0].f).toBe(-4)
    expect(r[0].r).toBe(-4)
  })

  it('$type returns correct type string', () => {
    const d = db({ mixed: [{ _id: 1, s: 'hello', n: 42, a: [], b: true, dt: new Date() }] })
    const r = run(d, "db.mixed.aggregate([{ $addFields: { ts: { $type: '$s' }, tn: { $type: '$n' }, ta: { $type: '$a' }, tb: { $type: '$b' }, tdt: { $type: '$dt' } } }])")
    expect(r[0].ts).toBe('string')
    expect(r[0].tn).toBe('int')
    expect(r[0].ta).toBe('array')
    expect(r[0].tb).toBe('bool')
    expect(r[0].tdt).toBe('date')
  })
})

// --- $lookup pipeline form ---------------------------------------------------

describe('$lookup pipeline form', () => {
  it('pipeline $lookup joins with sub-pipeline', () => {
    const d = db({ orders: ORDERS, customers: CUSTOMERS })
    const r = run(d, `db.orders.aggregate([
      { $lookup: {
        from: "customers",
        let: { cid: "$customerId" },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$cid"] } } }],
        as: "customer"
      } }
    ])`)
    expect(r).toHaveLength(3)
    expect(r[0].customer).toHaveLength(1)
    expect(r[0].customer[0].name).toBe('Alice Corp')
    expect(r[1].customer[0].name).toBe('Bob LLC')
  })
})

// --- Set operators -----------------------------------------------------------

describe('set expression operators', () => {
  it('$setUnion combines unique elements', () => {
    const d = db({ s: [{ _id: 1, a: [1, 2, 3], b: [2, 3, 4] }] })
    const r = run(d, "db.s.aggregate([{ $addFields: { u: { $setUnion: ['$a', '$b'] } } }])")
    expect(r[0].u.sort()).toEqual([1, 2, 3, 4])
  })

  it('$setIntersection returns common elements', () => {
    const d = db({ s: [{ _id: 1, a: [1, 2, 3], b: [2, 3, 4] }] })
    const r = run(d, "db.s.aggregate([{ $addFields: { i: { $setIntersection: ['$a', '$b'] } } }])")
    expect(r[0].i.sort()).toEqual([2, 3])
  })

  it('$setDifference returns elements only in first set', () => {
    const d = db({ s: [{ _id: 1, a: [1, 2, 3], b: [2, 3, 4] }] })
    const r = run(d, "db.s.aggregate([{ $addFields: { d: { $setDifference: ['$a', '$b'] } } }])")
    expect(r[0].d).toEqual([1])
  })
})
