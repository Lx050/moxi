import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { InkState, target, conditioning, TAU_SECONDS } from '../src/state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const protocolPath = 'experiments/001-memory/protocol.json';
const raw = await readFile(root + protocolPath);
const p = JSON.parse(raw);
const engines = Object.fromEntries(Object.keys(p.histories).map(name => [name, new InkState()]));
const dt = 1 / p.fps;
for (let n = 0; n < p.history_seconds * p.fps; n++) {
  for (const [name, input] of Object.entries(p.histories)) engines[name].step(input, dt);
}
const trace = [], durations = [];
for (let n = 1; n <= p.probe_seconds * p.fps; n++) {
  const begin = performance.now();
  const quiet = engines.quiet.step(p.probe, dt), active = engines.active.step(p.probe, dt);
  durations.push((performance.now() - begin) / 2);
  trace.push({ frame: n, time_s: n / p.fps, input: p.probe, quiet, active,
    baseline: target(p.probe), gap: Math.hypot(...quiet.map((v, i) => v - active[i])) });
}
const t = p.targets;
const baselineQuiet = target(p.probe), baselineActive = target({ ...p.probe });
const bounds = trace.every(frame => [...frame.quiet, ...frame.active].every(v => v >= t.state_bounds_min && v <= t.state_bounds_max));
const metrics = { gap_at_1s: trace[p.fps - 1].gap, gap_at_30s: trace.at(-1).gap,
  baseline_gap: Math.hypot(...baselineQuiet.map((v, i) => v - baselineActive[i])), state_bounds_ok: bounds,
  core_step_p95_ms: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] };
const checks = { history_retention: metrics.gap_at_1s >= t.gap_at_1s_min,
  convergence: metrics.gap_at_30s <= t.gap_at_30s_max,
  baseline_independence: metrics.baseline_gap <= t.baseline_gap_max, bounds };
const sourcePaths = ['src/state.mjs', 'scripts/run-experiment.mjs', protocolPath];
const hashes = {};
for (const path of sourcePaths) hashes[path] = createHash('sha256').update(await readFile(root + path)).digest('hex');
const traceText = trace.map(row => JSON.stringify(row)).join('\n') + '\n';
const report = { experiment: p.id, executed_at: new Date().toISOString(), runtime: process.version,
  source_commit_before_run: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  source_sha256: hashes, trace_sha256: createHash('sha256').update(traceText).digest('hex'),
  data_kind: p.input_source, parameters: { tau_seconds: TAU_SECONDS, fps: p.fps }, metrics, checks,
  engineering_checks_passed: Object.values(checks).every(Boolean),
  human_validation: 'not_run', touchdesigner_runtime: 'not_run', mediapipe_live_inference: 'not_run',
  aigc_generation: 'not_run', conditioning_example: conditioning(trace[p.fps - 1].active),
  next_iteration: 'Measure controllability and overshoot versus direct mapping; first add a reproducible target-tracking task. Do not call this a learned world model.' };
const out = root + 'experiments/001-memory/results/';
await mkdir(out, { recursive: true });
await writeFile(out + 'trace.jsonl', traceText);
await writeFile(out + 'report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.engineering_checks_passed) process.exitCode = 1;
