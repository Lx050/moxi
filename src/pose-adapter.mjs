// Accepts MediaPipe PoseLandmarkerResult serialized to JSON. No camera capture.
export function poseToXin(result, previous, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.25) throw new RangeError('Invalid dt');
  const pose = result?.landmarks?.[0];
  const required = [11, 12, 15, 16];
  if (!pose || required.some(i => !pose[i]
      || !Number.isFinite(pose[i].x) || !Number.isFinite(pose[i].y)
      || !Number.isFinite(pose[i].visibility) || pose[i].visibility < 0.7)) {
    return { valid: false, reason: 'pose_missing_or_occluded', xin: null, previous: null };
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const scale = distance(pose[11], pose[12]);
  if (scale < 0.02) return { valid: false, reason: 'body_too_small', xin: null, previous: null };
  // Shoulder-relative wrists cancel global translation; shoulder scale reduces distance effects.
  const centre = { x: (pose[11].x + pose[12].x) / 2, y: (pose[11].y + pose[12].y) / 2 };
  const wrists = [15, 16].map(i => ({ x: (pose[i].x - centre.x) / scale,
    y: (pose[i].y - centre.y) / scale }));
  if (!previous) return { valid: false, reason: 'warming_up', xin: null, previous: wrists };
  const speed = (distance(wrists[0], previous[0]) + distance(wrists[1], previous[1])) / (2 * dt);
  return { valid: true, xin: Math.exp(-speed / 2), previous: wrists,
    meaning: 'wrist_steadiness_proxy_not_emotion_or_heart_rate' };
}
