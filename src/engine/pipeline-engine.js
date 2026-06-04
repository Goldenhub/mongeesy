import { evaluateQuery } from './operators.js'
import { deepEqual, compareValues } from './utils.js'
import { getNestedValue, setNestedValue, unsetNestedValue } from './collection.js'

export function executePipeline(ctx, pipeline) {
  if (!Array.isArray(pipeline)) {
    throw new Error('Aggregation pipeline must be an array')
  }

  let docs = ctx.collection.docs.map((d) => structuredClone(d))

  for (const stage of pipeline) {
    const stageName = Object.keys(stage)[0]
    const stageParams = stage[stageName]

    switch (stageName) {
      case '$match':
        docs = docs.filter((doc) => evaluateQuery(doc, stageParams))
        break
      case '$project':
        docs = docs.map((doc) => applyProjectStage(doc, stageParams))
        break
      case '$sort':
        docs = [...docs].sort((a, b) => {
          for (const [field, order] of Object.entries(stageParams)) {
            const aVal = resolveField(a, field)
            const bVal = resolveField(b, field)
            const cmp = compareValues(aVal, bVal)
            if (cmp !== 0) return cmp * order
          }
          return 0
        })
        break
      case '$limit':
        docs = docs.slice(0, stageParams)
        break
      case '$skip':
        docs = docs.slice(stageParams)
        break
      case '$count':
        docs = [{ [stageParams]: docs.length }]
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
        docs = docs.map((doc) => structuredClone(resolveExpression(doc, stageParams.newRoot)))
        break
      case '$replaceWith':
        docs = docs.map((doc) => structuredClone(resolveExpression(doc, stageParams)))
        break
      case '$sample': {
        const size = stageParams.size ?? 0
        const shuffled = [...docs]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        docs = shuffled.slice(0, size)
        break
      }
      default:
        throw new Error(`Unknown aggregation stage: ${stageName}`)
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

function applyProjectStage(doc, spec) {
  const includes = Object.values(spec).some((v) => v === 1)
  const result = {}

  if (includes) {
    for (const [key, val] of Object.entries(spec)) {
      if (val === 1) {
        const srcVal = getNestedValue(doc, key)
        if (srcVal !== undefined) setNestedValue(result, key, structuredClone(srcVal))
      } else if (typeof val === 'string' && val.startsWith('$')) {
        result[key] = resolveField(doc, val.slice(1))
      } else if (typeof val === 'object' && val !== null) {
        const computed = resolveExpression(doc, val)
        if (computed !== undefined) result[key] = computed
      }
    }
    if (!('_id' in spec)) {
      result._id = structuredClone(doc._id)
    }
  } else {
    Object.assign(result, structuredClone(doc))
    for (const [key, val] of Object.entries(spec)) {
      if (val === 0) unsetNestedValue(result, key)
    }
  }

  return result
}

function applyAddFields(doc, spec) {
  const result = structuredClone(doc)
  for (const [field, expr] of Object.entries(spec)) {
    result[field] = resolveExpression(doc, expr)
  }
  return result
}

function applyUnwind(doc, fieldPath) {
  let fieldName, preserveNullAndEmptyArrays = false, includeArrayIndex = null

  if (typeof fieldPath === 'string') {
    fieldName = fieldPath.startsWith('$') ? fieldPath.slice(1) : fieldPath
  } else {
    const rawPath = fieldPath.path ?? ''
    fieldName = rawPath.startsWith('$') ? rawPath.slice(1) : rawPath
    preserveNullAndEmptyArrays = fieldPath.preserveNullAndEmptyArrays ?? false
    includeArrayIndex = fieldPath.includeArrayIndex ?? null
  }

  const arr = getNestedValue(doc, fieldName)

  if (!Array.isArray(arr)) {
    return preserveNullAndEmptyArrays ? [structuredClone(doc)] : []
  }
  if (arr.length === 0) {
    if (preserveNullAndEmptyArrays) {
      const result = structuredClone(doc)
      unsetNestedValue(result, fieldName)
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

function applyGroup(docs, spec) {
  const idExpr = spec._id
  const groups = new Map()

  for (const doc of docs) {
    let groupKey
    if (idExpr === null) {
      groupKey = '__nogroup__'
    } else if (typeof idExpr === 'string' && idExpr.startsWith('$')) {
      groupKey = JSON.stringify(resolveField(doc, idExpr.slice(1)))
    } else if (typeof idExpr === 'object' && idExpr !== null) {
      groupKey = JSON.stringify(
        Object.fromEntries(
          Object.entries(idExpr).map(([k, v]) => [k, resolveExpression(doc, v)])
        )
      )
    } else {
      groupKey = JSON.stringify(resolveExpression(doc, idExpr))
    }

    if (!groups.has(groupKey)) {
      let parsedId
      if (groupKey === JSON.stringify(null) || groupKey === '__nogroup__') {
        parsedId = null
      } else {
        try { parsedId = JSON.parse(groupKey) } catch { parsedId = groupKey }
      }
      groups.set(groupKey, { _id: parsedId })
    }

    const group = groups.get(groupKey)
    for (const [key, val] of Object.entries(spec)) {
      if (key === '_id') continue
      if (typeof val === 'object' && val !== null) {
        const op = Object.keys(val)[0]
        const expr = val[op]
        accumulate(group, key, op, expr, doc)
      }
    }
  }

  return [...groups.values()].map(finalizeGroup)
}

function accumulate(group, field, op, expr, doc) {
  const val = resolveExpression(doc, expr)

  switch (op) {
    case '$sum': {
      group[field] = (group[field] ?? 0) + (typeof val === 'number' ? val : (val ? 1 : 0))
      break
    }
    case '$avg': {
      if (typeof val === 'number') {
        group[field] = (group[field] ?? 0) + val
        group[`__avg_count_${field}`] = (group[`__avg_count_${field}`] ?? 0) + 1
      }
      break
    }
    case '$min': {
      if (group[field] === undefined || compareValues(val, group[field]) < 0) group[field] = val
      break
    }
    case '$max': {
      if (group[field] === undefined || compareValues(val, group[field]) > 0) group[field] = val
      break
    }
    case '$push': {
      if (!group[field]) group[field] = []
      group[field].push(val)
      break
    }
    case '$addToSet': {
      if (!group[field]) group[field] = []
      if (!group[field].some((item) => deepEqual(item, val))) {
        group[field].push(val)
      }
      break
    }
    case '$first': {
      if (!(field in group)) group[field] = val
      break
    }
    case '$last': {
      group[field] = val
      break
    }
    case '$count': {
      group[field] = (group[field] ?? 0) + 1
      break
    }
    case '$stdDevPop':
    case '$stdDevSamp': {
      if (typeof val === 'number') {
        if (!group[`__stddev_vals_${field}`]) group[`__stddev_vals_${field}`] = []
        group[`__stddev_vals_${field}`].push(val)
      }
      break
    }
  }
}

function applyLookup(docs, spec, ctx) {
  const { from, localField, foreignField, as, pipeline: subPipeline, let: letSpec } = spec

  const foreignCollection = ctx.collections[from]
  if (!foreignCollection) return docs.map((doc) => ({ ...doc, [as]: [] }))

  if (subPipeline) {
    return docs.map((doc) => {
      const vars = {}
      if (letSpec) {
        for (const [varName, expr] of Object.entries(letSpec)) {
          vars[varName] = resolveExpression(doc, expr)
        }
      }
      // Substitute $$varName references in the pipeline with their resolved values
      const substituted = substituteVars(subPipeline, vars)
      const subCtx = {
        collection: foreignCollection,
        collections: ctx.collections,
      }
      const result = executePipeline(subCtx, substituted)
      return { ...doc, [as]: result }
    })
  }

  return docs.map((doc) => {
    const localVal = resolveField(doc, localField)
    const matches = foreignCollection.docs.filter((foreignDoc) => {
      const foreignVal = resolveField(foreignDoc, foreignField)
      if (Array.isArray(localVal)) {
        return localVal.includes(foreignVal)
      }
      return localVal === foreignVal
    })
    return { ...doc, [as]: matches }
  })
}

function applyBucket(docs, spec) {
  const { groupBy, boundaries, default: defaultBucket, output } = spec
  const buckets = []

  for (let i = 0; i < boundaries.length - 1; i++) {
    const bucket = { _id: boundaries[i] }
    if (output) {
      for (const [outField, outExpr] of Object.entries(output)) {
        const op = Object.keys(outExpr)[0]
        initAccumulator(bucket, outField, op)
      }
    } else {
      bucket.count = 0
    }
    buckets.push(bucket)
  }

  const defaultBucketObj = defaultBucket !== undefined ? { _id: defaultBucket } : null
  if (defaultBucketObj) {
    if (output) {
      for (const [outField, outExpr] of Object.entries(output)) {
        const op = Object.keys(outExpr)[0]
        initAccumulator(defaultBucketObj, outField, op)
      }
    } else {
      defaultBucketObj.count = 0
    }
  }

  for (const doc of docs) {
    const val = resolveExpression(doc, groupBy)

    let placed = false
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (val >= boundaries[i] && val < boundaries[i + 1]) {
        if (output) {
          for (const [outField, outExpr] of Object.entries(output)) {
            const op = Object.keys(outExpr)[0]
            const expr = outExpr[op]
            accumulate(buckets[i], outField, op, expr, doc)
          }
        } else {
          buckets[i].count++
        }
        placed = true
        break
      }
    }

    if (!placed && defaultBucketObj) {
      if (output) {
        for (const [outField, outExpr] of Object.entries(output)) {
          const op = Object.keys(outExpr)[0]
          const expr = outExpr[op]
          accumulate(defaultBucketObj, outField, op, expr, doc)
        }
      } else {
        defaultBucketObj.count++
      }
    }
  }

  const result = [...buckets]
  if (defaultBucketObj) result.push(defaultBucketObj)

  return result.map(finalizeGroup)
}

function initAccumulator(obj, field, op) {
  switch (op) {
    case '$sum': case '$avg': case '$count':
      obj[field] = 0; break
    case '$push': case '$addToSet':
      obj[field] = []; break
    case '$min': case '$max': case '$first': case '$last':
      obj[field] = undefined; break
  }
}

function finalizeGroup(doc) {
  const result = {}
  for (const [key, val] of Object.entries(doc)) {
    if (key.startsWith('__avg_count_') || key.startsWith('__stddev_vals_')) continue
    const countKey = `__avg_count_${key}`
    if (countKey in doc) {
      const count = doc[countKey]
      if (count > 0) {
        result[key] = roundNum(val / count)
        continue
      }
      result[key] = null
      continue
    }
    const valsKey = `__stddev_vals_${key}`
    if (valsKey in doc) {
      const vals = doc[valsKey] ?? []
      if (vals.length === 0) { result[key] = null; continue }
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length
      const isPopKey = key + '_pop'
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (key.endsWith('Pop') ? vals.length : Math.max(1, vals.length - 1))
      result[key] = roundNum(Math.sqrt(variance))
      continue
    }
    result[key] = val
  }
  return result
}

// resolveExpression — core expression evaluator
// vars: map of $$varName -> value for $filter/$map/$reduce/$let/$lookup pipeline
export function resolveExpression(doc, expr, vars = {}) {
  if (expr === null || expr === undefined) return expr
  if (typeof expr === 'string') {
    if (expr.startsWith('$$')) {
      const varName = expr.slice(2)
      return varName in vars ? vars[varName] : undefined
    }
    if (expr.startsWith('$')) return resolveField(doc, expr.slice(1))
    return expr
  }
  if (typeof expr === 'number' || typeof expr === 'boolean') return expr

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
        return !!resolveExpression(doc, cond, newVars)
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
      const { format, date, timezone } = expr.$dateToString
      const d = resolveExpression(doc, date, vars)
      return dateToString(d instanceof Date ? d : new Date(d), format)
    }
    if ('$dateFromString' in expr) {
      const { dateString, format } = expr.$dateFromString
      const s = resolveExpression(doc, dateString, vars)
      return new Date(s)
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
      return applyAggregationOperator(op, args, doc, vars)
    }

    // Plain object — resolve each value
    const result = {}
    for (const [key, val] of Object.entries(expr)) {
      result[key] = resolveExpression(doc, val, vars)
    }
    return result
  }

  return expr
}

function applyAggregationOperator(op, args, doc, vars) {
  switch (op) {
    // Arithmetic (in expressions)
    case '$sum': return args.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)
    case '$avg': {
      const nums = args.filter((a) => typeof a === 'number')
      return nums.length ? roundNum(nums.reduce((a, b) => a + b, 0) / nums.length) : null
    }
    case '$min': return args.reduce((a, b) => (compareValues(b, a) < 0 ? b : a))
    case '$max': return args.reduce((a, b) => (compareValues(b, a) > 0 ? b : a))
    case '$add': return args.reduce((a, b) => {
      if (a instanceof Date) return new Date(a.getTime() + b)
      if (b instanceof Date) return new Date(b.getTime() + a)
      return roundNum(a + b)
    })
    case '$subtract': return (() => {
      const [a, b] = args
      if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
      if (a instanceof Date) return new Date(a.getTime() - b)
      return roundNum(a - b)
    })()
    case '$multiply': return roundNum(args.reduce((a, b) => a * b, 1))
    case '$divide': return roundNum(args[0] / args[1])
    case '$mod': return roundNum(args[0] % args[1])
    case '$abs': return Math.abs(args[0])
    case '$ceil': return Math.ceil(args[0])
    case '$floor': return Math.floor(args[0])
    case '$round': {
      const [val, place = 0] = args
      const factor = 10 ** place
      return Math.round(val * factor) / factor
    }
    case '$sqrt': return Math.sqrt(args[0])
    case '$pow': return Math.pow(args[0], args[1])
    case '$log': return Math.log(args[0]) / Math.log(args[1])
    case '$ln': return Math.log(args[0])
    case '$log10': return Math.log10(args[0])
    case '$trunc': {
      const [val, place = 0] = args
      const factor = 10 ** place
      return Math.trunc(val * factor) / factor
    }
    case '$exp': return Math.exp(args[0])

    // Comparison (expression form)
    case '$lt': return args[0] < args[1]
    case '$gt': return args[0] > args[1]
    case '$lte': return args[0] <= args[1]
    case '$gte': return args[0] >= args[1]
    case '$eq': return deepEqual(args[0], args[1])
    case '$ne': return !deepEqual(args[0], args[1])

    // Logical (expression form)
    case '$and': return args.every(Boolean)
    case '$or': return args.some(Boolean)
    case '$not': return !args[0]

    // String
    case '$toUpper': return String(args[0] ?? '').toUpperCase()
    case '$toLower': return String(args[0] ?? '').toLowerCase()
    case '$substr': {
      const [str, start, length] = args
      return String(str).substring(start, start + length)
    }
    case '$substrCP': {
      const [str, start, length] = args
      return [...String(str)].slice(start, start + length).join('')
    }
    case '$substrBytes': {
      const [str, start, length] = args
      return String(str).slice(start, start + length)
    }
    case '$concat': return args.map((a) => a == null ? '' : String(a)).join('')
    case '$split': {
      const [str, delim] = args
      if (str == null) return []
      return String(str).split(String(delim))
    }
    case '$strLenCP': return [...String(args[0] ?? '')].length
    case '$strLenBytes': return new TextEncoder().encode(String(args[0] ?? '')).length
    case '$indexOfCP': {
      const [str, sub, start = 0] = args
      return [...String(str)].join('').indexOf(String(sub), start)
    }
    case '$indexOfBytes': {
      const [str, sub, start = 0] = args
      return String(str).indexOf(String(sub), start)
    }

    // Type conversion
    case '$toString': return args[0] == null ? null : String(args[0])
    case '$toInt': return args[0] == null ? null : Math.trunc(Number(args[0]))
    case '$toLong': return args[0] == null ? null : Math.trunc(Number(args[0]))
    case '$toDouble': return args[0] == null ? null : Number(args[0])
    case '$toBool': return args[0] == null ? null : Boolean(args[0])
    case '$toDate': return args[0] == null ? null : new Date(args[0])
    case '$toObjectId': return args[0] // passthrough in browser context
    case '$convert': {
      // args[0] is the resolved { input, to } object — raw args from single dispatch
      // Actually $convert has structured args; handled separately when needed
      return args[0]
    }
    case '$type': {
      const v = args[0]
      if (v === null) return 'null'
      if (v === undefined) return 'missing'
      if (v instanceof Date) return 'date'
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
      if (!Array.isArray(arr)) return undefined
      return arr[idx < 0 ? arr.length + idx : idx]
    }
    case '$concatArrays': return args.reduce((a, b) => [...(a ?? []), ...(Array.isArray(b) ? b : [])], [])
    case '$size': {
      const v = args[0]
      return Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : null
    }
    case '$slice': {
      const [arr, posOrN, maybeN] = args
      if (!Array.isArray(arr)) return arr
      if (maybeN !== undefined) return arr.slice(posOrN, posOrN + maybeN)
      return posOrN >= 0 ? arr.slice(0, posOrN) : arr.slice(posOrN)
    }
    case '$reverseArray': {
      if (!Array.isArray(args[0])) return args[0]
      return [...args[0]].reverse()
    }
    case '$in': return Array.isArray(args[1]) && args[1].some((v) => deepEqual(v, args[0]))
    case '$indexOfArray': {
      const [arr, search, start = 0] = args
      if (!Array.isArray(arr)) return -1
      for (let i = start; i < arr.length; i++) {
        if (deepEqual(arr[i], search)) return i
      }
      return -1
    }
    case '$range': {
      const [start, end, step = 1] = args
      const result = []
      for (let i = start; step > 0 ? i < end : i > end; i += step) result.push(i)
      return result
    }
    case '$first': {
      const v = args[0]
      return Array.isArray(v) ? v[0] : v
    }
    case '$last': {
      const v = args[0]
      return Array.isArray(v) ? v[v.length - 1] : v
    }
    case '$zip': {
      // args[0] = resolved { inputs, useLongestLength, defaults }
      const [spec] = args
      if (!spec || !Array.isArray(spec.inputs)) return []
      const arrays = spec.inputs
      const len = spec.useLongestLength
        ? Math.max(...arrays.map((a) => a?.length ?? 0))
        : Math.min(...arrays.map((a) => a?.length ?? 0))
      return Array.from({ length: len }, (_, i) =>
        arrays.map((a, j) => a?.[i] ?? (spec.defaults?.[j] ?? null))
      )
    }

    // Set operators
    case '$setUnion': return [...new Set(args.flat().map((v) => JSON.stringify(v)))].map((v) => JSON.parse(v))
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

    // Object
    case '$mergeObjects': return Object.assign({}, ...args.filter((a) => a != null))
    case '$objectToArray': {
      const obj = args[0]
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
      return Object.entries(obj).map(([k, v]) => ({ k, v }))
    }
    case '$arrayToObject': {
      const arr = args[0]
      if (!Array.isArray(arr)) return {}
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
    case '$toDate': return toDate(args[0])

    // Other
    case '$rand': return Math.random()

    default: return args[0]
  }
}

function applyCond(doc, cond, vars) {
  if (Array.isArray(cond)) {
    const [ifExpr, thenExpr, elseExpr] = cond
    return resolveExpression(doc, ifExpr, vars)
      ? resolveExpression(doc, thenExpr, vars)
      : resolveExpression(doc, elseExpr, vars)
  }
  return resolveExpression(doc, cond.if, vars)
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
  for (const branch of branches) {
    if (resolveExpression(doc, branch.case, vars)) {
      return resolveExpression(doc, branch.then, vars)
    }
  }
  return defaultExpr !== undefined ? resolveExpression(doc, defaultExpr, vars) : null
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

function dateToString(d, format = '%Y-%m-%dT%H:%M:%S.%LZ') {
  if (!d || isNaN(d.getTime())) return null
  return format
    .replace('%Y', String(d.getUTCFullYear()).padStart(4, '0'))
    .replace('%m', String(d.getUTCMonth() + 1).padStart(2, '0'))
    .replace('%d', String(d.getUTCDate()).padStart(2, '0'))
    .replace('%H', String(d.getUTCHours()).padStart(2, '0'))
    .replace('%M', String(d.getUTCMinutes()).padStart(2, '0'))
    .replace('%S', String(d.getUTCSeconds()).padStart(2, '0'))
    .replace('%L', String(d.getUTCMilliseconds()).padStart(3, '0'))
    .replace('%j', String((() => { const s = new Date(Date.UTC(d.getUTCFullYear(), 0, 0)); return Math.floor((d - s) / 86400000) })()).padStart(3, '0'))
    .replace('%u', String(d.getUTCDay() === 0 ? 7 : d.getUTCDay()))
    .replace('%w', String(d.getUTCDay()))
    .replace('%V', String(isoWeek(d)).padStart(2, '0'))
    .replace('%G', String(isoWeekYear(d)))
    .replace('%Z', 'UTC')
    .replace('%%', '%')
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
    return name in vars ? vars[name] : obj
  }
  if (Array.isArray(obj)) return obj.map((v) => substituteVars(v, vars))
  if (obj !== null && typeof obj === 'object') {
    const result = {}
    for (const [k, v] of Object.entries(obj)) result[k] = substituteVars(v, vars)
    return result
  }
  return obj
}

function applyFacet(docs, spec, ctx) {
  const result = {}
  for (const [outputField, pipeline] of Object.entries(spec)) {
    const subCtx = { collection: { docs: structuredClone(docs) }, collections: ctx.collections }
    result[outputField] = executePipeline(subCtx, pipeline)
  }
  return [result]
}
