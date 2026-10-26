import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommands, evaluateScale } from '../scripts/run-tracking-experiment.mjs';

const protocol = { seed: 9, transition_count: 4, fps: 10, segment_seconds: 2,
  settle_tail_seconds: 2, settling: { error_fraction_of_step: .1, stable_seconds: .2 } };

test('tracking command sequence is deterministic and changes targets', () => {
  const a = buildCommands(protocol), b = buildCommands(protocol);
  assert.deepEqual(a, b);
  assert.equal(a.length, protocol.transition_count);
  for (let i = 1; i < a.length; i++) assert.notDeepEqual(a[i], a[i - 1]);
});

test('direct mapping has zero tracking error and zero settling delay', () => {
  const commands = buildCommands(protocol), result = evaluateScale(protocol, commands, 0);
  assert.equal(result.metrics.normalized_rmse, 0);
  assert.equal(result.metrics.settling_p95_seconds, 0);
  assert.equal(result.metrics.censored_transitions, 0);
});

test('larger time constants do not respond faster and every state remains bounded', () => {
  const commands = buildCommands(protocol);
  const fast = evaluateScale(protocol, commands, .1), slow = evaluateScale(protocol, commands, 1);
  assert.ok(slow.metrics.normalized_rmse >= fast.metrics.normalized_rmse);
  assert.ok([...fast.rows, ...slow.rows].every(row => row.state.every(v => v >= 0 && v <= 1)));
  assert.ok(slow.metrics.censored_transitions >= fast.metrics.censored_transitions);
});
