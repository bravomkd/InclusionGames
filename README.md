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

Data is stored in a local SQLite file at `data/inclusion.db` (created on first run).

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

> Note: the game pages themselves (`game01-*`, `*-pl.html`, `index-pl.html`,
> `login-pl.html`, `games/`) are from the existing catalogue and still contain
> German/Polish content and old logic. Those are handled in the next phase
> (game-by-game), as discussed.

---

## Deploying

Any Node host works (Render, Railway, Fly.io, a VPS, etc.). Set the `.env` values,
point your domain at it, run `npm start` behind HTTPS. Set `APP_URL` to your real
domain so verification/reset/checkout links are correct.
