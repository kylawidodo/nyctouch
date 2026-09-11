import { BASE_X, DEFENSE_Y, DEFENSE_DRIFT, defRoleOf } from './constants.js';
import { interpolateAt } from './geometry.js';

// Who holds the ball at time t, derived from recorded passes (never stored
// separately). Falls back to the play's starting ball holder before any pass.
export function currentHolderAt(rep, playConfig, t) {
  let holder = playConfig.startingBallHolder;
  for (const action of (rep.actions || [])) {
    if (action.t > t) break;
    if (action.type === "dump") holder = null;
    if (action.type === "pop") holder = action.player;
    if (action.type === "pass") holder = action.to;
  }
  return holder;
}

export function ballPositionAt(rep, playConfig, t) {
  const holder = currentHolderAt(rep, playConfig, t);
  if (!holder) return rep.dumpPosition || { x: BASE_X[playConfig.startingBallHolder], y: 0 };
  const path = rep.paths[holder];
  return interpolateAt(path, t) || { x: BASE_X[holder], y: 0 };
}

// Returns a pure function (defRole, t) => {x, y}. Same function drives both
// live on-screen defender movement and grading, so they can never disagree.
export function getDefenderTrajectoryFn(playConfig, rep) {
  const ballX0 = ballPositionAt(rep, playConfig, 0).x;
  const overrides = playConfig.defenseStart || {};

  return function defenderTrajFn(defRole, t) {
    const baseRole = defRole.slice(2); // strip 'D_'
    const override = overrides[defRole] || {};
    const baseX = BASE_X[baseRole] + (override.dx || 0);
    const baseY = DEFENSE_Y + (override.dy || 0);
    const { drift, maxShift } = DEFENSE_DRIFT[defRole];

    const lagMs = { D_MID_A: 90, D_MID_B: 90, D_NEAR_LINK: 150, D_FAR_LINK: 150, D_WING_A: 220, D_WING_B: 220 }[defRole] || 150;
    const trackedBall = ballPositionAt(rep, playConfig, Math.max(0, t - lagMs));
    const ballX = trackedBall.x;
    const rawShift = drift * (ballX - ballX0);
    const shift = Math.max(-maxShift, Math.min(maxShift, rawShift));

    const targetY = Math.max(DEFENSE_Y - 4, Math.min(baseY, trackedBall.y + 7));
    return { x: baseX + shift, y: targetY };
  };
}

export { defRoleOf };
