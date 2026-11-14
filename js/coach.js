/* Gullak Coach v2 — browser-only money intelligence.
   Drop-in replacement for js/coach.js. Depends only on the existing window.G app API.
   It never calls a server, never writes a transaction without an explicit confirmation,
   and treats recorded transactions as facts (not guesses).
*/
(function (G) {
  'use strict';
  if (!G || !G.S) return;

  const legacyAnswer = G.answer; // screens-next.js owns transaction logging and general chat
  const legacyBrain = G.brain || null;
  const savedMemory = G.S.meta && G.S.meta.coachMemory && typeof G.S.meta.coachMemory === 'object' ? G.S.meta.coachMemory : {};
  const ctx = G.coachCtx = Object.assign({
    last: null, pending: null, pendingAction: null, profilePending: null,
    history: [], lastIntent: null, updatedAt: 0, version: 3
  }, savedMemory, G.coachCtx || {});
  ctx.history = Array.isArray(ctx.history) ? ctx.history.slice(-8) : [];
  const coachActions = Object.create(null);
  function persistMemory() {
    if (!G.S.meta) G.S.meta = {};
    G.S.meta.coachMemory = {
      version: 1, pending: ctx.pending, profilePending: ctx.profilePending,
      last: ctx.last, lastIntent: ctx.lastIntent,
      history: ctx.history.slice(-8), updatedAt: Date.now()
    };
    G.save();
  }
  function coachButton(label, fn) {
    const id = G.uid(8);
    coachActions[id] = fn;
    return '<div class="row gap mt"><button class="btn primary" data-act="coach-do" data-id="' + id + '">' + label + '</button></div>';
  }
  function coachReply(html, plain, intent) {
    ctx.lastIntent = intent || ctx.lastIntent;
    ctx.updatedAt = Date.now();
    persistMemory();
    return answer(html, plain);
  }

  const isSenior = () => !!(G.S.profile && G.S.profile.ageGroup === 'senior');
  const esc = G.esc || (s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const finite = n => Number.isFinite(Number(n));
  const money = n => '₹' + round2(n).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(round2(n)) ? 0 : 2, maximumFractionDigits: 2 });
  const number = n => round2(n).toLocaleString('en-IN', { maximumFractionDigits: 4 });
  const plural = (n, word) => `${number(n)} ${word}${Math.abs(Number(n)) === 1 ? '' : 's'}`;
  const safe = (n, min = -1e15, max = 1e15) => finite(n) && Number(n) >= min && Number(n) <= max;
  const box = (title, rows, result) =>
    `<div class="calc"><div class="calc-t">${title}</div>${rows.map(x => `<div class="calc-l">${x}</div>`).join('')}${result ? `<div class="calc-r">${result}</div>` : ''}</div>`;
  const answer = (html, plain, extra = {}) => ({ html, plain: plain || '', ...extra });
  const invalid = msg => answer(`<p>${msg}</p>`, msg);

  // Number words, including common Indian scales. Numeric digits are left untouched.
  const WORD_NUM = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
    ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17,
    eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70,
    eighty:80, ninety:90 };
  const SCALES = { hundred:100, thousand:1000, lakh:100000, lakhs:100000, lac:100000, lacs:100000,
    crore:10000000, crores:10000000 };
  function wordsToDigits(input) {
    const tokens = String(input).toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?|[^\w\s]+|\s+/g) || [];
    const out = []; let cur = 0, total = 0, active = false;
    const flush = () => { if (active) out.push(String(total + cur)); cur = 0; total = 0; active = false; };
    for (const token of tokens) {
      if (/^\s+$/.test(token)) { if (active) continue; out.push(token); continue; }
      if (Object.prototype.hasOwnProperty.call(WORD_NUM, token)) { cur += WORD_NUM[token]; active = true; continue; }
      if (Object.prototype.hasOwnProperty.call(SCALES, token) && active) {
        const scale = SCALES[token];
        if (scale === 100) cur = (cur || 1) * 100;
        else { total += (cur || 1) * scale; cur = 0; }
        continue;
      }
      if (token === 'and' && active) continue;
      flush(); out.push(token);
    }
    flush();
    return out.join('').replace(/\s+/g, ' ').trim();
  }

  function normalize(raw) {
    let t = wordsToDigits(String(raw || '').toLowerCase());
    t = t.replace(/₹/g, ' rs ').replace(/,/g, '');
    t = t.replace(/\b(?:rupees?|inr|rs\.?)\b/g, ' rs ');
    t = t.replace(/\bsemi[- ]?annually\b|\bhalf[- ]?year(?:ly)?\b|\btwice a year\b|\bevery six months\b/g, ' halfyearly ');
    t = t.replace(/\bp\.a\.?\b|\bper annum\b|\bannually\b|\byearly\b/g, ' per year ');
    t = t.replace(/\bquarter(?:ly)?\b|\bevery three months\b/g, ' quarterly ');
    t = t.replace(/\bmonthly\b|\bevery month\b/g, ' monthly ');
    t = t.replace(/\bdaily\b|\bevery day\b/g, ' daily ');
    t = t.replace(/\bweekly\b|\bevery week\b/g, ' weekly ');
    t = t.replace(/%/g, ' percent ').replace(/\bpercent(?:age)?\b|\bpct\b/g, ' percent ');
    t = t.replace(/\bcompund\b|\bcompond\b|\bcoumpound\b/g, ' compound ');
    t = t.replace(/\bintrest\b|\binterst\b|\bintrst\b/g, ' interest ');
    return t.replace(/\s+/g, ' ').trim();
  }

  function parseEntities(t) {
    let rest = t;
    const e = { amounts: [], rate: null, years: null, freq: null, period: null, rawTime: null };
    const rate = rest.match(/(?:at|rate(?: of)?|interest(?: rate)?(?: of| at)?)\s*(\d+(?:\.\d+)?)\s*percent|(\d+(?:\.\d+)?)\s*percent/);
    if (rate) {
      e.rate = Number(rate[1] || rate[2]);
      rest = rest.replace(rate[0], ' ');
    }
    const timeRe = /(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|mos?|weeks?|wks?|days?)\b/g;
    let timeMatch, years = 0, foundTime = false;
    while ((timeMatch = timeRe.exec(rest))) {
      const v = Number(timeMatch[1]), u = timeMatch[2];
      foundTime = true; e.rawTime = e.rawTime || [];
      e.rawTime.push({ value: v, unit: u });
      if (/^year|^yr/.test(u)) years += v;
      else if (/^month|^mo/.test(u)) years += v / 12;
      else if (/^week|^wk/.test(u)) years += v / 52;
      else years += v / 365;
    }
    if (foundTime) e.years = years;
    rest = rest.replace(timeRe, ' ');
    e.freq = /\bhalfyearly\b/.test(t) ? 2 : /\bquarterly\b/.test(t) ? 4 :
      /\bmonthly\b/.test(t) ? 12 : /\bdaily\b/.test(t) ? 365 : /\bweekly\b/.test(t) ? 52 : null;
    e.period = /\b(last|previous) week\b/.test(t) ? 'lastWeek' : /\bthis week\b/.test(t) ? 'week' :
      /\byesterday\b/.test(t) ? 'yesterday' : /\btoday\b/.test(t) ? 'today' :
      /\b(last|previous) month\b/.test(t) ? 'lastMonth' : /\bthis month\b/.test(t) ? 'month' :
      /\b(all time|ever|lifetime|total)\b/.test(t) ? 'all' : null;
    (rest.match(/\d+(?:\.\d+)?/g) || []).forEach(x => e.amounts.push(Number(x)));
    return e;
  }

  // Profile and dream commands are handled before the legacy chat brain.
  // Mutations require a clear confirmation button; no guessed profile or goal changes.
  function profileBrain(raw) {
    const t = normalize(raw);
    const rawText = String(raw || '').trim();
    const p = G.S.profile;
    if (!p) return null;
    const simpleReply = (html, plain, intent) => coachReply(html, plain, intent);
    const confirm = (label, detail, fn, intent) =>
      simpleReply('<p>' + detail + '</p>' + coachButton(label, fn),
        detail.replace(/<[^>]*>/g, ''), intent);

    if (/\b(?:what is|what's|whats|tell me)\s+(?:my\s+)?name\b|\bwhat do you call me\b/.test(t))
      return simpleReply('I have your name as <b>' + esc(p.nickname || 'not set') + '</b>.', 'Your name is ' + (p.nickname || 'not set') + '.', 'profile-name-query');
    if (/\b(?:what is|what's|whats|tell me)\s+my\s+(?:age\s*)?group\b|\bwhich age group am i\b/.test(t))
      return simpleReply('Your current age group is <b>' + esc(p.ageGroup || 'not set') + '</b>.', 'Your age group is ' + (p.ageGroup || 'not set') + '.', 'profile-group-query');
    if (/\b(?:what is|what's|whats|tell me)\s+my\s+(?:current\s+)?dream\b|\bwhat am i saving for\b/.test(t)) {
      const g = G.activeGoal();
      return simpleReply(g ? 'Your active dream is <b>' + esc(g.name) + '</b> (' + money(g.target) + ' target, ' + G.goalPct(g) + '% saved).' : 'You have not created an active dream yet.',
        g ? 'Your active dream is ' + g.name + ', target ' + g.target + ' rupees.' : 'You do not have an active dream.', 'dream-query');
    }

    const nameMatch = rawText.match(/\b(?:change|update|edit|set)\s+(?:my\s+)?name\s+(?:to|as)\s+(.+)$/i) || rawText.match(/\bcall\s+me\s+(.+)$/i) || rawText.match(/\bmy\s+name\s+is\s+(.+)$/i);
    if (nameMatch) {
      const value = String(nameMatch[1] || nameMatch[2] || '').replace(/[?!.,]+$/g, '').trim().slice(0, 24);
      if (!value) return simpleReply('What name should I call you?', 'What name should I call you?', 'profile-name-clarify');
      ctx.profilePending = { kind: 'name', value };
      return confirm('Yes, change my name', 'Should I call you <b>' + esc(value) + '</b> from now on?', () => {
        p.nickname = value; ctx.profilePending = null; persistMemory();
        sayCoach('Got it! I will call you ' + esc(value) + ' from now on. 🐷');
      }, 'profile-name-change');
    }
    if (/\b(?:change|update|edit|set)\s+(?:my\s+)?name\b/.test(t)) {
      ctx.profilePending = { kind: 'name' };
      return simpleReply('What should I call you? Tell me the name you want to use.', 'What should I call you?', 'profile-name-clarify');
    }
    if (ctx.profilePending && ctx.profilePending.kind === 'name' && /^[\p{L}][\p{L} .'-]{0,23}$/u.test(String(raw).trim())) {
      const value = String(raw).trim();
      return confirm('Confirm name change', 'Should I call you <b>' + esc(value) + '</b>?', () => {
        p.nickname = value; ctx.profilePending = null; persistMemory();
        sayCoach('Got it! I will call you ' + esc(value) + ' from now on. 🐷');
      }, 'profile-name-change');
    }

    const groupMatch = t.match(/\b(?:change|update|set)\s+(?:my\s+)?(?:age\s*)?group\s+(?:to|as)\s+(junior|senior|kid|child|children|teen|teenager|adult|grown.?up)\b/);
    if (groupMatch) {
      const group = /junior|kid|child/.test(groupMatch[1]) ? 'junior' : 'senior';
      return confirm('Confirm age group', 'Change your age group from <b>' + esc(p.ageGroup || 'unset') + '</b> to <b>' + group + '</b>?', () => {
        p.ageGroup = group; ctx.profilePending = null; persistMemory();
        sayCoach('Done. Your age group is now ' + group + '.');
      }, 'profile-group-change');
    }
    if (/\b(?:change|update|set)\s+(?:my\s+)?(?:age\s*)?group\b/.test(t)) {
      ctx.profilePending = { kind: 'group' };
      return simpleReply('Which age group should I use: <b>junior</b> or <b>senior</b>?', 'Say junior or senior.', 'profile-group-clarify');
    }
    if (ctx.profilePending && ctx.profilePending.kind === 'group' && /\b(junior|senior|kid|child|teen|teenager|adult)\b/.test(t)) {
      const group = /junior|kid|child/.test(t) ? 'junior' : 'senior';
      return confirm('Confirm age group', 'Change your age group to <b>' + group + '</b>?', () => {
        p.ageGroup = group; ctx.profilePending = null; persistMemory();
        sayCoach('Done. Your age group is now ' + group + '.');
      }, 'profile-group-change');
    }

    const wantsDream = /\b(?:create|add|make|start|set up)\s+(?:a\s+|new\s+)?(?:dream|goal)\b/.test(t) || /\bnew\s+(?:dream|goal)\b/.test(t);
    if (wantsDream || (ctx.profilePending && ctx.profilePending.kind === 'dream')) {
      const ent = parseEntities(t);
      const amount = ent.amounts.length ? ent.amounts[0] : null;
      let name = '';
      let m = rawText.match(/\b(?:dream|goal)\s+(?:called|named)\s+(.+?)(?=\s+(?:for|costing|worth|target)\b|$)/i);
      if (!m) m = rawText.match(/\b(?:create|add|make|start|set up)\s+(?:a\s+|new\s+)?(?:dream|goal)\s+(?:for\s+)?(.+?)(?=\s+(?:for|costing|worth|target)\b|$)/i);
      if (m) name = m[1].replace(/\b(?:called|named)\b/g, '').trim();
      if (name && amount != null) name = name.replace(new RegExp('\\b' + String(amount) + '\\b'), '').replace(/\s+/g, ' ').trim();
      if (!name && ctx.profilePending && ctx.profilePending.name) name = ctx.profilePending.name;
      if (!name && amount == null) {
        ctx.profilePending = { kind: 'dream' };
        return simpleReply('Sure! What should the dream be called, and what is its target amount? For example: <i>Create a dream called bicycle for 5000</i>.', 'Tell me the dream name and target amount.', 'dream-create-clarify');
      }
      if (!name) name = 'My dream';
      if (!(Number.isSafeInteger(amount) && amount > 0)) {
        ctx.profilePending = { kind: 'dream', name };
        return simpleReply('What is the target amount for <b>' + esc(name) + '</b>? Tell me a whole number of rupees.', 'What is the target amount?', 'dream-target-clarify');
      }
      const cleanName = name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
      if (!cleanName) return simpleReply('Please give the dream a short name.', 'Please give the dream a name.', 'dream-name-clarify');
      return confirm('Create this dream', 'Create <b>' + esc(cleanName) + '</b> with a target of <b>' + money(amount) + '</b>?', () => {
        const goal = G.act.addGoal({ name: cleanName, emoji: '🎯', target: amount });
        ctx.profilePending = null; persistMemory();
        sayCoach(goal ? 'Your dream <b>' + esc(goal.name) + '</b> is ready! Target: ' + money(goal.target) + '. 🌈' : 'I could not create that dream. Check that the target is a whole number of rupees.');
      }, 'dream-create');
    }
    return null;
  }
  function sayCoach(html) {
    G.chat.push({ from: 'pig', html });
    if (G.S.settings && G.S.settings.readAloud) G.speak(String(html).replace(/<[^>]*>/g, ''), true);
    G.after(); G.render({ keepScroll: true });
  }

  function missingMath(type, have, keys, example) {
    ctx.pending = { type, have: Object.assign({}, have), at: Date.now() };
    const names = { P:'starting amount (principal)', R:'annual interest rate (%)', T:'time period',
      X:'regular saving amount', N:'number of people or parts' };
    const list = keys.map(k => `<b>${names[k] || k}</b>`).join(' and ');
    return answer(`I can calculate that. I still need ${list}.<br><small>Example: <i>${esc(example)}</i></small>`,
      `I still need ${keys.map(k => names[k] || k).join(' and ')}.`);
  }

  const M = {
    simpleInterest(P, R, T) {
      if (![P,R,T].every(finite) || P < 0 || R < 0 || T < 0) throw new Error('Use non-negative principal, rate and time.');
      const interest = P * (R / 100) * T;
      return { interest: round2(interest), amount: round2(P + interest) };
    },
    compoundInterest(P, R, T, n = 1) {
      if (![P,R,T,n].every(finite) || P < 0 || R < 0 || T < 0 || n <= 0) throw new Error('Use non-negative values and a compounding frequency greater than zero.');
      const periods = n * T;
      if (periods > 100000) throw new Error('That time/frequency combination is too large to calculate safely.');
      const amount = P * Math.pow(1 + (R / 100) / n, periods);
      return { amount: round2(amount), interest: round2(amount - P), periods };
    },
    emi(P, annualRate, months) {
      if (![P,annualRate,months].every(finite) || P < 0 || annualRate < 0 || months <= 0 || !Number.isInteger(months))
        throw new Error('Enter a non-negative loan amount and annual rate, plus a whole number of months.');
      const r = annualRate / 1200;
      const payment = r === 0 ? P / months : P * r / (1 - Math.pow(1 + r, -months));
      return { payment: round2(payment), total: round2(payment * months), interest: round2(payment * months - P) };
    },
    discount(price, pct) {
      if (![price,pct].every(finite) || price < 0 || pct < 0 || pct > 100) throw new Error('Discount must be between 0% and 100%.');
      return { saving: round2(price * pct / 100), final: round2(price * (1 - pct / 100)) };
    },
    gst(price, pct, inclusive = false) {
      if (![price,pct].every(finite) || price < 0 || pct < 0 || pct > 100) throw new Error('Enter a non-negative price and a tax rate from 0% to 100%.');
      if (inclusive) { const base = price / (1 + pct / 100); return { base:round2(base), tax:round2(price-base), total:round2(price) }; }
      const tax = price * pct / 100; return { base:round2(price), tax:round2(tax), total:round2(price+tax) };
    },
    percent(pct, value) { if (![pct,value].every(finite)) throw new Error('Enter valid numbers.'); return round2(pct * value / 100); },
    percentChange(oldValue, newValue) {
      if (![oldValue,newValue].every(finite) || oldValue === 0) throw new Error('The starting value must not be zero.');
      return round2((newValue-oldValue) / Math.abs(oldValue) * 100);
    },
    profitLoss(cost, selling) {
      if (![cost,selling].every(finite) || cost <= 0 || selling < 0) throw new Error('Cost price must be greater than zero; selling price cannot be negative.');
      const diff = selling - cost;
      return { kind: diff >= 0 ? 'profit' : 'loss', amount:round2(Math.abs(diff)), pct:round2(Math.abs(diff)/cost*100) };
    },
    split(total, people) {
      if (![total,people].every(finite) || total < 0 || people <= 0 || !Number.isInteger(people)) throw new Error('Enter a non-negative total and a whole number of people greater than zero.');
      return round2(total / people);
    },
    average(values) {
      if (!values.length || values.some(v => !finite(v))) throw new Error('Enter at least one valid number.');
      return round2(values.reduce((a,b)=>a+b,0) / values.length);
    },
    doubleYears(rate, n = 1) {
      if (!finite(rate) || rate <= 0 || !finite(n) || n <= 0) throw new Error('The annual rate and compounding frequency must be greater than zero.');
      return Math.log(2) / (n * Math.log(1 + rate / (100*n)));
    },
    inflationPrice(price, rate, years) {
      if (![price,rate,years].every(finite) || price < 0 || rate <= -100 || years < 0) throw new Error('Use a non-negative price and time, and an inflation rate above -100%.');
      return round2(price * Math.pow(1 + rate/100, years));
    },
    sipFutureValue(payment, annualRate, months) {
      if (![payment,annualRate,months].every(finite) || payment < 0 || annualRate <= -1200 || months < 0 || !Number.isInteger(months))
        throw new Error('Enter a non-negative monthly deposit, a valid annual rate, and a whole number of months.');
      const r = annualRate / 1200;
      if (months === 0) return 0;
      return round2(r === 0 ? payment * months : payment * ((Math.pow(1+r, months)-1)/r));
    }
  };
  G.coachMath = M;

  function yearText(t) {
    const months = Math.round(t * 12);
    return months % 12 === 0 ? plural(months / 12, 'year') : plural(months, 'month');
  }

  function periodRange(period) {
    const now = new Date(), start = new Date(now), end = new Date(now);
    if (period === 'today') start.setHours(0,0,0,0);
    else if (period === 'yesterday') { start.setDate(start.getDate()-1); start.setHours(0,0,0,0); end.setDate(end.getDate()-1); end.setHours(23,59,59,999); }
    else if (period === 'week' || period === 'lastWeek') {
      const day = (start.getDay()+6)%7; start.setHours(0,0,0,0); start.setDate(start.getDate()-day-(period==='lastWeek'?7:0));
      end.setTime(start.getTime()+7*86400000-1);
    } else if (period === 'month' || period === 'lastMonth') {
      start.setDate(1); start.setHours(0,0,0,0);
      if (period === 'lastMonth') start.setMonth(start.getMonth()-1);
      end.setTime(start.getTime()); end.setMonth(end.getMonth()+1); end.setMilliseconds(-1);
    } else return { from:0, to:Infinity, label:'all recorded time' };
    return { from:start.getTime(), to:end.getTime(), label:({today:'today',yesterday:'yesterday',week:'this week',lastWeek:'last week',month:'this month',lastMonth:'last month'})[period] };
  }
  function transactionSummary(raw, kind) {
    const t = normalize(raw), e = parseEntities(t), period = periodRange(e.period || (/month/.test(t) ? 'month' : /\bweek\b/.test(t) ? 'week' : 'all'));
    const txns = Array.isArray(G.S.txns) ? G.S.txns : [];
    let list = txns.filter(x => x && Number(x.date) >= period.from && Number(x.date) <= period.to);
    const cats = G.CATS || {};
    const category = Object.keys(cats).find(k => {
      const name = String(cats[k].n || '').toLowerCase();
      return new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b').test(t) || (name && t.includes(name));
    });
    if (kind === 'spent') list = list.filter(x => x.type === 'out');
    else if (kind === 'income') list = list.filter(x => x.type === 'in');
    if (category) list = list.filter(x => x.category === category || (x.category === 'asked' && category === 'other'));
    const total = list.reduce((a,x)=>a+(Number(x.amount)||0),0);
    const rows = {};
    list.forEach(x => { const k=x.category || 'other'; rows[k]=(rows[k]||0)+(Number(x.amount)||0); });
    const label = period.label;
    if (!list.length) return answer(`I don't see any recorded ${kind === 'spent' ? 'spending' : 'income'} for ${label}. I won't guess unrecorded amounts.`,
      `No recorded ${kind} for ${label}.`);
    const top = Object.entries(rows).sort((a,b)=>b[1]-a[1])[0];
    const topName = top ? ((cats[top[0]] && cats[top[0]].n) || top[0]) : '';
    return answer(box(kind === 'spent' ? '💸 Recorded spending' : '💰 Recorded money in',
      [`Period: ${label}`, `Transactions counted: ${list.length}`, category ? `Category: ${esc((cats[category] && cats[category].n) || category)}` : `Largest category: ${esc(topName)} (${money(top[1])})`],
      `Total recorded: ${money(total)}`),
      `You have ${kind === 'spent' ? 'spent' : 'received'} ${round2(total)} rupees ${label}.`);
  }

  function findCategory(t) {
    const cats = G.CATS || {};
    for (const [id, c] of Object.entries(cats)) {
      const n = String(c.n || '').toLowerCase();
      if (new RegExp('\\b' + id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b').test(t) || (n && t.includes(n))) return id;
    }
    const aliases = { snack:'snacks', food:'snacks', icecream:'snacks', ice:'snacks', toy:'toys', toys:'toys',
      game:'games', games:'games', book:'school', books:'school', bus:'travel', auto:'travel', movie:'fun' };
    for (const [word,id] of Object.entries(aliases)) if (new RegExp('\\b'+word+'\\b').test(t)) return id;
    return null;
  }

  function moneyContext() {
    const balance = Number(G.balance()) || 0;
    const inDreams = Number(G.totalInGoals()) || 0;
    const pending = (G.S.requests || []).filter(r => r.status === 'pending');
    const pendingTotal = pending.reduce((a,r)=>a+(Number(r.kidPays)||0),0);
    return { balance, inDreams, pending, pendingTotal };
  }

  function spendAnswer(raw, t, e, askAdvice) {
    const nums = e.amounts;
    const price = nums[0];
    const { balance, inDreams, pending, pendingTotal } = moneyContext();
    if (!finite(price) || price < 0) return answer('What price are you thinking about? For example: <i>Should I spend ₹300 on a toy?</i>', 'What price are you thinking about?');
    const item = (raw.match(/\b(?:on|for|buy)\s+(.+?)(?:\?|$)/i) || [])[1] || 'this';
    const remaining = balance - price;
    const g = G.activeGoal();
    const canCover = price <= balance;
    const details = [
      `Recorded spendable balance: ${money(balance)}`,
      `Proposed price: ${money(price)}`,
      `After buying: ${money(remaining)}`,
      `Already set aside in dreams: ${money(inDreams)} (not included in spendable balance)`
    ];
    if (pending.length) details.push(`Pending grown-up asks: ${pending.length} (${money(pendingTotal)} requested by you; not deducted until approved)`);
    if (g) details.push(`Current dream: ${esc(g.name)} — ${money(Math.max(0, g.target - G.goalSaved(g.id)))} still needed`);
    const note = canCover
      ? 'The recorded balance can cover this price, but that alone does not mean it is the right choice. Check whether it is a need, whether you have upcoming plans, and whether you still want it after a short wait.'
      : `The recorded balance is short by ${money(price-balance)}. Gullak does not count future pocket money as money you have today.`;
    const html = box(askAdvice ? '🤔 Purchase check' : '🧮 Affordability check', details, canCover ? 'The recorded balance covers the price.' : 'The recorded balance does not cover the full price.') +
      `<p>${note}</p><p class="small">I can only see transactions and goals recorded in this Gullak. Upcoming expenses outside the app may not be included. Ask a trusted grown-up before making a real-money decision.</p>`;
    return answer(html, `${canCover ? 'Your recorded balance covers' : 'Your recorded balance does not cover'} ${money(price)}. ${note}`);
  }

  function calculateInterest(type, params) {
    const { P, R, T, n=1 } = params;
    const missing = []; if (!(P > 0)) missing.push('P'); if (!(R >= 0)) missing.push('R'); if (!(T > 0)) missing.push('T');
    if (missing.length) return missingMath(type, params, missing, type === 'ci' ? 'CI on 5000 at 8% for 3 years monthly' : 'SI on 5000 at 8% for 3 years');
    if (P > 1e12 || R > 1000 || T > 200) return invalid('Those values are outside this learning calculator range. Try a smaller example.');
    if (type === 'si') {
      const x=M.simpleInterest(P,R,T);
      return answer(box('📘 Simple interest', [
        '<b>SI = P × R × T ÷ 100</b>', `P = ${money(P)}`, `R = ${number(R)}% per year`, `T = ${yearText(T)}`,
        `SI = ${money(P)} × ${number(R)} × ${number(T)} ÷ 100 = <b>${money(x.interest)}</b>`,
        `Final amount = principal + interest = <b>${money(x.amount)}</b>`
      ], `Interest: ${money(x.interest)} · Final amount: ${money(x.amount)}`),
      `Simple interest is ${x.interest} rupees. The final amount is ${x.amount} rupees.`);
    }
    if (type === 'ci' || type === 'compare') {
      const c=M.compoundInterest(P,R,T,n), s=M.simpleInterest(P,R,T);
      const label={1:'yearly',2:'half-yearly',4:'quarterly',12:'monthly',52:'weekly',365:'daily'}[n] || `${n} times a year`;
      const rows=[
        `P = ${money(P)} · annual nominal rate = ${number(R)}% · time = ${yearText(T)}`,
        `Compounding: ${label} (${n} periods per year)`,
        `A = P × (1 + R/(100n))<sup>nT</sup>`,
        `Compound interest = A − P = <b>${money(c.interest)}</b>`,
        `Simple interest for comparison = ${money(s.interest)}`
      ];
      if (type==='compare') rows.push(`Difference (CI − SI) = ${money(c.interest-s.interest)}`);
      rows.push(`<small>Assumption: fixed annual nominal rate, constant compounding frequency, no deposits or withdrawals. Fractional periods use the mathematical exponent model.</small>`);
      return answer(box(type==='compare'?'⚖️ Simple vs compound':'📗 Compound interest',rows,
        `Final amount: ${money(c.amount)} · Interest: ${money(c.interest)}`),
        `Compound interest is ${c.interest} rupees. Final amount ${c.amount} rupees.`);
    }
  }

  function mathBrain(raw) {
    const t=normalize(raw), e=parseEntities(t), nums=e.amounts;
    const has=re=>re.test(t);
    const shortFollow=/^(?:and |what about |how about |now |then |instead |make it |change it to |what if )/.test(t) && !/\b(?:save|saving|spent|spend|bought|buy|income|received|budget|balance)\b/.test(t);
    let base=null;
    if (ctx.pending && Date.now()-ctx.pending.at < 30*60*1000 && (nums.length || e.rate!=null || e.years!=null || e.freq)) {
      base=Object.assign({},ctx.pending.have,{type:ctx.pending.type}); ctx.pending=null;
    } else if (ctx.last && shortFollow && (nums.length || e.rate!=null || e.years!=null || e.freq)) {
      base=Object.assign({},ctx.last);
    }
    if (base) {
      if (nums.length) base.P=nums[0];
      if (e.rate!=null) base.R=e.rate;
      if (e.years!=null) base.T=e.years;
      if (e.freq!=null) base.n=e.freq;
      if (has(/\bcompare|versus|\bvs\b/)) base.type='compare';
      if (has(/\bsimple\b/)) base.type='si';
      if (has(/\bcompound\b/)) base.type='ci';
      if (['si','ci','compare'].includes(base.type)) return rememberInterest(base.type,base);
    }

    // Recorded-data questions must be handled before generic math or the legacy coach.
    if (has(/\bwhat can i spend\b|\bhow much can i spend\b|\bspendable\b|\bavailable to spend\b/)) {
      const {balance,inDreams,pending,pendingTotal}=moneyContext();
      const html=box('🐷 Money available in Gullak',[
        `Current recorded spendable balance: <b>${money(balance)}</b>`,
        `Already saved in active dreams: ${money(inDreams)} (separate from spendable balance)`,
        pending.length ? `Pending asks: ${pending.length}, requesting ${money(pendingTotal)} (not yet deducted)` : 'No pending grown-up asks'
      ],`Recorded spendable balance: ${money(balance)}`)+
      `<p class="small">This is the amount currently unallocated in Gullak's recorded transactions. The app may not know about upcoming expenses or money you have not entered.</p>`;
      return answer(html,`You currently have ${round2(balance)} rupees recorded as spendable in Gullak.`);
    }
    if (has(/\bshould i spend\b|\bshould i buy\b|\bis it worth\b|\bworth it\b|\bcan i spend\b|\bcan i buy\b|\bcan i afford\b|\bafford\b/)) {
      if (!nums.length) return answer('What is the price, and what are you thinking of buying? Example: <i>Should I spend ₹300 on a toy?</i>', 'Tell me the price and item.');
      return spendAnswer(raw,t,e,has(/\bshould|worth\b/));
    }
    if (has(/\bwhat have i spent\b|\bhow much did i spend\b|\bhow much have i spent\b|\bwhat did i spend\b|\bspending history\b|\bspent this\b|\bspent last\b/))
      return transactionSummary(raw,'spent');
    if (has(/\bhow much (?:money )?(?:did i get|have i received|came in)\b|\bmy income\b|\bmoney received\b/))
      return transactionSummary(raw,'income');

    // Percentages: order matters (part-of, reverse percentage, then change).
    let m;
    if ((m=t.match(/(\d+(?:\.\d+)?)\s*percent\s+(?:of|from)\s+(\d+(?:\.\d+)?)/))) {
      const pct=Number(m[1]), val=Number(m[2]), out=M.percent(pct,val);
      return answer(box('🔢 Percentage',[`${number(pct)}% × ${money(val)} ÷ 100`],`= ${money(out)}`),`${number(pct)} percent of ${val} is ${out}.`);
    }
    if ((m=t.match(/(?:what percent|what percentage)\s+(?:is\s+)?(\d+(?:\.\d+)?)\s+(?:of|out of)\s+(\d+(?:\.\d+)?)/))) {
      const pct=Number(m[1])/Number(m[2])*100;
      if (!Number.isFinite(pct)) return invalid('The total cannot be zero.');
      return answer(box('🔢 Reverse percentage',[`${number(m[1])} ÷ ${number(m[2])} × 100`],`= ${number(pct)}%`),`${number(pct)} percent.`);
    }
    if ((m=t.match(/(\d+(?:\.\d+)?)\s+(?:is what percent|out of)\s+(?:of\s+)?(\d+(?:\.\d+)?)/))) {
      const a=Number(m[1]), b=Number(m[2]); if (!b) return invalid('The total cannot be zero.');
      return answer(box('🔢 Reverse percentage',[`${number(a)} ÷ ${number(b)} × 100`],`= ${number(a/b*100)}%`),`${number(a/b*100)} percent.`);
    }
    if ((m=t.match(/(?:percent(?:age)?\s+)?change\s+from\s+(\d+(?:\.\d+)?)\s+(?:to|into)\s+(\d+(?:\.\d+)?)/)) ||
        (m=t.match(/(?:increase|decrease|change)\s+from\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/))) {
      const pct=M.percentChange(Number(m[1]),Number(m[2]));
      return answer(box('📊 Percentage change',[`Change = ${number(m[2])} − ${number(m[1])}` ,`Percentage change = change ÷ starting value × 100`],`${pct>=0?'Increase':'Decrease'}: ${number(Math.abs(pct))}%`),`The percentage change is ${pct} percent.`);
    }

    // SI / CI / compare / EMI / doubling / inflation.
    const si=has(/\bsimple interest\b|\bsi on\b|\bs\.i\.\b/);
    const ci=has(/\bcompound(?:ed|ing)? interest\b|\bci on\b|\bc\.i\.\b/);
    const interest=si||ci||has(/\binterest\b/);
    if (interest && (nums.length || e.rate!=null || e.years!=null || base)) {
      const type=has(/\bcompare\b|\bversus\b|\bvs\b|\bboth\b|\bdifference between\b/) ? 'compare' : ci ? 'ci' : 'si';
      const P=nums[0] ?? (ctx.last && ctx.last.P), R=e.rate ?? (nums.length>1 && nums[1]<=100 ? nums[1] : ctx.last && ctx.last.R);
      const T=e.years ?? (ctx.last && ctx.last.T), n=e.freq ?? (ctx.last && ctx.last.n) ?? 1;
      return rememberInterest(type,{P,R,T,n});
    }
    if (has(/\bemi\b|\bmonthly payment\b|\bloan payment\b/)) {
      const P=nums[0], R=e.rate, months=e.rawTime && e.rawTime.length ? e.rawTime.reduce((a,x)=>a+x.value*(/^year|^yr/.test(x.unit)?12:/^week|^wk/.test(x.unit)?12/52:/^day/.test(x.unit)?12/365:1),0) : null;
      if (!(P>0) || R==null || !(months>0)) return missingMath('emi',{P,R,months},[...(P>0?[]:['P']),...(R!=null?[]:['R']),...(months>0?[]:['T'])],'EMI on 50000 at 12% for 18 months');
      const N=Math.round(months); if (Math.abs(N-months)>1e-8) return invalid('For EMI, give the repayment period in whole months.');
      const x=M.emi(P,R,N);
      return answer(box('🏦 Monthly loan payment',[`Loan principal: ${money(P)}`,`Annual nominal rate: ${number(R)}% · Monthly rate: ${number(R/12)}%`,`Number of monthly payments: ${N}`,`EMI = P × r ÷ (1 − (1+r)<sup>−N</sup>)`],`Monthly payment: ${money(x.payment)} · Total interest: ${money(x.interest)} · Total repaid: ${money(x.total)}`),`The monthly payment is ${x.payment} rupees.`);
    }
    if (has(/\bdouble\b|\bdoubling\b|\brule of 72\b/) && e.rate!=null) {
      const n=e.freq||1, exact=M.doubleYears(e.rate,n), quick=72/e.rate;
      return answer(box('⏱️ Time to double',[`Rule of 72 estimate: 72 ÷ ${number(e.rate)} = ${number(quick)} years`,`Mathematical result at ${n} compounding period(s) per year: ${number(exact)} years`],`About ${number(exact)} years`),`At that rate, doubling takes about ${number(exact)} years in this model.`);
    }
    if (has(/\binflation\b|\bfuture price\b/) && nums.length && e.rate!=null && e.years!=null) {
      const future=M.inflationPrice(nums[0],e.rate,e.years), today=nums[0]/Math.pow(1+e.rate/100,e.years);
      return answer(box('🎈 Inflation projection',[`Current price: ${money(nums[0])}`,`Assumed inflation: ${number(e.rate)}% per year for ${yearText(e.years)}`,`Future price = current price × (1 + rate)<sup>time</sup>`],`Estimated future price: ${money(future)}`)+`<p class="small">This is a mathematical scenario, not a prediction of actual future prices.</p>`,`At that assumed inflation rate, the price would be about ${future} rupees.`);
    }

    // Discount and GST. GST-inclusive prices are reverse-calculated, not added twice.
    if (has(/\bdiscount\b|\boff\b|\bsale price\b/) && nums.length && e.rate!=null) {
      const x=M.discount(nums[0],e.rate);
      return answer(box('🏷️ Discount',[`Marked price: ${money(nums[0])}`,`Discount: ${number(e.rate)}% = ${money(x.saving)}`],`Final price: ${money(x.final)} · You save ${money(x.saving)}`),`After the discount, the price is ${x.final} rupees.`);
    }
    if (has(/\bgst\b|\btax\b/) && nums.length && e.rate!=null) {
      const inclusive=has(/\bincluding\b|\binclusive\b|\bwith gst included\b/), x=M.gst(nums[0],e.rate,inclusive);
      return answer(box('🧾 GST calculation',[inclusive?`GST-inclusive total: ${money(x.total)}`:`Price before GST: ${money(x.base)}`,`GST rate: ${number(e.rate)}%`,`GST amount: ${money(x.tax)}`],`Total: ${money(x.total)} · Before-tax price: ${money(x.base)}`),`GST is ${x.tax} rupees and the total is ${x.total} rupees.`);
    }
         // Cost price and selling price.
    if ((m=t.match(/(?:bought|buy|cost price|cp)\D{0,24}(\d+(?:\.\d+)?)\D{1,32}(?:sold|sell|selling price|sp)\D{0,24}(\d+(?:\.\d+)?)/))) {
      const x=M.profitLoss(Number(m[1]),Number(m[2]));
      return answer(box(x.kind==='profit'?'📈 Profit':'📉 Loss',[`Cost price: ${money(m[1])}`,`Selling price: ${money(m[2])}`,`${x.kind} percentage = ${money(x.amount)} ÷ cost price × 100`],`${x.kind}: ${money(x.amount)} (${number(x.pct)}%)`),`${x.kind} is ${x.amount} rupees.`);
    }
    if (has(/\bsplit\b|\bdivide equally\b|\beach person\b/) && nums.length) {
      const k=nums[1] || Number((t.match(/(?:between|among|amongst|ways|people|friends)\s+(\d+)/)||[])[1]);
      if (!(k>0)) return missingMath('split',{total:nums[0]},['N'],'Split 900 between 4 people');
      const each=M.split(nums[0],k);
      return answer(box('🍕 Equal split',[`${money(nums[0])} ÷ ${k} people`],`Each person: ${money(each)}`),`Each person pays ${each} rupees.`);
    }

    // Regular saving deposits (ordinary annuity; no market return is promised).
    if (has(/\bsip\b|\brecurring deposit\b|\bsave\b.*\b(?:every|per|a)\s+month\b|\bmonthly saving\b/) && nums.length) {
      const payment=nums[0], months=e.rawTime ? Math.round(e.rawTime.reduce((a,x)=>a+x.value*(/^year|^yr/.test(x.unit)?12:/^week|^wk/.test(x.unit)?12/52:/^day/.test(x.unit)?12/365:1),0)) : null;
      const rate=e.rate==null?0:e.rate;
      if (!(months>0)) return missingMath('sip',{X:payment,R:rate},['T'],'Save 500 every month for 2 years at 6%');
      const total=M.sipFutureValue(payment,rate,months), principal=payment*months;
      return answer(box('🌱 Regular monthly savings',[`Monthly deposit: ${money(payment)} · Months: ${months}`,`Total deposited: ${money(principal)}`,`Assumed annual rate: ${number(rate)}%`,`End-of-month deposit model; monthly compounding`],`Projected value: ${money(total)} · Growth in this model: ${money(total-principal)}`)+`<p class="small">Illustration only. The rate is an assumption; real savings or investments can use different rules and may not earn this return.</p>`,`Deposits total ${principal} rupees. The illustrative projected value is ${total} rupees.`);
    }

    // Goal arithmetic: how much to save each period, or how long a target will take.
    if (has(/\bsave\b|\bsaving\b|\bput away\b/) && has(/\b(?:week|weekly|month|monthly|day|daily)\b/) && nums.length) {
      const per = /\b(?:month|monthly)\b/.test(t) ? 'month' : /\b(?:day|daily)\b/.test(t) ? 'day' : 'week';
      const perCount = { day:365, week:52, month:12 }[per];
      if (has(/\bhow long\b|\bwhen will\b|\bhow many (?:days|weeks|months)\b|\bto reach\b|\bto get\b/) && nums.length >= 2) {
        const deposit=nums[0], target=nums[1];
        if (deposit<=0 || target<0) return invalid('Enter a positive saving amount and a non-negative target.');
        const count=Math.ceil(target/deposit), years=count/perCount;
        return answer(box('🎯 Savings target',[`${money(deposit)} saved every ${per}`,`Target: ${money(target)}`,`Periods needed: ${count}`],`About ${plural(count,per)} (${number(years*12)} months)`),`At ${deposit} rupees every ${per}, you need ${count} ${per}s to reach ${target} rupees, before interest.`);
      }
      if (has(/\bhow much\b/) && nums.length >= 1 && e.years!=null) {
        const target=nums[0], periods=Math.max(1,Math.ceil(e.years*perCount)), each=Math.ceil(target/periods);
        return answer(box('🎯 Savings target',[`Target: ${money(target)}`,`Time: ${yearText(e.years)}`,`Saving periods: ${periods}`],`Save at least ${money(each)} every ${per}`),`Save at least ${each} rupees every ${per}, before interest.`);
      }
    }

    // Short financial glossary. This supplements the app's original conversational fallback.
    const glossary = [
      [['budget','budgeting'],'Budget','A plan for how money will be used. It separates priorities, spending and saving.'],
      [['saving','savings'],'Saving','Keeping some money for a future goal instead of using it now.'],
      [['income','pocket money'],'Income','Money received, such as pocket money, gifts or earnings.'],
      [['expense','expenses'],'Expense','Money that goes out when something is bought or paid for.'],
      [['need','needs'],'Need','Something important for health, safety or everyday responsibilities.'],
      [['want','wants'],'Want','Something nice to have but not essential.'],
      [['principal'],'Principal','The starting amount on which interest is calculated.'],
      [['interest rate'],'Interest rate','The percentage charged or earned over a stated time, usually quoted per year.'],
      [['simple interest'],'Simple interest','Interest calculated only on the original principal: P × R × T ÷ 100.'],
      [['compound interest','compounding'],'Compound interest','Interest calculated on the principal plus interest already added.'],
      [['inflation'],'Inflation','A general rise in prices over time, which reduces what the same amount of money can buy.'],
      [['loan'],'Loan','Money borrowed that must be repaid, usually with interest.'],
      [['emi'],'EMI','Equated Monthly Instalment: a regular monthly loan repayment.'],
      [['discount'],'Discount','A reduction from the marked price.'],
      [['gst'],'GST','Goods and Services Tax, a tax applied to many goods and services in India.'],
      [['profit'],'Profit','The amount left when selling price is greater than cost price.'],
      [['loss'],'Loss','The amount lost when selling price is below cost price.'],
      [['asset'],'Asset','Something valuable a person owns.'],
      [['liability'],'Liability','A debt or other amount a person owes.'],
      [['net worth'],'Net worth','Assets minus liabilities.'],
      [['emergency fund'],'Emergency fund','Money kept aside for unexpected needs.'],
      [['opportunity cost'],'Opportunity cost','The next-best thing you give up when choosing one option.'],
      [['mutual fund'],'Mutual fund','A pool of money from investors that is invested according to a fund strategy.'],
      [['sip'],'SIP','Systematic Investment Plan: a schedule for investing a fixed amount regularly. Returns are not guaranteed.'],
      [['fixed deposit','fd'],'Fixed deposit','A bank deposit kept for a chosen period at an agreed interest rate and terms.'],
      [['recurring deposit','rd'],'Recurring deposit','A bank product where a fixed amount is deposited regularly for a set period.'],
      [['risk'],'Risk','The possibility that an outcome may be different from what was expected, including losing money.'],
      [['insurance'],'Insurance','A contract that may help cover specified losses in return for a premium.'],
      [['tax'],'Tax','Money collected by governments to pay for public services.'],
      [['upi'],'UPI','Unified Payments Interface, an instant bank-transfer system in India. Real payments should be handled with a trusted adult.'],
      [['rbi'],'RBI','Reserve Bank of India, the country’s central bank.']
    ];
    const askedForMeaning=has(/\bwhat is\b|\bwhat does\b|\bmeaning of\b|\bdefine\b|\bexplain\b|\bwhat are\b/);
    const concept=glossary.find(([keys])=>keys.some(k=>new RegExp('\\b'+k.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&')+'\\b').test(t)));
    if (concept && (askedForMeaning || t.trim().split(/\s+/).length<=3)) {
      const title=concept[1], desc=concept[2];
      return answer(`<b>📚 ${esc(title)}</b><p>${esc(desc)}</p>`,`${title}. ${desc}`);
    }

    // General arithmetic, averages and conversions.
    if ((m=t.match(/(?:average|mean)\s+(?:of\s+)?([\d.\s,]+)$/))) {
      const values=m[1].split(/[,\s]+/).filter(Boolean).map(Number);
      return answer(box('📊 Average',[`Numbers: ${values.map(number).join(', ')}`,`Sum: ${number(values.reduce((a,b)=>a+b,0))} ÷ ${values.length}`],`Average: ${number(M.average(values))}`),`The average is ${M.average(values)}.`);
    }
    if ((m=t.match(/(?:how many|convert)\s+(\d+(?:\.\d+)?)\s*(rupees?|rs)\s+(?:in|to)\s+(\d+(?:\.\d+)?)\s*(?:rupees?|rs)/))) {
      const a=Number(m[1]), b=Number(m[3]); return answer(`${money(a)} compared with ${money(b)} is ${number(a/b)} times.`,`${a} divided by ${b} is ${a/b}.`);
    }
    if ((m=t.match(/(?:what is|calculate|solve)?\s*(\d+(?:\.\d+)?)\s*([+*/×÷-])\s*(\d+(?:\.\d+)?)/))) {
      const a=Number(m[1]), b=Number(m[3]), op=m[2]; if (op==='÷' || op==='/') { if (b===0) return invalid('Division by zero is not defined.'); }
      const out=op==='+'?a+b:op==='-'?a-b:op==='*'||op==='×'?a*b:a/b;
      return answer(box('🧮 Calculation',[`${number(a)} ${op} ${number(b)}`],`= ${number(out)}`),`${number(out)}.`);
    }
    return null;
  }
     function rememberInterest(type,p) {
    const have={P:p.P,R:p.R,T:p.T,n:p.n||1};
    const missing=[]; if (!(have.P>0)) missing.push('P'); if (!(have.R>=0)) missing.push('R'); if (!(have.T>0)) missing.push('T');
    if (missing.length) return missingMath(type,have,missing,type==='ci'?'CI on 5000 at 8% for 3 years monthly':'SI on 5000 at 8% for 3 years');
    const out=calculateInterest(type,have);
    ctx.last=Object.assign({type},have); ctx.updatedAt=Date.now();
    return out;
  }

  function brain(raw) {
    const profileResult = profileBrain(raw);
    if (profileResult) return profileResult;
    const t=normalize(raw), e=parseEntities(t), has=re=>re.test(t);
    const advanced=mathBrain(raw);
    if (advanced) return advanced;
    // Preserve the existing money-word dictionary from the original coach if present.
    if (legacyBrain) return legacyBrain(raw);
    return null;
  }
  G.normalizeQ=normalize;
  G.entities=parseEntities;
  G.brain=brain;

  G.answer=(raw,voice)=>{
    const userText = String(raw || '').trim();
    if (userText) { ctx.history.push({ role: 'user', text: userText.slice(0, 180), at: Date.now() }); ctx.history = ctx.history.slice(-8); }
    let out=null;
    try { out=brain(raw); } catch(err) { console.error('Gullak coach:',err); out=invalid('I could not safely handle that. Please check the details and try again.'); }
    if (!out) { persistMemory(); return legacyAnswer(raw,voice); }
    G.S.meta.talked=(G.S.meta.talked||0)+1;
    G.chat.push({from:'pig',html:out.html});
    persistMemory();
    if (voice || (G.S.settings && G.S.settings.readAloud)) G.speak(out.plain || 'Here is the calculation.',true);
  };

  // Keep legacy chat actions working, while exposing a safe reset for context.
  G.resetCoachContext=()=>{
    ctx.last=null; ctx.pending=null; ctx.pendingAction=null; ctx.profilePending=null;
    ctx.history=[]; ctx.lastIntent=null; ctx.updatedAt=0; persistMemory();
  };
  const talk=G.screens && G.screens.talk;
  if (talk && talk.handlers) {
    const oldHandlers=talk.handlers;
    talk.handlers=(q)=>{
      const h=oldHandlers(q)||{};
      h['coach-clear-context']=()=>G.resetCoachContext();
      h['coach-do']=(el)=> {
        const id = el && el.dataset && el.dataset.id;
        const fn = id && coachActions[id];
        if (!fn) return;
        delete coachActions[id];
        try { fn(); } catch (err) { console.error('Gullak coach action:', err); sayCoach('I could not complete that change. Nothing else was changed.'); }
      };
      return h;
    };
  }
})(window.G);
