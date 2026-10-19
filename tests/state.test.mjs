import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { InkState, target, conditioning } from '../src/state.mjs';
import { oscFloat } from '../src/osc.mjs';
import { poseToXin } from '../src/pose-adapter.mjs';
const neutral = { qi: .5, xin: .5, sheng: .5 };

test('held-input state is sample-rate invariant', () => {
  const run = fps => { const s = new InkState(); for (let i = 0; i < fps * 3; i++) s.step(neutral, 1 / fps); return s.state; };
  run(30).forEach((v, i) => assert.ok(Math.abs(v - run(120)[i]) < 1e-12));
});
test('same input retains history while direct baseline is history independent', () => {
  const a = new InkState(), b = new InkState();
  for (let i = 0; i < 180; i++) {
    a.step({ qi: .1, xin: .9, sheng: .1 }, 1 / 30);
    b.step({ qi: .9, xin: .1, sheng: .9 }, 1 / 30);
  }
  for (let i = 0; i < 30; i++) { a.step(neutral, 1 / 30); b.step(neutral, 1 / 30); }
  assert.ok(Math.hypot(...a.state.map((v, i) => v - b.state[i])) > .1);
  assert.deepEqual(target(neutral), target({ ...neutral }));
});
test('reject corrupt samples without mutating the previous state', () => {
  const s = new InkState(); s.step(neutral, .1); const before = s.state.slice();
  for (const invalid of [NaN, Infinity, -1, 1.1, '0.5']) {
    assert.throws(() => s.step({ ...neutral, qi: invalid }, .1)); assert.deepEqual(s.state, before);
  }
  for (const dt of [0, -.1, 1, NaN]) assert.throws(() => s.step(neutral, dt));
  s.reset(); assert.deepEqual(s.state, [0, 0, 0]);
});
test('all extreme input combinations remain bounded and converge', () => {
  for (const qi of [0, 1]) for (const xin of [0, 1]) for (const sheng of [0, 1]) {
    const s = new InkState(), input = { qi, xin, sheng };
    for (let i = 0; i < 1200; i++) {
      s.step(input, 1 / 30); assert.ok(s.state.every(v => v >= 0 && v <= 1));
    }
    s.state.forEach((v, i) => assert.ok(Math.abs(v - target(input)[i]) < 1e-5));
  }
});
test('MediaPipe pose adapter rejects missing/occluded data and cancels translation', () => {
  assert.equal(poseToXin({}, null, .1).valid, false);
  const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: .9 }));
  pose[11].x = .3; pose[12].x = .7; pose[15].y = .8; pose[16].y = .8;
  const initial = poseToXin({ landmarks: [pose] }, null, .1);
  assert.equal(initial.reason, 'warming_up');
  const shifted = pose.map(p => ({ ...p, x: p.x + .1 }));
  assert.ok(poseToXin({ landmarks: [shifted] }, initial.previous, .1).xin > .99999);
  shifted[15].visibility = .2;
  assert.equal(poseToXin({ landmarks: [shifted] }, initial.previous, .1).valid, false);
});
test('conditioning describes values without claiming model execution', () => {
  assert.equal(conditioning([.1, .2, .3]).execution, 'conditioning_only_no_model_called');
  assert.throws(() => conditioning([NaN, .2, .3]));
});
test('OSC loopback receives correctly aligned address, type tag and big-endian float', async () => {
  const receiver = dgram.createSocket('udp4'), sender = dgram.createSocket('udp4');
  try {
    await new Promise(resolve => receiver.bind(0, '127.0.0.1', resolve));
    const received = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('OSC timeout')), 2000);
      receiver.once('message', data => { clearTimeout(timeout); resolve(data); });
    });
    const packet = oscFloat('/moxi/energy', .75);
    await new Promise((resolve, reject) => sender.send(packet, receiver.address().port, '127.0.0.1', err => err ? reject(err) : resolve()));
    const data = await received;
    assert.equal(data.subarray(0, 12).toString(), '/moxi/energy');
    assert.equal(data.subarray(16, 18).toString(), ',f');
    assert.equal(data.readFloatBE(data.length - 4), .75);
    assert.equal(data.length % 4, 0);
  } finally { sender.close(); receiver.close(); }
});
