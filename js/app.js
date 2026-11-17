/* Gullak app: tiny hash router + bottom nav + boot. */
(function (G) {
  const NAV = [['home', '🏠', 'Home'], ['money', '💸', 'Money'], ['goal', '🎯', 'Dream'], ['ask', '🙋', 'Ask'], ['play', '🎪', 'Play']];
  const FREE = G.FREE_ROUTES = G.FREE_ROUTES || ['welcome', 'parent', 'reply']; // work without a profile

  const parse = () => {
    const h = location.hash.replace(/^#\/?/, '');
    const i = h.indexOf('?'); const name = (i < 0 ? h : h.slice(0, i)) || 'welcome';
    const q = {}; if (i >= 0) new URLSearchParams(h.slice(i + 1)).forEach((v, k) => { q[k] = v; });
    return { name, q };
  };

  G.go = (name, q) => {
    const h = '#/' + name + (q ? '?' + new URLSearchParams(q).toString() : '');
    G._forceScrollTop = true;
    if (location.hash === h) G.render(); else location.hash = h;
  };

  /* Navigation chain: revisiting an earlier page trims everything after it. */
  const H = G._hist = [];
  const routeNameFromHash = hash => {
    const raw = String(hash || '#/welcome').replace(/^#\/?/, '');
    const i = raw.indexOf('?');
    return (i < 0 ? raw : raw.slice(0, i)) || 'welcome';
  };
  const validHistoryEntry = hash => !!G.screens[routeNameFromHash(hash)];
  const track = (hash = location.hash) => {
    const h = hash || '#/welcome';
    const existing = H.lastIndexOf(h);
    if (existing >= 0) {
      // A route already in the chain is a return to that point, not a new loop.
      H.splice(existing + 1);
      return;
    }
    H.push(h);
    if (H.length > 40) H.splice(0, H.length - 40);
  };
  G.back = () => {
    G._forceScrollTop = true;
    const current = location.hash || '#/welcome';
    const currentIndex = H.lastIndexOf(current);
    if (currentIndex >= 0) H.splice(currentIndex);
    else H.length = 0; // No trustworthy chain for this page: start from Home.

    while (H.length && !validHistoryEntry(H[H.length - 1])) H.pop();
    const target = H[H.length - 1] || '#/home';
    if (location.hash === target) G.render();
    else location.hash = target;
  };

  G.render = (opt = {}) => {
    if (G.timer) { clearInterval(G.timer); G.timer = null; }
    const requestedHash = location.hash || '#/welcome';
    let { name, q } = parse();
    if (!G.screens[name]) name = 'home';
    if (G.routeGuard) { const r = G.routeGuard(name, q); if (r && G.screens[r]) name = r; }
    if (!G.S.profile && !((G.FREE_ROUTES || FREE).includes(name))) name = 'welcome';
    if (G.S.profile && name === 'welcome') name = 'home';
    // Canonicalize guarded routes in-place. Leaving the blocked route in the
    // address bar makes browser Back revisit it and can create a two-page loop.
    const canonicalHash = '#/' + name + (Object.keys(q).length ? '?' + new URLSearchParams(q).toString() : '');
    if (requestedHash !== canonicalHash) {
      history.replaceState(history.state, '', location.pathname + location.search + canonicalHash);
      // If Back landed on a route that is now guarded, replace that chain link
      // with its canonical destination instead of adding a new forward loop.
      const requestedIndex = H.lastIndexOf(requestedHash);
      if (requestedIndex >= 0) {
        const canonicalIndex = H.lastIndexOf(canonicalHash);
        if (canonicalIndex >= 0 && canonicalIndex < requestedIndex) H.splice(canonicalIndex + 1);
        else {
          H[requestedIndex] = canonicalHash;
          H.splice(requestedIndex + 1);
        }
      } else track(canonicalHash);
    } else {
      // Only record the route after guards have resolved it. A blocked/deep link
      // must never become a Back destination and recreate a redirect loop.
      track(canonicalHash);
    }
    const sc = G.screens[name];
    const view = document.getElementById('view'); const y = window.scrollY;
    G.handlers = Object.assign({ go: (el) => (el.classList.contains('back') ? G.back() : G.go(el.dataset.to)), speak: (el) => G.speak(el.dataset.text, true) }, sc.handlers ? sc.handlers(q) : {});
    try { view.innerHTML = sc.render(q); }
    catch (e) { console.error(e); view.innerHTML = `<section class="card center">${G.piggy('worried', 120)}<h2>Oops, something broke 😕</h2><p class="muted small">${G.esc(e.message)}</p><a class="btn soft" href="#/home">Go home</a></section>`; }
    view.className = 'view screen-' + name;
    if (sc.after) { try { sc.after(view, q); } catch (e) { console.error(e); } }

    const nav = document.getElementById('nav');
    const showNav = !!G.S.profile && !sc.bare && name !== 'welcome' && !(G.hideNav && G.hideNav());
    nav.hidden = !showNav; document.body.classList.toggle('has-nav', showNav);
    if (showNav) {
      const active = sc.nav || '';
      const pend = G.S.requests.filter(r => r.status === 'pending' || (r.status === 'cooling' && r.coolUntil <= G.now())).length;
      nav.innerHTML = NAV.map(([k, e, n]) => `<button class="nav-b ${k === active ? 'on' : ''}" data-act="go" data-to="${k}" aria-label="${n}">
        <span>${e}</span><small>${n}</small>${k === 'ask' && pend ? `<i class="dot">${pend}</i>` : ''}</button>`).join('');
    }
    if (G._forceScrollTop) { window.scrollTo(0, 0); G._forceScrollTop = false; }
    else if (opt.keepScroll) window.scrollTo(0, y);
    else if (G._last !== name || JSON.stringify(q) !== G._lastQ) window.scrollTo(0, 0);
    G._last = name; G._lastQ = JSON.stringify(q);
  };

  window.addEventListener('hashchange', () => {
    G._forceScrollTop = true;
    const target = parse().name;
    if (G.handleFamilyCreationNavigation) G.handleFamilyCreationNavigation(G._last || '', target);
    G.closeAllModals(); G.render();
  });

  /* Add accessible show/hide controls to every password/PIN field,
     including fields inserted later inside dialogs. */
  function addPasswordEye(input) {
    if (!input || input.dataset.eyeReady === '1' || input.type !== 'password') return;
    const parent = input.parentElement;
    if (!parent) return;
    const wrap = document.createElement('span');
    wrap.className = 'gullak-password-eye-wrap';
    input.dataset.eyeReady = '1';
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.style.paddingRight = '48px';
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'gullak-password-eye';
    eye.setAttribute('aria-label', 'Show password');
    eye.setAttribute('aria-pressed', 'false');
    eye.title = 'Show password';
    eye.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="M4 4 20 20"/></svg>';
    wrap.appendChild(eye);
    Array.from(parent.children).forEach(sibling => {
      if (sibling !== wrap && sibling.style && sibling.style.position === 'absolute' && sibling.style.right) sibling.style.right = '44px';
    });
  }
  function scanPasswordEyes(root) {
    if (root.matches && root.matches('input[type="password"]')) addPasswordEye(root);
    if (root.querySelectorAll) root.querySelectorAll('input[type="password"]').forEach(addPasswordEye);
  }
  scanPasswordEyes(document);
  document.addEventListener('click', event => {
    const eye = event.target.closest && event.target.closest('.gullak-password-eye');
    if (!eye) return;
    const input = eye.parentElement.querySelector('input');
    if (!input) return;
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    eye.classList.toggle('is-visible', visible);
    eye.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    eye.setAttribute('aria-pressed', String(visible));
    eye.title = visible ? 'Hide password' : 'Show password';
  });
  const passwordEyeObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1) scanPasswordEyes(node);
    }));
  });
  passwordEyeObserver.observe(document.documentElement, { childList: true, subtree: true });

  /* boot */
  Promise.resolve(G.bootReady).then(() => { // family mode may need to unlock (async) before the first render
    const m = G.S.meta; m.prevOpen = m.lastOpen || G.now(); m.lastOpen = G.now(); G.save();
    G.checkBadges(); G.save();
    G.render();
  });
  /* refresh home every minute so cool-down & payday banners appear on time */
  setInterval(() => { if (!document.querySelector('.modal-wrap') && ['home', 'ask'].includes(G._last) && !document.activeElement.matches('input')) G.render({ keepScroll: true }); }, 60000);
})(window.G);
