import { PLAYS } from './plays-data.js';
import { evaluatePlay } from './checklist-engine.js';
import { Field } from './field.js';
import { Presence } from './presence.js';

const svg = document.getElementById('field');
const field = new Field(svg);
const presence = new Presence({
  listEl: document.getElementById('online-list'),
  countEl: document.getElementById('online-count'),
  stateEl: document.getElementById('connection-state'),
  nameEl: document.getElementById('your-name'),
  changeNameBtn: document.getElementById('change-name-btn'),
});

const playNameEl = document.getElementById('play-name');
const playBriefEl = document.getElementById('play-brief');
const tipsEl = document.getElementById('play-tips');
const startBtn = document.getElementById('start-btn');
const doneBtn = document.getElementById('done-btn');
const resultsEl = document.getElementById('results');

let currentPlay = null;

function pickRandomPlay() {
  return PLAYS[Math.floor(Math.random() * PLAYS.length)];
}

function renderIdle() {
  playNameEl.textContent = 'Press Start to get a play';
  playBriefEl.textContent = '';
  tipsEl.innerHTML = '';
  doneBtn.disabled = true;
  startBtn.disabled = false;
  resultsEl.innerHTML = '';
}

function renderPlay(play) {
  playNameEl.textContent = play.name;
  playBriefEl.textContent = play.brief;
  tipsEl.innerHTML = play.tips.length
    ? '<strong>Tips (not graded):</strong><ul>' + play.tips.map((t) => `<li>${t}</li>`).join('') + '</ul>'
    : '';
  doneBtn.disabled = false;
  startBtn.disabled = true;
  resultsEl.innerHTML = '';
}

function renderResults(grade) {
  const header = `<h3>${grade.allPass ? 'Nailed it!' : 'Not quite — here’s what to fix'}</h3>`;
  const items = grade.results
    .map(
      (r) => `<li class="${r.pass ? 'pass' : 'fail'}">
        <span class="mark">${r.pass ? '✓' : '✗'}</span>
        <span class="text">${r.text}${r.pass ? '' : `<br><em>${r.detail}</em>`}</span>
      </li>`
    )
    .join('');
  resultsEl.innerHTML = header + `<ul class="checklist">${items}</ul>`;
}

startBtn.addEventListener('click', () => {
  currentPlay = pickRandomPlay();
  field.loadPlay(currentPlay);
  field.startRecording();
  renderPlay(currentPlay);
});

doneBtn.addEventListener('click', () => {
  const rep = field.stopRecording();
  const grade = evaluatePlay(currentPlay, rep);
  renderResults(grade);
  doneBtn.disabled = true;
  startBtn.disabled = false;
});

renderIdle();
presence.start();
