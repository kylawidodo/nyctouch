import { THRESHOLDS, DEFENSE_Y } from './constants.js';
import { getDefenderTrajectoryFn } from './defense-script.js';
import {
  classifyShoulder,
  netLateralDisplacement,
  minDistanceToDefender,
  findHeadingBreak,
  interpolateAt,
  distance,
} from './geometry.js';

// Resolves the play's declared events (from/to) against what was actually
// recorded, matching the first recorded pass with the same from/to values.
function resolveEventTimes(playConfig, rep) {
  const times = {};
  for (const event of playConfig.events) {
    const match = rep.passes.find((p) => p.from === event.from && p.to === event.to);
    times[event.id] = match ? match.t : null;
  }
  return times;
}

function repEndMs(rep) {
  return rep.endedAt - rep.startedAt;
}

function resolveDirection(direction, flowDirection) {
  if (direction === 'flow') return Math.sign(flowDirection);
  if (direction === 'outside') return Math.sign(flowDirection);
  if (direction === 'inside') return -Math.sign(flowDirection);
  throw new Error('Unknown direction: ' + direction);
}

const PREDICATES = {
  passOnShoulder(pred, ctx) {
    const passTime = ctx.eventTimes[pred.passEvent];
    if (passTime == null) {
      return { pass: false, detail: 'That pass never happened.', time: null };
    }
    const path = ctx.rep.paths[pred.role];
    const defenderTrajFn = (t) => ctx.defenderFn(pred.defender, t);
    const result = classifyShoulder(path, defenderTrajFn, DEFENSE_Y, 0, passTime, ctx.play.flowDirection, THRESHOLDS);
    if (result.result === 'NO_ENGAGEMENT') {
      return { pass: false, detail: 'Never actually engaged that defender before passing.', time: passTime };
    }
    if (result.result === 'STRAIGHT') {
      return { pass: false, detail: 'Ran straight at the defender — no clear shoulder.', time: passTime };
    }
    if (result.result !== pred.shoulder) {
      return { pass: false, detail: `Attacked the ${result.result.toLowerCase()} shoulder instead of the ${pred.shoulder.toLowerCase()}.`, time: passTime };
    }
    return { pass: true, detail: '', time: passTime };
  },

  drawsDefender(pred, ctx) {
    const beforeTime = ctx.eventTimes[pred.beforeEvent];
    if (beforeTime == null) {
      return { pass: false, detail: 'That pass never happened.', time: null };
    }
    const path = ctx.rep.paths[pred.role];
    const defenderTrajFn = (t) => ctx.defenderFn(pred.defender, t);
    const minDist = minDistanceToDefender(path, defenderTrajFn, 0, beforeTime);
    const netLateral = netLateralDisplacement(path, 0, beforeTime);
    const towardFlow = Math.sign(netLateral) === Math.sign(ctx.play.flowDirection);
    if (minDist > pred.proximityMax) {
      return { pass: false, detail: 'Never got close enough to the defender to draw them.', time: beforeTime };
    }
    if (Math.abs(netLateral) < pred.minLateralAdvance || !towardFlow) {
      return { pass: false, detail: 'Didn’t run enough of a line toward the defender before passing.', time: beforeTime };
    }
    return { pass: true, detail: '', time: beforeTime };
  },

  lateralTrend(pred, ctx) {
    const t0 = pred.sinceEvent === 'repStart' ? 0 : ctx.eventTimes[pred.sinceEvent];
    if (t0 == null) {
      return { pass: false, detail: 'That pass never happened.', time: null };
    }
    const t1 = pred.windowMs === 'wholeRep' ? repEndMs(ctx.rep) : t0 + pred.windowMs;
    const path = ctx.rep.paths[pred.role];
    const netLateral = netLateralDisplacement(path, t0, t1);
    const requiredSign = resolveDirection(pred.direction, ctx.play.flowDirection);
    if (Math.sign(netLateral) !== requiredSign || Math.abs(netLateral) < pred.minDist) {
      return { pass: false, detail: `Didn’t run far enough ${pred.direction === 'flow' ? 'toward the short side' : pred.direction}.`, time: t1 };
    }
    return { pass: true, detail: '', time: t1 };
  },

  stepThenLine(pred, ctx) {
    const t0 = ctx.eventTimes[pred.sinceEvent];
    if (t0 == null) {
      return { pass: false, detail: 'That pass never happened.', time: null };
    }
    const path = ctx.rep.paths[pred.role];
    const stepEnd = t0 + pred.stepMaxMs;
    const step = netLateralDisplacement(path, t0, stepEnd);
    const stepSign = resolveDirection(pred.stepDir, ctx.play.flowDirection);
    if (Math.sign(step) !== stepSign || Math.abs(step) < pred.stepMinDist) {
      return { pass: false, detail: 'Missed the initial step before running the line.', time: stepEnd };
    }
    const lineEnd = t0 + pred.lineWindowMs;
    const line = netLateralDisplacement(path, t0, lineEnd);
    const lineSign = resolveDirection(pred.lineDir, ctx.play.flowDirection);
    if (Math.sign(line) !== lineSign) {
      return { pass: false, detail: 'Didn’t follow through with an inside line after the step.', time: lineEnd };
    }
    return { pass: true, detail: '', time: lineEnd };
  },

  straightThenAngle(pred, ctx) {
    const t0 = ctx.eventTimes[pred.sinceEvent];
    if (t0 == null) {
      return { pass: false, detail: 'That pass never happened.', time: null };
    }
    const path = ctx.rep.paths[pred.role];
    const t1 = repEndMs(ctx.rep);
    const brk = findHeadingBreak(path, t0, t1, pred.minStraightDist, pred.angleThresholdDeg);
    if (!brk) {
      return { pass: false, detail: 'Ran a single straight line — never broke to the short side.', time: t1 };
    }
    const afterAngle = netLateralDisplacement(path, brk.t, t1);
    const requiredSign = resolveDirection(pred.angleDir, ctx.play.flowDirection);
    if (Math.sign(afterAngle) !== requiredSign) {
      return { pass: false, detail: 'Broke away from the ball too early, or angled the wrong way.', time: brk.t };
    }
    return { pass: true, detail: '', time: brk.t };
  },

  isLiveOption(pred, ctx) {
    const t = pred.atEvent === 'repEnd' ? repEndMs(ctx.rep) : ctx.eventTimes[pred.atEvent];
    if (t == null) {
      return { pass: false, detail: 'That pass never happened.', time: null };
    }
    const posRole = interpolateAt(ctx.rep.paths[pred.role], t);
    const posRel = interpolateAt(ctx.rep.paths[pred.relativeTo], t);
    const dist = distance(posRole, posRel);
    const maxAheadY = pred.maxAheadY != null ? pred.maxAheadY : THRESHOLDS.liveOptionMaxAheadY;
    if (dist > pred.maxDist) {
      return { pass: false, detail: 'Drifted too far away to be a real passing option.', time: t };
    }
    if (posRole.y > posRel.y + maxAheadY) {
      return { pass: false, detail: 'Ran ahead of the ball carrier — not an onside option.', time: t };
    }
    return { pass: true, detail: '', time: t };
  },
};

export function evaluatePlay(playConfig, rep) {
  const eventTimes = resolveEventTimes(playConfig, rep);
  const defenderFn = getDefenderTrajectoryFn(playConfig, rep);
  const ctx = { rep, play: playConfig, eventTimes, defenderFn };

  const resultsById = {};
  const results = [];

  for (const item of playConfig.checklist) {
    const impl = PREDICATES[item.predicate.type];
    let outcome = impl(item.predicate, ctx);

    if (outcome.pass && item.after) {
      for (const depId of item.after) {
        const dep = resultsById[depId];
        if (!dep || !dep.pass) {
          outcome = { pass: false, detail: `Needs "${depId}" done correctly first.`, time: outcome.time };
          break;
        }
        if (dep.time != null && outcome.time != null && dep.time > outcome.time) {
          outcome = { pass: false, detail: `This happened before "${depId}" — should come after.`, time: outcome.time };
          break;
        }
      }
    }

    resultsById[item.id] = outcome;
    results.push({ id: item.id, text: item.text, pass: outcome.pass, detail: outcome.detail });
  }

  return {
    allPass: results.every((r) => r.pass),
    results,
  };
}
