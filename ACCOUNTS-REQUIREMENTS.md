# Gullak Modes & Family Accounts (as built)

## Two modes (chosen on the first screen)
Whoever opens the app keeps their data in **their own browser**. Nothing is shared or uploaded.

| Mode | Who it's for | Sign-in? | Where data lives |
|---|---|---|---|
| 🧒 **Individual** | One kid on their own device (the original app) | None. A **grown-up sets a 4-digit PIN at the very start** for Grown-up mode, then the kid sets up | This browser (`gullak:v1`) |
| 👨‍👩‍👧 **Family** | Many kids and grown-ups sharing a device | Pick family → pick user → PIN | This browser, **encrypted** (`gullak:famdata:<id>`) |

✅ **Hackathon rules:** the app still opens with **no sign-in or account**: Individual mode only asks a grown-up to pick a PIN. Family mode is optional. Only nicknames and emojis are used: no email, phone, real names, schools or photos.

## Family mode
- **Any number of families** on a device, each with **any number of members**.
- Two roles:
  - 🛡️ **Supervisor** (grown-up): approves asks, opens each kid's grown-up view (chores, loans, savings match, cool-down settings), adds and removes members, resets PINs and manages the family.
  - 🧒 **Kid** (normal member): uses the full Gullak app.
- **Only supervisors can create accounts** (kids or other supervisors). The person who creates a family is its first supervisor.
- **Login:** choose your family → tap your picture → enter your 4–6-digit PIN.
- **"Can I buy this, Mum?":** the kid chooses which supervisor(s) should decide. The ask appears on that supervisor's dashboard the next time they log in. The decision ("Yes / Yes if you pay half / Wait a week / Not this time" plus a note) shows up on the kid's home screen with who decided. The WhatsApp link stays available for grown-ups who aren't on the device.
- **Switch user** (👥) locks the current person and returns to the family's user picker. Closing the tab locks the family too.

### Recovery (no email or phone)
| Who forgot | How |
|---|---|
| Kid | A supervisor taps **🔑 Reset PIN** next to their name |
| Supervisor | Another supervisor resets it, **or** the **Family Recovery Code** (shown once at creation; can be regenerated), **or** the 2 **security questions** chosen at creation |

Security questions use non-identifying topics only (favourite food, fruit, superhero, first film, dream holiday, colour + number, a made-up secret word). Answers ignore case, spaces and punctuation. There are no school, address or birthday questions, because the rules ban collecting them.

### Lockout
5 wrong PINs lock that user for 1 minute. Each further wrong try doubles the wait, up to about an hour. A supervisor resetting the PIN clears the lock.

## Encryption (end-to-end, on the device)
- A random **256-bit Family Key** encrypts all of the family's money data with **AES-256-GCM** (browser Web Crypto, no libraries).
- Each member's PIN, the Recovery Code, and the security answers each **wrap** (encrypt) the Family Key using **PBKDF2-SHA-256 with 150,000 rounds** and a random salt.
- **No PIN, code or answer is ever stored.** A wrong PIN simply fails to decrypt.
- Saved on the device in plain form: only the family name/emoji, member nicknames/avatars/roles (needed to show the picker), and the encrypted key wraps.
- **Nothing is sent to any server.** Whatever hosts the app later only serves its code.

### Honest limits
- A 4-digit PIN has only 10,000 combinations. Someone who copies the browser's storage could eventually guess it offline. The lockout stops guessing inside the app, not on a copied file. **Supervisors should use 6-digit PINs.** This level suits a family app with pretend money.
- If every supervisor forgets their PIN **and** the recovery code **and** the answers, the family data cannot be recovered. That's the price of real encryption.
- Data is per device. To move to another device, a supervisor uses **💾 Save encrypted family file**, and the new device uses **📂 Open a family backup file**. The file stays encrypted.

## Why the data is not stored "in a file in the repository"
A web page in a visitor's browser **cannot write to a GitHub repository** without a GitHub access token, and any token in the page would be visible to everyone. A data file committed to a public repo is also public: anyone who clones it gets it.

So the repository holds **only code**. Each family's data stays encrypted on their own device, and the optional family file is something the family keeps. Cloning the repo reveals nothing. The `.gitignore` also blocks `*.gullak`, backup and recovery-code files from being committed by accident.
