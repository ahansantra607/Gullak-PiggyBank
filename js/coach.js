/* Gullak's money brain for "Hey Gullak". Runs fully in the browser: no AI server, nothing leaves the device.
   Understands: money maths (SI, CI, compare, EMI, doubling, inflation, %, discount, GST, profit/loss, split, savings plans,
   unit conversions) with step-by-step working, ~40 money words explained for kids (8–12) and teens (13–18),
   typos, number words ("five thousand", "2 lakh", "1k"), months/years, and follow-ups ("what about 5 years?"). */
(function (G) {
  const esc = G.esc;
  const ctx = G.coachCtx = { last: null, pending: null };
  const senior = () => !!(G.S.profile && G.S.profile.ageGroup === 'senior');

  /* ---------- formatting ---------- */
  const r2 = (n) => Math.round(n * 100) / 100;
  const money = (n) => { const v = r2(n); return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); };
  const num = (n) => r2(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const plural = (n, w) => `${num(n)} ${w}${r2(n) === 1 ? '' : 's'}`;
  const yearsText = (t) => {
    if (Number.isInteger(t)) return plural(t, 'year');
    const m = Math.round(t * 12); return m % 12 === 0 ? plural(m / 12, 'year') : plural(m, 'month') + ` (${num(t)} years)`;
  };
  const samosas = (n) => { const k = Math.floor(n / 20); return k > 0 ? `🥟 That's ${k} samosa${k === 1 ? '' : 's'}!` : ''; };
  const box = (title, lines, result) => `<div class="calc"><div class="calc-t">${title}</div>${lines.map(l => `<div class="calc-l">${l}</div>`).join('')}${result ? `<div class="calc-r">${result}</div>` : ''}</div>`;

  /* ---------- understanding the words ---------- */
  const TYPOS = {
    intrest: 'interest', interst: 'interest', intrst: 'interest', intersts: 'interests', intereset: 'interest', interes: 'interest',
    compund: 'compound', coumpound: 'compound', compond: 'compound', compaund: 'compound', componud: 'compound', cmpound: 'compound',
    simpel: 'simple', smple: 'simple', simle: 'simple', principle: 'principal', prinicipal: 'principal', pricipal: 'principal',
    percnt: 'percent', precent: 'percent', pecent: 'percent', persent: 'percent', percentage: 'percent', pct: 'percent',
    anually: 'annually', anualy: 'annually', annualy: 'annually', yearlly: 'yearly', mnth: 'month', mnths: 'months', mths: 'months',
    yrs: 'years', yr: 'year', wk: 'week', wks: 'weeks', inflaton: 'inflation', inflasion: 'inflation', discont: 'discount',
    intrestrate: 'interest rate', emis: 'emi', loans: 'loan', stocks: 'stock', shares: 'share', mutualfund: 'mutual fund', budjet: 'budget', bugdet: 'budget',
    rupee: 'rs', rupees: 'rs', rs: 'rs', inr: 'rs', bucks: 'rs'
  };
  const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
    fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const SCALE = { hundred: 100, thousand: 1000, lakh: 100000, lakhs: 100000, lac: 100000, crore: 10000000, crores: 10000000 };
  const wordsToDigits = (t) => {
    const toks = t.split(/(\s+|-)/); const out = []; let cur = 0, total = 0, inNum = false, buf = [];
    const flush = () => { if (inNum) out.push(String(total + cur)); else out.push(...buf); cur = 0; total = 0; inNum = false; buf = []; };
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i];
      if (/^\s+$|^-$/.test(w)) { if (inNum) continue; out.push(w); continue; }
      if (ONES[w] != null) { cur += ONES[w]; inNum = true; continue; }
      if (SCALE[w] && inNum) { if (SCALE[w] === 100) cur = (cur || 1) * 100; else { total += (cur || 1) * SCALE[w]; cur = 0; } continue; }
      if (w === 'and' && inNum) continue;
      if (inNum) { out.push(String(total + cur), ' '); cur = 0; total = 0; inNum = false; }
      out.push(w);
    }
    if (inNum) out.push(String(total + cur));
    return out.join('').replace(/\s+/g, ' ');
  };
  G.normalizeQ = (raw) => {
    let t = ' ' + String(raw || '').toLowerCase() + ' ';
    t = t.replace(/₹/g, ' rs ').replace(/[?!"“”]/g, ' ').replace(/(\d),(?=\d)/g, '$1');
    t = t.replace(/p\.a\.?|per annum/g, ' per year ').replace(/half[\s-]?year(ly)?|semi[\s-]?annual(ly)?|every 6 months|every six months|twice a year/g, ' halfyearly ')
      .replace(/every 3 months|every three months|quarter(ly)?/g, ' quarterly ');
    t = t.replace(/[a-z]+/g, (w) => TYPOS[w] || w);
    t = wordsToDigits(t);
    t = t.replace(/(\d+(?:\.\d+)?)\s*k\b/g, (_, n) => String(Number(n) * 1000))
      .replace(/(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac)\b/g, (_, n) => String(Number(n) * 100000))
      .replace(/(\d+(?:\.\d+)?)\s*(crore|crores|cr)\b/g, (_, n) => String(Number(n) * 10000000))
      .replace(/(\d)\s*%/g, '$1 percent ').replace(/per cent/g, 'percent');
    return t.replace(/\s+/g, ' ');
  };

  /* pull out amounts, rate, time, how often */
  G.entities = (t) => {
    let rest = t; const e = { amounts: [] };
    const rm = rest.match(/(\d+(?:\.\d+)?)\s*percent/) || rest.match(/rate (?:of )?(?:interest )?(?:is |of |at )?(\d+(?:\.\d+)?)\b(?!\s*(?:years?|months?|weeks?|days?))/);
    if (rm) { e.rate = Number(rm[1]); rest = rest.replace(rm[0], ' '); }
    let years = 0, found = false; const units = {};
    rest = rest.replace(/(\d+(?:\.\d+)?)\s*(years?|months?|weeks?|days?)\b/g, (m, n, u) => {
      const v = Number(n); found = true; const k = u.replace(/s$/, ''); units[k] = (units[k] || 0) + v;
      years += k === 'year' ? v : k === 'month' ? v / 12 : k === 'week' ? v / 52 : v / 365; return ' ';
    });
    if (found) { e.years = years; e.units = units; }
    (rest.match(/\d+(?:\.\d+)?/g) || []).forEach(n => e.amounts.push(Number(n)));
    e.freq = /halfyearly/.test(t) ? 2 : /quarterly/.test(t) ? 4 : /monthly|every month|each month/.test(t) && /compound/.test(t) ? 12 : /daily|every day/.test(t) && /compound/.test(t) ? 365 : null;
    e.per = /\b(a|per|every|each) week\b|\bweekly\b/.test(t) ? 'week' : /\b(a|per|every|each) month\b|\bmonthly\b/.test(t) ? 'month' : /\b(a|per|every|each) day\b|\bdaily\b/.test(t) ? 'day' : null;
    return e;
  };

  /* ---------- calculators ---------- */
  const need = (type, have, missing, example) => {
    ctx.pending = { type, have };
    const names = { P: 'how much money (principal)', R: 'the interest rate (%)', T: 'how long (years or months)' };
    return { html: `I can work that out! I just need ${missing.map(m => `<b>${names[m] || m}</b>`).join(' and ')}.<br><small>Try: <i>${example}</i></small>`, plain: 'I need a bit more information.' };
  };
  const calc = {};
  
  calc.si = ({ P, R, T }, alsoCI = true) => {
    const si = P * R * T / 100, A = P + si;
    let html = box('📘 Simple Interest', [
      `<b>SI = P × R × T ÷ 100</b>`,
      `P (money you start with) = ${money(P)}`, `R (rate) = ${num(R)}% a year`, `T (time) = ${yearsText(T)}`,
      `SI = ${num(P)} × ${num(R)} × ${num(T)} ÷ 100 = <b>${money(si)}</b>`,
      `Total = ${money(P)} + ${money(si)} = <b>${money(A)}</b>`
    ], `Interest earned: ${money(si)} · Total: ${money(A)}`);
    html += `<p>${senior() ? 'Simple interest is paid only on the original amount, so it grows by the same amount every year.' : 'Simple interest is the same "thank-you money" every year, only on the money you first put in.'} ${samosas(si)}</p>`;
    if (alsoCI && T > 0) { 
      const A2 = P * Math.pow(1 + R / 100, T); 
      html += `<p class="small">💡 With <b>compound</b> interest (yearly) you'd get ${money(A2 - P)}, which is ${money(A2 - P - si)} more. Ask me "compare SI and CI"!</p>`; 
    }
    ctx.last = { type: 'si', P, R, T };
    return { html, plain: `Simple interest is ${r2(si)} rupees. Total is ${r2(A)} rupees.` };
  };

  calc.ci = ({ P, R, T, n }) => {
    n = n || 1; const per = R / 100 / n, N = n * T; const A = P * Math.pow(1 + per, N), ci = A - P, si = P * R * T / 100;
    const nName = { 1: 'yearly', 2: 'half-yearly', 4: 'quarterly', 12: 'monthly', 365: 'daily' }[n] || n + '× a year';
    const lines = [`<b>A = P × (1 + R/100${n > 1 ? '/' + n : ''})<sup>${n > 1 ? n + '×T' : 'T'}</sup></b>`,
      `P = ${money(P)} · R = ${num(R)}% a year · T = ${yearsText(T)} · added ${nName}`];
    if (Number.isInteger(N) && N <= 8) {
      let bal = P;
      for (let i = 1; i <= N; i++) { 
        const add = bal * per; 
        bal += add; 
        lines.push(`${{ 1: 'Year', 2: 'Half-year', 4: 'Quarter', 12: 'Month' }[n] || 'Step'} ${i}: ${money(bal - add)} + ${num(per * 100)}% (${money(add)}) = <b>${money(bal)}</b>`); 
      }
    } else {
      lines.push(`A = ${num(P)} × (1 + ${num(per)})<sup>${num(N)}</sup> = <b>${money(A)}</b>`);
    }
    lines.push(`CI = A − P = ${money(A)} − ${money(P)} = <b>${money(ci)}</b>`);
    let html = box('📗 Compound Interest', lines, `Interest earned: ${money(ci)} · Total: ${money(A)}`);
    html += `<p>${senior() ? 'Compound interest earns interest on the interest too. The longer you wait, the faster it grows.' : 'Compound interest is like a snowball ⛄: your interest also earns interest, so it grows faster and faster!'}</p>`;
    html += `<p class="small">Simple interest would give ${money(si)}, so compounding adds <b>${money(ci - si)}</b> extra.</p>`;
    ctx.last = { type: 'ci', P, R, T, n };
    return { html, plain: `Compound interest is ${r2(ci)} rupees. Total is ${r2(A)} rupees.` };
  };

  calc.compare = ({ P, R, T, n }) => {
    n = n || 1; const rows = []; const maxT = Math.min(Math.max(1, Math.ceil(T)), 10);
    for (let y = 1; y <= maxT; y++) { 
      const s = P * R * y / 100, c = P * Math.pow(1 + R / 100 / n, n * y) - P; 
      rows.push(`<tr><td>${y}</td><td>${money(P + s)}</td><td>${money(P + c)}</td><td class="plus">+${money(c - s)}</td></tr>`); 
    }
    const s = P * R * T / 100, c = P * Math.pow(1 + R / 100 / n, n * T) - P;
    const html = `<div class="calc"><div class="calc-t">⚖️ Simple vs Compound: ${money(P)} at ${num(R)}%</div>
      <table class="calc-tab"><tr><th>Year</th><th>Simple</th><th>Compound</th><th>Extra</th></tr>${rows.join('')}</table>
      <div class="calc-r">After ${yearsText(T)}: SI ${money(s)} vs CI ${money(c)} → compound wins by ${money(c - s)}</div></div>
      <p>${senior() ? 'SI grows in a straight line; CI curves upward because each year\'s interest joins the principal.' : 'See how compound pulls ahead every year? That\'s why starting to save early is a superpower! 🦸'}</p>`;
    ctx.last = { type: 'compare', P, R, T, n };
    return { html, plain: `After ${T} years, simple interest gives ${r2(s)} and compound gives ${r2(c)} rupees.` };
  };

  calc.emi = ({ P, R, T }) => {
    const N = Math.round(T * 12), r = R / 12 / 100;
    const emi = r === 0 ? P / N : P * r * Math.pow(1 + r, N) / (Math.pow(1 + r, N) - 1); const tot = emi * N;
    const html = box('🏦 Loan EMI (monthly payment)', [`<b>EMI = P × r × (1+r)<sup>N</sup> ÷ ((1+r)<sup>N</sup> − 1)</b>`,
      `P = ${money(P)} · r = ${num(R)}% ÷ 12 = ${num(r * 100)}% a month · N = ${N} months`,
      `EMI = <b>${money(emi)}</b> every month`, `You pay back ${money(tot)} in total, so <b>${money(tot - P)}</b> is interest`],
      `${money(emi)} a month for ${N} months`) + `<p>${senior() ? 'Borrowing costs money: here the extra is the bank\'s charge for lending to you.' : 'A loan means paying back MORE than you borrowed. Saving first is cheaper!'}</p>`;
    ctx.last = { type: 'emi', P, R, T };
    return { html, plain: `The EMI is ${r2(emi)} rupees a month. Total interest is ${r2(tot - P)} rupees.` };
  };

  calc.double = ({ R }) => {
    const rule = 72 / R, exact = Math.log(2) / Math.log(1 + R / 100);
    const html = box('⏱️ How long to double?', [`<b>Rule of 72:</b> 72 ÷ ${num(R)} ≈ <b>${num(rule)} years</b>`, `Exact (compound yearly): ${num(exact)} years`],
      `At ${num(R)}% a year, money doubles in about ${num(Math.round(exact * 10) / 10)} years`) +
      `<p>${senior() ? 'The Rule of 72 is a quick mental shortcut bankers use.' : 'Magic trick: divide 72 by the rate to guess how long money takes to double! 🪄'}</p>`;
    ctx.last = { type: 'double', R };
    return { html, plain: `At ${R} percent, money doubles in about ${Math.round(exact * 10) / 10} years.` };
  };

  calc.inflation = ({ P, R, T }) => {
    const f = P * Math.pow(1 + R / 100, T), buys = 100 / Math.pow(1 + R / 100, T);
    const html = box('🎈 Inflation', [`<b>Future price = Price × (1 + R/100)<sup>T</sup></b>`, `${money(P)} × (1 + ${num(R / 100)})<sup>${num(T)}</sup> = <b>${money(f)}</b>`,
      `So ₹100 then will buy only what <b>${money(buys)}</b> buys today`], `In ${yearsText(T)}, ${money(P)} of stuff will cost about ${money(f)}`) +
      `<p>That's why money sitting still slowly loses power. Savings should grow faster than inflation!</p>`;
    ctx.last = { type: 'inflation', P, R, T };
    return { html, plain: `It will cost about ${r2(f)} rupees.` };
  };

  calc.plan = ({ X, per, T, units, target }) => {
    const perN = { week: 52, month: 12, day: 365 }[per];
    if (target && !T) {
      const k = Math.ceil(target / X); const when = new Date(G.now() + k * (per === 'week' ? 7 : per === 'month' ? 30 : 1) * G.DAY);
      return { html: box('🎯 Savings plan', [`Goal ${money(target)} ÷ ${money(X)} a ${per} = ${num(target / X)}`, `Round up → <b>${plural(k, per)}</b>`],
        `You'll reach ${money(target)} in ${plural(k, per)} (around ${when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`), plain: `It will take ${k} ${per}s.` };
    }
    const periods = units && units[per] != null && Object.keys(units).length === 1 ? units[per] : Math.round(T * perN);
    const total = X * periods; const match = Number(G.S.settings && G.S.settings.matchPct) || 0;
    return { html: box('🐷 Savings plan', [`${money(X)} × ${plural(periods, per)} = <b>${money(total)}</b>`,
      match ? `With your grown-up's ${match}% match: <b>${money(total * (1 + match / 100))}</b>` : `Tip: ask a grown-up for a savings match to grow it faster!`],
      `You'll have ${money(total)}`) + `<p>${samosas(total)}</p>`, plain: `You will have ${r2(total)} rupees.` };
  };

  /* ---------- money dictionary ---------- */
  const KB = [
    { id: 'si', keys: ['simple interest', 'si'], t: 'Simple interest', k: 'When you keep money in a bank, it pays you a little extra called interest. With <b>simple interest</b> you get the same extra every year, only on the money you first put in.', s: 'Interest calculated only on the principal: SI = P × R × T ÷ 100. It grows linearly.', ex: 'SI on 1000 at 5% for 3 years' },
    { id: 'ci', keys: ['compound interest', 'ci', 'compounding', 'power of compounding', 'compound'], t: 'Compound interest', k: 'With <b>compound interest</b>, the interest you earn gets added to your money, and next time you earn interest on that too. It grows like a snowball ⛄!', s: 'Interest on principal plus accumulated interest: A = P(1 + r/n)<sup>nt</sup>. Growth is exponential, so time matters most.', ex: 'CI on 5000 at 10% for 2 years' },
    { id: 'sivsci', keys: ['difference between si and ci', 'si vs ci', 'simple vs compound', 'compound vs simple', 'si and ci', 'simple and compound'], t: 'Simple vs compound', k: 'Simple interest pays the same every year. Compound interest pays interest on the interest, so it gets bigger every year and wins over time!', s: 'SI is linear (P·R·T/100); CI compounds (P(1+r)<sup>t</sup> − P). The gap widens with time and rate.', ex: 'compare SI and CI on 1000 at 10% for 5 years' },
    { id: 'interest', keys: ['interest', 'interest rate', 'rate of interest'], t: 'Interest', k: '<b>Interest</b> is a "thank-you" payment for using money. A bank pays YOU interest when you save, and YOU pay interest when you borrow.', s: 'The price of money over time, usually a % per year. Savers earn it; borrowers pay it.', ex: 'interest on 2000 at 6% for 2 years' },
    { id: 'principal', keys: ['principal'], t: 'Principal', k: 'The <b>principal</b> is the money you start with, before any interest is added.', s: 'The original sum deposited or borrowed, on which interest is calculated.' },
    { id: 'inflation', keys: ['inflation', 'prices go up', 'price rise'], t: 'Inflation', k: '<b>Inflation</b> means prices slowly go up over the years. A samosa that cost ₹5 long ago costs ₹20 now!', s: 'The general rise in prices over time, which reduces what each rupee can buy. India\'s target is about 4% a year.', ex: 'inflation on 100 at 6% for 10 years' },
    { id: 'budget', keys: ['budget', 'budgeting'], t: 'Budget', k: 'A <b>budget</b> is a plan for your money: how much to spend, how much to save and how much to share, BEFORE you spend it.', s: 'A spending plan. A popular rule is 50/30/20: needs / wants / savings.' },
    { id: 'saving', keys: ['saving', 'savings', 'why save', 'why should i save'], t: 'Saving', k: '<b>Saving</b> means keeping some money for later instead of spending it now, so you can buy bigger dreams and be ready for surprises.', s: 'Setting aside income for future goals or emergencies. "Pay yourself first": save before you spend.' },
    { id: 'needwant', keys: ['need and want', 'needs and wants', 'need vs want', 'needs vs wants', 'need or want'], t: 'Needs vs wants', k: 'A <b>need</b> is something you must have (food, school books, medicine). A <b>want</b> is nice to have (toys, games, sweets).', s: 'Needs are essentials; wants are discretionary. Cover needs first, then decide on wants.' },
    { id: 'loan', keys: ['loan', 'borrow', 'borrowing'], t: 'Loan', k: 'A <b>loan</b> is money you borrow and must give back later, usually with extra money called interest.', s: 'Borrowed money repaid over time with interest. The total cost is always more than the amount borrowed.', ex: 'EMI on 100000 at 10% for 2 years' },
    { id: 'emi', keys: ['emi', 'instalment', 'installment'], t: 'EMI', k: '<b>EMI</b> means "Equated Monthly Instalment": paying back a loan in equal parts every month.', s: 'A fixed monthly loan repayment covering both principal and interest.', ex: 'EMI on 50000 at 12% for 1 year' },
    { id: 'debt', keys: ['debt'], t: 'Debt', k: '<b>Debt</b> is money you owe someone. Too much debt is like a heavy backpack 🎒: it slows you down.', s: 'Money owed. Good debt can build assets (education); bad debt funds consumption at high interest.' },
    { id: 'credit', keys: ['credit card'], t: 'Credit card', k: 'A <b>credit card</b> lets grown-ups buy now and pay the bank later. If they don\'t pay on time, the bank charges a LOT of interest.', s: 'Short-term borrowing. Paying the full bill on time is free; carrying a balance costs ~36–42% a year in India.' },
    { id: 'debit', keys: ['debit card', 'atm card'], t: 'Debit card', k: 'A <b>debit card</b> spends money that is already in your bank account. No borrowing!', s: 'A card linked to your bank balance; spending is deducted immediately.' },
    { id: 'bank', keys: ['bank', 'bank account', 'savings account'], t: 'Bank account', k: 'A <b>bank account</b> is a super-safe gullak run by a bank. It keeps your money safe and pays you a little interest.', s: 'A deposit account; savings accounts in India typically pay ~2.5–4% a year and are insured up to ₹5 lakh by DICGC.' },
    { id: 'fd', keys: ['fixed deposit', 'fd'], t: 'Fixed deposit (FD)', k: 'An <b>FD</b> is when you lock money in a bank for a fixed time. You can\'t touch it, but you get more interest!', s: 'A term deposit with a fixed rate and tenure; usually compounded quarterly.', ex: 'CI on 10000 at 7% for 3 years compounded quarterly' },
    { id: 'rd', keys: ['recurring deposit', 'rd'], t: 'Recurring deposit (RD)', k: 'An <b>RD</b> is when you put a small fixed amount in the bank every month, and it grows with interest.', s: 'Monthly fixed deposits for a set tenure, building a disciplined savings habit.' },
    { id: 'sip', keys: ['sip', 'systematic investment plan'], t: 'SIP', k: 'A <b>SIP</b> is putting a small amount into investments every month, like feeding your gullak on a schedule.', s: 'Systematic Investment Plan: regular fixed investments into a mutual fund, averaging out market ups and downs.' },
    { id: 'mf', keys: ['mutual fund'], t: 'Mutual fund', k: 'A <b>mutual fund</b> is when lots of people put money together and an expert invests it in many companies for them.', s: 'A pooled investment managed professionally, diversified across stocks and/or bonds.' },
    { id: 'stock', keys: ['stock', 'stock market', 'shares', 'share market', 'sensex', 'nifty'], t: 'Stocks / shares', k: 'A <b>share</b> is a tiny piece of a company. If the company does well, your piece can become worth more!', s: 'Equity ownership in a company. Higher long-term returns than deposits, but prices go up and down.' },
    { id: 'invest', keys: ['invest', 'investing', 'investment'], t: 'Investing', k: '<b>Investing</b> means putting money somewhere it can grow, like planting a seed 🌱 that becomes a tree.', s: 'Allocating money to assets expected to grow (stocks, funds, bonds) to beat inflation over time.' },
    { id: 'risk', keys: ['risk', 'risky'], t: 'Risk', k: '<b>Risk</b> means the chance of losing some money. Things that can grow a lot can also fall a lot.', s: 'The uncertainty of returns. Higher expected return usually means higher risk; diversify to reduce it.' },
    { id: 'insurance', keys: ['insurance'], t: 'Insurance', k: '<b>Insurance</b> is paying a small amount regularly so that if something bad happens, the company helps pay the big cost.', s: 'Risk transfer: small premiums protect against large, unlikely losses (health, life, vehicle).' },
    { id: 'tax', keys: ['tax', 'taxes', 'income tax'], t: 'Tax', k: '<b>Tax</b> is money people give the government to build roads, schools and hospitals for everyone.', s: 'Compulsory payments to government: direct (income tax) and indirect (GST).' },
    { id: 'gst', keys: ['gst'], t: 'GST', k: '<b>GST</b> is a tax added to the price of things you buy. Part of what you pay goes to the government.', s: 'Goods and Services Tax, with slabs of 0/5/12/18/28% in India.', ex: 'GST on 500 at 18%' },
    { id: 'profit', keys: ['profit', 'loss', 'profit and loss'], t: 'Profit & loss', k: 'If you sell something for MORE than you paid, that\'s a <b>profit</b>. If you sell for less, that\'s a <b>loss</b>.', s: 'Profit = Selling price − Cost price; Profit % = Profit ÷ Cost × 100.', ex: 'bought for 200 sold for 250' },
    { id: 'discount', keys: ['discount', 'sale', 'offer'], t: 'Discount', k: 'A <b>discount</b> means the price is cut. 20% off ₹100 means you pay ₹80.', s: 'Reduction from the marked price: Sale price = MP × (1 − d/100).', ex: '20 percent discount on 1500' },
    { id: 'percent', keys: ['percent', 'percentage'], t: 'Percent', k: '<b>Percent</b> means "out of 100". 10% of ₹200 = ₹20.', s: 'A ratio per hundred: x% of y = x × y ÷ 100.', ex: 'what is 15 percent of 800' },
    { id: 'emergency', keys: ['emergency fund', 'emergency'], t: 'Emergency fund', k: 'An <b>emergency fund</b> is money kept aside only for surprises, like a broken bicycle or a lost bus pass.', s: 'Savings covering 3–6 months of expenses, kept liquid for unexpected events.' },
    { id: 'rule72', keys: ['rule of 72', 'double my money', 'doubling'], t: 'Rule of 72', k: 'The <b>Rule of 72</b>: divide 72 by the interest rate to guess how many years money takes to double!', s: 'Years to double ≈ 72 ÷ annual rate (%). Accurate for rates of about 4–15%.', ex: 'how long to double money at 8%' },
    { id: 'opportunity', keys: ['opportunity cost'], t: 'Opportunity cost', k: '<b>Opportunity cost</b> is what you give up when you choose something. Buying a game means NOT buying that football.', s: 'The value of the next-best alternative forgone when making a choice.' },
    { id: 'impulse', keys: ['impulse buying', 'impulse'], t: 'Impulse buying', k: '<b>Impulse buying</b> is buying something suddenly without thinking. The Cool-down Jar 🧊 in Gullak helps stop it!', s: 'Unplanned purchases driven by emotion. A waiting period reduces regret.' },
    { id: 'scam', keys: ['scam', 'fraud', 'otp', 'pin', 'my pin', 'password', 'cvv', 'phishing', 'hacker', 'stranger asked', 'asked for my'], t: 'Staying safe from scams', k: '🚨 NEVER share a PIN, OTP or password with anyone, even if they say they\'re from a bank. Tell a grown-up right away!', s: 'Banks never ask for OTP/PIN. Verify callers, avoid unknown links, and report fraud to 1930 (India\'s cyber-crime helpline).' },
    { id: 'upi', keys: ['upi', 'gpay', 'paytm', 'phonepe'], t: 'UPI', k: '<b>UPI</b> lets grown-ups send money instantly using a phone. It\'s real money, so only grown-ups should use it. Gullak uses pretend money only!', s: 'Unified Payments Interface: instant bank-to-bank transfers in India via a UPI ID or QR code.' },
    { id: 'income', keys: ['income', 'salary', 'earn', 'earning'], t: 'Income', k: '<b>Income</b> is money that comes in: pocket money, gifts or money you earn by helping.', s: 'Money received from work, business, investments or gifts.' },
    { id: 'expense', keys: ['expense', 'expenses', 'spending'], t: 'Expense', k: 'An <b>expense</b> is money that goes out when you buy something.', s: 'Money spent. Track expenses to see where your money goes. That\'s exactly what Gullak does!' },
    { id: 'asset', keys: ['asset', 'assets', 'liability', 'liabilities', 'net worth'], t: 'Assets, liabilities & net worth', k: 'An <b>asset</b> is something valuable you own; a <b>liability</b> is money you owe. <b>Net worth</b> = what you own − what you owe.', s: 'Net worth = assets − liabilities. Grow assets, limit liabilities.' },
    { id: 'charity', keys: ['donate', 'donation', 'charity', 'sharing money'], t: 'Giving', k: 'Giving a little to help others feels great 💛. Many families use 3 jars: Spend, Save and Share.', s: 'Charitable giving is part of healthy money habits; some donations also reduce tax (80G in India).' },
    { id: 'money', keys: ['what is money', 'why money', 'barter', 'history of money'], t: 'What is money?', k: 'Long ago people swapped things (that\'s <b>barter</b>): a goat for rice! Money made swapping easy, because everyone agrees it has value.', s: 'Money is a medium of exchange, unit of account and store of value, backed in India by the RBI.' },
    { id: 'rbi', keys: ['rbi', 'reserve bank'], t: 'RBI', k: 'The <b>RBI</b> (Reserve Bank of India) is the bank for all banks. It prints our rupee notes and keeps money safe.', s: 'India\'s central bank: issues currency, sets the repo rate and regulates banks.' },
    { id: 'delayed', keys: ['delayed gratification', 'patience', 'wait to buy'], t: 'Waiting to buy', k: 'Waiting before buying (<b>delayed gratification</b>) is a money superpower. Often you don\'t even want it later!', s: 'Choosing a larger later reward over a smaller immediate one. It is strongly linked to financial success.' }
  ];

  const lev = (a, b) => { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; };
  const findConcept = (t) => {
    const scam = KB.find(c => c.id === 'scam');
    if (scam.keys.some(k => new RegExp('\\b' + k.replace(/ /g, '\\s+') + '\\b').test(t))) return scam;
    let best = null, bestLen = 0;
    KB.forEach(c => c.keys.forEach(k => { if (new RegExp('\\b' + k.replace(/ /g, '\\s+') + '\\b').test(t) && k.length > bestLen) { best = c; bestLen = k.length; } }));
    if (best) return best;
    const words = t.trim().split(' ').filter(w => w.length >= 5);
    KB.forEach(c => c.keys.filter(k => !k.includes(' ') && k.length >= 5).forEach(k => words.forEach(w => { if (!best && lev(w, k) <= (k.length >= 8 ? 2 : 1)) best = c; })));
    return best;
  };
  const explain = (c) => {
    const html = `<b>📚 ${c.t}</b><br>${senior() ? c.s + '<br><small>' + c.k + '</small>' : c.k}${c.ex ? `<div class="mt"><button class="chip" data-act="chat-say" data-t="${esc(c.ex)}">🧮 Try: ${esc(c.ex)}</button></div>` : ''}`;
    ctx.last = Object.assign({}, ctx.last || {}, { concept: c.id });
    return { html, plain: c.t + '. ' + (senior() ? c.s : c.k) };
  };

  /* ---------- the brain ---------- */
  const DEF = /\b(what|whats|wat|explain|define|definition|meaning|tell me about|teach me|how does|how do|how to|how can|why|difference|what does|what are|means?|is it|should i|is a|are)\b/;
  G.brain = (raw) => {
    const t = G.normalizeQ(raw); const e = G.entities(t);
    const A = e.amounts; const has = (re) => re.test(t);
    const SI = has(/\bsimple interest\b|\bsimple\b.*\binterest\b|\bs\.?\s?i\b/), CI = has(/\bcompound(ed|ing)?\b|\bc\.?\s?i\b/);
    const followUp = has(/^\s*(and|what about|what if|how about|if|now|then|instead|make it|change)\b/) || (t.trim().split(' ').length <= 5 && (e.years != null || e.rate != null) && !A.length);

    if (has(/\b(what can you do|help me|what do you know|commands|abilities)\b/)) return { html: `I can help with: <ul><li>📝 Writing down money: <i>"I spent 40 on ice cream"</i></li><li>🙋 <i>"Can I buy a ₹300 toy?"</i></li><li>🧮 Maths: <i>"SI on 1000 at 5% for 3 years"</i>, <i>"CI on 5000 at 10% for 2 years half-yearly"</i>, <i>"EMI on 50000 at 12% for 1 year"</i>, <i>"20% discount on 1500"</i></li><li>🎯 Plans: <i>"If I save 50 a week, when will I have 2000?"</i></li><li>📚 Words: <i>"What is inflation?"</i>, <i>"What is a SIP?"</i></li></ul>`, plain: 'I can write down money, answer can I buy questions, do money maths, and explain money words.' };

    let base = null;
    if (ctx.pending && (A.length || e.rate != null || e.years != null)) { base = Object.assign({ type: ctx.pending.type }, ctx.pending.have); ctx.pending = null; }
    else if (ctx.last && ctx.last.type && followUp && !has(/\b(spent|bought|got|can i)\b/)) base = Object.assign({}, ctx.last);
    if (base && SI && !CI) base.type = 'si'; if (base && CI && !SI) base.type = 'ci';
    if (base && has(/compare|both|vs|versus/)) base.type = 'compare';

    const wantsCalc = A.length || e.rate != null || e.years != null;
    const emiQ = has(/\bemi\b|monthly (payment|instalment)/) || (base && base.type === 'emi');
    if (emiQ && (wantsCalc || base)) {
      const P = A[0] || (base && base.P), R = e.rate != null ? e.rate : base && base.R, T = e.years || (base && base.T);
      const missing = []; if (!(P > 0)) missing.push('P'); if (R == null || !(R >= 0)) missing.push('R'); if (!(T > 0)) missing.push('T');
      if (missing.length) return need('emi', { P, R, T }, missing, 'EMI on 50000 at 12% for 1 year');
      return calc.emi({ P, R, T });
    }
    if ((has(/\bdoubl(e|ing)\b/) || (base && base.type === 'double')) && (e.rate != null || (base && base.R))) return calc.double({ R: e.rate != null ? e.rate : base.R });
    if (has(/\binflation\b/) && A.length && e.rate != null && e.years) return calc.inflation({ P: A[0], R: e.rate, T: e.years });

    const interestish = SI || CI || has(/\binterest\b/) || (base && ['si', 'ci', 'compare'].includes(base.type));
    if (interestish && (wantsCalc || base)) {
      const type = base ? base.type : (SI && CI) || has(/compare|difference|vs|versus|both/) ? 'compare' : CI ? 'ci' : 'si';
      const P = A.length ? A[0] : base && base.P, R = e.rate != null ? e.rate : (A.length > 1 && A[1] <= 50 && !e.rate ? A[1] : base && base.R), T = e.years != null ? e.years : base && base.T;
      const n = e.freq || (base && base.n) || (has(/\bmonthly\b/) && type !== 'si' ? 12 : null);
      const missing = []; if (!(P > 0)) missing.push('P'); if (!(R > 0)) missing.push('R'); if (!(T > 0)) missing.push('T');
      if (missing.length) return need(type, { P, R, T, n }, missing, type === 'ci' ? 'CI on 5000 at 10% for 2 years' : 'SI on 1000 at 5% for 3 years');
      if (P > 1e12 || R > 1000 || T > 200) return { html: 'Whoa, those numbers are HUGE! 😅 Try something smaller, like ₹1000 at 5% for 3 years.', plain: 'Those numbers are too big.' };
      return calc[type]({ P, R, T, n });
    }

    let m;
    if ((m = t.match(/(\d+(?:\.\d+)?) percent (?:of|on) (\d+(?:\.\d+)?)/)) && !has(/discount|off\b|gst|tax|interest/)) {
      const p = Number(m[1]), v = Number(m[2]); const r = p * v / 100;
      return { html: box('🔢 Percent', [`${num(p)}% of ${num(v)} = ${num(p)} × ${num(v)} ÷ 100`], `= ${num(r)}`) + `<p class="small">Percent means "out of 100".</p>`, plain: `${p} percent of ${v} is ${r2(r)}.` };
    }
    if ((m = t.match(/what (?:percent|part) is (\d+(?:\.\d+)?) (?:of|out of) (\d+(?:\.\d+)?)/)) || (m = t.match(/(\d+(?:\.\d+)?) (?:is what percent|out of) (?:of )?(\d+(?:\.\d+)?)/))) {
      const a = Number(m[1]), b = Number(m[2]); const r = a / b * 100;
      return { html: box('🔢 Percent', [`${num(a)} ÷ ${num(b)} × 100`], `= ${num(r)}%`), plain: `${r2(r)} percent.` };
    }
    if (has(/discount|\boff\b|sale price/) && e.rate != null && A.length) {
      const P = A[0], d = e.rate; const cut = P * d / 100;
      return { html: box('🏷️ Discount', [`Price ${money(P)} · discount ${num(d)}%`, `Discount = ${num(P)} × ${num(d)} ÷ 100 = ${money(cut)}`], `You pay ${money(P - cut)} (you save ${money(cut)})`) + `<p>${samosas(cut) ? 'Saving ' + samosas(cut).replace("That's", 'that\'s') : ''}</p>`, plain: `You pay ${r2(P - cut)} rupees.` };
    }
    if (has(/\bgst\b|\btax\b/) && A.length && e.rate != null) {
      const P = A[0], g = e.rate, tax = P * g / 100;
      return { html: box('🧾 GST', [`Price ${money(P)} · GST ${num(g)}%`, `GST = ${num(P)} × ${num(g)} ÷ 100 = ${money(tax)}`], `Total to pay: ${money(P + tax)}`), plain: `Total is ${r2(P + tax)} rupees.` };
    }
    if ((m = t.match(/(?:bought|cost price|cp|buy)\D{0,20}(\d+(?:\.\d+)?)\D{1,30}(?:sold|selling price|sp|sell)\D{0,20}(\d+(?:\.\d+)?)/))) {
      const cp = Number(m[1]), sp = Number(m[2]), d = sp - cp; const pct = d / cp * 100;
      return { html: box(d >= 0 ? '📈 Profit' : '📉 Loss', [`Selling price − cost price = ${money(sp)} − ${money(cp)} = ${money(d)}`, `${d >= 0 ? 'Profit' : 'Loss'} % = ${money(Math.abs(d))} ÷ ${money(cp)} × 100 = ${num(Math.abs(pct))}%`], `${d >= 0 ? 'Profit' : 'Loss'} of ${money(Math.abs(d))} (${num(Math.abs(pct))}%)`), plain: `${d >= 0 ? 'Profit' : 'Loss'} of ${r2(Math.abs(d))} rupees.` };
    }
    if (has(/\b(split|share|divide)\b/) && A.length && (m = t.match(/(?:between|among|amongst|by|with) (\d+)|(\d+) (?:friends|people|kids|ways|of us)/))) {
      const total = A[0], k = Number(m[1] || m[2]); const each = total / k;
      return { html: box('🍕 Splitting', [`${money(total)} ÷ ${k} = ${money(each)}`], `Each person pays ${money(each)}`), plain: `Each pays ${r2(each)} rupees.` };
    }
    if ((m = t.match(/how many (samosas?|ice ?creams?|chocolates?|chores?|pani ?puri|movie tickets?)/)) && A.length) {
      const id = /samosa/.test(m[1]) ? 'samosa' : /ice/.test(m[1]) ? 'icecream' : /choc/.test(m[1]) ? 'choc' : /chore/.test(m[1]) ? 'chore' : /pani/.test(m[1]) ? 'panipuri' : 'movie';
      const u = G.inUnits(A[0], id); return { html: `${money(A[0])} = <b>${u.text}</b> ${G.emojiRow(u.n, u.e, 12)}`, plain: `${A[0]} rupees is ${u.text}.` };
    }

    if ((m = t.match(/how much (?:should|do|must|can|to|will) (?:i )?(?:need to )?save (?:a|per|each|every) (week|month|day) (?:to|for) (?:get|reach|buy|have|collect)?\s*(?:a |an |my )?(?:rs )?(\d+(?:\.\d+)?)/)) && e.years) {
      const per = m[1], target = Number(m[2]); const unitsN = e.units && Object.keys(e.units).length === 1 && e.units[per] != null ? e.units[per] : null;
      const periods = Math.max(1, unitsN || Math.round(e.years * { week: 52, month: 12, day: 365 }[per]));
      return { html: box('🎯 Savings plan', [`${money(target)} ÷ ${plural(periods, per)} = ${money(target / periods)}`], `Save ${money(Math.ceil(target / periods))} every ${per}`), plain: `Save ${Math.ceil(target / periods)} rupees every ${per}.` };
    }
    const X = A.length ? A[0] : null;
    if (e.per && X && has(/\bsave|saving|put away|keep\b/) && !has(/\binterest\b/) && !has(/^\s*how much (should|do|must|can|to|will)/)) {
      const tg = t.match(/(?:reach|get to|have|for|buy|target|goal of|collect)\s+(?:a |an |my )?(?:rs )?(\d+(?:\.\d+)?)/);
      const target = A.length > 1 ? A[1] : tg ? Number(tg[1]) : null;
      if (e.years) return calc.plan({ X, per: e.per, T: e.years, units: e.units });
      if (target && target !== X) return calc.plan({ X, per: e.per, target });
      const g = G.activeGoal(); if (g) { const left = Math.max(0, g.target - G.goalSaved(g.id)); return calc.plan({ X, per: e.per, target: left }); }
    }

    const c = findConcept(t);
    if (c && (c.id === 'scam' || DEF.test(t) || t.trim().split(' ').length <= 4)) return explain(c);
    return null;
  };

  const a0 = G.answer;
  G.answer = (raw, voice) => {
    let out = null;
    try { out = G.brain(raw); } catch (err) { console.error(err); out = null; }
    if (!out) return a0(raw, voice);
    G.S.meta.talked = (G.S.meta.talked || 0) + 1;
    G.chat.push({ from: 'pig', html: out.html });
    if (voice || G.S.settings.readAloud) G.speak(out.plain || out.html, true);
  };

  const sc = G.screens.talk; const r0 = sc.render;
  sc.render = (q) => r0(q).replace(/<div class="chips sugg">[\s\S]*?<\/div>/, `<div class="chips sugg">${['What can you do?', 'SI on 1000 at 5% for 3 years', 'CI on 5000 at 10% for 2 years half-yearly',
    'Compare SI and CI on 2000 at 8% for 5 years', 'What is inflation?', 'How long to double money at 8%?', 'If I save 50 a week how long to reach 2000?',
    'EMI on 50000 at 12% for 1 year', '20% discount on 1500', 'Can I buy a ₹300 toy?', 'I spent 40 on ice cream', 'What is a SIP?']
    .map(x => `<button class="chip" data-act="chat-say" data-t="${esc(x)}">${esc(x)}</button>`).join('')}</div>`);
})(window.G);