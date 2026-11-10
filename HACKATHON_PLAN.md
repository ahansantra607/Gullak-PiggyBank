# Dezerv Children's Day Hackathon 2026: Analysis & Full Build Plan

Source: https://childrens-day-hackathon.dezerv.in/ (read 7 Nov 2026)

---

## 1. What the hackathon is

**Challenge:** Build a **web app that helps children manage their money**, using **made-up amounts only**.

**Who:** Kids aged 8–18 (age on 14 Nov 2026). Solo, or a team of up to 3 kids in the same age group.
- **Juniors:** 8–12
- **Seniors:** 13–18

Each group is judged against kids its own age. A parent or guardian must register the entrant.

### The 3 required questions (every entry must answer all 3 in ONE app)

| # | Kid's question | What the app must do | Organisers' example |
|---|---|---|---|
| 1 | "Where did all my money go?" | Show what they spent and what's left | Show ₹500 as **25 samosas**, not a number |
| 2 | "How do I save for that cycle?" | Set a goal and watch progress | "This ice cream **pushes your cycle back 3 days**" |
| 3 | "Can I buy this, Mum?" | Decide together with parents | A **"can I buy this?" request** a parent can approve |
| + | "What if money worked like…?" (optional) | Any fresh idea | Money game, savings challenge with friends, something new |

### Timeline (all times IST, 100% online)

| Date | Milestone | Status today (7 Nov) |
|---|---|---|
| 28 Oct | Start; building may begin | Done |
| **8 Nov** | **Registration closes** | **Tomorrow. Register today.** |
| **10 Nov, 11:59 PM** | **Submission deadline** | 3 days left |
| 12 Nov | Top 10 told by email | |
| 13 Nov | Tech-check call for top 3 | |
| 14 Nov | Top 3 present live to 2,000+ people | |

### What to submit (through the link emailed after registration)
1. **App link.** It must open in a browser with **no sign-in and no download**, and stay working **until 14 Nov**.
2. **Demo video, 2 minutes or less**, showing *someone using* the app. A phone recording is fine.
3. One submission per person or team. Don't change the app link after 10 Nov; judges look at the version submitted by the deadline.

### Rules
**Must:** use made-up amounts · be a working web app (link only) · start building on or after 28 Oct · test with a real kid and improve from it · have a parent register · keep the link alive until 14 Nov.

**Can't:** connect real money (bank/UPI/card/wallet) · **collect real personal info (no real names, phones, addresses, schools, photos)** · show ads or ask for payment · copy someone else's app · submit more than once.

**Allowed:** no-code tools, app builders, AI, templates and tutorials, as long as *the idea, design and decisions are the child's*. Parents may guide but shouldn't build it. The top 3 answer questions live, so the child must understand their app.

### Judging (100 points)

| Criterion | Points | What it really means for the design |
|---|---|---|
| **Answers the questions** | **40** | All 3 questions handled clearly and *visibly*. Each one should have its own obvious screen or tab. |
| **Easy to use** | **25** | "Can a new kid figure it out in **10 seconds**?" Big buttons, emoji, almost no typing, no clutter. |
| **Creative** | **20** | Ideas judges haven't seen before. Generic expense trackers score low here. |
| **Money smarts** | **15** | Builds a good habit: saving, thinking before buying, needs vs wants. |

**Prizes:** up to ₹1,00,000 total; top 3 present live and get special awards; top 10 get mystery swag boxes; everyone who submits gets a certificate.

### Key insights for scoring well
1. **65 of 100 points are "answers the questions" plus "easy to use".** Polish the 3 core flows before adding anything extra.
2. The examples hint at what judges want: **translate rupees into things kids understand** (samosas, ice creams, days of waiting).
3. **"No sign-in"** rules out account systems. Everything should work instantly from the link, so store data in the browser (localStorage).
4. **The parent-approval flow has to work without accounts.** Solve it with a same-device "Parent mode" and/or a **shareable request link** (e.g. sent over WhatsApp). This is the hardest design problem and a chance to stand out.
5. **"No real personal info"** means nickname plus emoji avatar only. No photo upload, no school field.
6. Juniors and Seniors are judged separately. Make the language and visuals match the entrant's age group.

---

## 2. Proposed product concept

> The child should choose the name and the theme. Below is a full working concept they can adapt.

**Working name: "Gullak"** (the Hindi word for a clay piggy bank). The app is a talking piggy bank with three jars.

**One-line pitch:** *"Gullak turns your pocket money into samosas, shows how every treat moves your dream closer or further, and lets you ask Mum or Dad with one tap."*

### Home screen (works in under 10 seconds)
Three huge buttons, one per question, plus a running balance shown as a picture:

```
 ┌─────────────────────────────────┐
 │  🐷 Hi Rocket! You have ₹340    │
 │     = 🥟 x 17 samosas           │
 ├─────────────────────────────────┤
 │  💸  Where did my money go?     │  → Q1
 │  🚲  My dream: Cycle  [███░░] 42% │  → Q2
 │  🙋  Can I buy this?            │  → Q3
 ├─────────────────────────────────┤
 │  ➕ Got money    ➖ Spent money   │  (quick actions)
 └─────────────────────────────────┘
```

---

## 3. Feature specification

### 3.0 First-run onboarding (about 20 seconds, 4 taps)
1. Pick an **emoji avatar** and type a **nickname** (hint: "Not your real name!").
2. Pick your age group: **Junior (8–12)** or **Senior (13–18)**. This switches the copy style and the level of detail.
3. "How much pocket money do you get?" Choose an amount (₹50/₹100/₹200/custom) and how often (weekly/monthly).
4. "What are you saving for?" Pick from presets (🚲 Cycle ₹5,000 · 🎮 Game ₹2,000 · ⚽ Football ₹800 · 📚 Books ₹500) or make your own.
5. A **"Try with sample data"** button is also on the welcome screen so judges can explore instantly. This matters a lot: judges will open the link cold.

### 3.1 Q1: "Where did all my money go?" (Spend & Left screen)
- **Add money in:** pocket money, gift, earned (chores). Amount keypad with big buttons; source picked by emoji.
- **Add a spend:** amount, then a category emoji (🍦 Snacks, 🎮 Games, ✏️ School stuff, 🎁 Gifts, 🚌 Travel, 🧸 Toys, ❓ Other), then **Need or Want?** (one tap). This builds the money habit.
- **"What's left" visual:** a jar that drains as money is spent, with the remaining balance in rupees *and* in a chosen "unit".
- **The Samosa Converter** (the judges' own example, made central): every amount can be shown in a fun unit the kid picks: 🥟 samosa ₹20, 🍦 ice cream ₹40, 🍫 chocolate ₹10, 🎬 movie ticket ₹200, 🚲 "% of my cycle". Tap the unit to cycle through them.
- **Spending breakdown:** emoji bubble chart or stacked jar ("You spent ₹300: 🍦🍦🍦🍦🍦 snacks, 🎮🎮 games") instead of an adult pie chart. Seniors also get a simple bar chart by week and a needs-vs-wants split.
- **Insight sentence** (auto-generated): "This week, snacks ate 60% of your money. That's 9 samosas! 🥟"
- **History list** grouped by day, with swipe or tap to delete mistakes.

### 3.2 Q2: "How do I save for that cycle?" (Dream Goal screen)
- Goal = name, emoji or preset picture (no photo upload), target amount.
- **Progress visual:** the item "builds up" piece by piece (a cycle drawn in 5 parts, wheels first), or a jar fills up. Celebrate at 25/50/75/100% with confetti.
- **"Move money to my goal"** button: moves money from spending balance to the goal jar.
- **Time-to-goal estimate:** "At this rate you'll get your cycle in **6 weeks** (by 19 Dec)."
- **Delay calculator (the organisers' example):** whenever a spend is entered, or in Q3 preview, show **"This ice cream pushes your cycle back 3 days 🚲⏪"**.
  - Formula:
    ```
    dailySaving = max(weeklyPocketMoney − avgWeeklySpend(last 4 weeks), weeklyPocketMoney × 0.2) / 7
    daysPushedBack = ceil(spendAmount / dailySaving)
    weeksToGoal = ceil((goalTarget − goalSaved) / (dailySaving × 7))
    ```
  - It also works the other way: "Skip one samosa a day and get your cycle **9 days sooner**!"
- **Savings streak:** count of consecutive weeks with any money moved to the goal. Show 🔥 x 3.
- Multiple goals for Seniors; one goal for Juniors keeps it simple.

### 3.3 Q3: "Can I buy this, Mum?" (Ask a Grown-up)
**Kid side: make a request card**
1. What do you want? (name + emoji), how much?
2. Need or want?
3. Why do I want it? (short text or pick: "Everyone has it", "I'll use it every day", "It's on sale", "For school")
4. **The app automatically shows the impact before sending:** "If you buy this: you'll have ₹140 left (7 samosas) and your cycle moves back 5 days."
5. Optional **"I'll pay half"** slider (co-pay). This builds negotiation and money sense.
6. Send it to a parent.

**Parent side: two ways that both need no sign-in**
- **A. Same device, "Grown-up mode":** a 🔒 button, then the parent sets a 4-digit PIN on first use (stored locally, hashed). This is *not* a login; it just keeps kids from approving their own requests. The parent sees pending cards and taps ✅ **Yes** / ❌ **Not now** / 🤝 **Yes, if you pay half** / ⏳ **Wait a week**, with an optional note ("Let's wait for Diwali sale").
- **B. Different device, "Send to Mum on WhatsApp":** the app encodes the request into a URL (`/#/ask?d=<base64 JSON>`) and opens `https://wa.me/?text=...` so the kid chooses the contact themselves. The parent opens the link, sees the request and its impact, and taps a decision. That produces a **reply link** (or a 4-letter code) that sends the decision back. The kid opens it and Gullak updates. No server and no accounts. The rules forbid storing phone numbers, so the app never asks for one; WhatsApp picks the contact.
- On approval the money is deducted automatically (and the goal impact applied). On "wait a week" a countdown appears.
- **Request history** shows what was approved or declined and why. This doubles as a learning log.

### 3.4 Out-of-the-box idea (optional, high value for the 20 "Creative" points)
Pick **one or two**, done well:
1. **⏳ "Cool-down Jar" / 24-hour wait rule:** any "want" request over a threshold goes into a jar with a 24-hour timer. After the timer: "Do you still want it?" Most kids say no, and the app shows "You saved ₹X by waiting!" This is a strong money-smarts mechanic and easy to build.
2. **🐷 Gullak has moods:** the piggy avatar reacts. Happy when saving, worried when the balance is low, sleepy if not opened for a while. Emotional feedback is great for Juniors.
3. **🗓️ "Future Me" time machine:** a slider showing "If you save ₹20 a week, by your next birthday you'll have ₹1,040 = 52 samosas, or 1 cricket bat."
4. **👫 Friend savings challenge (no personal data):** create a challenge code like `TIGER-42`, then everyone types their own progress and compares on a shared screen. This needs a backend, so skip it unless there's time.
5. **🎲 Money mini-game "Mela Day":** spend ₹200 at a virtual fair with stalls, then see what's left and whether you hit your goal. Good demo moment.

**Recommendation:** Cool-down Jar plus Gullak moods (low effort, clearly original, ties to money smarts).

### 3.5 Age-group adaptation
| | Junior (8–12) | Senior (13–18) |
|---|---|---|
| Copy | Short, playful, emoji-heavy | Plain, slightly more detail |
| Charts | Emoji jars and bubbles only | Plus weekly bars and need/want % |
| Goals | 1 goal | Up to 3 goals, plus budget limits per category |
| Extras | Mood piggy | "Future Me" compound-saving slider, monthly budget |

---

## 4. Technical design

### 4.1 Stack (recommended)
- **Frontend:** React + Vite + TypeScript (or plain HTML/CSS/JS if the child is a beginner), with **Tailwind CSS** for fast styling.
- **State:** a single store (Zustand or React context) persisted to **localStorage**.
- **Routing:** hash router (`/#/spend`, `/#/goal`, `/#/ask`). This avoids 404s on static hosts and lets request links work.
- **Charts:** hand-made emoji visuals, plus `recharts` for the Senior bar chart.
- **Fun:** `canvas-confetti` for milestones.
- **Hosting:** **Vercel / Netlify / GitHub Pages** (free, public link, no sign-in for visitors).
- **No backend.** That means no personal data leaves the device, which is a strong point to say in the video.

*No-code alternative:* Lovable / Bolt / Glide / Softr can produce the same screens. The no-sign-in plus parent-link flow is easiest in code or an AI app builder.

### 4.2 Data model (localStorage key `gullak:v1`)
```ts
type Profile = { nickname: string; avatar: string; ageGroup: 'junior'|'senior';
                 pocketMoney: number; frequency: 'weekly'|'monthly'; unit: UnitId;
                 parentPinHash?: string; createdAt: string };

type Txn = { id: string; type: 'in'|'out'|'toGoal'|'fromGoal';
             amount: number; category: CategoryId; needOrWant?: 'need'|'want';
             note?: string; goalId?: string; requestId?: string; date: string };

type Goal = { id: string; name: string; emoji: string; target: number;
              saved: number; createdAt: string; completedAt?: string };

type Request = { id: string; item: string; emoji: string; price: number;
                 needOrWant: 'need'|'want'; reason: string; kidPays: number;
                 status: 'pending'|'approved'|'declined'|'wait'|'coolingDown';
                 parentNote?: string; decidedAt?: string; waitUntil?: string;
                 createdAt: string };

type State = { profile: Profile; txns: Txn[]; goals: Goal[]; requests: Request[];
               streak: { weeks: number; lastWeek: string } };
```
Derived values (never stored): `balance = Σin − Σout − ΣtoGoal + ΣfromGoal`, spend by category, avg weekly spend, daily saving rate, days to goal.

### 4.3 Units table
```ts
const UNITS = [
  { id:'samosa',  emoji:'🥟', name:'samosas',   price:20 },
  { id:'icecream',emoji:'🍦', name:'ice creams',price:40 },
  { id:'choc',    emoji:'🍫', name:'chocolates',price:10 },
  { id:'movie',   emoji:'🎬', name:'movie tickets', price:200 },
  { id:'goal',    emoji:'🎯', name:'% of my goal', price:null } // computed
];
toUnits = (amt, unit) => Math.floor(amt / unit.price)
```

### 4.4 Parent link protocol (no server)
```
Kid → Parent:  https://<app>/#/parent?r=<base64url(JSON{id,item,emoji,price,needOrWant,reason,kidPays,balance,goalName,daysBack})>
Parent → Kid:  https://<app>/#/reply?r=<base64url(JSON{id,status,note,decidedAt})>
```
- The parent screen is read-only apart from the decision. It shows the impact so the parent decides with context.
- When the reply link is opened on the kid's device, find the request by `id`, update its status, and apply the transaction if approved.
- Fallback for when links are awkward: show a short code like `YES-7K2Q` the kid can type in.
- Payloads contain no personal info (nickname optional and fake).

### 4.5 Folder structure
```
src/
  main.tsx, App.tsx, router.tsx
  store/useGullak.ts         # state + persistence + derived selectors
  lib/units.ts, lib/money.ts (formulas), lib/share.ts (encode/decode links)
  screens/Welcome.tsx, Home.tsx, Spend.tsx, AddTxn.tsx, Goal.tsx,
          Ask.tsx, ParentMode.tsx, ParentLink.tsx, Reply.tsx, CoolDown.tsx, Settings.tsx
  components/BigButton.tsx, Keypad.tsx, Jar.tsx, EmojiBreakdown.tsx,
             ImpactCard.tsx, PiggyMood.tsx, UnitToggle.tsx, Confetti.ts
  data/sample.ts             # "Try with sample data"
```

### 4.6 UX and accessibility checklist (the 25 "Easy to use" points)
- Mobile-first (judges and kids will use phones). Tap targets ≥ 48px, font ≥ 18px.
- At most 3 main choices per screen. Bottom tab bar: 🏠 Home · 💸 Spending · 🎯 Goal · 🙋 Ask.
- Numbers come from an on-screen keypad, never a tiny input.
- Every action gives instant feedback (animation or sound toggle) and can be undone.
- High contrast, emoji always paired with a word label.
- A "Reset / start over" option in Settings. Works offline after first load.

---

## 5. Implementation plan (7 Nov → 10 Nov)

> ⚠️ **Register TODAY or by 8 Nov.** A parent fills the form on the site, and the submission link arrives by email.

### Day 1: Fri 7 Nov (evening): setup + Q1
- [ ] Parent registers on the site.
- [ ] Child picks the name, colours and mascot; sketch the 4 screens on paper (5 min each).
- [ ] `npm create vite@latest gullak -- --template react-ts`, add Tailwind, hash router, store with localStorage.
- [ ] Build Welcome/onboarding plus the sample-data button.
- [ ] Build Add Money / Spent Money with keypad, category emoji and need/want.
- [ ] Build the Spending screen: jar, unit converter, emoji breakdown, insight sentence, history.
- [ ] Deploy to Vercel/Netlify **now** to get the permanent link early.

### Day 2: Sat 8 Nov: Q2 + Q3
- [ ] Goal screen: create goal, progress visual, move-to-goal, time-to-goal, milestone confetti.
- [ ] "Pushes your goal back N days" on every spend and in previews.
- [ ] Ask screen: request card, impact preview, co-pay slider.
- [ ] Grown-up mode (PIN) with approve/decline/half/wait and notes.
- [ ] WhatsApp share link → parent page → reply link → kid update.
- [ ] Redeploy; test on 2 phones.

### Day 3: Sun 9 Nov: extras + real-kid test
- [ ] Out-of-the-box: Cool-down Jar (24h timer) + piggy moods.
- [ ] Junior/Senior copy and chart differences.
- [ ] **Real-kid test (required by the rules):** give the link to a friend, sibling or cousin who has never seen it. Say nothing and watch. Note every hesitation longer than 10 seconds. Fix the top 3–5 issues. Write down what changed; it's a great line for the video.
- [ ] Polish: empty states, error states (₹0, huge numbers, spending more than the balance gives a friendly warning), loading.

### Day 4: Mon 10 Nov (submit well before 11:59 PM IST)
- [ ] Final bug pass on phone + laptop, Chrome + Safari. Clear localStorage and test the first-run flow cold.
- [ ] Record the demo video (script below), ≤ 2:00.
- [ ] Submit the app link + video via the emailed link. **Aim for 8 PM.**
- [ ] Freeze: don't change the link; keep hosting alive until 14 Nov.

---

## 6. Demo video script (≤ 2 minutes)
| Time | Shot |
|---|---|
| 0:00–0:10 | Child on camera or voice: "Hi, I'm [nickname], and this is Gullak, my money buddy." |
| 0:10–0:40 | **Q1:** add ₹100 pocket money, spend ₹40 on ice cream. "See? ₹340 is 17 samosas, and snacks ate most of my money!" |
| 0:40–1:05 | **Q2:** cycle goal, move ₹50 in, progress fills. "This ice cream pushed my cycle back 3 days!" |
| 1:05–1:35 | **Q3:** ask for a ₹600 game, see the impact, send to Mum on WhatsApp. Mum taps "Yes, if you pay half." The app updates. |
| 1:35–1:50 | **Extra:** Cool-down Jar: "After 24 hours I didn't want it anymore, and I saved ₹600!" |
| 1:50–2:00 | "We tested it with my cousin and made the buttons bigger. No real money, no sign-in. Thanks!" |

Film the *test kid using it* for a few seconds; the brief asks to "show someone using your app".

---

## 7. Compliance checklist (before submitting)
- [ ] No real money, banks, UPI, cards or wallets anywhere (including "pay" wording).
- [ ] No fields for real name, phone, address, school, or photo upload. Nickname hint says "not your real name".
- [ ] Opens from the link with no sign-in or download (Parent PIN is local, optional, and not a login).
- [ ] No ads, no payment prompts, no tracking scripts.
- [ ] Built from scratch on or after 28 Oct; the idea and design are the child's.
- [ ] Tested with a real kid; improvements made and mentioned.
- [ ] Link live until 14 Nov; one submission only.

## 8. Mapping features to judging
| Criterion (pts) | Features that earn it |
|---|---|
| Answers questions (40) | Dedicated screen per question on the home screen; samosa converter; days-pushed-back; parent approve flow over WhatsApp |
| Easy to use (25) | 3 big buttons, keypad, emoji + labels, sample data, real-kid-tested fixes |
| Creative (20) | Cool-down Jar, mood piggy, co-pay "I'll pay half", server-less parent link |
| Money smarts (15) | Need vs want tagging, save-first nudges, streaks, wait rule, "skip a samosa, get it sooner" |

## 9. If they reach the Top 3 (14 Nov)
- Prepare a 3–5 minute walkthrough with live sample data. Practice answering "Why did you build X?" and "What did your tester struggle with?".
- Join the tech check on 13 Nov; present from home with a parent present.
