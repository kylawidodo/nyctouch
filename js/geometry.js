// Pure math helpers over recorded polylines: [{x, y, t}, ...] sorted by t (ms).

export function interpolateAt(path, t) {
  if (!path || path.length === 0) return null;
  if (t <= path[0].t) return { x: path[0].x, y: path[0].y };
  const last = path[path.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (t <= b.t) {
      const span = b.t - a.t;
      const f = span === 0 ? 0 : (t - a.t) / span;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return { x: last.x, y: last.y };
}

export function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

export function netLateralDisplacement(path, t0, t1) {
  const p0 = interpolateAt(path, t0);
  const p1 = interpolateAt(path, t1);
  if (!p0 || !p1) return 0;
  return p1.x - p0.x;
}

// First time (within [tMin, tMax]) the path's y crosses from below targetY to
// at-or-above it, interpolated to sub-sample accuracy. Depth is treated as
// static (v1 defenders don't move in y), so this only needs the attacker's
// own recorded points.
export function findDepthCrossing(path, targetY, tMin, tMax) {
  if (!path || path.length === 0) return null;
  const pts = path.filter((p) => p.t >= tMin && p.t <= tMax);
  let prev = null;
  for (const p of pts) {
    if (prev && prev.y < targetY && p.y >= targetY) {
      const span = p.y - prev.y;
      const f = span === 0 ? 0 : (targetY - prev.y) / span;
      return { t: prev.t + (p.t - prev.t) * f, x: prev.x + (p.x - prev.x) * f };
    }
    prev = p;
  }
  return null;
}

// Closest approach between a role's path and a (possibly moving) defender
// over a time window. defenderTrajFn(t) -> {x, y}.
export function minDistanceToDefender(path, defenderTrajFn, tMin, tMax) {
  if (!path || path.length === 0) return Infinity;
  const pts = path.filter((p) => p.t >= tMin && p.t <= tMax);
  const samplePoints = pts.length ? pts : [interpolateAt(path, tMin)];
  let min = Infinity;
  for (const p of samplePoints) {
    const d = defenderTrajFn(p.t);
    const dist = Math.hypot(p.x - d.x, p.y - d.y);
    if (dist < min) min = dist;
  }
  return min;
}

// Classifies which shoulder (relative to attacking flow direction) a path
// passed a defender on, within [tMin, tMax]. Returns one of:
// 'OUTSIDE' | 'INSIDE' | 'STRAIGHT' | 'NO_ENGAGEMENT'
export function classifyShoulder(path, defenderTrajFn, targetY, tMin, tMax, flowDirection, thresholds) {
  const crossing = findDepthCrossing(path, targetY, tMin, tMax);
  const minDist = minDistanceToDefender(path, defenderTrajFn, tMin, tMax);
  if (!crossing || minDist > thresholds.engagementRadius) {
    return { result: 'NO_ENGAGEMENT', minDist };
  }
  const defenderAtCrossing = defenderTrajFn(crossing.t);
  const dx = crossing.x - defenderAtCrossing.x;
  if (Math.abs(dx) < thresholds.shoulderDeadzone) {
    return { result: 'STRAIGHT', dx, t: crossing.t };
  }
  const side = Math.sign(dx) === Math.sign(flowDirection) ? 'OUTSIDE' : 'INSIDE';
  return { result: side, dx, t: crossing.t };
}

// Per-segment heading (radians), and the first point past `minDist` of
// cumulative travel where heading has broken away from the initial heading
// by more than `thresholdDeg`. Used for Sweeper's "straight, then angle".
export function findHeadingBreak(path, t0, t1, minDist, thresholdDeg) {
  const pts = (path || []).filter((p) => p.t >= t0 && p.t <= t1);
  if (pts.length < 2) return null;
  const initialHeading = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  let cumulative = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    cumulative += segLen;
    const heading = Math.atan2(b.y - a.y, b.x - a.x);
    let diffDeg = Math.abs(((heading - initialHeading + Math.PI) % (2 * Math.PI)) - Math.PI) * (180 / Math.PI);
    if (cumulative >= minDist && diffDeg > thresholdDeg) {
      return { t: b.t, x: b.x, y: b.y, cumulativeBeforeBreak: cumulative - segLen };
    }
  }
  return null;
}
