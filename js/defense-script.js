import { BASE_X, DEFENSE_Y, DEFENSE_DRIFT, defRoleOf } from './constants.js';
import { interpolateAt } from './geometry.js';

// Who holds the ball at time t, derived from recorded passes (never stored
// separately). Falls back to the play's starting ball holder before any pass.
export function currentHolderAt(rep, playConfig, t) {
  let holder = playConfig.startingBallHolder;
  for (const pass of rep.passes) {
    if (pass.t <= t) holder = pass.to;
    else break;
  }
  return holder;
}

export function ballPositionAt(rep, playConfig, t) {
  const holder = currentHolderAt(rep, playConfig, t);
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

    const ballX = ballPositionAt(rep, playConfig, t).x;
    const rawShift = drift * (ballX - ballX0);
    const shift = Math.max(-maxShift, Math.min(maxShift, rawShift));

    return { x: baseX + shift, y: baseY };
  };
}

export { defRoleOf };
