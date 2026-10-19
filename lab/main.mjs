import { InkState, target } from '../src/state.mjs';
const engine = new InkState();
const fields = Object.fromEntries(['qi', 'xin', 'sheng'].map(name => [name, document.getElementById(name)]));
const canvases = ['direct', 'memory'].map(id => document.getElementById(id));
let rows = [], frame = 0, epoch = performance.now(), last = epoch, condition = 'manual';
const input = () => Object.fromEntries(Object.entries(fields).map(([k, el]) => [k, Number(el.value)]));
const set = data => { for (const [k, value] of Object.entries(data)) fields[k].value = value; };
const neutral = { qi: .5, xin: .5, sheng: .5 };
function clear() { for (const c of canvases) c.getContext('2d').clearRect(0, 0, c.width, c.height); }
function reset() { engine.reset(); rows = []; frame = 0; condition = 'manual'; set(neutral); clear(); epoch = last = performance.now(); }
for (const [id, values] of Object.entries({ quiet: { qi: .1, xin: .9, sheng: .1 }, active: { qi: .9, xin: .1, sheng: .9 } })) {
  document.getElementById(id).onclick = () => {
    engine.reset();
    for (let i = 0; i < 180; i++) engine.step(values, 1 / 30);
    condition = `six_second_${id}_history_injected`;
    rows.push({ event: condition, time_ms: performance.now() - epoch, input: values, duration_s: 6 });
    set(neutral); clear(); frame = 0;
  };
}
for (const el of Object.values(fields)) el.oninput = () => { condition = 'manual'; };
document.getElementById('probe').onclick = () => { set(neutral); condition = 'neutral_probe'; };
document.getElementById('reset').onclick = reset;
document.getElementById('record').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 'moxi-browser-log-v1',
    source: 'manual_or_injected_synthetic_history', rows }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'moxi-001-manual.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function draw(c, values, n) {
  const ctx = c.getContext('2d'), x = 20 + (n % 440), [energy, turbulence, saturation] = values;
  if (n % 440 === 0) ctx.clearRect(0, 0, c.width, c.height);
  const y = 160 + 60 * Math.sin(n * .025) + turbulence * 20 * Math.sin(n * .19);
  ctx.fillStyle = `rgba(26,26,26,${.15 + .65 * saturation})`;
  ctx.beginPath(); ctx.ellipse(x, y, 1.5 + 5 * energy, 2 + 10 * energy, 0, 0, Math.PI * 2); ctx.fill();
}
function tick(now) {
  const elapsed = (now - last) / 1000;
  if (elapsed >= 1 / 30) {
    last = now;
    // A hidden tab or long pause resets state explicitly instead of fabricating continuous data.
    if (elapsed > .25) { engine.reset(); rows.push({ event: 'gap_reset', time_ms: now - epoch }); clear(); }
    else {
      const values = input(), direct = target(values), memory = engine.step(values, elapsed);
      draw(canvases[0], direct, frame); draw(canvases[1], memory, frame++);
      rows.push({ time_ms: now - epoch, dt_s: elapsed, condition, input: values, direct, memory });
      if (rows.length > 18000) rows.splice(0, rows.length - 18000);
      document.getElementById('status').textContent = `状态：${memory.map(v => v.toFixed(3)).join(' / ')} · 本地记录 ${rows.length} 条（最多保留最近约十分钟）`;
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
