import dgram from 'node:dgram';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { STATE_NAMES } from '../src/state.mjs';
import { oscFloat } from '../src/osc.mjs';

const trace = (await readFile(new URL('../experiments/001-memory/results/trace.jsonl', import.meta.url), 'utf8'))
  .trim().split('\n').map(JSON.parse);
const socket = dgram.createSocket('udp4');
// Deliberately loopback-only; external destinations require an explicit code/config change.
try {
  for (const frame of trace) {
    for (const [i, name] of STATE_NAMES.entries()) {
      await new Promise((resolve, reject) => socket.send(oscFloat(`/moxi/${name}`, frame.active[i]),
        7400, '127.0.0.1', error => error ? reject(error) : resolve()));
    }
    await setTimeout(1000 / 30);
  }
} finally { socket.close(); }
