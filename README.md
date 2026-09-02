# InclusionGames

Camera-powered educational games for children ages 4–10, including children with
disabilities. This repo contains the marketing site, the auth flow, and a Node
backend that powers login, sign-up, password reset and payments.

---

## Quick start

```bash
# 1. install dependencies (Node 18+ required)
npm install

# 2. (optional) configure keys — the app runs without them in DEMO mode
cp .env.example .env        # then edit .env

# 3. run
npm start
# → http://localhost:3000
```

Open `http://localhost:3000`. Sign up, check the **terminal** for the verification
link (when no SMTP is configured, emails are printed to the console), click it,
then log in. Payments run in **demo mode** until you add Stripe/PayPal keys, so the
whole funnel is testable immediately without charging anything.

---

## What's included

| Area | File(s) |
|------|---------|
| Backend (auth, payments, email, static hosting) | `server.js` |
| Config template | `.env.example` |
| Shared client auth helper (`window.IG`) | `assets/auth.js` |
| Translation engine (EN default + DE/PL/ES) | `assets/i18n.js` |
| Landing page | `index.html` |
| Auth pages | `login.html`, `signup.html`, `forgot.html`, `reset.html`, `verify.html` |
| Payment return page | `payment-success.html` |
| Member dashboard (gated) | `dashboard.html` |
| Child profiles & per-game customisation (gated) | `teacher.html` |
| Reports & analytics (gated) | `report.html` |
| Game catalogue, shared by browser and server | `assets/catalogue.js` |
| Progress maths (one source for page and PDF) | `lib/analytics.js` |
| PDF report renderer (EN / DE / PL / ES) | `lib/report-pdf.js` |

Accounts are stored as JSON in `data/users.json`, created on first run. Saves are
atomic (written to a temp file, then renamed), and the previous run's copy is kept
alongside it as `users.backup.json`.

> The server **refuses to start** if `users.json` exists but cannot be parsed, rather
> than starting empty and overwriting it on the next save. If you see that message,
> restore `users.backup.json` — do not delete the damaged file.

Set `DATA_DIR` to keep the database outside the web root entirely, which is what you
want in production:
>
> ```
> DATA_DIR=/var/lib/inclusion
> ```

---

## API (all under `/api`)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/auth/register` | Create account, start 3-day trial, send verify email |
| GET  | `/auth/verify?token=` | Confirm email |
| POST | `/auth/login` | Returns `{ token, user }` |
| POST | `/auth/forgot` | Emails a reset link |
| POST | `/auth/reset` | Sets a new password from a reset token |
| GET  | `/auth/me` | Current user (requires Bearer token) |
| GET  | `/payments/config` | Which processors are live |
| POST | `/payments/create-checkout-session` | Stripe Checkout (card) |
| GET  | `/payments/verify-session` | Confirm Stripe session, upgrade plan |
| POST | `/payments/paypal/create-order` | Start a PayPal order |
| POST | `/payments/paypal/capture` | Capture a PayPal order, upgrade plan |
| POST | `/payments/webhook/stripe` | Stripe webhook (subscription events) |

Auth uses **JWT** (30-day tokens) stored client-side as `ig_token` / `ig_user`.
Passwords are hashed with **bcrypt**. Auth routes are **rate-limited**.

---

## Payments

* **Now (this phase):** credit/debit card via **Stripe Checkout** and **PayPal**.
  With no keys set, both run in DEMO mode (the success page activates the plan
  without a real charge) so you can test end-to-end.
* **Going live:** add `STRIPE_SECRET_KEY` (+ optional price IDs + webhook secret)
  and `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` to `.env`.
* **CopeCart (later):** CopeCart is a merchant-of-record — it hosts checkout and
  notifies us via webhook (IPN). A `COPECART_WEBHOOK_SECRET` slot is already in
  `.env.example`; the handler will be added when we wire the CopeCart funnel.

---

## Languages

The site is **English-first**. The selector in the top-right switches the visible
UI between **English, German (DE), Polish (PL) and Spanish (ES)**. Translations
live in `assets/i18n.js` — add a string under a language to translate more, or add
a new language block + a `<select>` option to support another language.

> Note: `game01.html` and the `*-pl.html` / `index-pl.html` / `login-pl.html` pages
> are from the existing catalogue and still contain German/Polish content and old
> logic. `game02`–`game42` have been migrated onto the shared engine
> (`assets/game-engine.js`) and are thin config files. The older pages are handled
> in the next phase (game-by-game), as discussed.

---

## Reports

`report.html` is the Reports section: pick a child and a period, and it shows what
they played and how it is going.

* **At a glance** — sessions, accuracy, questions answered, play time, days played,
  current streak, games tried, perfect rounds.
* **Skill areas** — accuracy per subject (Language, Math, English, Science, Music,
  Art, Sport) with a bar, a trend and a verdict.
* **Going well / worth practising** — the areas a parent should hear about, plus
  anything never tried.
* **Activity** — sessions per day across the period.
* **Game by game** and **recent sessions** — the detail behind the summary.

Two things it deliberately does *not* do:

* It will not call something a strength or a weakness until at least **20 questions**
  have been answered in that area. Below that it shows the number but withholds the
  verdict, and says why — a child who got 2 out of 2 is not "100% at Maths".
* Trends need at least **six sessions**; anything shorter reads as steady rather
  than inventing a direction from two data points.

The same numbers drive the on-screen view and the PDF, so a parent reading the
attachment sees exactly what the teacher saw.

**Download** produces a PDF in English, German, Polish or Spanish. **Send to parent**
emails that PDF to a guardian with an optional message, with replies going to the
account holder — this needs SMTP configured (see `.env.example`); without it the
button explains that and points at the download instead.

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/children/:id/analytics?range=` | Everything the page draws (`range` = 7, 30, 90, 365, or all) |
| GET | `/api/children/:id/report.pdf?lang=&range=&download=1` | The report as a PDF |
| POST | `/api/children/:id/report/send` | Email the PDF to a parent or guardian |

---

## Tests

```bash
npm test
```

Runs the suite in `test/` on Node's built-in test runner — no extra dependencies.
Each test boots a real `server.js` against a throwaway data directory, so it never
touches `data/`. The suite covers sign-up/verification/sign-in, the account
lockout, entitlement, the subscription gate, the payment routes and the
refuse-to-start guards. GitHub Actions runs it on every push (`.github/workflows/ci.yml`).

---

## Before going live

Three settings are enforced rather than suggested, because getting them wrong is
not visible from the outside:

| Setting | Why |
|---------|-----|
| `JWT_SECRET` | Must be a long random value. The server **refuses to start** in production with the sample value or anything under 32 characters — a guessable key lets anyone forge a session for any account. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| Payment keys | With no Stripe/PayPal keys, checkout runs in demo mode and activates plans without charging. That is refused in production, so set real keys before launch or checkout returns an error. |
| `COPECART_WEBHOOK_SECRET` | The CopeCart webhook grants paid access. Without the secret set, the endpoint refuses every request rather than trusting unsigned ones. |

"Production" means `NODE_ENV=production`, or an `APP_URL` that is not localhost.

---

## Deploying

Any Node host works (Render, Railway, Fly.io, a VPS, etc.). Set the `.env` values,
point your domain at it, run `npm start` behind HTTPS. Set `APP_URL` to your real
domain so verification/reset/checkout links are correct.
