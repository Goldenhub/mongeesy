import { executeQuery } from './execute-query.js'

self.onmessage = ({ data }) => {
  const { id, seed, query } = data
  let outcome = executeQuery(seed, query)
  try {
    self.postMessage({ id, outcome })
  } catch (err) {
    outcome = { ok: false, error: { name: 'Error', message: `The result couldn't be displayed: ${err.message}`, userFacing: true } }
    self.postMessage({ id, outcome })
  }
}
