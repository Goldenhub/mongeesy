import { deepEqual, compareValues, typeRank, getPathValues, isPlainObject, isTruthy } from './utils.js'
import { QueryError, unknownMessage } from './errors.js'
import { resolveExpression } from './pipeline-engine.js'

const TOP_LEVEL_OPERATORS = ['$and', '$or', '$nor', '$expr', '$comment']
const FIELD_OPERATORS = [
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists', '$type',
  '$regex', '$options', '$not', '$elemMatch', '$all', '$size', '$mod',
]

export function evaluateQuery(doc, query) {
  if (query == null) return true
  if (!isPlainObject(query)) {
    throw new QueryError('A filter must be an object, for example { genre: "fiction" }')
  }

  for (const [key, condition] of Object.entries(query)) {
    if (key.startsWith('$')) {
      switch (key) {
        case '$and':
        case '$or':
        case '$nor': {
          if (!Array.isArray(condition) || condition.length === 0) {
            throw new QueryError(`${key} needs a non-empty array of filters, e.g. { ${key}: [ { a: 1 }, { b: 2 } ] }`)
          }
          const results = condition.map((sub) => evaluateQuery(doc, sub))
          if (key === '$and' && !results.every(Boolean)) return false
          if (key === '$or' && !results.some(Boolean)) return false
          if (key === '$nor' && results.some(Boolean)) return false
          continue
        }
        case '$expr':
          if (!isTruthy(resolveExpression(doc, condition))) return false
          continue
        case '$comment':
          continue
        case '$where':
          throw new QueryError('$where is not supported because it runs arbitrary JavaScript. Use $expr instead.')
        default:
          throw new QueryError(unknownMessage('top-level operator', key, TOP_LEVEL_OPERATORS))
      }
    }
    if (!matchValues(getPathValues(doc, key), condition)) return false
  }
  return true
}

// Does a single value satisfy a condition? Used by $pull and $elemMatch.
export function matchesCondition(value, condition) {
  return matchValues([value], condition)
}

function isOperatorObject(condition) {
  if (!isPlainObject(condition)) return false
  const keys = Object.keys(condition)
  if (keys.length === 0 || !keys[0].startsWith('$')) {
    const op = keys.find((k) => k.startsWith('$'))
    if (op) throw new QueryError(`Can't mix operators like ${op} with plain field names in the same object`)
    return false
  }
  const plain = keys.find((k) => !k.startsWith('$'))
  if (plain) throw new QueryError(`Can't mix operators like ${keys[0]} with the plain field name '${plain}' in the same object`)
  return true
}

function matchValues(values, condition) {
  if (!isOperatorObject(condition)) {
    if (condition instanceof RegExp) return values.some((v) => regexMatch(v, condition))
    return values.some((v) => eqMatch(v, condition))
  }

  for (const [op, operand] of Object.entries(condition)) {
    if (!applyOperator(values, op, operand, condition)) return false
  }
  return true
}

// Equality with MongoDB's array semantics: a field holding an array matches
// if the whole array equals the value or any element does.
function eqMatch(v, operand) {
  if (operand === null) {
    return v == null || (Array.isArray(v) && v.some((el) => el === null))
  }
  return deepEqual(v, operand) || (Array.isArray(v) && v.some((el) => deepEqual(el, operand)))
}

function regexMatch(v, re) {
  const test = (s) => {
    re.lastIndex = 0
    return typeof s === 'string' && re.test(s)
  }
  return test(v) || (Array.isArray(v) && v.some(test))
}

function eachOrElement(v, fn) {
  return fn(v) || (Array.isArray(v) && v.some(fn))
}

function compareMatch(v, operand, test) {
  return eachOrElement(v, (x) => x !== undefined && typeRank(x) === typeRank(operand) && test(compareValues(x, operand)))
    || (operand === null && v === undefined && test(0))
}

function requireArray(op, operand) {
  if (!Array.isArray(operand)) throw new QueryError(`${op} needs an array, e.g. { ${op}: [1, 2, 3] }`)
}

function inMatch(values, operand) {
  return values.some((v) => operand.some((o) => (o instanceof RegExp ? regexMatch(v, o) : eqMatch(v, o))))
}

const TYPE_ALIASES = {
  1: 'double', 2: 'string', 3: 'object', 4: 'array', 8: 'bool', 9: 'date', 10: 'null', 11: 'regex', 16: 'int', 18: 'long', 19: 'decimal',
}

function typeMatches(v, wanted) {
  const name = TYPE_ALIASES[wanted] ?? wanted
  switch (name) {
    case 'number': case 'double': case 'decimal': return typeof v === 'number'
    case 'int': case 'long': return Number.isInteger(v)
    case 'string': return typeof v === 'string'
    case 'bool': return typeof v === 'boolean'
    case 'date': return v instanceof Date
    case 'null': return v === null
    case 'regex': return v instanceof RegExp
    case 'array': return Array.isArray(v)
    case 'object': return isPlainObject(v)
    default:
      throw new QueryError(unknownMessage('type', String(wanted), ['double', 'string', 'object', 'array', 'bool', 'date', 'null', 'regex', 'int', 'long', 'decimal', 'number'], (s) => `"${s}"`))
  }
}

function applyOperator(values, op, operand, condition) {
  switch (op) {
    case '$eq': return values.some((v) => eqMatch(v, operand))
    case '$ne': return !values.some((v) => eqMatch(v, operand))
    case '$gt': return values.some((v) => compareMatch(v, operand, (c) => c > 0))
    case '$gte': return values.some((v) => compareMatch(v, operand, (c) => c >= 0))
    case '$lt': return values.some((v) => compareMatch(v, operand, (c) => c < 0))
    case '$lte': return values.some((v) => compareMatch(v, operand, (c) => c <= 0))
    case '$in':
      requireArray(op, operand)
      return inMatch(values, operand)
    case '$nin':
      requireArray(op, operand)
      return !inMatch(values, operand)
    case '$exists': return values.some((v) => v !== undefined) === Boolean(operand)
    case '$type': {
      const wanted = Array.isArray(operand) ? operand : [operand]
      return values.some((v) => v !== undefined && wanted.some((t) => eachOrElement(v, (x) => typeMatches(x, t))))
    }
    case '$regex': {
      const options = condition.$options ?? ''
      let re
      try {
        re = operand instanceof RegExp
          ? (options ? new RegExp(operand.source, options) : operand)
          : new RegExp(String(operand), options)
      } catch (err) {
        throw new QueryError(`Invalid $regex: ${err.message}`)
      }
      return values.some((v) => regexMatch(v, re))
    }
    case '$options':
      if (!('$regex' in condition)) throw new QueryError('$options can only be used together with $regex')
      return true
    case '$not':
      if (!(operand instanceof RegExp) && !isPlainObject(operand)) {
        throw new QueryError('$not needs an operator object or a regex, e.g. { $not: { $gt: 5 } }')
      }
      return !matchValues(values, operand)
    case '$elemMatch': {
      if (!isPlainObject(operand)) throw new QueryError('$elemMatch needs an object')
      const keys = Object.keys(operand)
      const queryStyle = keys.some((k) => !k.startsWith('$') || TOP_LEVEL_OPERATORS.includes(k))
      return values.some((v) => Array.isArray(v) && v.some((el) => (
        queryStyle ? isPlainObject(el) && evaluateQuery(el, operand) : matchesCondition(el, operand)
      )))
    }
    case '$all':
      requireArray(op, operand)
      if (operand.length === 0) return false
      return values.some((v) => operand.every((o) => (
        isPlainObject(o) && '$elemMatch' in o
          ? applyOperator([v], '$elemMatch', o.$elemMatch, o)
          : eqMatch(v, o)
      )))
    case '$size':
      if (typeof operand !== 'number') throw new QueryError('$size needs a number')
      return values.some((v) => Array.isArray(v) && v.length === operand)
    case '$mod': {
      if (!Array.isArray(operand) || operand.length !== 2 || operand.some((n) => typeof n !== 'number')) {
        throw new QueryError('$mod needs [divisor, remainder], e.g. { $mod: [4, 0] }')
      }
      if (operand[0] === 0) throw new QueryError('$mod divisor cannot be 0')
      const [d, r] = operand
      return values.some((v) => eachOrElement(v, (x) => typeof x === 'number' && Math.trunc(x) % d === r))
    }
    case '$where':
      throw new QueryError('$where is not supported because it runs arbitrary JavaScript. Use $expr instead.')
    default:
      throw new QueryError(unknownMessage('query operator', op, FIELD_OPERATORS))
  }
}
