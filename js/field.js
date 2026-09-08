import {
  ROLES, DEF_ROLES, ROLE_LABELS, ATTACK_Y, DEFENSE_Y, FIELD_WIDTH, FIELD_HEIGHT,
  HALFWAY_Y, TEN_METRE_LINE_OFFSET, TAP_MAX_MOVEMENT, TAP_MAX_DURATION_MS,
} from './constants.js';
import { getDefenderTrajectoryFn, currentHolderAt } from './defense-script.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OFFENSE_RADIUS = 1.4;
const DEFENSE_RADIUS = 1.4;
const HOLDER_RING_RADIUS = OFFENSE_RADIUS + 0.5;
const ARMED_RING_RADIUS = OFFENSE_RADIUS + 0.9;

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  return node;
}

// Attack advances toward increasing game-y. The field is rendered flipped so
// attack points up-screen, purely visually: every dot/line is drawn with its
// raw game coordinates inside a vertically-mirrored <g>, so none of the
// gameplay math (geometry.js, defense-script.js, checklist-engine.js) needs
// to know about screen orientation at all.
function gameToScreenY(gameY) {
  return FIELD_HEIGHT - gameY;
}

export class Field {
  constructor(svg) {
    this.svg = svg;
    this.svg.setAttribute('viewBox', `0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}`);
    this.play = null;
    this.rep = null;
    this.recording = false;
    this.dragRole = null;
    this.dragStart = null;
    this.dragMoved = false;
    this.armedRole = null;
    this._buildStaticField();
    this._buildMarkings();
    this._buildDots();
    this._bindPointerEvents();
    this._raf = null;
  }

  _buildStaticField() {
    const bg = el('rect', { x: 0, y: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT, fill: '#2e7d32' });
    this.svg.appendChild(bg);
    const border = el('rect', {
      x: 0.1, y: 0.1, width: FIELD_WIDTH - 0.2, height: FIELD_HEIGHT - 0.2,
      fill: 'none', stroke: 'white', 'stroke-width': 0.2,
    });
    this.svg.appendChild(border);

    this.flipGroup = el('g', { transform: `matrix(1,0,0,-1,0,${FIELD_HEIGHT})` });
    this.svg.appendChild(this.flipGroup);
  }

  _buildMarkings() {
    const dashedLine = (y) => el('line', {
      x1: 0, y1: y, x2: FIELD_WIDTH, y2: y,
      stroke: 'rgba(255,255,255,0.55)', 'stroke-width': 0.15, 'stroke-dasharray': '1,1',
    });
    const solidLine = (y) => el('line', {
      x1: 0, y1: y, x2: FIELD_WIDTH, y2: y,
      stroke: 'rgba(255,255,255,0.85)', 'stroke-width': 0.2,
    });

    // Advantage line — functionally meaningful, the defensive alignment.
    this.flipGroup.appendChild(dashedLine(DEFENSE_Y));

    // Halfway + 10m broken lines — purely decorative field context (a
    // mid-field zoom), no gameplay logic reads these.
    this.flipGroup.appendChild(solidLine(HALFWAY_Y));
    this.flipGroup.appendChild(dashedLine(HALFWAY_Y - TEN_METRE_LINE_OFFSET));
    this.flipGroup.appendChild(dashedLine(HALFWAY_Y + TEN_METRE_LINE_OFFSET));
  }

  _buildDots() {
    this.offenseEls = {};
    this.defenseEls = {};
    this.labelEls = {};

    for (const role of DEF_ROLES) {
      const c = el('circle', { r: DEFENSE_RADIUS, fill: '#c62828', stroke: '#7f0000', 'stroke-width': 0.2 });
      this.flipGroup.appendChild(c);
      this.defenseEls[role] = c;
    }

    this.holderRingEl = el('circle', {
      r: HOLDER_RING_RADIUS, fill: 'none', stroke: '#fdd835', 'stroke-width': 0.3,
    });
    this.flipGroup.appendChild(this.holderRingEl);

    this.armedRingEl = el('circle', {
      r: ARMED_RING_RADIUS, fill: 'none', stroke: '#ff8f00', 'stroke-width': 0.3,
      'stroke-dasharray': '0.6,0.4', visibility: 'hidden',
    });
    this.flipGroup.appendChild(this.armedRingEl);

    for (const role of ROLES) {
      const c = el('circle', {
        r: OFFENSE_RADIUS, fill: '#1565c0', stroke: '#0d3c78', 'stroke-width': 0.2,
        'data-role': role, style: 'cursor: pointer;',
      });
      this.flipGroup.appendChild(c);
      this.offenseEls[role] = c;

      // Labels live outside the flip group (text would render mirrored
      // otherwise), positioned manually in screen space each time a dot moves.
      const label = el('text', {
        'font-size': 1.5, fill: 'white', 'text-anchor': 'middle', style: 'pointer-events: none;',
      });
      label.textContent = ROLE_LABELS[role];
      this.svg.appendChild(label);
      this.labelEls[role] = label;
    }
  }

  _setDotPosition(role, x, y) {
    this.offenseEls[role].setAttribute('cx', x);
    this.offenseEls[role].setAttribute('cy', y);
    this.labelEls[role].setAttribute('x', x);
    this.labelEls[role].setAttribute('y', gameToScreenY(y) - 2);
  }

  _svgPoint(clientX, clientY) {
    const pt = this.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = this.svg.getScreenCTM().inverse();
    const p = pt.matrixTransform(ctm);
    return { x: p.x, y: p.y };
  }

  // Converts a raw pointer event position into game-space coordinates
  // (inverting the visual flip — getScreenCTM ignores the inner group's
  // transform, so it always returns pre-flip/screen-space coordinates).
  _toGameSpace(clientX, clientY) {
    const screen = this._svgPoint(clientX, clientY);
    return { x: screen.x, y: FIELD_HEIGHT - screen.y };
  }

  _bindPointerEvents() {
    for (const role of ROLES) {
      const c = this.offenseEls[role];
      c.addEventListener('pointerdown', (e) => {
        if (!this.recording) return;
        const p = this._toGameSpace(e.clientX, e.clientY);
        this.dragRole = role;
        this.dragStart = { x: p.x, y: p.y, t: performance.now() };
        this.dragMoved = false;
        c.setPointerCapture(e.pointerId);
      });
    }
    this.svg.addEventListener('pointermove', (e) => {
      if (!this.recording || !this.dragRole) return;
      const role = this.dragRole;
      const p = this._toGameSpace(e.clientX, e.clientY);
      const t = performance.now() - this.rep.startedAt;
      this.rep.paths[role].push({ x: p.x, y: p.y, t });
      this._setDotPosition(role, p.x, p.y);

      const moved = Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y);
      if (moved > TAP_MAX_MOVEMENT) this.dragMoved = true;
    });
    this.svg.addEventListener('pointerup', () => {
      if (!this.recording || !this.dragRole) return;
      const role = this.dragRole;
      const elapsed = performance.now() - this.dragStart.t;
      const wasTap = !this.dragMoved && elapsed <= TAP_MAX_DURATION_MS;
      this.dragRole = null;
      this.dragStart = null;
      if (wasTap) {
        const t = performance.now() - this.rep.startedAt;
        this._handleTap(role, t);
      }
    });
  }

  _handleTap(role, t) {
    const holder = currentHolderAt(this.rep, this.play, t);
    if (this.armedRole == null) {
      if (role === holder) this.armedRole = role;
      // tapping a non-holder while nothing is armed: no-op
    } else if (role === this.armedRole) {
      this.armedRole = null; // cancel
    } else {
      this.rep.passes.push({ from: this.armedRole, to: role, t });
      this.armedRole = null;
    }
  }

  loadPlay(playConfig) {
    this.play = playConfig;
    this.armedRole = null;
    for (const role of ROLES) {
      const { x, y } = playConfig.startPositions[role];
      this._setDotPosition(role, x, y);
    }
  }

  startRecording() {
    const startedAt = performance.now();
    const paths = {};
    for (const role of ROLES) {
      const { x, y } = this.play.startPositions[role];
      paths[role] = [{ x, y, t: 0 }];
    }
    this.rep = { playId: this.play.id, startedAt, paths, passes: [], endedAt: null };
    this.recording = true;
    this._loop();
  }

  stopRecording() {
    this.rep.endedAt = performance.now();
    this.recording = false;
    this.armedRole = null;
    this.armedRingEl.setAttribute('visibility', 'hidden');
    if (this._raf) cancelAnimationFrame(this._raf);
    return this.rep;
  }

  _loop() {
    if (!this.recording) return;
    const t = performance.now() - this.rep.startedAt;
    const defenderFn = getDefenderTrajectoryFn(this.play, this.rep);
    for (const defRole of DEF_ROLES) {
      const pos = defenderFn(defRole, t);
      this.defenseEls[defRole].setAttribute('cx', pos.x);
      this.defenseEls[defRole].setAttribute('cy', pos.y);
    }

    const holder = currentHolderAt(this.rep, this.play, t);
    const holderPos = { x: this.offenseEls[holder].getAttribute('cx'), y: this.offenseEls[holder].getAttribute('cy') };
    this.holderRingEl.setAttribute('cx', holderPos.x);
    this.holderRingEl.setAttribute('cy', holderPos.y);

    if (this.armedRole) {
      const armedPos = { x: this.offenseEls[this.armedRole].getAttribute('cx'), y: this.offenseEls[this.armedRole].getAttribute('cy') };
      this.armedRingEl.setAttribute('cx', armedPos.x);
      this.armedRingEl.setAttribute('cy', armedPos.y);
      this.armedRingEl.setAttribute('visibility', 'visible');
    } else {
      this.armedRingEl.setAttribute('visibility', 'hidden');
    }

    this._raf = requestAnimationFrame(() => this._loop());
  }
}
