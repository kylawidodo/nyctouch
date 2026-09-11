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
  constructor({ listEl, countEl, stateEl, changeNameBtn, summaryEl, joinBackdrop, joinForm, nicknameInput, joinError, joinIntro }) {
    this.listEl = listEl;
    this.countEl = countEl;
    this.stateEl = stateEl;
    this.changeNameBtn = changeNameBtn;
    this.summaryEl = summaryEl; this.joinBackdrop = joinBackdrop; this.joinForm = joinForm; this.nicknameInput = nicknameInput; this.joinError = joinError; this.joinIntro = joinIntro; this.pendingJoinResolve = null;
    this.unsubscribe = null;
    this.claimRef = null;
    this.presenceRef = null;
    this.db = null;
    this.uid = null;
    this.nickname = null;
    this.changeNameBtn.addEventListener('click', () => this.promptForName(true));
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
    this.joinError.textContent = 'Checking availability…'; this.joinForm.querySelector('button[type=submit]').disabled = true;
    try { const joined = await this.claimNickname(nickname); if (joined) this.closeJoin(true); } catch (error) { console.warn('Could not update online name.', error); const duplicate = error?.code === 'PERMISSION_DENIED' || error?.code === 'permission-denied' || /permission[_ -]?denied/i.test(error?.message || ''); this.joinError.textContent = duplicate ? 'That name is already in use. Please choose a different name.' : 'We could not connect right now. Try again.'; if (duplicate) this.nicknameInput.select(); } finally { this.joinForm.querySelector('button[type=submit]').disabled = false; }
  }

  closeJoin(result) { this.joinBackdrop.hidden = true; document.body.classList.remove('modal-open'); if (this.pendingJoinResolve) { const resolve = this.pendingJoinResolve; this.pendingJoinResolve = null; resolve(result); } }

  setMessage(message, warning = false) { if (this.statusMessageEl) { this.statusMessageEl.textContent = message; this.statusMessageEl.classList.toggle('is-warning', warning); } }

  async claimNickname(nickname) {
    const key = normalizeNickname(nickname).replace(/[^a-z0-9_-]/g, '_');
    const { ref, runTransaction, onDisconnect, set, onValue, serverTimestamp } = this.database;
    const nextClaimRef = ref(this.db, `nicknameClaims/${key}`);
    const claim = await runTransaction(nextClaimRef, (existing) => existing || { uid: this.uid });
    if (claim.snapshot.val()?.uid !== this.uid) {
      this.joinError.textContent = 'That name is already in use. Please choose a different name.'; this.nicknameInput.focus();
      return false;
    }
    if (this.claimRef) await set(this.claimRef, null);
    if (this.presenceRef) await set(this.presenceRef, null);
    this.claimRef = nextClaimRef;
    this.presenceRef = ref(this.db, `presence/${this.uid}`);
    await set(this.presenceRef, { uid: this.uid, nickname, nicknameKey: key, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() });
    onDisconnect(this.presenceRef).remove();
    onDisconnect(this.claimRef).remove();
    localStorage.setItem(localNicknameKey, nickname);
    this.nickname = nickname;
    this.setState('Connected');
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = onValue(ref(this.db, 'presence'), (snapshot) => {
      const users = Object.values(snapshot.val() || {}).filter((user) => user && user.nickname);
      this.render(users);
    });
    return true;
  }

  setState(state) { this.stateEl.textContent = state === 'Connected' ? 'Online' : state; this.stateEl.dataset.state = state.toLowerCase().replace(/\s+/g, '-'); if (this.summaryEl) this.summaryEl.dataset.state = this.stateEl.dataset.state; if (state === 'Connected') this.setMessage('You are visible to teammates.'); else if (state === 'Reconnecting') this.setMessage('Trying to reconnect…', true); else if (state === 'Offline mode') this.setMessage('Playing offline; online names are unavailable.', true); }

  render(users) {
    const sorted = users.sort((a, b) => a.nickname.localeCompare(b.nickname));
    this.countEl.textContent = `${sorted.length} online`;
    this.listEl.innerHTML = sorted.length
      ? sorted.map((user) => `<li>${escapeText(user.nickname)}</li>`).join('')
      : '<li class="presence-empty">No one else is online yet.</li>';
  }
}
