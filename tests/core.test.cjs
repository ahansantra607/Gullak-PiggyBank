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
