const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createApp() {
  const storage = new Map();
  const window = { G: {} };
  const context = {
    window,
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    location: { href: 'https://example.test/' },
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    Buffer, console, Date, Math, JSON, Number, String, Object, Array, RegExp, Intl,
    unescape, escape
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/core.js'), 'utf8'), context);
  const G = window.G;
  G.S = G.fresh();
  return G;
}

test('full money journey keeps spendable balance consistent across transaction types', () => {
  const G = createApp();
  G.S.txns.push({ id: 'seed', type: 'in', amount: 500, date: G.now() });
  G.S.goals.push({ id: 'goal-1', name: 'Cycle', target: 300 });
  assert.ok(G.act.addTxn({ type: 'out', amount: 100, category: 'snacks' }));
  assert.ok(G.act.addTxn({ type: 'toGoal', amount: 200, goalId: 'goal-1' }));
  assert.ok(G.act.addTxn({ type: 'fromGoal', amount: 50, goalId: 'goal-1' }));
  assert.ok(G.act.addTxn({ type: 'loanIn', amount: 100, loanId: 'loan-1' }));
  assert.ok(G.act.addTxn({ type: 'loanPay', amount: 25, loanId: 'loan-1' }));
  assert.equal(G.balance(), 325);
  assert.equal(G.goalSaved('goal-1'), 150);
});

test('removing a dream returns its remaining saved money exactly once', () => {
  const G = createApp();
  G.S.txns.push({ id: 'seed', type: 'in', amount: 400, date: G.now() });
  G.S.goals.push({ id: 'goal-1', name: 'Books', target: 300 });
  assert.ok(G.act.addTxn({ type: 'toGoal', amount: 125, goalId: 'goal-1' }));
  const before = G.balance();
  G.act.deleteGoal('goal-1');
  assert.equal(G.balance(), before + 125);
  assert.equal(G.S.goals.some(g => g.id === 'goal-1'), false);
  assert.equal(G.S.txns.filter(t => t.type === 'fromGoal' && t.note === 'Dream removed').length, 1);
});

test('an approved ask deducts the kid contribution once and marks the request approved', () => {
  const G = createApp();
  G.S.txns.push({ id: 'seed', type: 'in', amount: 300, date: G.now() });
  G.S.requests.push({ id: 'ask-1', status: 'pending', item: 'Book', price: 120, kidPays: 80 });
  const result = G.act.decide('ask-1', 'approved', 'Okay');
  assert.equal(result.ok, true);
  assert.equal(G.balance(), 220);
  assert.equal(G.act.decide('ask-1', 'approved', '').ok, false);
  assert.equal(G.balance(), 220);
});

test('deleting a spend restores the balance without changing other entries', () => {
  const G = createApp();
  G.S.txns.push({ id: 'seed', type: 'in', amount: 250, date: G.now() });
  const spend = G.act.addTxn({ type: 'out', amount: 60, category: 'games' });
  assert.equal(G.balance(), 190);
  assert.equal(G.act.deleteTxn(spend.id), true);
  assert.equal(G.balance(), 250);
  assert.equal(G.S.txns.length, 1);
});
