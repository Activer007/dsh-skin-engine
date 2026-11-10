import assert from 'node:assert/strict'
import test from 'node:test'
import { redact } from '../scripts/acceptance/hosts.mjs'

test('acceptance diagnostics keep URL context while removing credentials', () => {
  const output = 'http://127.0.0.1:42/?token=sample%2B&mode=test&access_token=sample#api_key=sample '
    + 'https://user:sample@127.0.0.1/path Authorization: Bearer sample'
  assert.equal(redact(output),
    'http://127.0.0.1:42/?token=[redacted]&mode=test&access_token=[redacted]#api_key=[redacted] '
    + 'https://[redacted]@127.0.0.1/path Authorization: Bearer [redacted]')
})
