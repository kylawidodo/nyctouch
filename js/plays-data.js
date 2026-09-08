import { ROLES, BASE_X, ATTACK_Y } from './constants.js';

function defaultStartPositions() {
  const positions = {};
  for (const role of ROLES) positions[role] = { x: BASE_X[role], y: ATTACK_Y };
  return positions;
}

// flowDirection: -1 means the play develops toward decreasing x (the
// near-link/short side) — true for all 5 base plays per the coaching notes.
const FLOW_SHORT_SIDE = -1;

export const PLAYS = [
  {
    id: 'splitter',
    name: 'Splitter',
    brief:
      'Short-side quickie: a link runs onto the ball at pace instead of the dumping middle splitting sideways.',
    flowDirection: FLOW_SHORT_SIDE,
    actingHalf: 'MID_B',
    startingBallHolder: 'MID_A',
    startPositions: defaultStartPositions(),
    defenseStart: {},
    events: [
      { id: 'p1', from: 'MID_A', to: 'MID_B' },
      { id: 'p2', from: 'MID_B', to: 'NEAR_LINK' },
    ],
    checklist: [
      {
        id: 'dumpOutside',
        text: "Middle A's dump to Middle B is on the outside shoulder of the opposing Middle A",
        predicate: { type: 'passOnShoulder', role: 'MID_A', defender: 'D_MID_A', shoulder: 'OUTSIDE', passEvent: 'p1' },
      },
      {
        id: 'receiverTakesShortSide',
        text: 'Near Link (receiving from half) takes the cornering middle to the short side',
        predicate: { type: 'lateralTrend', role: 'NEAR_LINK', direction: 'flow', sinceEvent: 'p2', windowMs: 1500, minDist: 1.5 },
      },
      {
        id: 'halfStepsInside',
        text: 'Dummy half (Middle B) steps inside before running an inside support line',
        predicate: {
          type: 'stepThenLine', role: 'MID_B', sinceEvent: 'p2', stepDir: 'inside',
          stepMinDist: 0.6, stepMaxMs: 500, lineDir: 'inside', lineWindowMs: 1500,
        },
      },
      {
        id: 'chopLine',
        text: 'Far Link runs a good chop line (angles inward)',
        predicate: { type: 'lateralTrend', role: 'FAR_LINK', direction: 'inside', sinceEvent: 'repStart', windowMs: 'wholeRep', minDist: 2 },
      },
    ],
    tips: [],
  },
  {
    id: 'rooster',
    name: 'Rooster',
    brief: 'Classic 32 peel: a middle dumps for the Near Link, who plays half.',
    flowDirection: FLOW_SHORT_SIDE,
    actingHalf: 'NEAR_LINK',
    startingBallHolder: 'MID_A',
    startPositions: defaultStartPositions(),
    defenseStart: {},
    events: [{ id: 'p1', from: 'MID_A', to: 'NEAR_LINK' }],
    checklist: [
      {
        id: 'dragThenDump',
        text: 'Middle A drags the opposing Middle A before dumping (both middles turn their hips inward)',
        predicate: { type: 'drawsDefender', role: 'MID_A', defender: 'D_MID_A', beforeEvent: 'p1', proximityMax: 4, minLateralAdvance: 1.5 },
      },
      {
        id: 'dumpOutside',
        text: 'The dump to Near Link lands on the outside shoulder of the opposing Middle A',
        predicate: { type: 'passOnShoulder', role: 'MID_A', defender: 'D_MID_A', shoulder: 'OUTSIDE', passEvent: 'p1' },
        after: ['dragThenDump'],
      },
    ],
    tips: ['Speed off the ground — the receiver should accelerate hard into the peel. Not graded: a mouse-drag flick isn’t a reliable stand-in for real acceleration.'],
  },
  {
    id: 'sweeper',
    name: 'Sweeper',
    brief: 'Classic 33: a middle dumps for a middle, with a link wrapping around as a platform.',
    flowDirection: FLOW_SHORT_SIDE,
    actingHalf: 'NEAR_LINK',
    startingBallHolder: 'MID_A',
    startPositions: defaultStartPositions(),
    defenseStart: {},
    events: [{ id: 'p1', from: 'MID_A', to: 'MID_B' }],
    checklist: [
      {
        id: 'dragBeforePass',
        text: 'Middle A drags the middles sideways before passing, rather than running straight into the touch',
        predicate: { type: 'drawsDefender', role: 'MID_A', defender: 'D_MID_A', beforeEvent: 'p1', proximityMax: 4, minLateralAdvance: 1.5 },
      },
      {
        id: 'straightThenAngle',
        text: 'Middle B (the sweeper) attacks the ball running straight before angling to the short side',
        predicate: {
          type: 'straightThenAngle', role: 'MID_B', sinceEvent: 'p1',
          minStraightDist: 2, angleThresholdDeg: 20, angleDir: 'flow',
        },
      },
      {
        id: 'linkWraps',
        text: 'Near Link wraps around as a live support option for the sweeper',
        predicate: { type: 'isLiveOption', role: 'NEAR_LINK', relativeTo: 'MID_B', atEvent: 'repEnd', maxDist: 8 },
      },
    ],
    tips: [],
  },
  {
    id: 'hotdog',
    name: 'Hot Dog',
    brief: 'A 32 sweeper move run specifically with the Near Link — called when the near-side link is weak or too aggressive.',
    flowDirection: FLOW_SHORT_SIDE,
    actingHalf: 'NEAR_LINK',
    startingBallHolder: 'MID_A',
    startPositions: defaultStartPositions(),
    defenseStart: { D_NEAR_LINK: { dx: 1.5 } },
    events: [{ id: 'p1', from: 'MID_A', to: 'NEAR_LINK' }],
    checklist: [
      {
        id: 'dragThenDump',
        text: 'Middle A drags the opposing Middle A before dumping',
        predicate: { type: 'drawsDefender', role: 'MID_A', defender: 'D_MID_A', beforeEvent: 'p1', proximityMax: 4, minLateralAdvance: 1.5 },
      },
      {
        id: 'dumpOutside',
        text: 'The dump to Near Link lands on the outside shoulder of the opposing Middle A',
        predicate: { type: 'passOnShoulder', role: 'MID_A', defender: 'D_MID_A', shoulder: 'OUTSIDE', passEvent: 'p1' },
        after: ['dragThenDump'],
      },
    ],
    tips: ['Called because the near-side link is out of position — notice their defender starts shifted up before you move.'],
  },
  {
    id: 'ml',
    name: 'ML',
    brief: 'Classic 33 peel using the Near Link as the primary striker.',
    flowDirection: FLOW_SHORT_SIDE,
    actingHalf: 'MID_B',
    startingBallHolder: 'MID_A',
    startPositions: defaultStartPositions(),
    defenseStart: {},
    events: [
      { id: 'p1', from: 'MID_A', to: 'MID_B' },
      { id: 'p2', from: 'MID_B', to: 'NEAR_LINK' },
    ],
    checklist: [
      {
        id: 'dumpInside',
        text: 'Middle A dumps on the INSIDE shoulder of the opposing Middle A (turning their shoulders in)',
        predicate: { type: 'passOnShoulder', role: 'MID_A', defender: 'D_MID_A', shoulder: 'INSIDE', passEvent: 'p1' },
      },
      {
        id: 'dumperInsideLine',
        text: 'Middle A runs a good inside line after the dump',
        predicate: { type: 'lateralTrend', role: 'MID_A', direction: 'inside', sinceEvent: 'p1', windowMs: 1500, minDist: 1.5 },
      },
      {
        id: 'dumperLiveOption',
        text: 'Middle A becomes a live receiving option',
        predicate: { type: 'isLiveOption', role: 'MID_A', relativeTo: 'NEAR_LINK', atEvent: 'p2', maxDist: 8 },
      },
      {
        id: 'linkTakesShortSide',
        text: 'Near Link (receiving from half) takes the cornering middle to the short side',
        predicate: { type: 'lateralTrend', role: 'NEAR_LINK', direction: 'flow', sinceEvent: 'p2', windowMs: 1500, minDist: 1.5 },
      },
      {
        id: 'halfLooksAtStriker',
        text: 'Dummy half (Middle B) stays a live option looking at the striking link',
        predicate: { type: 'isLiveOption', role: 'MID_B', relativeTo: 'NEAR_LINK', atEvent: 'p2', maxDist: 8 },
      },
      {
        id: 'chopLine',
        text: 'Far Link runs a good chop line (angles inward)',
        predicate: { type: 'lateralTrend', role: 'FAR_LINK', direction: 'inside', sinceEvent: 'repStart', windowMs: 'wholeRep', minDist: 2 },
      },
    ],
    tips: [],
  },
];
