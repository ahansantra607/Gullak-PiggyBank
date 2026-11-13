/* Gullak UI kit: click delegation, modals, keypad, toasts, confetti, sounds, voice, piggy & jar art. */
(function (G) {
  G.handlers = {};
  const modals = [];

  /* One click listener for the whole app. Buttons say data-act="name". */
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]'); if (!el || el.disabled) return;
    const name = el.getAttribute('data-act');
    const inModal = el.closest('.modal-wrap');
    const top = inModal ? modals.find(m => m.el === inModal) : null;
    const fn = top ? (top.handlers[name] || (name === 'close' ? top.close : null)) : G.handlers[name];
    if (fn) { ev.preventDefault(); fn(el, ev); }
  });

  /* Keep number fields numeric while the user is typing (not just at save time).
     type="number" still permits exponent/sign characters in several browsers. */
  const isNumericField = (el) => el instanceof HTMLInputElement && el.type === 'number';
  const allowsDecimal = (el) => el.step === 'any' || (el.step !== '' && Number(el.step) % 1 !== 0);
  const cleanNumericValue = (el) => {
    const decimal = allowsDecimal(el);
    let value = String(el.value || '').replace(/[^0-9.]/g, '');
    if (!decimal) value = value.replace(/\\./g, '');
    else {
      const dot = value.indexOf('.');
      if (dot !== -1) value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\\./g, '');
    }
    if (el.value !== value) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  document.addEventListener('beforeinput', (e) => {
    const el = e.target;
    if (!isNumericField(el) || !e.data || !e.inputType.startsWith('insert')) return;
    if (/^[0-9]+$/.test(e.data)) return;
    if (allowsDecimal(el) && e.data === '.' && !String(el.value).includes('.')) return;
    e.preventDefault();
  }, true);

  document.addEventListener('paste', (e) => {
    const el = e.target;
    if (!isNumericField(el)) return;
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const valid = allowsDecimal(el) ? /^\\d+(\\.\\d*)?$|^\\.\\d+$/.test(pasted.trim()) : /^\\d+$/.test(pasted.trim());
    if (!valid) e.preventDefault();
  }, true);

  document.addEventListener('input', (e) => {
    if (isNumericField(e.target)) cleanNumericValue(e.target);
  }, true);

  /* Scrolling over a focused number box: the opposite of the browser's built-in direction, as requested
     (on the reporter's device the default felt backwards: scrolling down raised the price). Never below the box's min. */
  document.addEventListener('wheel', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== 'number' || document.activeElement !== el || !e.deltaY) return;
    e.preventDefault();
    const step = parseFloat(el.step) || 1; const cur = parseFloat(el.value) || 0;
    let v = cur + (e.deltaY > 0 ? step : -step);
    const min = el.min === '' ? -Infinity : parseFloat(el.min); const max = el.max === '' ? Infinity : parseFloat(el.max);
    v = Math.min(max, Math.max(min, Math.round(v * 100) / 100));
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
  }, { passive: false });

  G.$ = (sel, root) => (root || document).querySelector(sel);
  G.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- modal sheet ---------- */
  /* topBtn: replaces the ✕ with your own button (e.g. "⏰ Later"); tapping outside then does nothing */
  G.modal = ({ html, handlers = {}, onClose, cls = '', topBtn = null }) => {
    const el = document.createElement('div');
    el.className = 'modal-wrap';
    el.innerHTML = `<div class="modal-back" ${topBtn ? '' : 'data-act="close"'}></div>
      <div class="sheet ${cls}" role="dialog" aria-modal="true">
        ${topBtn ? `<div class="sheet-topbar"><button class="sheet-top" data-act="${topBtn.act}">${topBtn.label}</button></div>` : '<button class="sheet-x" data-act="close" aria-label="Close">✕</button>'}${html}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
    const m = { el, handlers, close: () => {
      const i = modals.indexOf(m); if (i < 0) return; modals.splice(i, 1);
      el.classList.remove('open'); setTimeout(() => el.remove(), 220);
      if (onClose) onClose();
    } };
    modals.unshift(m);
    return m;
  };
  G.closeAllModals = () => modals.slice().forEach(m => m.close());
  G.confirm = (title, body, yes = 'Yes', no = 'No') => new Promise(res => {
    let answered = false;
    const m = G.modal({
      html: `<h2>${title}</h2><p class="muted">${body}</p>
        <div class="row gap"><button class="btn ghost grow" data-act="no">${no}</button>
        <button class="btn primary grow" data-act="yes">${yes}</button></div>`,
      handlers: { yes: () => { answered = true; m.close(); res(true); }, no: () => { answered = true; m.close(); res(false); } },
      onClose: () => { if (!answered) res(false); }
    });
  });

  /* ---------- keypad (big buttons, no tiny inputs) ---------- */
  G.keypadHTML = (chips = [10, 20, 50, 100, 500]) => `
    <div class="kp">
      <div class="kp-display" aria-live="polite"><span class="kp-amt">₹0</span><span class="kp-sub"></span></div>
      <div class="kp-chips">${chips.map(v => `<button type="button" class="chip" data-kpadd="${v}">+₹${v}</button>`).join('')}</div>
      <div class="kp-grid">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫']
        .map(k => `<button type="button" class="kp-key ${k === '⌫' ? 'del' : ''}" data-kpkey="${k}" aria-label="${k === '⌫' ? 'Delete' : k}">${k}</button>`).join('')}</div>
    </div>`;
  G.attachKeypad = (root, { value = 0, max = 999999, onChange = () => {} } = {}) => {
    const kp = { value: Math.round(value), fresh: value > 0 }; // first digit replaces a pre-filled amount
    const amtEl = G.$('.kp-amt', root);
    const set = (v) => { kp.value = G.clamp(Math.round(v) || 0, 0, max); amtEl.textContent = G.rs(kp.value); onChange(kp.value); };
    root.addEventListener('click', (e) => {
      const k = e.target.closest('[data-kpkey]'); const a = e.target.closest('[data-kpadd]');
      if (k) {
        const key = k.getAttribute('data-kpkey'); G.sound('tap');
        if (key === '⌫') set(kp.fresh ? 0 : Math.floor(kp.value / 10));
        else { const base = kp.fresh || kp.value === 0 ? '' : String(kp.value); const next = Number(base + key); if (next <= max) set(next); }
        kp.fresh = false;
      } else if (a) { G.sound('tap'); kp.fresh = false; set(kp.value + Number(a.getAttribute('data-kpadd'))); }
    });
    const onKey = (e) => {
      if (!document.body.contains(amtEl)) return document.removeEventListener('keydown', onKey);
      const all = document.querySelectorAll('.modal-wrap'); const top = all[all.length - 1]; if (top && !top.contains(amtEl)) return; // only the top-most keypad listens
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (/^[0-9]$/.test(e.key)) { const n = Number((kp.fresh ? '' : String(kp.value || '')) + e.key); kp.fresh = false; if (n <= max) set(n); }
      else if (e.key === 'Backspace') { set(kp.fresh ? 0 : Math.floor(kp.value / 10)); kp.fresh = false; }
    };
    document.addEventListener('keydown', onKey);
    kp.set = set; set(kp.value);
    return kp;
  };

  /* ---------- toast ---------- */
  G.toast = (msg, ms = 2600) => {
    let box = G.$('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), ms); setTimeout(() => t.remove(), ms + 400);
  };

  /* ---------- confetti (no library) ---------- */
  G.confetti = (n = 140) => {
    const c = document.createElement('canvas'); c.className = 'confetti';
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; document.body.appendChild(c);
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    const cols = ['#FF5C8A', '#FFC93C', '#3DDC97', '#4D9DE0', '#9B5DE5', '#FF8C42'];
    const ps = Array.from({ length: n }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4,
      c: cols[(Math.random() * cols.length) | 0], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4
    }));
    const t0 = performance.now();
    const step = (t) => {
      x.clearRect(0, 0, innerWidth, innerHeight);
      ps.forEach(p => { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.a += p.va;
        x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore(); });
      if (t - t0 < 2600) requestAnimationFrame(step); else c.remove();
    };
    requestAnimationFrame(step);
  };

  /* ---------- sounds (tiny WebAudio blips, can be muted) ---------- */
  let ac = null;
  G.sound = (type) => {
    if (!G.S.settings.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const seq = { tap: [[660, 0.03]], coin: [[988, 0.08], [1319, 0.18]], pop: [[520, 0.08]],
        win: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]], bad: [[330, 0.12], [220, 0.2]] }[type] || [[600, 0.05]];
      let t = ac.currentTime;
      seq.forEach(([f, d]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type === 'bad' ? 'triangle' : 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(type === 'tap' ? 0.04 : 0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02); t += d * 0.8;
      });
    } catch (e) { /* audio not available */ }
  };

  /* ---------- read aloud (great for young or early readers) ---------- */
  G.speak = (text, force) => {
    if (!('speechSynthesis' in window)) return G.toast('Your browser cannot read aloud 😔');
    if (!force && !G.S.settings.readAloud) return;
    const clean = String(text).replace(/<[^>]+>/g, ' ').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/₹/g, ' rupees ');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean); u.lang = 'en-IN'; u.rate = 0.95; u.pitch = 1.15;
    speechSynthesis.speak(u);
  };
  G.speakBtn = (text) => `<button class="speak" data-act="speak" data-text="${G.esc(text)}" aria-label="Read aloud">🔊</button>`;

  /* ---------- after any money action: milestones + badges ---------- */
  G.after = () => {
    const S = G.S; let party = false;
    S.goals.filter(g => !g.boughtAt).forEach(g => {
      const pct = G.goalPct(g);
      [25, 50, 75, 100].forEach(m => {
        const k = g.id + ':' + m;
        if (pct >= m && !S.meta.celebrated[k]) {
          S.meta.celebrated[k] = 1; party = true;
          setTimeout(() => G.toast(m === 100 ? `🎉 <b>${G.esc(g.name)} money complete!</b> You did it!` : `${g.emoji} <b>${m}%</b> of your ${G.esc(g.name)}! Keep going!`, 3500), 300);
        }
      });
    });
    const fresh = G.checkBadges();
    fresh.forEach((b, i) => setTimeout(() => G.toast(`<span class="big">${b.e}</span> New badge: <b>${b.n}</b>`, 3200), 700 + i * 900));
    if (party || fresh.length) { G.confetti(); G.sound('win'); }
    G.save();
  };

  /* ---------- art: Gullak the piggy bank, with moods ---------- */
  G.piggy = (mood = 'calm', size = 150) => {
    const eyes = {
      happy: `<path d="M66 90 q8 -10 16 0 M118 90 q8 -10 16 0" stroke="#3a2140" stroke-width="5" fill="none" stroke-linecap="round"/>`,
      excited: `<circle cx="74" cy="88" r="9" fill="#fff"/><circle cx="126" cy="88" r="9" fill="#fff"/><circle cx="75" cy="89" r="5.5" fill="#3a2140"/><circle cx="127" cy="89" r="5.5" fill="#3a2140"/><circle cx="77" cy="86" r="2" fill="#fff"/><circle cx="129" cy="86" r="2" fill="#fff"/>`,
      worried: `<circle cx="74" cy="90" r="5" fill="#3a2140"/><circle cx="126" cy="90" r="5" fill="#3a2140"/><path d="M64 76 l18 6 M136 76 l-18 6" stroke="#3a2140" stroke-width="4" stroke-linecap="round"/>`,
      sleepy: `<path d="M66 90 h16 M118 90 h16" stroke="#3a2140" stroke-width="5" stroke-linecap="round"/><text x="150" y="40" font-size="22" font-weight="800" fill="#7a5c99">z</text><text x="164" y="24" font-size="16" font-weight="800" fill="#7a5c99">z</text>`,
      proud: `<path d="M66 90 q8 -10 16 0 M118 90 q8 -10 16 0" stroke="#3a2140" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M78 30 l10 14 l12 -18 l12 18 l10 -14 l-4 22 h-36z" fill="#FFC93C" stroke="#e0a400" stroke-width="2"/>`,
      calm: `<circle cx="74" cy="90" r="5.5" fill="#3a2140"/><circle cx="126" cy="90" r="5.5" fill="#3a2140"/>`
    }[mood] || '';
    const mouth = {
      happy: 'M86 134 q14 12 28 0', excited: '', worried: 'M88 140 q12 -9 24 0', sleepy: 'M92 137 h16',
      proud: 'M84 132 q16 16 32 0', calm: 'M90 135 q10 7 20 0'
    }[mood];
    const mouthSvg = mood === 'excited' ? `<ellipse cx="100" cy="137" rx="10" ry="8" fill="#a3245b"/>`
      : `<path d="${mouth}" stroke="#a3245b" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    return `<svg class="piggy mood-${mood}" width="${size}" height="${size * 0.85}" viewBox="0 0 200 170" role="img" aria-label="Gullak the piggy bank looks ${mood}">
      <path d="M168 98 q20 -6 14 -20 q-6 -10 -14 0" stroke="#ff7bac" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="54" y="138" width="20" height="24" rx="7" fill="#ff86b5"/><rect x="126" y="138" width="20" height="24" rx="7" fill="#ff86b5"/>
      <path d="M52 66 L58 34 L84 54 Z" fill="#ff86b5"/><path d="M148 66 L142 34 L116 54 Z" fill="#ff86b5"/>
      <ellipse cx="100" cy="102" rx="74" ry="58" fill="#ffa3c8"/>
      <ellipse cx="80" cy="76" rx="26" ry="12" fill="#ffc4dc" opacity=".6"/>
      <rect x="84" y="46" width="32" height="7" rx="3.5" fill="#a3245b"/>
      ${eyes}
      <circle cx="58" cy="112" r="9" fill="#ff6f9f" opacity=".45"/><circle cx="142" cy="112" r="9" fill="#ff6f9f" opacity=".45"/>
      <ellipse cx="100" cy="114" rx="22" ry="15" fill="#ff7bac"/>
      <ellipse cx="92" cy="114" rx="4" ry="6" fill="#a3245b"/><ellipse cx="108" cy="114" rx="4" ry="6" fill="#a3245b"/>
      ${mouthSvg}
    </svg>`;
  };

  /* jar that fills up with coins */
  let jarN = 0;
  G.jar = (pct, color = '#FFC93C', size = 120) => {
    const id = 'jc' + (++jarN); const p = G.clamp(pct, 0, 100); const h = 104 * p / 100;
    return `<svg class="jar" width="${size}" height="${size * 1.2}" viewBox="0 0 120 144" role="img" aria-label="${p}% full">
      <defs><clipPath id="${id}"><rect x="12" y="32" width="96" height="104" rx="20"/></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".75"/></linearGradient></defs>
      <rect x="12" y="32" width="96" height="104" rx="20" fill="#eef6ff" stroke="#9cc3e8" stroke-width="3"/>
      <g clip-path="url(#${id})"><rect class="jar-fill" x="12" y="${136 - h}" width="96" height="${h}" fill="url(#${id}g)"/>
      ${p > 8 ? `<circle cx="40" cy="${Math.min(124, 140 - h + 14)}" r="7" fill="#fff3c4" opacity=".7"/><circle cx="78" cy="${Math.min(128, 140 - h + 22)}" r="5" fill="#fff3c4" opacity=".6"/>` : ''}</g>
      <rect x="24" y="16" width="72" height="18" rx="6" fill="#ff8c42"/>
      <rect x="24" y="44" width="10" height="60" rx="5" fill="#fff" opacity=".55"/>
    </svg>`;
  };

  /* puzzle reveal: the dream appears tile by tile as you save */
  G.puzzle = (emoji, pct) => {
    const open = Math.floor(G.clamp(pct, 0, 100) / 100 * 9);
    const order = [4, 0, 8, 2, 6, 1, 7, 3, 5]; // reveal centre first, then corners
    const shown = new Set(order.slice(0, open));
    return `<div class="puzzle" aria-label="${open} of 9 puzzle pieces unlocked">
      <div class="puzzle-pic">${emoji}</div>
      <div class="puzzle-grid">${Array.from({ length: 9 }, (_, i) => `<div class="pz ${shown.has(i) ? 'gone' : ''}">${shown.has(i) ? '' : '?'}</div>`).join('')}</div>
    </div>`;
  };

  G.progress = (pct, cls = '') => `<div class="bar ${cls}"><div class="bar-fill" style="width:${G.clamp(pct, 0, 100)}%"></div></div>`;
  G.stars = (n, of = 5) => '<span class="stars">' + '★'.repeat(n) + '<span class="dim">' + '★'.repeat(of - n) + '</span></span>';
})(window.G);

/* ---------- Global Keyboard, Enter & PIN Typing Support ---------- */
document.addEventListener('keydown', (e) => {
  // 1. Handle Enter key globally to trigger primary action buttons or modal submissions
  if (e.key === 'Enter') {
    if (e.target.tagName === 'TEXTAREA') return; // Allow normal line breaks in textareas

    const activeModal = document.querySelector('.modal-wrap.open');
    const targetRoot = activeModal || document.getElementById('view');
    
    if (targetRoot) {
      const primaryBtn = targetRoot.querySelector('.btn.primary, [data-act="ok"], [data-act="send"], [data-act="next"], [data-act="rules-ok"]');
      if (primaryBtn && !primaryBtn.disabled) {
        e.preventDefault();
        primaryBtn.click();
        return;
      }
    }
  }

  // 2. Handle physical keyboard typing for custom PIN grids (family-pin, me-pin, parent-pin)
  const pinGrid = document.querySelector('.pin-grid');
  if (pinGrid && /^[0-9]$/.test(e.key)) {
    const keyBtn = pinGrid.querySelector(`[data-k="${e.key}"]`);
    if (keyBtn && !keyBtn.disabled) {
      e.preventDefault();
      keyBtn.click();
    }
  } else if (pinGrid && e.key === 'Backspace') {
    const delBtn = pinGrid.querySelector('[data-k="⌫"]');
    if (delBtn && !delBtn.disabled) {
      e.preventDefault();
      delBtn.click();
    }
  }
});