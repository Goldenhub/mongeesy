import { deepEqual } from './utils.js'

export function evaluateQuery(doc, query) {
  if (!query || Object.keys(query).length === 0) return true

  for (const [key, condition] of Object.entries(query)) {
    if (key === '$and') {
      if (!condition.every((sub) => evaluateQuery(doc, sub))) return false
      continue
    }
    if (key === '$or') {
      if (!condition.some((sub) => evaluateQuery(doc, sub))) return false
      continue
    }
    if (key === '$nor') {
      if (condition.some((sub) => evaluateQuery(doc, sub))) return false
      continue
    }
    if (key === '$where') {
      if (typeof condition === 'string') {
        try { return new Function('doc', `return ${condition}`)(doc) } catch { return false }
      }
      if (typeof condition === 'function') return condition(doc)
      return false
    }
    if (key === '$expr') {
      return evaluateExpression(doc, condition)
    }

    const docVal = getNestedValue(doc, key)
    if (!matchCondition(docVal, condition)) return false
  }
  return true
}

function getNestedValue(doc, path) {
  const parts = path.split('.')
  let val = doc
  for (const part of parts) {
    if (val == null || typeof val !== 'object') return undefined
    val = val[part]
  }
  return val
}

function matchCondition(docVal, condition) {
  // null shorthand: { field: null } matches null and missing
  if (condition === null) return docVal == null

  if (typeof condition !== 'object' || condition instanceof RegExp) {
    if (condition instanceof RegExp) return condition.test(String(docVal))
    return docVal === condition
  }

  if (Array.isArray(condition)) {
    return condition.some((item) => matchCondition(docVal, item))
  }

  // Pre-process $regex + $options combination
  if (typeof condition.$regex !== 'undefined' && typeof condition.$options !== 'undefined') {
    const regex = condition.$regex instanceof RegExp
      ? condition.$regex
      : new RegExp(condition.$regex, condition.$options)
    if (!regex.test(String(docVal))) return false
    // Continue to process any remaining operators (excluding $regex/$options)
    const rest = Object.entries(condition).filter(([op]) => op !== '$regex' && op !== '$options')
    for (const [op, operand] of rest) {
      if (!applySingleOp(docVal, op, operand, condition)) return false
    }
    return true
  }

  for (const [op, operand] of Object.entries(condition)) {
    if (!applySingleOp(docVal, op, operand, condition)) return false
  }
  return true
}

function applySingleOp(docVal, op, operand, fullCondition) {
  switch (op) {
    case '$eq': return docVal == null && operand == null ? true : docVal === operand
    case '$ne': return docVal !== operand
    case '$gt': return docVal > operand
    case '$gte': return docVal >= operand
    case '$lt': return docVal < operand
    case '$lte': return docVal <= operand
    case '$in': return Array.isArray(operand) && operand.some((v) => deepEqual(v, docVal))
    case '$nin': return Array.isArray(operand) && operand.every((v) => !deepEqual(v, docVal))
    case '$exists': return operand ? docVal !== undefined : docVal === undefined
    case '$type': {
      const bsonType = typeof docVal === 'number' ? 'number'
        : typeof docVal === 'string' ? 'string'
        : typeof docVal === 'boolean' ? 'bool'
        : Array.isArray(docVal) ? 'array'
        : docVal === null ? 'null'
        : docVal instanceof Date ? 'date'
        : typeof docVal === 'object' ? 'object' : typeof docVal
      return bsonType === operand
    }
    case '$regex': {
      const flags = fullCondition.$options ?? ''
      const regex = operand instanceof RegExp ? operand : new RegExp(operand, flags)
      return regex.test(String(docVal))
    }
    case '$options': return true // handled with $regex above
    case '$not': return !matchCondition(docVal, operand)
    case '$elemMatch': {
      if (!Array.isArray(docVal)) return false
      return docVal.some((item) => evaluateQuery(item, operand))
    }
    case '$all': {
      if (!Array.isArray(docVal) || !Array.isArray(operand)) return false
      return operand.every((v) => docVal.some((item) => deepEqual(item, v)))
    }
    case '$size': {
      return Array.isArray(docVal) && docVal.length === operand
    }
    case '$mod': {
      return Array.isArray(operand) && operand.length >= 2 && typeof docVal === 'number'
        && docVal % operand[0] === operand[1]
    }
    default: return false
  }
}

function evaluateExpression(doc, expr) {
  if (!expr || typeof expr !== 'object') return !!expr

  if (expr.$eq) return resolveExpr(doc, expr.$eq[0]) === resolveExpr(doc, expr.$eq[1])
  if (expr.$ne) return resolveExpr(doc, expr.$ne[0]) !== resolveExpr(doc, expr.$ne[1])
  if (expr.$gt) return resolveExpr(doc, expr.$gt[0]) > resolveExpr(doc, expr.$gt[1])
  if (expr.$gte) return resolveExpr(doc, expr.$gte[0]) >= resolveExpr(doc, expr.$gte[1])
  if (expr.$lt) return resolveExpr(doc, expr.$lt[0]) < resolveExpr(doc, expr.$lt[1])
  if (expr.$lte) return resolveExpr(doc, expr.$lte[0]) <= resolveExpr(doc, expr.$lte[1])
  if (expr.$and) return expr.$and.every((e) => evaluateExpression(doc, e))
  if (expr.$or) return expr.$or.some((e) => evaluateExpression(doc, e))
  if (expr.$not) return !evaluateExpression(doc, expr.$not)
  return true
}

function resolveExpr(doc, expr) {
  if (typeof expr === 'string' && expr.startsWith('$')) {
    return getNestedValue(doc, expr.slice(1))
  }
  if (typeof expr === 'number' || typeof expr === 'boolean' || expr === null) return expr
  if (Array.isArray(expr)) return expr.map((e) => resolveExpr(doc, e))
  if (typeof expr === 'object') {
    const result = {}
    for (const [k, v] of Object.entries(expr)) result[k] = resolveExpr(doc, v)
    return result
  }
  return expr
}
