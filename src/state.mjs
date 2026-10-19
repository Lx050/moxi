// A hand-designed dynamical state; neither learned latent space nor world model.
export const TAU_SECONDS = Object.freeze([0.35, 1.2, 3]);
export const STATE_NAMES = Object.freeze(['energy', 'turbulence', 'saturation']);

function unit(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number in [0, 1]`);
  }
  return value;
}

export function target({ qi, xin, sheng }) {
  unit(qi, 'qi'); unit(xin, 'xin'); unit(sheng, 'sheng');
  return [0.6 * qi + 0.4 * sheng, 0.7 * (1 - xin) + 0.3 * sheng,
    0.5 * qi + 0.25 * xin + 0.25 * sheng];
}

export class InkState {
  constructor() { this.reset(); }
  reset() { this.state = [0, 0, 0]; }
  step(input, dt) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.25) {
      throw new RangeError('dt must be in (0, 0.25] seconds');
    }
    const destination = target(input);
    // Closed-form first-order update: invariant to sample rate for held inputs.
    this.state = this.state.map((s, i) => destination[i]
      + (s - destination[i]) * Math.exp(-dt / TAU_SECONDS[i]));
    return this.state.slice();
  }
}

export function conditioning(state) {
  if (!Array.isArray(state) || state.length !== 3) throw new TypeError('Expected 3 state values');
  state.forEach((v, i) => unit(v, STATE_NAMES[i]));
  return { schema: 'moxi-conditioning-v1', model: 'hand-designed-state',
    controls: Object.fromEntries(STATE_NAMES.map((name, i) => [name, state[i]])),
    generation: { seed: 17, prompt: 'monochrome ink on warm paper',
      strength: 0.15 + 0.35 * state[2] },
    execution: 'conditioning_only_no_model_called' };
}
