// Field is in meters. Attack advances toward increasing y.
export const FIELD_WIDTH = 60;
export const FIELD_HEIGHT = 40;

export const ATTACK_Y = 8;
export const DEFENSE_Y = 12;

export const ROLES = ['WING_A', 'NEAR_LINK', 'MID_A', 'MID_B', 'FAR_LINK', 'WING_B'];
export const ROLE_LABELS = {
  WING_A: 'Wing',
  NEAR_LINK: 'Near Link',
  MID_A: 'Middle A',
  MID_B: 'Middle B',
  FAR_LINK: 'Far Link',
  WING_B: 'Wing',
};

export const DEF_ROLES = ROLES.map((r) => 'D_' + r);

export function defRoleOf(role) {
  return 'D_' + role;
}

// Base lateral (x) position for each role, left to right across the field.
export const BASE_X = {
  WING_A: 5,
  NEAR_LINK: 15,
  MID_A: 25,
  MID_B: 35,
  FAR_LINK: 45,
  WING_B: 55,
};

// How hard each defensive role drifts toward the ball-holder's x, and the
// max distance it will shift from its base position. Pure config, reused
// unmodified by every play.
export const DEFENSE_DRIFT = {
  D_WING_A: { drift: 0.15, maxShift: 1 },
  D_NEAR_LINK: { drift: 0.4, maxShift: 2 },
  D_MID_A: { drift: 0.6, maxShift: 3 },
  D_MID_B: { drift: 0.6, maxShift: 3 },
  D_FAR_LINK: { drift: 0.4, maxShift: 2 },
  D_WING_B: { drift: 0.15, maxShift: 1 },
};

// Grading thresholds, in meters/ms/degrees.
export const THRESHOLDS = {
  engagementRadius: 4,
  shoulderDeadzone: 0.5,
  dragProximityMax: 4,
  dragMinLateralAdvance: 1.5,
  chopMinDist: 2,
  liveOptionMaxDist: 8,
  liveOptionMaxAheadY: 0.5,
  angleThresholdDeg: 20,
  minStraightDist: 2,
  stepMinDist: 0.6,
  stepMaxMs: 500,
  lineWindowMs: 1500,
};
