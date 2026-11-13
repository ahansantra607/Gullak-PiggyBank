const { test, expect } = require('@playwright/test');

const seedState = () => {
  if (sessionStorage.getItem('gullak-test-seeded')) return;
  sessionStorage.setItem('gullak-test-seeded', '1');
  const now = Date.now();
  localStorage.setItem('gullak:mode', 'individual');
  localStorage.setItem('gullak:v1', JSON.stringify({
    v: 1,
    profile: { nickname: 'Tester', avatar: '🐼', ageGroup: 'senior', pocketMoney: 100, frequency: 'weekly', createdAt: now },
    txns: [{ id: 'seed-income', type: 'in', amount: 100, category: 'other', date: now, note: 'Starting balance' }],
    goals: [],
    activeGoalId: null,
    requests: [],
    chores: [],
    badges: [],
    pinHash: null,
    settings: { unit: 'samosa', customUnit: null, sound: false, readAloud: false, coolHours: 24, coolMin: 200, matchPct: 0 },
    meta: { lastOpen: now, prevOpen: now, lastPayday: now, savedByWaiting: 0, melaBest: 0, quizBest: 0, celebrated: {} }
  }));
};

async function openSeededApp(page) {
  await page.addInitScript(seedState);
  await page.goto('/');
  await expect(page.locator('.bal')).toHaveText('₹100');
}

async function enterKeypadAmount(page, digits) {
  for (const digit of digits) await page.locator(`.modal-wrap [data-kpkey="${digit}"]`).click();
}

test('spending updates the visible balance and persists after reload', async ({ page }) => {
  await openSeededApp(page);
  await page.locator('[data-act="out"]').first().click();
  await enterKeypadAmount(page, ['2', '0']);
  await page.locator('.modal-wrap .pick[data-v="snacks"]').click();
  await page.locator('.modal-wrap .seg-b[data-v="want"]').click();
  await page.locator('.modal-wrap [data-act="save"]').click();

  await expect(page.locator('.bal')).toHaveText('₹80');
  await page.reload();
  await expect(page.locator('.bal')).toHaveText('₹80');
  await page.locator('#nav [aria-label="Money"]').click();
  await expect(page.locator('.kv.big b')).toHaveText('₹80');
  await expect(page.locator('.tx').filter({ hasText: 'Snacks' })).toContainText('₹20');
});

test('the spend form blocks a ₹200 spend when only ₹100 is available', async ({ page }) => {
  await openSeededApp(page);
  await page.locator('[data-act="out"]').first().click();
  await enterKeypadAmount(page, ['2', '0', '0']);
  await page.locator('.modal-wrap .pick[data-v="snacks"]').click();
  await page.locator('.modal-wrap .seg-b[data-v="need"]').click();

  await expect(page.locator('.modal-wrap [data-act="save"]')).toBeDisabled();
  await expect(page.locator('#tx-prev')).toContainText('more than your Gullak has');
  await expect(page.locator('.bal')).toHaveText('₹100');
});

test('saving into a dream reduces spendable money and survives reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('gullak-test-seeded')) return;
    sessionStorage.setItem('gullak-test-seeded', '1');
    const now = Date.now();
    localStorage.setItem('gullak:mode', 'individual');
    localStorage.setItem('gullak:v1', JSON.stringify({
      v: 1,
      profile: { nickname: 'Tester', avatar: '🐼', ageGroup: 'senior', pocketMoney: 100, frequency: 'weekly', createdAt: now },
      txns: [{ id: 'seed-income', type: 'in', amount: 100, category: 'other', date: now, note: 'Starting balance' }],
      goals: [{ id: 'goal-1', name: 'Books', emoji: '📚', target: 500, createdAt: now }],
      activeGoalId: 'goal-1', requests: [], chores: [], badges: [], pinHash: null,
      settings: { unit: 'samosa', customUnit: null, sound: false, readAloud: false, coolHours: 24, coolMin: 200, matchPct: 0 },
      meta: { lastOpen: now, prevOpen: now, lastPayday: now, savedByWaiting: 0, melaBest: 0, quizBest: 0, celebrated: {} }
    }));
  });
  await page.goto('/');
  await expect(page.locator('.bal')).toHaveText('₹100');
  await page.locator('#nav [aria-label="Dream"]').click();
  await page.locator('[data-act="feed"]').click();
  await enterKeypadAmount(page, ['2', '0']);
  await page.locator('.modal-wrap [data-act="ok"]').click();

  await expect(page.locator('.dream')).toContainText('₹20');
  await expect(page.locator('.dream')).toContainText('Spendable money in your Gullak: ₹80');
  await page.reload();
  await page.locator('#nav [aria-label="Dream"]').click();
  await expect(page.locator('.dream')).toContainText('Spendable money in your Gullak: ₹80');
});

test('Family mode opens the family chooser without breaking the app', async ({ page }) => {
  await page.goto('/#/modes');
  await page.locator('.m-fam').click();
  await expect(page).toHaveURL(/#\/fam-pick$/);
  await expect(page.locator('body')).toContainText('No families on this device yet.');
  await expect(page.locator('[data-to="fam-create"]')).toBeVisible();
});
