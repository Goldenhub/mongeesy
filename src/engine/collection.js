import { evaluateQuery, matchesCondition } from './operators.js'
import { executePipeline } from './pipeline-engine.js'
import {
  deepEqual, compareValues, getNestedValue, setNestedValue, unsetNestedValue,
  getPathValues, isPlainObject,
} from './utils.js'
import { QueryError, unknownMessage } from './errors.js'
import { generateObjectId } from './mongosh-parser.js'

export { getNestedValue, setNestedValue, unsetNestedValue }

const UPDATE_OPERATORS = [
  '$set', '$unset', '$inc', '$mul', '$min', '$max', '$currentDate', '$push', '$pop',
  '$pull', '$pullAll', '$addToSet', '$rename', '$bit', '$setOnInsert',
]

export class Collection {
  constructor(name, docs = []) {
    this.name = name
    this.docs = docs.map((d) => structuredClone(d))
  }

  // Cursor semantics: filter, then sort, skip, limit, and only then project,
  // so you can sort on a field you don't return.
  find(query, projection, { sort, skip = 0, limit = 0 } = {}) {
    validateFilter(query)
    validateProjection(projection)
    let results = this.docs.filter((doc) => evaluateQuery(doc, query ?? {}))
    if (sort) results = sortDocs(results, sort)
    if (skip) results = results.slice(skip)
    if (limit) results = results.slice(0, Math.abs(limit))
    results = results.map((doc) => structuredClone(doc))
    if (projection && Object.keys(projection).length > 0) {
      results = results.map((doc) => applyProjection(doc, projection))
    }
    return results
  }

  findOne(query, projection) {
    return this.find(query, projection, { limit: 1 })[0] ?? null
  }

  insertOne(doc) {
    if (!isPlainObject(doc)) throw new QueryError('insertOne() needs a document object, e.g. insertOne({ title: "Dune" })')
    const id = this.insertDoc(doc)
    return { acknowledged: true, insertedId: id }
  }

  insertMany(docs) {
    if (!Array.isArray(docs)) throw new QueryError('insertMany() needs an array of documents, e.g. insertMany([{ a: 1 }, { a: 2 }])')
    if (docs.length === 0) throw new QueryError('insertMany() needs at least one document')
    const insertedIds = {}
    docs.forEach((doc, i) => {
      if (!isPlainObject(doc)) throw new QueryError(`insertMany(): item ${i} is not a document object`)
      insertedIds[i] = this.insertDoc(doc)
    })
    return { acknowledged: true, insertedIds }
  }

  insertDoc(doc) {
    const clone = structuredClone(doc)
    if (clone._id === undefined) clone._id = this.generateId()
    if (this.docs.some((d) => deepEqual(d._id, clone._id))) {
      throw new QueryError(`E11000 duplicate key error: a document with _id ${JSON.stringify(clone._id)} already exists in ${this.name}`)
    }
    const { _id, ...rest } = clone
    this.docs.push({ _id, ...rest })
    return _id
  }

  // Numeric ids keep the sample data readable; once a collection holds
  // non-numeric ids we fall back to ObjectId-style hex strings.
  generateId() {
    if (this.docs.every((d) => typeof d._id === 'number')) {
      return this.docs.reduce((max, d) => Math.max(max, d._id), 0) + 1
    }
    return generateObjectId()
  }

  updateOne(filter, update, options = {}) {
    return this.updateDocs(filter, update, options, false)
  }

  updateMany(filter, update, options = {}) {
    return this.updateDocs(filter, update, options, true)
  }

  updateDocs(filter, update, options, multi) {
    const method = multi ? 'updateMany' : 'updateOne'
    requireFilter(method, filter)
    validateUpdate(method, update)
    let matchedCount = 0
    let modifiedCount = 0
    for (let i = 0; i < this.docs.length; i++) {
      if (!evaluateQuery(this.docs[i], filter)) continue
      matchedCount++
      const updated = applyUpdate(structuredClone(this.docs[i]), update)
      assertSameId(this.docs[i], updated)
      if (!deepEqual(updated, this.docs[i])) {
        this.docs[i] = updated
        modifiedCount++
      }
      if (!multi) break
    }
    let insertedId = null
    if (matchedCount === 0 && options?.upsert) {
      insertedId = this.insertDoc(applyUpdate(seedFromFilter(filter), update, { isUpsert: true }))
    }
    return { acknowledged: true, insertedId, matchedCount, modifiedCount, upsertedCount: insertedId === null ? 0 : 1 }
  }

  replaceOne(filter, replacement, options = {}) {
    requireFilter('replaceOne', filter)
    validateReplacement(replacement)
    const idx = this.docs.findIndex((doc) => evaluateQuery(doc, filter))
    if (idx === -1) {
      if (!options?.upsert) return { acknowledged: true, insertedId: null, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
      const seed = seedFromFilter(filter)
      const insertedId = this.insertDoc({ ...(seed._id !== undefined ? { _id: seed._id } : {}), ...structuredClone(replacement) })
      return { acknowledged: true, insertedId, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
    }
    const next = { _id: this.docs[idx]._id, ...structuredClone(replacement) }
    assertSameId(this.docs[idx], next)
    const modified = !deepEqual(next, this.docs[idx])
    this.docs[idx] = next
    return { acknowledged: true, insertedId: null, matchedCount: 1, modifiedCount: modified ? 1 : 0, upsertedCount: 0 }
  }

  findOneAndUpdate(filter, update, options = {}) {
    requireFilter('findOneAndUpdate', filter)
    validateUpdate('findOneAndUpdate', update)
    return this.findOneAndModify(filter, options, (doc) => applyUpdate(doc, update), (seed) => applyUpdate(seed, update, { isUpsert: true }))
  }

  findOneAndReplace(filter, replacement, options = {}) {
    requireFilter('findOneAndReplace', filter)
    validateReplacement(replacement)
    return this.findOneAndModify(
      filter,
      options,
      (doc) => ({ _id: doc._id, ...structuredClone(replacement) }),
      (seed) => ({ ...(seed._id !== undefined ? { _id: seed._id } : {}), ...structuredClone(replacement) }),
    )
  }

  findOneAndModify(filter, options, modify, buildUpsert) {
    const returnAfter = options?.returnDocument === 'after' || options?.returnNewDocument === true
    const target = this.find(filter, undefined, { sort: options?.sort, limit: 1 })[0]
    if (!target) {
      if (!options?.upsert) return null
      const id = this.insertDoc(buildUpsert(seedFromFilter(filter)))
      if (!returnAfter) return null
      return this.project(this.docs.find((d) => deepEqual(d._id, id)), options?.projection)
    }
    const idx = this.docs.findIndex((d) => deepEqual(d._id, target._id))
    const before = this.docs[idx]
    const after = modify(structuredClone(before))
    assertSameId(before, after)
    this.docs[idx] = after
    return this.project(returnAfter ? after : before, options?.projection)
  }

  findOneAndDelete(filter, options = {}) {
    requireFilter('findOneAndDelete', filter)
    const target = this.find(filter, undefined, { sort: options?.sort, limit: 1 })[0]
    if (!target) return null
    const idx = this.docs.findIndex((d) => deepEqual(d._id, target._id))
    const [removed] = this.docs.splice(idx, 1)
    return this.project(removed, options?.projection)
  }

  project(doc, projection) {
    const clone = structuredClone(doc)
    if (!projection || Object.keys(projection).length === 0) return clone
    validateProjection(projection)
    return applyProjection(clone, projection)
  }

  deleteOne(filter) {
    requireFilter('deleteOne', filter)
    const idx = this.docs.findIndex((doc) => evaluateQuery(doc, filter))
    if (idx === -1) return { acknowledged: true, deletedCount: 0 }
    this.docs.splice(idx, 1)
    return { acknowledged: true, deletedCount: 1 }
  }

  deleteMany(filter) {
    requireFilter('deleteMany', filter)
    const before = this.docs.length
    this.docs = this.docs.filter((doc) => !evaluateQuery(doc, filter))
    return { acknowledged: true, deletedCount: before - this.docs.length }
  }

  countDocuments(query, options = {}) {
    return this.find(query, undefined, { skip: options?.skip ?? 0, limit: options?.limit ?? 0 }).length
  }

  estimatedDocumentCount() {
    return this.docs.length
  }

  // Like MongoDB, array values are unwound: distinct("tags") lists each tag
  distinct(field, query) {
    if (typeof field !== 'string' || !field) throw new QueryError('distinct() needs a field name string, e.g. distinct("genre")')
    const values = []
    for (const doc of this.find(query)) {
      for (const val of getPathValues(doc, field)) {
        const items = Array.isArray(val) ? val : [val]
        for (const item of items) {
          if (item !== undefined && !values.some((v) => deepEqual(v, item))) values.push(item)
        }
      }
    }
    return values.sort(compareValues)
  }

  aggregate(pipeline, collectionsMap = {}) {
    const ctx = { collection: this, collections: collectionsMap }
    return executePipeline(ctx, pipeline)
  }

  reset(docs) {
    this.docs = docs.map((d) => structuredClone(d))
  }
}

export function sortDocs(docs, sortSpec) {
  const entries = validateSort(sortSpec)
  return [...docs].sort((a, b) => {
    for (const [field, order] of entries) {
      const cmp = compareValues(getNestedValue(a, field), getNestedValue(b, field))
      if (cmp !== 0) return cmp * order
    }
    return 0
  })
}

export function validateSort(sortSpec) {
  if (!isPlainObject(sortSpec) || Object.keys(sortSpec).length === 0) {
    throw new QueryError('A sort needs an object like { price: 1 } (ascending) or { price: -1 } (descending)')
  }
  return Object.entries(sortSpec).map(([field, order]) => {
    const dir = order === 1 || order === 'asc' || order === 'ascending' ? 1
      : order === -1 || order === 'desc' || order === 'descending' ? -1 : null
    if (dir === null) throw new QueryError(`Sort direction for '${field}' must be 1 or -1, got ${JSON.stringify(order)}`)
    return [field, dir]
  })
}

function validateFilter(query) {
  if (query !== undefined && query !== null && !isPlainObject(query)) {
    throw new QueryError('A filter must be an object, for example { genre: "fiction" }')
  }
}

function requireFilter(method, filter) {
  if (filter === undefined) {
    throw new QueryError(`${method}() needs a filter as its first argument. Use {} to match every document.`)
  }
  validateFilter(filter)
}

function validateUpdate(method, update) {
  if (Array.isArray(update)) throw new QueryError('Pipeline-style updates ([...]) aren\'t supported here. Use update operators like { $set: {...} }.')
  if (!isPlainObject(update) || Object.keys(update).length === 0) {
    throw new QueryError(`${method}() needs an update document as its second argument, e.g. { $set: { rating: 4.5 } }`)
  }
  for (const [op, operand] of Object.entries(update)) {
    if (!op.startsWith('$')) {
      throw new QueryError(`Update documents must use operators like $set. To set '${op}', write { $set: { ${op}: ... } }. (To replace a whole document, use replaceOne.)`)
    }
    if (!UPDATE_OPERATORS.includes(op)) throw new QueryError(unknownMessage('update operator', op, UPDATE_OPERATORS))
    if (!isPlainObject(operand)) throw new QueryError(`${op} needs an object of fields, e.g. { ${op}: { field: value } }`)
    for (const path of Object.keys(operand)) {
      if (path.split('.').some((p) => p === '$' || p.startsWith('$['))) {
        throw new QueryError(`Positional updates like '${path}' aren't supported in this sandbox. Update the whole array or use $push / $pull.`)
      }
    }
  }
}

function validateReplacement(replacement) {
  if (!isPlainObject(replacement)) throw new QueryError('replaceOne() needs a replacement document')
  const op = Object.keys(replacement).find((k) => k.startsWith('$'))
  if (op) throw new QueryError(`Replacement documents can't contain operators like ${op}. Use updateOne() for partial updates.`)
}

function validateProjection(projection) {
  if (projection === undefined || projection === null) return
  if (!isPlainObject(projection)) throw new QueryError('A projection must be an object, e.g. { title: 1, _id: 0 }')
  let include = null
  for (const [key, val] of Object.entries(projection)) {
    if (isPlainObject(val)) {
      if (!('$slice' in val)) throw new QueryError(`Unsupported projection for '${key}'. Use 1, 0 or { $slice: n }.`)
      continue
    }
    if (key === '_id') continue
    const isInclude = Boolean(val)
    if (include === null) include = isInclude
    else if (include !== isInclude) {
      throw new QueryError(`Can't mix inclusion and exclusion in one projection ('${key}'). Only _id may be excluded alongside included fields.`)
    }
  }
}

function assertSameId(before, after) {
  if (!deepEqual(before._id, after._id)) {
    throw new QueryError("Performing an update on the path '_id' would modify the immutable field '_id'")
  }
}

// Equality conditions in an upsert's filter become fields of the new document
function seedFromFilter(filter) {
  const doc = {}
  const add = (f) => {
    for (const [key, val] of Object.entries(f ?? {})) {
      if (key === '$and' && Array.isArray(val)) val.forEach(add)
      if (key.startsWith('$')) continue
      if (isPlainObject(val) && Object.keys(val)[0]?.startsWith('$')) {
        if ('$eq' in val) setNestedValue(doc, key, structuredClone(val.$eq))
      } else if (!(val instanceof RegExp)) {
        setNestedValue(doc, key, structuredClone(val))
      }
    }
  }
  add(filter)
  return doc
}

function applyProjection(doc, projection) {
  const entries = Object.entries(projection)
  // { _id: 1 } on its own is an inclusion projection returning only _id
  const includes = entries.some(([key, v]) => key !== '_id' && !isPlainObject(v) && Boolean(v))
    || (entries.length === 1 && entries[0][0] === '_id' && Boolean(entries[0][1]))
  let result = {}

  if (includes) {
    for (const [key, val] of entries) {
      if (!isPlainObject(val) && val) {
        const srcVal = getNestedValue(doc, key)
        if (srcVal !== undefined) setNestedValue(result, key, structuredClone(srcVal))
      }
      if (isPlainObject(val) && doc[key] !== undefined) result[key] = doc[key]
    }
    if (!('_id' in projection) || projection._id) {
      result = { _id: structuredClone(doc._id), ...result }
    }
  } else {
    Object.assign(result, structuredClone(doc))
    for (const [key, val] of entries) {
      if (!isPlainObject(val) && !val) unsetNestedValue(result, key)
    }
  }

  for (const [key, val] of entries) {
    if (isPlainObject(val) && '$slice' in val && result[key] !== undefined) {
      result[key] = applySlice(getNestedValue(doc, key), val.$slice)
    }
  }

  return result
}

function applySlice(arr, n) {
  if (!Array.isArray(arr)) return arr
  if (Array.isArray(n)) {
    const [skip, limit] = n
    const start = skip < 0 ? Math.max(arr.length + skip, 0) : skip
    return arr.slice(start, start + limit)
  }
  if (n >= 0) return arr.slice(0, n)
  return arr.slice(n)
}

function typeName(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (v instanceof Date) return 'date'
  return typeof v
}

function numericOperand(op, key, val) {
  if (typeof val !== 'number') throw new QueryError(`${op} needs a number for '${key}', got ${typeName(val)}`)
}

function arrayAt(doc, op, key) {
  const current = getNestedValue(doc, key)
  if (current !== undefined && !Array.isArray(current)) {
    throw new QueryError(`${op} needs '${key}' to be an array, but it is a ${typeName(current)}`)
  }
  return current
}

function sortArray(arr, sort) {
  arr.sort((a, b) => {
    if (typeof sort === 'number') return sort * compareValues(a, b)
    for (const [field, order] of Object.entries(sort)) {
      const cmp = compareValues(getNestedValue(a, field), getNestedValue(b, field))
      if (cmp !== 0) return cmp * order
    }
    return 0
  })
}

export function applyUpdate(doc, update, { isUpsert = false } = {}) {
  for (const [op, operand] of Object.entries(update)) {
    switch (op) {
      case '$set':
        for (const [key, val] of Object.entries(operand)) setNestedValue(doc, key, structuredClone(val))
        break
      case '$setOnInsert':
        if (isUpsert) {
          for (const [key, val] of Object.entries(operand)) setNestedValue(doc, key, structuredClone(val))
        }
        break
      case '$unset':
        for (const key of Object.keys(operand)) unsetNestedValue(doc, key)
        break
      case '$inc':
      case '$mul':
        for (const [key, val] of Object.entries(operand)) {
          numericOperand(op, key, val)
          const current = getNestedValue(doc, key)
          if (current !== undefined && typeof current !== 'number') {
            throw new QueryError(`Cannot apply ${op} to '${key}' because it is a ${typeName(current)}, not a number`)
          }
          const next = op === '$inc' ? (current ?? 0) + val : (current ?? 0) * val
          setNestedValue(doc, key, Math.round(next * 1e10) / 1e10)
        }
        break
      case '$min':
      case '$max':
        for (const [key, val] of Object.entries(operand)) {
          const current = getNestedValue(doc, key)
          const cmp = compareValues(val, current)
          if (current === undefined || (op === '$min' ? cmp < 0 : cmp > 0)) setNestedValue(doc, key, structuredClone(val))
        }
        break
      case '$currentDate':
        for (const key of Object.keys(operand)) setNestedValue(doc, key, new Date())
        break
      case '$push':
        for (const [key, val] of Object.entries(operand)) {
          const current = arrayAt(doc, op, key) ?? []
          if (isPlainObject(val) && '$each' in val) {
            if (!Array.isArray(val.$each)) throw new QueryError('$each needs an array')
            const items = val.$each.map((v) => structuredClone(v))
            if (val.$position != null) {
              const pos = val.$position < 0 ? Math.max(current.length + val.$position, 0) : val.$position
              current.splice(pos, 0, ...items)
            } else {
              current.push(...items)
            }
            if (val.$sort != null) sortArray(current, val.$sort)
            if (val.$slice != null) {
              if (val.$slice >= 0) current.splice(val.$slice)
              else current.splice(0, Math.max(current.length + val.$slice, 0))
            }
          } else {
            current.push(structuredClone(val))
          }
          setNestedValue(doc, key, current)
        }
        break
      case '$addToSet':
        for (const [key, val] of Object.entries(operand)) {
          const current = arrayAt(doc, op, key) ?? []
          const items = isPlainObject(val) && '$each' in val ? val.$each : [val]
          for (const item of items) {
            if (!current.some((existing) => deepEqual(existing, item))) current.push(structuredClone(item))
          }
          setNestedValue(doc, key, current)
        }
        break
      case '$pop':
        for (const [key, val] of Object.entries(operand)) {
          if (val !== 1 && val !== -1) throw new QueryError('$pop needs 1 (remove last) or -1 (remove first)')
          const current = arrayAt(doc, op, key)
          if (!current) continue
          if (val === 1) current.pop()
          else current.shift()
        }
        break
      case '$pull':
        for (const [key, val] of Object.entries(operand)) {
          const current = arrayAt(doc, op, key)
          if (!current) continue
          setNestedValue(doc, key, current.filter((item) => {
            if (isPlainObject(val) && !Object.keys(val)[0]?.startsWith('$')) {
              return !(isPlainObject(item) && evaluateQuery(item, val))
            }
            return !matchesCondition(item, val)
          }))
        }
        break
      case '$pullAll':
        for (const [key, val] of Object.entries(operand)) {
          if (!Array.isArray(val)) throw new QueryError('$pullAll needs an array of values to remove')
          const current = arrayAt(doc, op, key)
          if (!current) continue
          setNestedValue(doc, key, current.filter((item) => !val.some((v) => deepEqual(item, v))))
        }
        break
      case '$rename':
        for (const [oldName, newName] of Object.entries(operand)) {
          if (typeof newName !== 'string' || newName === oldName) {
            throw new QueryError(`$rename needs a different new field name for '${oldName}'`)
          }
          const val = getNestedValue(doc, oldName)
          if (val !== undefined) {
            unsetNestedValue(doc, oldName)
            setNestedValue(doc, newName, val)
          }
        }
        break
      case '$bit':
        for (const [key, ops] of Object.entries(operand)) {
          const current = getNestedValue(doc, key) ?? 0
          if (!Number.isInteger(current)) throw new QueryError(`$bit needs '${key}' to be an integer`)
          let result = current
          if ('and' in ops) result = result & ops.and
          if ('or' in ops) result = result | ops.or
          if ('xor' in ops) result = result ^ ops.xor
          setNestedValue(doc, key, result)
        }
        break
    }
  }
  return doc
}
