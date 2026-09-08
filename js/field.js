import { ROLES, DEF_ROLES, ROLE_LABELS, ATTACK_Y, FIELD_WIDTH, FIELD_HEIGHT } from './constants.js';
import { getDefenderTrajectoryFn, currentHolderAt } from './defense-script.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OFFENSE_RADIUS = 1.4;
const DEFENSE_RADIUS = 1.4;
const BALL_RADIUS = 0.6;
const SNAP_DISTANCE = 3;

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  return node;
}

export class Field {
  constructor(svg) {
    this.svg = svg;
    this.svg.setAttribute('viewBox', `0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}`);
    this.play = null;
    this.rep = null;
    this.recording = false;
    this.dragRole = null;
    this.draggingBall = false;
    this._buildStaticField();
    this._buildDots();
    this._bindPointerEvents();
    this._raf = null;
  }

  _buildStaticField() {
    const bg = el('rect', { x: 0, y: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT, fill: '#2e7d32' });
    this.svg.appendChild(bg);
    const advantageLine = el('line', {
      x1: 0, y1: 12, x2: FIELD_WIDTH, y2: 12,
      stroke: 'rgba(255,255,255,0.55)', 'stroke-width': 0.15, 'stroke-dasharray': '1,1',
    });
    this.svg.appendChild(advantageLine);
  }

  _buildDots() {
    this.offenseEls = {};
    this.defenseEls = {};
    this.labelEls = {};

    for (const role of DEF_ROLES) {
      const c = el('circle', { r: DEFENSE_RADIUS, fill: '#c62828', stroke: '#7f0000', 'stroke-width': 0.2 });
      this.svg.appendChild(c);
      this.defenseEls[role] = c;
    }
    for (const role of ROLES) {
      const c = el('circle', {
        r: OFFENSE_RADIUS, fill: '#1565c0', stroke: '#0d3c78', 'stroke-width': 0.2,
        'data-role': role, style: 'cursor: grab;',
      });
      this.svg.appendChild(c);
      this.offenseEls[role] = c;

      const label = el('text', {
        'font-size': 1.5, fill: 'white', 'text-anchor': 'middle', y: -2, style: 'pointer-events: none;',
      });
      label.textContent = ROLE_LABELS[role];
      this.svg.appendChild(label);
      this.labelEls[role] = label;
    }

    this.ballEl = el('circle', { id: 'ball', r: BALL_RADIUS, fill: '#fdd835', stroke: '#7a6100', 'stroke-width': 0.15, style: 'cursor: grab;' });
    this.svg.appendChild(this.ballEl);
  }

  _svgPoint(clientX, clientY) {
    const pt = this.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = this.svg.getScreenCTM().inverse();
    const p = pt.matrixTransform(ctm);
    return { x: p.x, y: p.y };
  }

  _bindPointerEvents() {
    for (const role of ROLES) {
      const c = this.offenseEls[role];
      c.addEventListener('pointerdown', (e) => {
        if (!this.recording) return;
        this.dragRole = role;
        c.setPointerCapture(e.pointerId);
      });
    }
    this.ballEl.addEventListener('pointerdown', (e) => {
      if (!this.recording) return;
      this.draggingBall = true;
      this.ballEl.setPointerCapture(e.pointerId);
    });
    this.svg.addEventListener('pointermove', (e) => {
      if (!this.recording) return;
      const p = this._svgPoint(e.clientX, e.clientY);
      const t = performance.now() - this.rep.startedAt;
      if (this.dragRole) {
        const role = this.dragRole;
        this.rep.paths[role].push({ x: p.x, y: p.y, t });
        this.offenseEls[role].setAttribute('cx', p.x);
        this.offenseEls[role].setAttribute('cy', p.y);
        this.labelEls[role].setAttribute('x', p.x);
        this.labelEls[role].setAttribute('y', p.y - 2);
      } else if (this.draggingBall) {
        this.ballEl.setAttribute('cx', p.x);
        this.ballEl.setAttribute('cy', p.y);
      }
    });
    this.svg.addEventListener('pointerup', (e) => {
      if (!this.recording) return;
      if (this.dragRole) {
        this.dragRole = null;
      } else if (this.draggingBall) {
        this._finishBallDrag(e);
        this.draggingBall = false;
      }
    });
  }

  _finishBallDrag(e) {
    const p = this._svgPoint(e.clientX, e.clientY);
    const t = performance.now() - this.rep.startedAt;
    const holder = currentHolderAt(this.rep, this.play, t);

    let closestRole = null;
    let closestDist = Infinity;
    for (const role of ROLES) {
      if (role === holder) continue;
      const dotPos = { x: this.offenseEls[role].getAttribute('cx'), y: this.offenseEls[role].getAttribute('cy') };
      const d = Math.hypot(p.x - dotPos.x, p.y - dotPos.y);
      if (d < closestDist) {
        closestDist = d;
        closestRole = role;
      }
    }

    if (closestRole && closestDist <= SNAP_DISTANCE) {
      this.rep.passes.push({ from: holder, to: closestRole, t });
    }
  }

  loadPlay(playConfig) {
    this.play = playConfig;
    for (const role of ROLES) {
      const { x, y } = playConfig.startPositions[role];
      this.offenseEls[role].setAttribute('cx', x);
      this.offenseEls[role].setAttribute('cy', y);
      this.labelEls[role].setAttribute('x', x);
      this.labelEls[role].setAttribute('y', y - 2);
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
    if (!this.dragRole && !this.draggingBall) {
      const holder = currentHolderAt(this.rep, this.play, t);
      const holderPos = { x: this.offenseEls[holder].getAttribute('cx'), y: this.offenseEls[holder].getAttribute('cy') };
      this.ballEl.setAttribute('cx', Number(holderPos.x) + OFFENSE_RADIUS + BALL_RADIUS + 0.2);
      this.ballEl.setAttribute('cy', holderPos.y);
    }
    this._raf = requestAnimationFrame(() => this._loop());
  }
}
