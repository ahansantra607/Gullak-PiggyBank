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
    if (location.hash === h) G.render(); else location.hash = h;
  };

  /* Page history so every ← back button returns to the page you came from (not always Home) */
  const H = G._hist = [];
  const track = () => {
    const h = location.hash || '#/';
    if (H[H.length - 1] === h) return;
    if (H[H.length - 2] === h) H.pop();       // browser back, or our own back
    else { H.push(h); if (H.length > 40) H.shift(); }
  };
  G.back = (fallback = 'home') => {
    if (H.length > 1) { H.pop(); location.hash = H[H.length - 1]; }
    else G.go(fallback);
  };

  G.render = (opt = {}) => {
    if (G.timer) { clearInterval(G.timer); G.timer = null; }
    track();
    let { name, q } = parse();
    if (!G.screens[name]) name = 'home';
    if (G.routeGuard) { const r = G.routeGuard(name, q); if (r && G.screens[r]) name = r; }
    if (!G.S.profile && !FREE.includes(name)) name = 'welcome';
    if (G.S.profile && name === 'welcome') name = 'home';
    const sc = G.screens[name];
    const view = document.getElementById('view'); const y = window.scrollY;
    G.handlers = Object.assign({ go: (el) => (el.classList.contains('back') ? G.back(el.dataset.to) : G.go(el.dataset.to)), speak: (el) => G.speak(el.dataset.text, true) }, sc.handlers ? sc.handlers(q) : {});
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
    if (opt.keepScroll) window.scrollTo(0, y); else if (G._last !== name || JSON.stringify(q) !== G._lastQ) window.scrollTo(0, 0);
    G._last = name; G._lastQ = JSON.stringify(q);
  };

  window.addEventListener('hashchange', () => { G.closeAllModals(); G.render(); });

  /* boot */
  Promise.resolve(G.bootReady).then(() => { // family mode may need to unlock (async) before the first render
    const m = G.S.meta; m.prevOpen = m.lastOpen || G.now(); m.lastOpen = G.now(); G.save();
    G.checkBadges(); G.save();
    G.render();
  });
  /* refresh home every minute so cool-down & payday banners appear on time */
  setInterval(() => { if (!document.querySelector('.modal-wrap') && ['home', 'ask'].includes(G._last) && !document.activeElement.matches('input')) G.render({ keepScroll: true }); }, 60000);
})(window.G);
