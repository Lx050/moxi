import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { InkState, target, TAU_SECONDS } from '../src/state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const protocolPath = 'experiments/002-tracking/protocol.json';
const bytes = await readFile(root + protocolPath);
const protocol = JSON.parse(bytes);

export function buildCommands({ seed, transition_count }) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const commands = [];
  let previous = null;
  while (commands.length < transition_count) {
    const input = Object.fromEntries(['qi', 'xin', 'sheng'].map(name => [name, random() < 0.5 ? 0.1 : 0.9]));
    if (Object.keys(input).every(name => input[name] === previous?.[name])) continue;
    commands.push(input);
    previous = input;
  }
  return commands;
}

export function evaluateScale(protocol, commands, scale) {
  const dt = 1 / protocol.fps;
  const first = target(commands[0]);
  const engine = new InkState();
  // All conditions start at the exact same first target after the fixed warm-up.
  engine.state = first.slice();
  const rows = [];
  const transitions = [];
  let previousTarget = first;
  let durationSumMs = 0;
  let updateCount = 0;
  let index = 0;

  for (let segment = 0; segment < commands.length; segment++) {
    const desired = target(commands[segment]);
    const distance = Math.hypot(...desired.map((v, i) => v - previousTarget[i]));
    const segmentRows = [];
    const count = (segment === commands.length - 1
      ? protocol.segment_seconds + protocol.settle_tail_seconds
      : protocol.segment_seconds) * protocol.fps;
    for (let frame = 0; frame < count; frame++) {
      const begin = performance.now();
      let values;
      if (scale === 0) values = desired.slice();
      else {
        const adjusted = TAU_SECONDS.map(tau => tau * scale);
        engine.state = engine.state.map((current, i) => desired[i]
          + (current - desired[i]) * Math.exp(-dt / adjusted[i]));
        values = engine.state.slice();
      }
      durationSumMs += performance.now() - begin;
      updateCount++;
      const row = { frame: index++, scale, segment, time_s: frame / protocol.fps,
        command: commands[segment], target: desired, state: values,
        error: Math.hypot(...values.map((v, i) => v - desired[i])) };
      rows.push(row);
      segmentRows.push(row);
    }

    if (distance >= 0.1) {
      const threshold = distance * protocol.settling.error_fraction_of_step;
      const stableFrames = Math.ceil(protocol.settling.stable_seconds * protocol.fps);
      let settledAt = null;
      for (let start = 0; start + stableFrames <= protocol.segment_seconds * protocol.fps; start++) {
        if (segmentRows.slice(start, start + stableFrames).every(row => row.error <= threshold)) {
          settledAt = start / protocol.fps;
          break;
        }
      }
      let overshoot = 0, dimensions = 0;
      for (let i = 0; i < desired.length; i++) {
        const delta = desired[i] - previousTarget[i];
        if (Math.abs(delta) < 1e-9) continue;
        const worst = Math.max(0, ...segmentRows.map(row => delta > 0
          ? (row.state[i] - desired[i]) / delta
          : (desired[i] - row.state[i]) / Math.abs(delta)));
        overshoot += worst;
        dimensions++;
      }
      transitions.push({ segment, distance, settled_at_seconds: settledAt,
        settling_censored: settledAt === null, normalized_overshoot: dimensions ? overshoot / dimensions : 0 });
    }
    previousTarget = desired;
  }

  const errors = rows.flatMap(row => row.state.map((v, i) => v - row.target[i]));
  const settleTimes = transitions.filter(t => t.settled_at_seconds !== null)
    .map(t => t.settled_at_seconds).sort((a, b) => a - b);
  const percentile = (values, q) => values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * q) - 1)] : null;
  return { rows, transitions, metrics: {
    normalized_rmse: Math.sqrt(errors.reduce((sum, x) => sum + x * x, 0) / errors.length),
    max_absolute_error: Math.max(...errors.map(Math.abs)),
    settling_fraction: transitions.length ? settleTimes.length / transitions.length : 1,
    settling_p95_seconds: percentile(settleTimes, 0.95),
    censored_transitions: transitions.filter(t => t.settling_censored).length,
    normalized_overshoot_mean: transitions.length
      ? transitions.reduce((sum, t) => sum + t.normalized_overshoot, 0) / transitions.length : 0,
    core_update_mean_ms: durationSumMs / updateCount,
    core_update_count: updateCount,
  } };
}

const commands = buildCommands(protocol);
const trials = protocol.time_constant_scales.map(scale => {
  const result = evaluateScale(protocol, commands, scale);
  return { scale, metrics: result.metrics, transitions: result.transitions, rows: result.rows };
});
const baseline = trials.find(trial => trial.scale === 0);
const targetRules = protocol.targets;
const candidates = trials.filter(trial => trial.scale > 0
  && trial.metrics.normalized_rmse <= targetRules.candidate_rmse_max
  && trial.metrics.settling_fraction >= targetRules.candidate_settle_fraction_min
  && trial.metrics.settling_p95_seconds !== null
  && trial.metrics.settling_p95_seconds <= targetRules.candidate_settle_p95_seconds_max);
const checks = {
  instantaneous_baseline: baseline.metrics.normalized_rmse <= targetRules.baseline_rmse_max,
  all_values_bounded: trials.every(trial => trial.rows.every(row => row.state.every(v => v >= targetRules.state_min && v <= targetRules.state_max))),
  seeded_commands_reproducible: JSON.stringify(commands) === JSON.stringify(buildCommands(protocol)),
  at_least_one_candidate_meets_preregistered_targets: candidates.length > 0,
};
const sourcePaths = ['src/state.mjs', 'scripts/run-tracking-experiment.mjs', protocolPath];
const source_sha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
  [path, createHash('sha256').update(await readFile(root + path)).digest('hex')])));
const payload = trials.flatMap(trial => trial.rows.map(({ scale, frame, segment, time_s, command, target: targetState, state, error }) =>
  JSON.stringify({ scale, frame, segment, time_s, command, target: targetState, state, error }))).join('\n') + '\n';
const report = {
  experiment: protocol.id,
  executed_at: new Date().toISOString(),
  runtime: process.version,
  source_commit_before_run: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  source_sha256,
  trace_sha256: createHash('sha256').update(payload).digest('hex'),
  input_sha256: createHash('sha256').update(JSON.stringify(commands)).digest('hex'),
  data_kind: protocol.input_source,
  task: { fps: protocol.fps, transitions: protocol.transition_count, segment_seconds: protocol.segment_seconds,
    warmup_seconds: protocol.warmup_seconds, final_settle_tail_seconds: protocol.settle_tail_seconds,
    command_count: commands.length, scales: protocol.time_constant_scales },
  pre_registered_targets: targetRules,
  metrics_by_scale: Object.fromEntries(trials.map(({ scale, metrics }) => [String(scale), metrics])),
  transitions_by_scale: Object.fromEntries(trials.map(({ scale, transitions }) => [String(scale), transitions])),
  candidate_scales: candidates.map(trial => trial.scale),
  checks,
  engineering_run_passed: checks.instantaneous_baseline && checks.all_values_bounded && checks.seeded_commands_reproducible,
  hypothesis_outcome: candidates.length ? 'supported_within_preregistered_synthetic_targets' : 'not_supported_within_preregistered_synthetic_targets',
  hypothesis_scope: 'A supported candidate is only a promising engineering setting on one synthetic task, not evidence of user benefit.',
  human_validation: 'not_run',
  touchdesigner_runtime: 'not_run',
  mediapipe_live_inference: 'not_run',
  aigc_generation: 'not_run',
  next_iteration: candidates.length
    ? `Take the lowest-lag passing scale ${candidates[0].scale} into a controlled browser usability task; preregister a within-person direct-mapping comparison.`
    : 'Inspect per-channel lag and settling traces; consider state-specific time constants or a user-controlled reset before collecting any human data.',
};
const output = root + 'experiments/002-tracking/results/';
await mkdir(output, { recursive: true });
await writeFile(output + 'trace.jsonl', payload);
await writeFile(output + 'report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.engineering_run_passed) process.exitCode = 1;
