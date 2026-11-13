const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCore() {
  const storage = new Map();
  const window = { G: {} };
  const context = {
    window,
    localStorage: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    location: { href: 'https://example.test/' },
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    Buffer,
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    RegExp,
    Intl,
    unescape,
    escape
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'js/core.js' });
  return { G: window.G, storage };
}

function resetState(G, balance = 0) {
  G.S = G.fresh();
  if (balance > 0) G.S.txns.push({ id: 'seed', type: 'in', amount: balance, date: G.now() });
}

test('fresh state starts with an empty ledger and zero balance', () => {
  const { G } = loadCore();
  resetState(G);
  assert.equal(G.S.txns.length, 0);
  assert.equal(G.balance(), 0);
});

test('balance counts income, spending, goal transfers and withdrawals', () => {
  const { G } = loadCore();
  const state = {
    txns: [
      { type: 'in', amount: 1000 },
      { type: 'out', amount: 125 },
      { type: 'toGoal', amount: 300 },
      { type: 'fromGoal', amount: 50 },
      { type: 'loanIn', amount: 200 },
      { type: 'loanPay', amount: 25 }
    ]
  };
  assert.equal(G.balance(state), 800);
});

test('balance fails closed for a malformed recognized transaction amount', () => {
  const { G } = loadCore();
  assert.equal(G.balance({ txns: [{ type: 'in', amount: NaN }] }), 0);
  assert.equal(G.balance({ txns: null }), 0);
});

test('addTxn accepts a valid income transaction and persists state', () => {
  const { G, storage } = loadCore();
  resetState(G);
  const tx = G.act.addTxn({ type: 'in', amount: 250, category: 'gift' });
  assert.ok(tx);
  assert.equal(G.balance(), 250);
  assert.ok(storage.has(G.storeKey));
  assert.equal(JSON.parse(storage.get(G.storeKey)).txns.length, 1);
});

test('addTxn rejects zero, negative and unsafe amounts', () => {
  const { G } = loadCore();
  resetState(G, 500);
  assert.equal(G.act.addTxn({ type: 'out', amount: 0 }), null);
  assert.equal(G.act.addTxn({ type: 'out', amount: -1 }), null);
  assert.equal(G.act.addTxn({ type: 'out', amount: Number.MAX_SAFE_INTEGER + 1 }), null);
  assert.equal(G.balance(), 500);
});

test('addTxn prevents spending more than the available balance', () => {
  const { G } = loadCore();
  resetState(G, 100);
  assert.equal(G.act.addTxn({ type: 'out', amount: 101 }), null);
  assert.equal(G.balance(), 100);
  assert.equal(G.S.txns.length, 1);
});

test('addTxn permits spending exactly the available balance', () => {
  const { G } = loadCore();
  resetState(G, 100);
  assert.ok(G.act.addTxn({ type: 'out', amount: 100 }));
  assert.equal(G.balance(), 0);
});

test('goal saving is limited by available balance and goal target', () => {
  const { G } = loadCore();
  resetState(G, 100);
  G.S.goals.push({ id: 'goal-1', target: 80, name: 'Book' });
  assert.equal(G.act.addTxn({ type: 'toGoal', amount: 81, goalId: 'goal-1' }), null);
  assert.ok(G.act.addTxn({ type: 'toGoal', amount: 80, goalId: 'goal-1' }));
  assert.equal(G.balance(), 20);
  assert.equal(G.goalSaved('goal-1'), 80);
});

test('deleteTxn refuses to remove income if doing so would make balance negative', () => {
  const { G } = loadCore();
  resetState(G);
  const income = G.act.addTxn({ type: 'in', amount: 100 });
  G.act.addTxn({ type: 'out', amount: 80 });
  assert.equal(G.act.deleteTxn(income.id), false);
  assert.equal(G.balance(), 20);
});

test('deleteTxn removes a transaction when the resulting ledger remains valid', () => {
  const { G } = loadCore();
  resetState(G);
  const income = G.act.addTxn({ type: 'in', amount: 100 });
  assert.equal(G.act.deleteTxn(income.id), true);
  assert.equal(G.balance(), 0);
  assert.equal(G.S.txns.length, 0);
});


test('addTxn rejects fractional rupees instead of rounding them', () => {
  const { G } = loadCore();
  resetState(G, 100);
  assert.equal(G.act.addTxn({ type: 'out', amount: 100.4 }), null);
  assert.equal(G.act.addTxn({ type: 'out', amount: '99.5' }), null);
  assert.equal(G.balance(), 100);
  assert.equal(G.S.txns.length, 1);
});

test('addTxn rejects unknown transaction types', () => {
  const { G } = loadCore();
  resetState(G, 100);
  assert.equal(G.act.addTxn({ type: 'mystery', amount: 50 }), null);
  assert.equal(G.balance(), 100);
  assert.equal(G.S.txns.length, 1);
});

test('loan repayments cannot exceed available spendable balance', () => {
  const { G } = loadCore();
  resetState(G, 100);
  assert.equal(G.act.addTxn({ type: 'loanPay', amount: 101, loanId: 'loan-1' }), null);
  assert.ok(G.act.addTxn({ type: 'loanPay', amount: 100, loanId: 'loan-1' }));
  assert.equal(G.balance(), 0);
});

test('loan advances increase spendable balance and can be repaid', () => {
  const { G } = loadCore();
  resetState(G);
  assert.ok(G.act.addTxn({ type: 'loanIn', amount: 250, loanId: 'loan-1' }));
  assert.ok(G.act.addTxn({ type: 'loanPay', amount: 75, loanId: 'loan-1' }));
  assert.equal(G.balance(), 175);
});

test('dream withdrawals require an existing goal and cannot exceed its saved amount', () => {
  const { G } = loadCore();
  resetState(G, 100);
  G.S.goals.push({ id: 'goal-1', target: 100, name: 'Book' });
  assert.equal(G.act.addTxn({ type: 'fromGoal', amount: 1, goalId: 'missing' }), null);
  assert.equal(G.act.addTxn({ type: 'fromGoal', amount: 1, goalId: 'goal-1' }), null);
  assert.ok(G.act.addTxn({ type: 'toGoal', amount: 60, goalId: 'goal-1' }));
  assert.ok(G.act.addTxn({ type: 'fromGoal', amount: 60, goalId: 'goal-1' }));
  assert.equal(G.balance(), 100);
  assert.equal(G.goalSaved('goal-1'), 0);
});

test('approval refuses an unaffordable purchase and leaves the request pending', () => {
  const { G } = loadCore();
  resetState(G, 100);
  G.S.requests.push({ id: 'ask-1', status: 'pending', price: 200, kidPays: 200, item: 'Toy' });
  const result = G.act.decide('ask-1', 'approved', '');
  assert.equal(result.ok, false);
  assert.equal(result.why, 'insufficient');
  assert.equal(G.S.requests[0].status, 'pending');
  assert.equal(G.balance(), 100);
});

test('approval cannot be applied twice or with an unknown decision', () => {
  const { G } = loadCore();
  resetState(G, 100);
  G.S.requests.push({ id: 'ask-1', status: 'pending', price: 40, kidPays: 40, item: 'Toy' });
  assert.equal(G.act.decide('ask-1', 'unknown', '').ok, false);
  assert.equal(G.act.decide('ask-1', 'approved', '').ok, true);
  assert.equal(G.act.decide('ask-1', 'approved', '').why, 'already');
  assert.equal(G.balance(), 60);
  assert.equal(G.S.txns.filter(t => t.requestId === 'ask-1').length, 1);
});

test('saveToGoal rejects fractional input without changing either balance or goal', () => {
  const { G } = loadCore();
  resetState(G, 100);
  G.S.goals.push({ id: 'goal-1', target: 100, name: 'Book' });
  assert.equal(G.act.saveToGoal('goal-1', 25.5), 0);
  assert.equal(G.balance(), 100);
  assert.equal(G.goalSaved('goal-1'), 0);
});

test('balance fails closed for unknown ledger records but counts dream purchases safely', () => {
  const { G } = loadCore();
  assert.equal(G.balance({ txns: [{ type: 'in', amount: 100 }, { type: 'unknown', amount: 20 }] }), 0);
  assert.equal(G.balance({ txns: [
    { type: 'in', amount: 100 },
    { type: 'toGoal', amount: 100, goalId: 'goal-1' },
    { type: 'goalSpend', amount: 100, goalId: 'goal-1' }
  ] }), 0);
});

test('addGoal rejects invalid and fractional targets without changing state', () => {
  const { G } = loadCore();
  resetState(G, 100);
  assert.equal(G.act.addGoal({ name: 'Book', target: 0 }), null);
  assert.equal(G.act.addGoal({ name: 'Book', target: 25.5 }), null);
  assert.equal(G.S.goals.length, 0);
  assert.ok(G.act.addGoal({ name: 'Book', target: 250 }));
  assert.equal(G.S.goals.length, 1);
});

test('buyGoal is idempotent and records a saved dream purchase once', () => {
  const { G } = loadCore();
  resetState(G, 200);
  const goal = G.act.addGoal({ name: 'Book', target: 150 });
  assert.ok(G.act.addTxn({ type: 'toGoal', amount: 150, goalId: goal.id }));
  assert.equal(G.act.buyGoal(goal.id), true);
  assert.equal(G.act.buyGoal(goal.id), false);
  assert.equal(G.balance(), 50);
  assert.equal(G.goalSaved(goal.id), 0);
  assert.equal(G.S.txns.filter(t => t.type === 'goalSpend' && t.goalId === goal.id).length, 1);
});

test('deleteGoal keeps the goal intact when its saved ledger is invalid', () => {
  const { G } = loadCore();
  resetState(G, 100);
  const goal = G.act.addGoal({ name: 'Book', target: 100 });
  G.S.txns.push({ id: 'bad-save', type: 'toGoal', amount: 10.5, goalId: goal.id });
  const before = G.S.txns.length;
  assert.equal(G.act.deleteGoal(goal.id), false);
  assert.equal(G.S.goals.some(g => g.id === goal.id), true);
  assert.equal(G.S.txns.length, before);
});
