# 🐷 Gullak: My Money Buddy

**Entry for the Dezerv Children's Day Hackathon 2026** · https://childrens-day-hackathon.dezerv.in/

Gullak (the Hindi word for a clay piggy bank) is a talking piggy bank that helps kids aged 8–18:
1. **See where their money went**, shown as samosas, not just numbers.
2. **Save for a dream** that appears piece by piece, and see how every treat moves it closer or further away in days.
3. **Ask a grown-up before buying**, with the impact shown and an "I'll pay half" deal. Grown-ups answer on the same phone or their own phone over WhatsApp, with no accounts needed.

> 🔒 Pretend money only. No bank, UPI, card or wallet. No sign-in, no ads, no real names, no photos. All data stays on the device (browser localStorage).

## 🔀 Two modes (whoever opens the app keeps their data in their own browser)
- **🧒 Individual:** the original one-kid app. First a **grown-up sets a 4-digit PIN** (used for Grown-up mode: approving asks, paying chores, loans and settings), then the kid sets up their Gullak. No account or sign-in.
- **👨‍👩‍👧 Family:** choose your family → tap who you are → enter your PIN. There can be any number of kids and 🛡️ supervisors (grown-ups), and **only supervisors can add people**. A kid sends "Can I buy this?" to the supervisor(s) they choose, and the decision appears on the kid's home screen. Everything is **encrypted on the device** (AES-256-GCM, PBKDF2-wrapped family key); nothing is sent to any server. Recovery works through another supervisor, a Family Recovery Code, or 2 fun security questions. Details: [ACCOUNTS-REQUIREMENTS.md](ACCOUNTS-REQUIREMENTS.md).

---

## ▶️ Run it

**Option A, just open it:** double-click `index.html`. It works offline, with no install. (The Google font needs internet; without it, the app falls back to a system font.)

**Option B, local server** (needed for the share links to work properly while testing):
```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```
Then open http://localhost:8080

**To explore with example data:** in Individual mode, go to ⚙️ Settings → **👀 Load sample data** (the grown-up PIN in the sample is **1234**). This replaces that browser's Individual data.

**Self-test (190 automatic checks):** with the local server running, open the browser console on the app and run:
```js
var s=document.createElement('script'); s.src='tests/selftest.js'; document.body.appendChild(s);
```
then `await GT.all()`. ⚠️ It erases that browser's Gullak data, so only use it on a test copy, never a family's real device.

*Hosting: not set up yet. The app is plain HTML/CSS/JS with no build step, so any static host can serve it later.*

---

## 🧩 Features

### Q1 · "Where did all my money go?" (💸 Money tab)
- **Money Lens 🔍:** see any amount as 🥟 samosas, 🍦 ice creams, 🍫 chocolates, 🥙 pani puri plates, 🎬 movie tickets, **% of my dream**, or **your own unit** (e.g. 🍕 pizza slice ₹60).
- **What's-left jar**, plus got / spent / saved / left for this week, this month or all time.
- **Spend Detective insight 🕵️:** "This week, snacks 🍦 ate 60% of your spending. That's 9 samosas! Without it your Cycle would come 4 days sooner." Can be read aloud 🔊.
- Category breakdown, **Needs 🧩 vs Wants ✨** bar, a **"What if…"** card (spend half on your top want and see how many days sooner you'd get your dream).
- Seniors also get a **6-week spent vs saved chart**.
- **Money diary** grouped by day; delete mistakes.
- The spend entry uses a big keypad, emoji categories and a one-tap need/want choice. It shows a **live preview: "₹40 = 2 samosas · pushes your Cycle back 2 days"**.

### Q2 · "How do I save for that cycle?" (🎯 Dream tab)
- **Puzzle reveal:** the dream is hidden behind 9 tiles that unlock as you save.
- Progress bar, ⭐ milestones at 25/50/75/100% with confetti, and a **🔥 weekly saving streak**.
- **ETA:** "At your speed (₹311/week) you'll get it in 42 days, around 19 December."
- **⏱️ Dream Time Machine:** "One ice cream ⏪ 2 days back", "Skip 1 samosa a day ⏩ 17 days sooner".
- **🧮 Try a price:** type any price, see the delay, then ask a grown-up about it in one tap.
- **Pay-yourself-first nudge:** whenever money comes in, Gullak asks "Feed your dream first? Save 10/20/50%".
- **🏆 Trophy shelf:** tap "I bought it!" when the dream is complete.
- Juniors: one dream at a time (simple). Seniors: up to 3.

### Q3 · "Can I buy this, Mum?" (🙋 Ask tab)
- The **request card** has: item, emoji, price, need/want, reasons (chips plus their own words), and an **"I'll pay X%" slider**.
- **Impact shown before sending:** what you have, what you pay, what the grown-up pays, what's left, and how many days your dream moves back.
- Grown-ups answer with **✅ Yes · 🤝 Yes, if you pay half · ⏳ Wait a week · 💭 Not this time**, plus a note.
- **Three server-less ways to answer:**
  1. **Same phone → 🔒 Grown-up mode** (local 4-digit PIN so kids can't approve themselves. It is *not* a login.)
  2. **Their phone → 📲 WhatsApp link.** The request is encoded in the link. The grown-up taps a decision and sends back a **reply link**.
  3. **Reply code**, e.g. `HALF-RQC6Q`, typed on the Ask screen.
- When approved, the kid's share comes out of their Gullak automatically. "Wait a week" shows when they can ask again.

### 🌟 Out-of-the-box ideas
| Idea | Why it builds money smarts |
|---|---|
| 🧊 **Cool-down Jar**: wants above a set price can "chill" for 24 h (grown-up sets 1 min demo / 1 h / 24 h / 2 days). Then: "Still want it?" Skipping adds to "Saved by waiting". | Fights impulse buying |
| 🐷 **Gullak has moods**: happy, excited, worried, sleepy, proud (with a crown) based on your real behaviour; tap it for tips | Emotional feedback for young kids |
| 🤝 **Grown-up savings match**: the grown-up adds a 5–50% bonus every time the kid saves | First taste of interest |
| 🧹 **Earn by chores**: the grown-up adds chores with rewards; the kid taps "I did it!"; the grown-up approves and pays | Money is earned |
| 🎪 **Mela Day game**: ₹200 at a fair. Missions: bus ticket home, lunch, water, fun, bring ₹30 home. Random surprises (drop ₹20, or Aunty gives ₹20) | Needs first, emergency buffer |
| 🧠 **Need or Want? quiz**: 10 random cards with explanations | Core concept |
| 🔮 **Future Me**: slide weekly savings and time; see the total in samosas and which dreams it unlocks. Seniors get an **8% "growth magic" (compound interest)** toggle | Long-term thinking |
| 📊 **Weekly Report Card**: 1–5 stars, needs/wants, streak, tip; copy to share | Reflection habit |
| 🏅 **14 badges**: First Coin, Halfway Hero, On Fire, Cool Head, Mela Master… | Motivation |
| 🗓️ **Pocket-money day banner**: one tap to add the usual amount | Less typing |
| 🗣️ **Read-aloud** for early readers, 🔊 sounds, reduced-motion support | Accessibility |
| 🧒 / 🧑 **Junior & Senior modes** | Fits each age group |

### 🚀 Next-level innovations (not from the hackathon's examples)
| Feature | What it does | The money lesson |
|---|---|---|
| 🎙️ **Hey Gullak**: talk to your piggy bank | Speak or type in plain words: *"I spent 40 on ice cream"*, *"Nani gave me two hundred"*, *"Can I buy a ₹300 Lego set?"*, *"When will I get my dream?"*, *"How much did I spend on snacks?"*, *"Save 50"*. It understands number words, guesses the category and need/want, and asks before writing anything. "Can I buy" answers in samosas, **chores of work** and days of delay, then offers *Ask a grown-up* or *Cool it first*. Runs entirely in the browser (Web Speech, en-IN), with no AI server. | Answers all 3 questions in one sentence; zero-typing logging for 8-year-olds |
| 😍 **Worth-It Meter** (joy per rupee) | 12 h after a purchase (grown-up can set 1 min for a demo), Gullak asks "Was it worth it?" 😞😐🙂😍. It then ranks categories by **joy per ₹100** and totals "money you wish you'd kept". | Value-based spending: spend on what truly makes you happy |
| ⛅ **Money Weather** | Forecasts your balance day by day until pocket-money day from your real spending speed: ☀️ Sunny / ⛅ Cloudy / ⛈️ "Storm on Thursday: you'll run out!", plus a **safe daily spend**. | Budget forecasting, made kid-sized |
| 🏦 **Borrow from Future Me** | Ask for a pocket-money advance (capped at one week). A grown-up approves it and can set **interest** (0–20%). Repayments come out **automatically on payday**, with a progress bar and a *Debt-Free Hero* badge. | How loans, interest and repayment really work, safely |
| 👵 **Then & Now: money reporter** | The child interviews a grown-up ("How much did a samosa cost when you were my age?"). Gullak works out *10× more expensive, about 8%/year: that's **inflation***, and what ₹100 today would have bought back then. Seniors see a 10-year forecast. | Inflation, and why savings should grow; builds family money talk |
| 📖 **My Money Comic** | The child's week, automatically retold as a 4-panel superhero comic ("The Adventures of Captain Rocket"), drawn from their real money, savings, asks and loans. It can read itself aloud or be copied to share. | Reflection through storytelling |
| 🧹 **Effort price tags** | A new Money Lens unit: prices in **chores of work**, based on the family's own chore rewards ("₹300 = 9 chores"). | Money = effort |

All new features live in `js/screens-next.js` and plug into the existing screens without changing how they behave. There are 5 new badges: 🎙️ Chatterbox, 😍 Joy Detective, 🦸 Debt-Free Hero, 🗞️ Money Reporter, ☀️ Sunny Saver.

---

## 🏆 How it maps to the judging (100 pts)
| Criterion | Where |
|---|---|
| **Answers the questions (40)** | The home screen has 3 big buttons, one per question, each with a dedicated screen. The organisers' own examples (₹ shown as samosas, "pushes your cycle back N days", a parent-approvable request) are central features. |
| **Easy to use (25)** | Huge buttons, a keypad instead of typing, emoji plus word labels, sample data, 20-second onboarding, read-aloud |
| **Creative (20)** | Voice-talking piggy bank, Worth-It joy-per-rupee meter, Money Weather, Then & Now inflation interviews, auto Money Comic, puzzle reveal, Dream Time Machine, server-less WhatsApp approval |
| **Money smarts (15)** | Need/want tagging, pay-yourself-first, streaks, wait rule, chores, savings match, **loans and interest**, **inflation**, **budget forecasting**, **value-based spending** |

## ✅ Rules checklist
- [x] Made-up amounts only. No real money connections anywhere.
- [x] Opens from a link, with no download and no sign-in (the grown-up PIN is optional, local, and not an account).
- [x] No real personal info: nickname plus emoji avatar only, with a "not your real name" hint. No photos, school or phone fields.
- [x] No ads, no payments, no trackers.
- [ ] Built fresh on or after 28 Oct ✔ · **Tested with a real kid: do this! (log below)**
- [ ] Keep the link working until 14 Nov · one submission only.

---

## 🧪 Real-kid test log (required by the rules)
Give the link to a friend, sibling or cousin who has never seen it. Say nothing. Watch.

| # | What they tried | Where they got stuck (> 10 s?) | What we changed |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

Tester age: ___ · Date: ___ · Favourite part: ___

## 🎬 Demo video script (≤ 2:00)
| Time | Show |
|---|---|
| 0:00–0:10 | "Hi, I'm [nickname]! This is Gullak, a piggy bank that talks." Show the piggy's mood. |
| 0:10–0:35 | **Q1:** add ₹200 pocket money → "feed your dream" nudge. Spend ₹40 on ice cream: "₹40 = 2 samosas, pushes my Cycle back 2 days!" Open the Money tab: Money Lens, insight. |
| 0:35–1:00 | **Q2:** Dream tab: puzzle reveal, ETA, Time Machine. Add money and watch a tile unlock. |
| 1:00–1:30 | **Q3:** ask for a ₹300 Lego set and pay 50%. Send on WhatsApp. The grown-up taps "Yes, if you pay half". Open the reply: the app updates. |
| 1:30–1:50 | **Wow moment:** tap 🎙️ and *say* "Can I buy a ₹300 Lego set?" Gullak answers out loud: "That's 15 samosas, 9 chores of work, your Cycle moves back 4 days…". Flash the Money Comic, Money Weather ⛅ and a Worth-It 😍 rating. |
| 1:50–2:00 | "We tested it with my cousin and changed ___. No real money, no sign-in. Thank you!" |

Film the **tester using it** for a few seconds; the brief asks you to show someone using the app.

---

## 🗂️ Code map
```
index.html            app shell
css/style.css         all styles (mobile-first)
js/core.js            state, localStorage, money maths (balance, daily saving rate, days-back), units, badges, sample data
js/ui.js              click delegation, modal sheets, keypad, toasts, confetti, sounds, read-aloud, piggy/jar/puzzle art
js/screens-main.js    Welcome, Home, Q1 Money, Q2 Dream + money modals
js/screens-ask.js     Q3 Ask, Cool-down Jar, Grown-up mode, parent link page, reply page, chores
js/screens-play.js    Games hub, Mela Day, Need-or-Want, Future Me, Report Card, Badges, Settings
js/screens-next.js    Hey Gullak (voice/chat), Worth-It Meter, Money Weather, Borrow from Future Me, Then & Now, Money Comic, effort unit
js/crypto.js          on-device encryption helpers (Web Crypto: AES-256-GCM, PBKDF2)
js/family.js          modes chooser, Family mode (family/user pickers, PIN, supervisors, members, recovery, family asks)
js/app.js             hash router, bottom nav, boot
serve.ps1             tiny local server for testing (Windows PowerShell)
```

**Key formulas** (`js/core.js`):
```
weeklyIncome  = max(avg weekly money in over last ≤28 days, pocket money per week)
dailySaving   = max(weeklyIncome − avgWeeklySpend, 20% of weeklyIncome, ₹7) / 7
daysBack(₹x)  = ceil(x / dailySaving)            → "pushes your Cycle back N days"
daysToGoal    = ceil((target − saved) / dailySaving)
```

**Share-link format** (no server): `#/parent?r=<base64url JSON of the request>` → grown-up decides → `#/reply?r=<base64url {id, status, note}>` or the code `YES|HALF|WAIT|NO-<id>`.

---
*Hackathon note: the rules say the idea, design and decisions should be the child's own. Use this as a starting point. Change the name, colours, mascot, units and features to make it yours, and be ready to explain every part live!*
