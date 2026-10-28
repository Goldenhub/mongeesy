import { evaluateQuery } from './operators.js'
import {
  deepEqual, compareValues, typeRank, canonicalKey, isPlainObject, isTruthy,
  getNestedValue, setNestedValue, unsetNestedValue, getPathValues,
} from './utils.js'
import { QueryError, unknownMessage } from './errors.js'
import { sortDocs } from './collection.js'

const STAGES = [
  '$match', '$project', '$sort', '$limit', '$skip', '$count', '$addFields', '$set', '$unset',
  '$unwind', '$group', '$lookup', '$bucket', '$facet', '$replaceRoot', '$replaceWith', '$sample',
  '$sortByCount',
]
const ACCUMULATORS = [
  '$sum', '$avg', '$min', '$max', '$push', '$addToSet', '$first', '$last', '$count', '$stdDevPop', '$stdDevSamp',
]

export function executePipeline(ctx, pipeline) {
  if (!Array.isArray(pipeline)) {
    throw new QueryError('aggregate() needs an array of stages, e.g. aggregate([ { $match: {...} } ])')
  }

  let docs = ctx.collection.docs.map((d) => structuredClone(d))

  for (const stage of pipeline) {
    if (!isPlainObject(stage) || Object.keys(stage).length !== 1) {
      throw new QueryError('Each pipeline stage must be an object with exactly one stage, e.g. { $match: { genre: "fiction" } }')
    }
    const stageName = Object.keys(stage)[0]
    const stageParams = stage[stageName]

    switch (stageName) {
      case '$match':
        if (!isPlainObject(stageParams)) throw new QueryError('$match needs a filter object')
        docs = docs.filter((doc) => evaluateQuery(doc, stageParams))
        break
      case '$project':
        if (!isPlainObject(stageParams) || Object.keys(stageParams).length === 0) {
          throw new QueryError('$project needs a non-empty object, e.g. { $project: { title: 1 } }')
        }
        docs = docs.map((doc) => applyProjectStage(doc, stageParams))
        break
      case '$sort':
        docs = sortDocs(docs, stageParams)
        break
      case '$limit':
        if (!Number.isInteger(stageParams) || stageParams <= 0) throw new QueryError('$limit needs a positive whole number')
        docs = docs.slice(0, stageParams)
        break
      case '$skip':
        if (!Number.isInteger(stageParams) || stageParams < 0) throw new QueryError('$skip needs a non-negative whole number')
        docs = docs.slice(stageParams)
        break
      case '$count':
        if (typeof stageParams !== 'string' || !stageParams || stageParams.startsWith('$') || stageParams.includes('.')) {
          throw new QueryError('$count needs a field name string, e.g. { $count: "total" }')
        }
        docs = docs.length ? [{ [stageParams]: docs.length }] : []
        break
      case '$sortByCount':
        docs = sortDocs(applyGroup(docs, { _id: stageParams, count: { $sum: 1 } }), { count: -1 })
        break
      case '$addFields':
      case '$set':
        docs = docs.map((doc) => applyAddFields(doc, stageParams))
        break
      case '$unset': {
        const fields = Array.isArray(stageParams) ? stageParams : [stageParams]
        docs = docs.map((doc) => {
          const result = structuredClone(doc)
          for (const f of fields) unsetNestedValue(result, f)
          return result
        })
        break
      }
      case '$unwind':
        docs = docs.flatMap((doc) => applyUnwind(doc, stageParams))
        break
      case '$group':
        docs = applyGroup(docs, stageParams)
        break
      case '$lookup':
        docs = applyLookup(docs, stageParams, ctx)
        break
      case '$bucket':
        docs = applyBucket(docs, stageParams)
        break
      case '$facet':
        docs = applyFacet(docs, stageParams, ctx)
        break
      case '$replaceRoot':
      case '$replaceWith': {
        const expr = stageName === '$replaceRoot' ? stageParams?.newRoot : stageParams
        docs = docs.map((doc) => {
          const root = resolveExpression(doc, expr)
          if (!isPlainObject(root)) {
            throw new QueryError(`${stageName} must produce a document, but got ${root === undefined ? 'a missing value' : JSON.stringify(root)}`)
          }
          return structuredClone(root)
        })
        break
      }
      case '$sample': {
        const size = stageParams?.size
        if (!Number.isInteger(size) || size < 0) throw new QueryError('$sample needs { size: n }')
        const shuffled = [...docs]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        docs = shuffled.slice(0, size)
        break
      }
      case '$out':
      case '$merge':
        throw new QueryError(`${stageName} isn't supported in this sandbox - the pipeline result is shown instead of being written to a collection`)
      default:
        throw new QueryError(unknownMessage('pipeline stage', stageName, STAGES))
    }
  }

  return docs
}

function resolveField(doc, path) {
  if (typeof path === 'string' && path.startsWith('$')) {
    path = path.slice(1)
  }
  return getNestedValue(doc, path)
}

// 1 / true / 0 / false are inclusion flags; anything else is a computed field
function isProjectionFlag(val) {
  return typeof val === 'boolean' || typeof val === 'number'
}

function applyProjectStage(doc, spec) {
  const entries = Object.entries(spec)
  const includes = entries.some(([key, v]) => key !== '_id' && (!isProjectionFlag(v) || Boolean(v)))
    || (entries.length === 1 && entries[0][0] === '_id' && Boolean(entries[0][1]))
  let result = {}

  if (includes) {
    for (const [key, val] of entries) {
      if (isProjectionFlag(val)) {
        if (!val) {
          if (key !== '_id') throw new QueryError(`Can't exclude '${key}' in a $project that includes fields. Only _id may be excluded.`)
          continue
        }
        const srcVal = getNestedValue(doc, key)
        if (srcVal !== undefined) setNestedValue(result, key, structuredClone(srcVal))
      } else {
        const computed = resolveExpression(doc, val)
        if (computed !== undefined) setNestedValue(result, key, structuredClone(computed))
      }
    }
    if (!('_id' in spec)) {
      result = { _id: structuredClone(doc._id), ...result }
    }
  } else {
    Object.assign(result, structuredClone(doc))
    for (const [key, val] of entries) {
      if (!val) unsetNestedValue(result, key)
    }
  }

  return result
}

function applyAddFields(doc, spec) {
  if (!isPlainObject(spec)) throw new QueryError('$addFields / $set needs an object of new fields')
  const result = structuredClone(doc)
  for (const [field, expr] of Object.entries(spec)) {
    const value = resolveExpression(doc, expr)
    if (value === undefined) unsetNestedValue(result, field)
    else setNestedValue(result, field, structuredClone(value))
  }
  return result
}

function applyUnwind(doc, fieldPath) {
  let rawPath, preserveNullAndEmptyArrays = false, includeArrayIndex = null

  if (typeof fieldPath === 'string') {
    rawPath = fieldPath
  } else if (isPlainObject(fieldPath)) {
    rawPath = fieldPath.path
    preserveNullAndEmptyArrays = fieldPath.preserveNullAndEmptyArrays ?? false
    includeArrayIndex = fieldPath.includeArrayIndex ?? null
  }
  if (typeof rawPath !== 'string' || !rawPath.startsWith('$') || rawPath.length < 2) {
    throw new QueryError('$unwind needs a field path that starts with $, e.g. { $unwind: "$tags" }')
  }
  const fieldName = rawPath.slice(1)

  const arr = getNestedValue(doc, fieldName)

  // A non-array value is treated as a one-element array
  if (arr != null && !Array.isArray(arr)) {
    const result = structuredClone(doc)
    if (includeArrayIndex) result[includeArrayIndex] = null
    return [result]
  }
  if (arr == null || arr.length === 0) {
    if (preserveNullAndEmptyArrays) {
      const result = structuredClone(doc)
      if (Array.isArray(arr)) unsetNestedValue(result, fieldName)
      if (includeArrayIndex) result[includeArrayIndex] = null
      return [result]
    }
    return []
  }

  return arr.map((item, idx) => {
    const result = structuredClone(doc)
    setNestedValue(result, fieldName, item)
    if (includeArrayIndex) result[includeArrayIndex] = idx
    return result
  })
}

function parseAccumulators(spec, stageName, skip = []) {
  return Object.entries(spec)
    .filter(([field]) => !skip.includes(field))
    .map(([field, val]) => {
      if (!isPlainObject(val) || Object.keys(val).length !== 1) {
        throw new QueryError(`${stageName} field '${field}' must be an accumulator object like { $sum: "$price" }`)
      }
      const op = Object.keys(val)[0]
      if (!ACCUMULATORS.includes(op)) throw new QueryError(unknownMessage('accumulator', op, ACCUMULATORS))
      return { field, op, expr: val[op] }
    })
}

function newAccumulatorState(op) {
  switch (op) {
    case '$sum': case '$count': return { value: 0 }
    case '$avg': return { sum: 0, n: 0 }
    case '$push': case '$addToSet': return { value: [] }
    case '$stdDevPop': case '$stdDevSamp': return { values: [] }
    default: return { value: null, seen: false }
  }
}

// Mirrors MongoDB: $sum/$avg/$stdDev* ignore non-numbers, $min/$max ignore
// null and missing, $push/$addToSet skip missing values.
function accumulate(state, op, val) {
  switch (op) {
    case '$sum':
      if (typeof val === 'number') state.value += val
      break
    case '$count':
      state.value += 1
      break
    case '$avg':
      if (typeof val === 'number') {
        state.sum += val
        state.n++
      }
      break
    case '$min':
    case '$max': {
      if (val == null) break
      const cmp = state.seen ? compareValues(val, state.value) : 0
      if (!state.seen || (op === '$min' ? cmp < 0 : cmp > 0)) {
        state.value = val
        state.seen = true
      }
      break
    }
    case '$first':
      if (!state.seen) {
        state.value = val === undefined ? null : val
        state.seen = true
      }
      break
    case '$last':
      state.value = val === undefined ? null : val
      break
    case '$push':
      if (val !== undefined) state.value.push(structuredClone(val))
      break
    case '$addToSet':
      if (val !== undefined && !state.value.some((v) => deepEqual(v, val))) state.value.push(structuredClone(val))
      break
    case '$stdDevPop':
    case '$stdDevSamp':
      if (typeof val === 'number') state.values.push(val)
      break
  }
}

function finalizeAccumulator(state, op) {
  switch (op) {
    case '$sum': return roundNum(state.value)
    case '$avg': return state.n ? roundNum(state.sum / state.n) : null
    case '$stdDevPop':
    case '$stdDevSamp': {
      const vals = state.values
      const n = vals.length
      if (op === '$stdDevPop' ? n === 0 : n < 2) return null
      const mean = vals.reduce((s, v) => s + v, 0) / n
      const squares = vals.reduce((s, v) => s + (v - mean) ** 2, 0)
      return roundNum(Math.sqrt(squares / (op === '$stdDevPop' ? n : n - 1)))
    }
    default: return state.value
  }
}

function finalizeGroup(id, accumulators, states) {
  const result = { _id: id }
  accumulators.forEach((acc, i) => {
    result[acc.field] = finalizeAccumulator(states[i], acc.op)
  })
  return result
}

function applyGroup(docs, spec) {
  if (!isPlainObject(spec) || !('_id' in spec)) {
    throw new QueryError('$group needs an _id. Use _id: "$field" to group by a field, or _id: null to group everything together.')
  }
  const accumulators = parseAccumulators(spec, '$group', ['_id'])
  const groups = new Map()

  for (const doc of docs) {
    let id = resolveExpression(doc, spec._id)
    if (id === undefined) id = null
    if (isPlainObject(id)) id = Object.fromEntries(Object.entries(id).filter(([, v]) => v !== undefined))
    const key = canonicalKey(id, { nullForMissing: true })
    if (!groups.has(key)) {
      groups.set(key, { id: structuredClone(id), states: accumulators.map((a) => newAccumulatorState(a.op)) })
    }
    const group = groups.get(key)
    accumulators.forEach((acc, i) => accumulate(group.states[i], acc.op, resolveExpression(doc, acc.expr)))
  }

  return [...groups.values()].map((g) => finalizeGroup(g.id, accumulators, g.states))
}

// Values a join key can match on: array elements individually, and a
// missing field as null (so it pairs with null / missing foreign values)
function joinValues(doc, path) {
  return getPathValues(doc, path)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map((v) => (v === undefined ? null : v))
}

function joinMatches(localValues, foreignDoc, foreignField) {
  const foreignValues = joinValues(foreignDoc, foreignField)
  return localValues.some((l) => foreignValues.some((f) => deepEqual(l, f)))
}

function applyLookup(docs, spec, ctx) {
  if (!isPlainObject(spec)) throw new QueryError('$lookup needs an object with from, localField, foreignField and as')
  const { from, localField, foreignField, as, pipeline: subPipeline, let: letSpec } = spec
  if (typeof from !== 'string' || !from) throw new QueryError('$lookup needs from: the name of the collection to join')
  if (typeof as !== 'string' || !as) throw new QueryError('$lookup needs as: the name of the new array field')
  const hasJoinFields = localField !== undefined || foreignField !== undefined
  if (hasJoinFields && (typeof localField !== 'string' || typeof foreignField !== 'string')) {
    throw new QueryError('$lookup needs both localField and foreignField as strings')
  }
  if (!hasJoinFields && subPipeline === undefined) {
    throw new QueryError('$lookup needs localField and foreignField, or a pipeline')
  }

  const foreignDocs = ctx.collections[from]?.docs ?? []

  return docs.map((doc) => {
    let matches = foreignDocs
    if (hasJoinFields) {
      const localValues = joinValues(doc, localField)
      matches = foreignDocs.filter((f) => joinMatches(localValues, f, foreignField))
    }
    if (subPipeline !== undefined) {
      if (!Array.isArray(subPipeline)) throw new QueryError('$lookup pipeline must be an array of stages')
      const vars = {}
      for (const [varName, expr] of Object.entries(letSpec ?? {})) {
        vars[varName] = resolveExpression(doc, expr)
      }
      matches = executePipeline({ collection: { docs: matches }, collections: ctx.collections }, substituteVars(subPipeline, vars))
    }
    const result = structuredClone(doc)
    setNestedValue(result, as, matches.map((m) => structuredClone(m)))
    return result
  })
}

function applyBucket(docs, spec) {
  if (!isPlainObject(spec)) throw new QueryError('$bucket needs an object with groupBy and boundaries')
  const { groupBy, boundaries, default: defaultId, output } = spec
  if (groupBy === undefined) throw new QueryError('$bucket needs groupBy, e.g. groupBy: "$price"')
  if (!Array.isArray(boundaries) || boundaries.length < 2) {
    throw new QueryError('$bucket needs at least two boundaries, e.g. boundaries: [0, 100, 200]')
  }
  for (let i = 1; i < boundaries.length; i++) {
    if (typeRank(boundaries[i]) !== typeRank(boundaries[0]) || compareValues(boundaries[i - 1], boundaries[i]) >= 0) {
      throw new QueryError('$bucket boundaries must all be the same type and in ascending order')
    }
  }
  const accumulators = output !== undefined
    ? parseAccumulators(output, '$bucket')
    : [{ field: 'count', op: '$sum', expr: 1 }]

  const buckets = new Map()
  for (const doc of docs) {
    const val = resolveExpression(doc, groupBy)
    let idx = -1
    if (val !== undefined && typeRank(val) === typeRank(boundaries[0])) {
      for (let i = 0; i < boundaries.length - 1; i++) {
        if (compareValues(val, boundaries[i]) >= 0 && compareValues(val, boundaries[i + 1]) < 0) {
          idx = i
          break
        }
      }
    }
    if (idx === -1 && defaultId === undefined) {
      throw new QueryError(`$bucket couldn't place a document (groupBy value ${val === undefined ? 'missing' : JSON.stringify(val)}) in any range, and no default was given. Add default: "Other".`)
    }
    if (!buckets.has(idx)) buckets.set(idx, accumulators.map((a) => newAccumulatorState(a.op)))
    const states = buckets.get(idx)
    accumulators.forEach((acc, i) => accumulate(states[i], acc.op, resolveExpression(doc, acc.expr)))
  }

  // Like MongoDB, only buckets that received documents are returned
  return [...buckets.entries()]
    .sort(([a], [b]) => (a === -1 ? 1 : b === -1 ? -1 : a - b))
    .map(([idx, states]) => finalizeGroup(idx === -1 ? defaultId : boundaries[idx], accumulators, states))
}

// resolveExpression - core expression evaluator
// vars: map of $$varName -> value for $filter/$map/$reduce/$let/$lookup pipeline
export function resolveExpression(doc, expr, vars = {}) {
  if (expr === null || expr === undefined) return expr
  if (typeof expr === 'string') {
    if (expr.startsWith('$$')) return resolveVariable(doc, expr.slice(2), vars)
    if (expr.startsWith('$')) return resolveField(doc, expr.slice(1))
    return expr
  }
  if (typeof expr === 'number' || typeof expr === 'boolean' || expr instanceof Date || expr instanceof RegExp) return expr

  if (Array.isArray(expr)) {
    return expr.map((e) => resolveExpression(doc, e, vars))
  }

  if (typeof expr === 'object') {
    // Structured multi-field operators (must be checked before generic key dispatch)

    if ('$cond' in expr) return applyCond(doc, expr.$cond, vars)
    if ('$ifNull' in expr) return applyIfNull(doc, expr.$ifNull, vars)
    if ('$switch' in expr) return applySwitch(doc, expr.$switch, vars)
    if ('$let' in expr) return applyLet(doc, expr.$let, vars)
    if ('$literal' in expr) return expr.$literal

    if ('$filter' in expr) {
      const { input, cond, as: asVar = 'this' } = expr.$filter
      const arr = resolveExpression(doc, input, vars)
      if (!Array.isArray(arr)) return []
      return arr.filter((item) => {
        const newVars = { ...vars, [asVar]: item }
        return isTruthy(resolveExpression(doc, cond, newVars))
      })
    }
    if ('$map' in expr) {
      const { input, in: inExpr, as: asVar = 'this' } = expr.$map
      const arr = resolveExpression(doc, input, vars)
      if (!Array.isArray(arr)) return []
      return arr.map((item) => {
        const newVars = { ...vars, [asVar]: item }
        return resolveExpression(doc, inExpr, newVars)
      })
    }
    if ('$reduce' in expr) {
      const { input, initialValue, in: inExpr } = expr.$reduce
      const arr = resolveExpression(doc, input, vars)
      if (!Array.isArray(arr)) return resolveExpression(doc, initialValue, vars)
      return arr.reduce((acc, item) => {
        const newVars = { ...vars, value: acc, this: item }
        return resolveExpression(doc, inExpr, newVars)
      }, resolveExpression(doc, initialValue, vars))
    }

    if ('$trim' in expr || '$ltrim' in expr || '$rtrim' in expr) {
      const key = '$trim' in expr ? '$trim' : '$ltrim' in expr ? '$ltrim' : '$rtrim'
      const { input, chars } = expr[key]
      const str = String(resolveExpression(doc, input, vars))
      const charsStr = chars ? String(resolveExpression(doc, chars, vars)) : null
      return applyTrim(str, charsStr, key)
    }

    if ('$dateToString' in expr) {
      const { format, date, timezone, onNull } = expr.$dateToString
      const d = resolveExpression(doc, date, vars)
      if (d == null) return onNull !== undefined ? resolveExpression(doc, onNull, vars) : null
      const tz = timezone !== undefined ? resolveExpression(doc, timezone, vars) : undefined
      return dateToString(toDate(d), resolveExpression(doc, format, vars) ?? undefined, tz)
    }
    if ('$dateFromString' in expr) {
      const { dateString, format, timezone, onError, onNull } = expr.$dateFromString
      const s = resolveExpression(doc, dateString, vars)
      if (s == null) return onNull !== undefined ? resolveExpression(doc, onNull, vars) : null
      const tz = timezone !== undefined ? resolveExpression(doc, timezone, vars) : undefined
      const parsed = dateFromString(String(s), format !== undefined ? resolveExpression(doc, format, vars) : undefined, tz)
      if (parsed) return parsed
      if (onError !== undefined) return resolveExpression(doc, onError, vars)
      throw new QueryError(`$dateFromString couldn't parse ${JSON.stringify(s)}${format ? ` with format "${format}"` : ''}`)
    }
    if ('$convert' in expr) {
      const { input, to, onError, onNull } = expr.$convert
      const value = resolveExpression(doc, input, vars)
      if (value == null) return onNull !== undefined ? resolveExpression(doc, onNull, vars) : null
      try {
        return convertValue(value, resolveExpression(doc, to, vars))
      } catch (err) {
        if (onError !== undefined) return resolveExpression(doc, onError, vars)
        throw err
      }
    }

    if ('$regexMatch' in expr) {
      const { input, regex, options = '' } = expr.$regexMatch
      const str = String(resolveExpression(doc, input, vars))
      const re = regex instanceof RegExp ? regex : new RegExp(regex, options)
      return re.test(str)
    }
    if ('$regexFind' in expr) {
      const { input, regex, options = '' } = expr.$regexFind
      const str = String(resolveExpression(doc, input, vars))
      const re = new RegExp(regex instanceof RegExp ? regex.source : regex, (regex instanceof RegExp ? regex.flags : '') || options)
      const m = re.exec(str)
      if (!m) return null
      return { match: m[0], idx: m.index, captures: m.slice(1) }
    }
    if ('$regexFindAll' in expr) {
      const { input, regex, options = '' } = expr.$regexFindAll
      const str = String(resolveExpression(doc, input, vars))
      const flags = ((regex instanceof RegExp ? regex.flags : '') || options).replace(/g/g, '') + 'g'
      const re = new RegExp(regex instanceof RegExp ? regex.source : regex, flags)
      const results = []
      let m
      while ((m = re.exec(str)) !== null) {
        results.push({ match: m[0], idx: m.index, captures: m.slice(1) })
      }
      return results
    }

    if ('$getField' in expr) {
      const spec = expr.$getField
      if (typeof spec === 'string') return doc[spec]
      const field = resolveExpression(doc, spec.field, vars)
      const input = spec.input ? resolveExpression(doc, spec.input, vars) : doc
      return input?.[field]
    }
    if ('$setField' in expr) {
      const { field, input, value } = expr.$setField
      const obj = structuredClone(resolveExpression(doc, input, vars) ?? {})
      const f = resolveExpression(doc, field, vars)
      obj[f] = resolveExpression(doc, value, vars)
      return obj
    }

    // Generic single-operator dispatch: { $op: args }
    const keys = Object.keys(expr)
    if (keys.length === 1 && keys[0].startsWith('$')) {
      const op = keys[0]
      const rawArgs = expr[op]
      const args = Array.isArray(rawArgs)
        ? rawArgs.map((a) => resolveExpression(doc, a, vars))
        : [resolveExpression(doc, rawArgs, vars)]
      return applyAggregationOperator(op, args)
    }

    // Plain object - resolve each value
    const result = {}
    for (const [key, val] of Object.entries(expr)) {
      result[key] = resolveExpression(doc, val, vars)
    }
    return result
  }

  return expr
}

function resolveVariable(doc, name, vars) {
  const [varName, ...path] = name.split('.')
  let value
  if (varName in vars) value = vars[varName]
  else if (varName === 'ROOT' || varName === 'CURRENT') value = doc
  else if (varName === 'NOW') value = new Date()
  else if (varName === 'REMOVE') return undefined
  else throw new QueryError(`Undefined variable $$${varName}. Define it with $let, the "as" option of $filter / $map, or "let" in $lookup.`)
  return path.length ? getNestedValue(value, path.join('.')) : value
}

// Arithmetic and most operators return null when an input is null or missing
const hasNullish = (args) => args.some((a) => a == null)

function requireNumbers(op, args) {
  const bad = args.find((a) => typeof a !== 'number' && !(a instanceof Date))
  if (bad !== undefined) throw new QueryError(`${op} only works with numbers, but got ${JSON.stringify(bad)}`)
}

// A single array argument means "operate on the array's elements"
const spread = (args) => (args.length === 1 && Array.isArray(args[0]) ? args[0] : args)

function requireArrayArg(op, v) {
  if (!Array.isArray(v)) throw new QueryError(`The argument to ${op} must be an array, but got ${v === undefined ? 'a missing field' : JSON.stringify(v)}`)
}

function applyAggregationOperator(op, args) {
  switch (op) {
    // Arithmetic
    case '$sum': return roundNum(spread(args).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0))
    case '$avg': {
      const nums = spread(args).filter((a) => typeof a === 'number')
      return nums.length ? roundNum(nums.reduce((a, b) => a + b, 0) / nums.length) : null
    }
    case '$min':
    case '$max': {
      const vals = spread(args).filter((a) => a != null)
      if (!vals.length) return null
      return vals.reduce((a, b) => {
        const cmp = compareValues(b, a)
        return (op === '$min' ? cmp < 0 : cmp > 0) ? b : a
      })
    }
    case '$add': {
      if (hasNullish(args)) return null
      requireNumbers(op, args)
      const date = args.find((a) => a instanceof Date)
      const total = args.reduce((s, a) => s + (a instanceof Date ? a.getTime() : a), 0)
      return date ? new Date(total) : roundNum(total)
    }
    case '$subtract': {
      const [a, b] = args
      if (a == null || b == null) return null
      requireNumbers(op, args)
      if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
      if (a instanceof Date) return new Date(a.getTime() - b)
      return roundNum(a - b)
    }
    case '$multiply':
      if (hasNullish(args)) return null
      requireNumbers(op, args)
      return roundNum(args.reduce((a, b) => a * b, 1))
    case '$divide':
      if (hasNullish(args)) return null
      requireNumbers(op, args)
      if (args[1] === 0) throw new QueryError("Can't $divide by zero")
      return roundNum(args[0] / args[1])
    case '$mod':
      if (hasNullish(args)) return null
      requireNumbers(op, args)
      if (args[1] === 0) throw new QueryError("Can't $mod by zero")
      return roundNum(args[0] % args[1])
    case '$abs': return args[0] == null ? null : Math.abs(args[0])
    case '$ceil': return args[0] == null ? null : Math.ceil(args[0])
    case '$floor': return args[0] == null ? null : Math.floor(args[0])
    case '$round':
    case '$trunc': {
      const [val, place = 0] = args
      if (val == null) return null
      const factor = 10 ** place
      return roundNum((op === '$round' ? Math.round : Math.trunc)(val * factor) / factor)
    }
    case '$sqrt': return args[0] == null ? null : Math.sqrt(args[0])
    case '$pow': return hasNullish(args) ? null : Math.pow(args[0], args[1])
    case '$log': return hasNullish(args) ? null : Math.log(args[0]) / Math.log(args[1])
    case '$ln': return args[0] == null ? null : Math.log(args[0])
    case '$log10': return args[0] == null ? null : Math.log10(args[0])
    case '$exp': return args[0] == null ? null : Math.exp(args[0])

    // Comparison (BSON order, so null < numbers < strings ...)
    case '$lt': return compareValues(args[0], args[1]) < 0
    case '$gt': return compareValues(args[0], args[1]) > 0
    case '$lte': return compareValues(args[0], args[1]) <= 0
    case '$gte': return compareValues(args[0], args[1]) >= 0
    case '$eq': return deepEqual(args[0] ?? null, args[1] ?? null)
    case '$ne': return !deepEqual(args[0] ?? null, args[1] ?? null)
    case '$cmp': return Math.sign(compareValues(args[0], args[1]))

    // Logical
    case '$and': return args.every(isTruthy)
    case '$or': return args.some(isTruthy)
    case '$not': return !isTruthy(args[0])

    // String
    case '$toUpper': return String(args[0] ?? '').toUpperCase()
    case '$toLower': return String(args[0] ?? '').toLowerCase()
    case '$substr':
    case '$substrBytes': {
      const [str, start, length] = args
      if (str == null) return ''
      return String(str).substring(start, length < 0 ? undefined : start + length)
    }
    case '$substrCP': {
      const [str, start, length] = args
      if (str == null) return ''
      return [...String(str)].slice(start, start + length).join('')
    }
    case '$concat': {
      if (hasNullish(args)) return null
      const bad = args.find((a) => typeof a !== 'string')
      if (bad !== undefined) throw new QueryError(`$concat only joins strings, but got ${JSON.stringify(bad)}. Convert it with $toString first.`)
      return args.join('')
    }
    case '$split': {
      const [str, delim] = args
      if (str == null) return null
      return String(str).split(String(delim))
    }
    case '$strLenCP': return [...String(args[0] ?? '')].length
    case '$strLenBytes': return new TextEncoder().encode(String(args[0] ?? '')).length
    case '$indexOfCP':
    case '$indexOfBytes': {
      const [str, sub, start = 0] = args
      if (str == null) return null
      return String(str).indexOf(String(sub), start)
    }
    case '$strcasecmp': return Math.sign(String(args[0] ?? '').toLowerCase().localeCompare(String(args[1] ?? '').toLowerCase()))

    // Type conversion
    case '$toString': return args[0] == null ? null : convertValue(args[0], 'string')
    case '$toInt':
    case '$toLong': return args[0] == null ? null : convertValue(args[0], 'int')
    case '$toDouble':
    case '$toDecimal': return args[0] == null ? null : convertValue(args[0], 'double')
    case '$toBool': return args[0] == null ? null : convertValue(args[0], 'bool')
    case '$toDate': return args[0] == null ? null : convertValue(args[0], 'date')
    case '$toObjectId': return args[0] // ObjectIds are plain hex strings in this sandbox
    case '$type': {
      const v = args[0]
      if (v === null) return 'null'
      if (v === undefined) return 'missing'
      if (v instanceof Date) return 'date'
      if (v instanceof RegExp) return 'regex'
      if (Array.isArray(v)) return 'array'
      if (typeof v === 'object') return 'object'
      if (typeof v === 'string') return 'string'
      if (typeof v === 'boolean') return 'bool'
      if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double'
      return typeof v
    }
    case '$isArray': return Array.isArray(args[0])
    case '$isNumber': return typeof args[0] === 'number'

    // Array
    case '$arrayElemAt': {
      const [arr, idx] = args
      if (arr == null) return null
      requireArrayArg(op, arr)
      return arr[idx < 0 ? arr.length + idx : idx]
    }
    case '$concatArrays':
      if (hasNullish(args)) return null
      args.forEach((a) => requireArrayArg(op, a))
      return args.flat(1)
    case '$size':
      requireArrayArg(op, args[0])
      return args[0].length
    case '$slice': {
      const [arr, posOrN, maybeN] = args
      if (arr == null) return null
      requireArrayArg(op, arr)
      if (maybeN !== undefined) {
        const start = posOrN < 0 ? Math.max(arr.length + posOrN, 0) : posOrN
        return arr.slice(start, start + maybeN)
      }
      return posOrN >= 0 ? arr.slice(0, posOrN) : arr.slice(posOrN)
    }
    case '$reverseArray':
      if (args[0] == null) return null
      requireArrayArg(op, args[0])
      return [...args[0]].reverse()
    case '$in':
      requireArrayArg(op, args[1])
      return args[1].some((v) => deepEqual(v, args[0]))
    case '$indexOfArray': {
      const [arr, search, start = 0] = args
      if (arr == null) return null
      requireArrayArg(op, arr)
      for (let i = start; i < arr.length; i++) {
        if (deepEqual(arr[i], search)) return i
      }
      return -1
    }
    case '$range': {
      const [start, end, step = 1] = args
      if (step === 0) throw new QueryError('$range step cannot be 0')
      if (Math.abs((end - start) / step) > 100000) throw new QueryError('$range would produce more than 100,000 numbers')
      const result = []
      for (let i = start; step > 0 ? i < end : i > end; i += step) result.push(i)
      return result
    }
    case '$first':
    case '$last': {
      const v = args[0]
      if (v == null) return null
      requireArrayArg(op, v)
      return op === '$first' ? v[0] : v[v.length - 1]
    }
    case '$zip': {
      const [spec] = args
      if (!spec || !Array.isArray(spec.inputs)) throw new QueryError('$zip needs { inputs: [array1, array2, ...] }')
      const arrays = spec.inputs
      if (arrays.some((a) => a == null)) return null
      const len = spec.useLongestLength
        ? Math.max(...arrays.map((a) => a.length))
        : Math.min(...arrays.map((a) => a.length))
      return Array.from({ length: len }, (_, i) =>
        arrays.map((a, j) => (i < a.length ? a[i] : (spec.defaults?.[j] ?? null)))
      )
    }

    // Set operators
    case '$setUnion': {
      const out = []
      for (const item of args.flat(1)) {
        if (!out.some((v) => deepEqual(v, item))) out.push(item)
      }
      return out
    }
    case '$setIntersection': {
      const [a, ...rest] = args
      return (a ?? []).filter((item) => rest.every((arr) => (arr ?? []).some((v) => deepEqual(v, item))))
    }
    case '$setDifference': {
      const [a, b] = args
      return (a ?? []).filter((item) => !(b ?? []).some((v) => deepEqual(v, item)))
    }
    case '$setEquals': {
      const [a, b] = args
      if (!Array.isArray(a) || !Array.isArray(b)) return false
      return a.every((item) => b.some((v) => deepEqual(v, item)))
        && b.every((item) => a.some((v) => deepEqual(v, item)))
    }
    case '$setIsSubset': {
      const [a, b] = args
      if (!Array.isArray(a) || !Array.isArray(b)) return false
      return a.every((item) => b.some((v) => deepEqual(v, item)))
    }
    case '$anyElementTrue': requireArrayArg(op, spread(args)); return spread(args).some(isTruthy)
    case '$allElementsTrue': requireArrayArg(op, spread(args)); return spread(args).every(isTruthy)

    // Object
    case '$mergeObjects': return Object.assign({}, ...spread(args).filter((a) => a != null))
    case '$objectToArray': {
      const obj = args[0]
      if (obj == null) return null
      if (!isPlainObject(obj)) throw new QueryError('$objectToArray needs a document')
      return Object.entries(obj).map(([k, v]) => ({ k, v }))
    }
    case '$arrayToObject': {
      const arr = spread(args)
      const result = {}
      for (const item of arr) {
        if (Array.isArray(item) && item.length === 2) result[item[0]] = item[1]
        else if (item && typeof item === 'object' && 'k' in item) result[item.k] = item.v
      }
      return result
    }

    // Date
    case '$year': return toDate(args[0])?.getUTCFullYear() ?? null
    case '$month': return toDate(args[0]) != null ? toDate(args[0]).getUTCMonth() + 1 : null
    case '$dayOfMonth': return toDate(args[0])?.getUTCDate() ?? null
    case '$hour': return toDate(args[0])?.getUTCHours() ?? null
    case '$minute': return toDate(args[0])?.getUTCMinutes() ?? null
    case '$second': return toDate(args[0])?.getUTCSeconds() ?? null
    case '$millisecond': return toDate(args[0])?.getUTCMilliseconds() ?? null
    case '$dayOfWeek': return toDate(args[0]) != null ? toDate(args[0]).getUTCDay() + 1 : null
    case '$dayOfYear': {
      const d = toDate(args[0])
      if (!d) return null
      const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0))
      return Math.floor((d - start) / 86400000)
    }
    case '$week': return isoWeek(toDate(args[0]))
    case '$isoWeek': return isoWeek(toDate(args[0]))
    case '$isoWeekYear': return isoWeekYear(toDate(args[0]))
    case '$isoDayOfWeek': {
      const d = toDate(args[0])
      if (!d) return null
      const day = d.getUTCDay()
      return day === 0 ? 7 : day
    }

    // Other
    case '$rand': return Math.random()

    default:
      throw new QueryError(unknownMessage('expression operator', op, EXPRESSION_OPERATORS))
  }
}

const EXPRESSION_OPERATORS = [
  '$sum', '$avg', '$min', '$max', '$add', '$subtract', '$multiply', '$divide', '$mod', '$abs', '$ceil',
  '$floor', '$round', '$trunc', '$sqrt', '$pow', '$log', '$ln', '$log10', '$exp', '$lt', '$gt', '$lte',
  '$gte', '$eq', '$ne', '$cmp', '$and', '$or', '$not', '$toUpper', '$toLower', '$substr', '$substrCP',
  '$substrBytes', '$concat', '$split', '$strLenCP', '$strLenBytes', '$indexOfCP', '$indexOfBytes',
  '$strcasecmp', '$toString', '$toInt', '$toLong', '$toDouble', '$toDecimal', '$toBool', '$toDate',
  '$toObjectId', '$type', '$isArray', '$isNumber', '$arrayElemAt', '$concatArrays', '$size', '$slice',
  '$reverseArray', '$in', '$indexOfArray', '$range', '$first', '$last', '$zip', '$setUnion',
  '$setIntersection', '$setDifference', '$setEquals', '$setIsSubset', '$anyElementTrue',
  '$allElementsTrue', '$mergeObjects', '$objectToArray', '$arrayToObject', '$year', '$month',
  '$dayOfMonth', '$hour', '$minute', '$second', '$millisecond', '$dayOfWeek', '$dayOfYear', '$week',
  '$isoWeek', '$isoWeekYear', '$isoDayOfWeek', '$rand', '$cond', '$ifNull', '$switch', '$let',
  '$literal', '$filter', '$map', '$reduce', '$trim', '$ltrim', '$rtrim', '$dateToString',
  '$dateFromString', '$convert', '$regexMatch', '$regexFind', '$regexFindAll', '$getField', '$setField',
]

function convertValue(value, to) {
  const fail = () => {
    throw new QueryError(`Can't convert ${JSON.stringify(value)} to ${to}`)
  }
  switch (to) {
    case 'string':
      if (value instanceof Date) return value.toISOString()
      if (typeof value === 'object') fail()
      return String(value)
    case 'int':
    case 'long':
    case 'double':
    case 'decimal': {
      let n
      if (typeof value === 'number') n = value
      else if (typeof value === 'boolean') n = value ? 1 : 0
      else if (value instanceof Date) n = value.getTime()
      else if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) n = Number(value)
      else fail()
      if (to === 'int' || to === 'long') {
        if (typeof value === 'string' && !Number.isInteger(n)) fail()
        return Math.trunc(n)
      }
      return n
    }
    case 'bool':
      if (typeof value === 'number') return value !== 0
      return Boolean(value)
    case 'date': {
      const d = toDate(value)
      if (!d) fail()
      return d
    }
    case 'objectId':
      if (typeof value !== 'string' || !/^[0-9a-fA-F]{24}$/.test(value)) fail()
      return value.toLowerCase()
    default:
      throw new QueryError(unknownMessage('$convert target type', String(to), ['string', 'int', 'long', 'double', 'decimal', 'bool', 'date', 'objectId'], (s) => `"${s}"`))
  }
}

function applyCond(doc, cond, vars) {
  if (Array.isArray(cond)) {
    const [ifExpr, thenExpr, elseExpr] = cond
    return isTruthy(resolveExpression(doc, ifExpr, vars))
      ? resolveExpression(doc, thenExpr, vars)
      : resolveExpression(doc, elseExpr, vars)
  }
  return isTruthy(resolveExpression(doc, cond.if, vars))
    ? resolveExpression(doc, cond.then, vars)
    : resolveExpression(doc, cond.else, vars)
}

function applyIfNull(doc, expr, vars) {
  const [fieldExpr, defaultExpr] = expr
  const val = resolveExpression(doc, fieldExpr, vars)
  return val != null ? val : resolveExpression(doc, defaultExpr, vars)
}

function applySwitch(doc, spec, vars) {
  const { branches, default: defaultExpr } = spec
  if (!Array.isArray(branches)) throw new QueryError('$switch needs branches: [ { case: ..., then: ... } ]')
  for (const branch of branches) {
    if (isTruthy(resolveExpression(doc, branch.case, vars))) {
      return resolveExpression(doc, branch.then, vars)
    }
  }
  if (defaultExpr === undefined) throw new QueryError('$switch found no matching branch and has no default')
  return resolveExpression(doc, defaultExpr, vars)
}

function applyLet(doc, spec, vars) {
  const newVars = { ...vars }
  for (const [varName, expr] of Object.entries(spec.vars)) {
    newVars[varName] = resolveExpression(doc, expr, vars)
  }
  return resolveExpression(doc, spec.in, newVars)
}

function applyTrim(str, chars, op) {
  if (!chars) {
    if (op === '$trim') return str.trim()
    if (op === '$ltrim') return str.trimStart()
    return str.trimEnd()
  }
  const charSet = new Set([...chars])
  let s = str
  if (op === '$trim' || op === '$ltrim') {
    while (s.length && charSet.has(s[0])) s = s.slice(1)
  }
  if (op === '$trim' || op === '$rtrim') {
    while (s.length && charSet.has(s[s.length - 1])) s = s.slice(0, -1)
  }
  return s
}

// Milliseconds to add to a UTC instant to get wall-clock time in `tz`.
// Accepts "UTC", Olson names like "Europe/Paris" and offsets like "+05:30".
function timezoneOffsetMs(date, tz) {
  if (tz == null || tz === 'UTC' || tz === 'GMT' || tz === 'Z') return 0
  if (typeof tz !== 'string') throw new QueryError('timezone must be a string like "Europe/Paris" or "+05:30"')
  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(tz)
  if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) * 60000
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date)
  } catch {
    throw new QueryError(`Unknown timezone "${tz}"`)
  }
  const get = (type) => Number(parts.find((p) => p.type === type).value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return wall - Math.floor(date.getTime() / 1000) * 1000
}

const pad = (n, len = 2) => String(n).padStart(len, '0')

function dateToString(d, format = '%Y-%m-%dT%H:%M:%S.%LZ', timezone) {
  if (!d || isNaN(d.getTime())) return null
  const offset = timezoneOffsetMs(d, timezone)
  const w = new Date(d.getTime() + offset)
  const offsetMin = Math.round(offset / 60000)
  const sign = offsetMin < 0 ? '-' : '+'
  const tokens = {
    Y: () => pad(w.getUTCFullYear(), 4),
    m: () => pad(w.getUTCMonth() + 1),
    d: () => pad(w.getUTCDate()),
    H: () => pad(w.getUTCHours()),
    M: () => pad(w.getUTCMinutes()),
    S: () => pad(w.getUTCSeconds()),
    L: () => pad(w.getUTCMilliseconds(), 3),
    j: () => pad(Math.floor((w - new Date(Date.UTC(w.getUTCFullYear(), 0, 0))) / 86400000), 3),
    u: () => String(w.getUTCDay() === 0 ? 7 : w.getUTCDay()),
    w: () => String(w.getUTCDay() + 1),
    V: () => pad(isoWeek(w)),
    G: () => String(isoWeekYear(w)),
    z: () => `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}${pad(Math.abs(offsetMin) % 60)}`,
    Z: () => String(offsetMin),
    '%': () => '%',
  }
  return String(format).replace(/%(.)/g, (whole, t) => (tokens[t] ? tokens[t]() : whole))
}

const FORMAT_PARTS = {
  Y: ['(\\d{4})', 'year'], m: ['(\\d{1,2})', 'month'], d: ['(\\d{1,2})', 'day'],
  H: ['(\\d{1,2})', 'hour'], M: ['(\\d{1,2})', 'minute'], S: ['(\\d{1,2})', 'second'],
  L: ['(\\d{1,3})', 'ms'], z: ['([+-]\\d{2}:?\\d{2})', 'offset'],
}

function dateFromString(str, format, timezone) {
  const s = str.trim()
  let utcMs
  let explicitOffset = null
  if (format !== undefined) {
    const fields = []
    const pattern = String(format).replace(/%(.)|[.*+?^${}()|[\]\\]/g, (whole, t) => {
      if (t === undefined) return `\\${whole}`
      if (t === '%') return '%'
      if (!FORMAT_PARTS[t]) throw new QueryError(`Unsupported $dateFromString format token %${t}`)
      fields.push(FORMAT_PARTS[t][1])
      return FORMAT_PARTS[t][0]
    })
    const m = new RegExp(`^${pattern}$`).exec(s)
    if (!m) return null
    const v = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0, ms: 0 }
    fields.forEach((f, i) => {
      if (f === 'offset') explicitOffset = m[i + 1]
      else v[f] = Number(m[i + 1])
    })
    utcMs = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second, v.ms)
  } else {
    // Strings without a zone are UTC in MongoDB (JS would treat them as local)
    const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(s)
    const iso = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(s)
    const d = new Date(iso && !zoned && s.length > 10 ? `${s.replace(' ', 'T')}Z` : s)
    if (isNaN(d.getTime())) return null
    if (zoned) return d
    utcMs = d.getTime()
  }
  if (explicitOffset) return new Date(utcMs - timezoneOffsetMs(new Date(utcMs), explicitOffset))
  if (timezone !== undefined) return new Date(utcMs - timezoneOffsetMs(new Date(utcMs), timezone))
  return new Date(utcMs)
}

function toDate(v) {
  if (v == null) return null
  if (v instanceof Date) return v
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function isoWeek(d) {
  if (!d) return null
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
}

function isoWeekYear(d) {
  if (!d) return null
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  return date.getUTCFullYear()
}

function roundNum(val) {
  if (typeof val === 'number' && !Number.isInteger(val)) {
    return Math.round(val * 1e10) / 1e10
  }
  return val
}

function substituteVars(obj, vars) {
  if (typeof obj === 'string' && obj.startsWith('$$')) {
    const name = obj.slice(2)
    // Wrapped in $literal so a substituted value like "$5" is not read as a field path
    const [varName, ...path] = name.split('.')
    if (!(varName in vars)) return obj
    return { $literal: path.length ? getNestedValue(vars[varName], path.join('.')) : vars[varName] }
  }
  if (Array.isArray(obj)) return obj.map((v) => substituteVars(v, vars))
  if (isPlainObject(obj)) {
    const result = {}
    for (const [k, v] of Object.entries(obj)) result[k] = substituteVars(v, vars)
    return result
  }
  return obj
}

function applyFacet(docs, spec, ctx) {
  if (!isPlainObject(spec)) throw new QueryError('$facet needs an object of named sub-pipelines')
  const result = {}
  for (const [outputField, pipeline] of Object.entries(spec)) {
    const subCtx = { collection: { docs: structuredClone(docs) }, collections: ctx.collections }
    result[outputField] = executePipeline(subCtx, pipeline)
  }
  return [result]
}
