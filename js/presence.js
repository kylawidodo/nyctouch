import { FIREBASE_CONFIG, FIREBASE_CONFIGURED } from './firebase-config.js';

const FIREBASE_VERSION = '11.0.2';
const localNicknameKey = 'nyctouch.nickname';

function normalizeNickname(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function validNickname(value) {
  return value.length >= 1 && value.length <= 24;
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

export class Presence {
  constructor({ listEl, countEl, stateEl, summaryEl, joinBackdrop, joinForm, nicknameInput, joinError, joinIntro, waveToast }) {
    this.listEl = listEl;
    this.countEl = countEl;
    this.stateEl = stateEl;
    this.summaryEl = summaryEl; this.joinBackdrop = joinBackdrop; this.joinForm = joinForm; this.nicknameInput = nicknameInput; this.joinError = joinError; this.joinIntro = joinIntro; this.pendingJoinResolve = null;
    this.unsubscribe = null;
    this.waveUnsubscribe = null;
    this.claimRef = null;
    this.presenceRef = null;
    this.db = null;
    this.waveToast = waveToast;
    this.waveToastTimer = null;
    this.uid = null;
    this.nickname = null;
    this.listEl.addEventListener('click', (event) => { const button = event.target.closest('[data-wave-uid]'); if (button) this.sendWave(button.dataset.waveUid, button); });
    this.joinForm.addEventListener('submit', (event) => { event.preventDefault(); this.submitName(); });
  }

  async start() {
    this.setState(FIREBASE_CONFIGURED ? 'Connecting…' : 'Offline mode');
    if (!FIREBASE_CONFIGURED) {
      await this.promptForName();
      this.render([]);
      return;
    }
    try {
      const [{ initializeApp }, { getAuth, signInAnonymously }, database] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`),
      ]);
      const app = initializeApp(FIREBASE_CONFIG);
      const credential = await signInAnonymously(getAuth(app));
      this.uid = credential.user.uid;
      this.db = database.getDatabase(app);
      this.database = database;
      database.onValue(database.ref(this.db, '.info/connected'), (snapshot) => {
        this.setState(snapshot.val() ? 'Connected' : 'Reconnecting');
      });
      await this.promptForName();
    } catch (error) {
      console.warn('Presence unavailable; continuing in offline mode.', error);
      this.setState('Offline mode');
      this.render([]);
    }
  }

  async promptForName(isChange = false) {
    const current = this.nickname || localStorage.getItem(localNicknameKey) || '';
    this.joinIntro.textContent = isChange ? 'Choose a new name for the online player list. Your game remains private.' : 'Choose a name so teammates can see who is online. Your game remains private.';
    this.nicknameInput.value = current; this.joinError.textContent = '';
    this.joinBackdrop.hidden = false; document.body.classList.add('modal-open'); this.nicknameInput.focus();
    return new Promise((resolve) => { this.pendingJoinResolve = resolve; });
  }

  async submitName() {
    const nickname = this.nicknameInput.value.trim().replace(/\s+/g, ' ');
    if (!validNickname(nickname)) { this.joinError.textContent = 'Use 1–24 characters for your name.'; this.nicknameInput.focus(); return; }
    if (!this.db) { this.nickname = nickname; localStorage.setItem(localNicknameKey, nickname); this.closeJoin(true); return; }
    this.joinError.textContent = 'Joining…'; this.joinForm.querySelector('button[type=submit]').disabled = true;
    try { const joined = await this.claimNickname(nickname); if (joined) this.closeJoin(true); } catch (error) { console.warn('Could not update online name.', error); this.joinError.textContent = 'We could not connect right now. Try again.'; } finally { this.joinForm.querySelector('button[type=submit]').disabled = false; }
  }

  closeJoin(result) { this.joinBackdrop.hidden = true; document.body.classList.remove('modal-open'); if (this.pendingJoinResolve) { const resolve = this.pendingJoinResolve; this.pendingJoinResolve = null; resolve(result); } }

  setMessage(message, warning = false) { if (this.statusMessageEl) { this.statusMessageEl.textContent = message; this.statusMessageEl.classList.toggle('is-warning', warning); } }

  async claimNickname(nickname) {
    const { ref, onDisconnect, set, onValue, serverTimestamp } = this.database;
    if (this.presenceRef) await set(this.presenceRef, null);
    this.presenceRef = ref(this.db, 'presence/' + this.uid);
    await set(this.presenceRef, { uid: this.uid, nickname, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() });
    onDisconnect(this.presenceRef).remove();
    localStorage.setItem(localNicknameKey, nickname);
    this.nickname = nickname;
    this.setState('Connected');
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = onValue(ref(this.db, 'presence'), (snapshot) => {
      const users = Object.values(snapshot.val() || {}).filter((user) => user && user.nickname);
      this.render(users);
    });
    this.listenForWaves();
    return true;
  }

  setState(state) { this.stateEl.textContent = state === 'Connected' ? 'Online' : state; this.stateEl.dataset.state = state.toLowerCase().replace(/\s+/g, '-'); if (this.summaryEl) this.summaryEl.dataset.state = this.stateEl.dataset.state; if (state === 'Connected') this.setMessage('You are visible to teammates.'); else if (state === 'Reconnecting') this.setMessage('Trying to reconnect…', true); else if (state === 'Offline mode') this.setMessage('Playing offline; online names are unavailable.', true); }

  render(users) {
    const sorted = users.sort((a, b) => a.nickname.localeCompare(b.nickname));
    this.countEl.textContent = sorted.length + ' online';
    this.listEl.innerHTML = sorted.length
      ? sorted.map((user) => {
        const name = escapeText(user.nickname);
        const isSelf = user.uid === this.uid;
        return '<li><span class="online-player"><span class="online-player-name">' + name + '</span>' + (isSelf ? '<span class="online-you">you</span>' : '<button type="button" class="wave-button" data-wave-uid="' + escapeText(user.uid) + '" aria-label="Wave at ' + name + '" title="Wave at ' + name + '">👋</button>') + '</span></li>';
      }).join('')
      : '<li class="presence-empty">No one else is online yet.</li>';
  }

  listenForWaves() {
    if (this.waveUnsubscribe) this.waveUnsubscribe();
    const { ref, onChildAdded, remove } = this.database;
    this.waveUnsubscribe = onChildAdded(ref(this.db, 'waves/' + this.uid), async (snapshot) => {
      const wave = snapshot.val();
      const createdAt = Number(wave?.createdAt || 0);
      if (wave?.fromName && (!createdAt || Date.now() - createdAt < 120000)) this.showWave(wave.fromName);
      try { await remove(snapshot.ref); } catch (error) { console.warn('Could not clear wave event.', error); }
    });
  }

  async sendWave(recipientUid, button) {
    if (!this.db || !this.uid || recipientUid === this.uid) return;
    button.disabled = true;
    try {
      const { ref, push, set, serverTimestamp } = this.database;
      const waveRef = push(ref(this.db, 'waves/' + recipientUid));
      await set(waveRef, { fromUid: this.uid, fromName: this.nickname, toUid: recipientUid, createdAt: serverTimestamp() });
    } catch (error) {
      console.warn('Could not send wave.', error);
    } finally {
      window.setTimeout(() => { button.disabled = false; }, 800);
    }
  }

  showWave(name) {
    if (!this.waveToast) return;
    this.waveToast.textContent = '👋 ' + name + ' waved at you';
    this.waveToast.classList.add('is-visible');
    window.clearTimeout(this.waveToastTimer);
    this.waveToastTimer = window.setTimeout(() => this.waveToast.classList.remove('is-visible'), 3500);
  }}
