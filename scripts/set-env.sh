#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# InclusionGames — safely write payment keys into .env
#
#   cd /var/www/inclusion
#   bash scripts/set-env.sh            # menu
#   bash scripts/set-env.sh stripe     # just the Stripe keys
#   bash scripts/set-env.sh paypal     # just the PayPal keys
#   bash scripts/set-env.sh show       # masked view of what is set
#
# Values are typed at a hidden prompt, so nothing lands in your shell
# history and nothing is echoed to the screen. Press Enter at any prompt
# to leave that key unchanged.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="${ENV_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env}"

RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; DIM=$'\033[2m'; BLD=$'\033[1m'; OFF=$'\033[0m'

[[ -f "$ENV_FILE" ]] || { echo "${RED}No .env at $ENV_FILE${OFF}"; exit 1; }

# ── helpers ──────────────────────────────────────────────────

get_val() {   # get_val KEY  → current value ('' if unset)
  sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | tr -d '"' | tr -d '\r'
}

mask() {      # mask VALUE → sk_test_…a1b2  (never prints the middle)
  local v="$1"
  if   [[ -z "$v" ]];        then printf '%s' "${DIM}(empty)${OFF}"
  elif [[ ${#v} -le 12 ]];   then printf '%s' "${v:0:2}…${v: -2}"
  else                            printf '%s' "${v:0:8}…${v: -4}"
  fi
}

backup_once() {
  if [[ -z "${BACKED_UP:-}" ]]; then
    local b="$ENV_FILE.bak-$(date +%s)"
    cp "$ENV_FILE" "$b"
    echo "${DIM}backup: $b${OFF}"
    BACKED_UP=1
  fi
}

set_var() {   # set_var KEY VALUE — replaces in place, or appends
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  # Value is passed via the environment, never through a regex, so
  # slashes, ampersands and quotes in a key are all safe.
  IG_VAL="$val" awk -v k="$key" '
    BEGIN { done=0; v=ENVIRON["IG_VAL"] }
    index($0, k "=") == 1 { if (!done) { print k "=" v; done=1 } ; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$ENV_FILE" > "$tmp"
  # cat back into the original file so ownership and permissions survive
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

# ask KEY "Label" "expected-prefix"   (prefix may be empty = no check)
ask() {
  local key="$1" label="$2" prefix="${3:-}" cur val
  cur="$(get_val "$key")"
  printf '\n  %s%s%s\n' "$BLD" "$label" "$OFF"
  printf '  %s%s%s   current: %s\n' "$DIM" "$key" "$OFF" "$(mask "$cur")"
  [[ -n "$prefix" ]] && printf '  %sexpected to start with %s%s\n' "$DIM" "$prefix" "$OFF"
  printf '  value (hidden, Enter = keep): '
  read -rs val; echo
  [[ -z "$val" ]] && { printf '  %s· unchanged%s\n' "$DIM" "$OFF"; return; }
  # strip accidental surrounding quotes/space from a paste
  val="$(printf '%s' "$val" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')"
  # A Stripe secret may be a standard key (sk_) or a restricted key (rk_); both
  # are valid. Accept either, and warn rather than reject anything unexpected.
  local ok=0 p
  for p in ${prefix//|/ }; do [[ "$val" == "$p"* ]] && ok=1; done
  if [[ -n "$prefix" && $ok -eq 0 ]]; then
    printf '  %s! that does not start with %s — not saved%s\n' "$RED" "${prefix//|/ or }" "$OFF"
    printf '  %s  (did you copy the URL, or a key from the wrong table?)%s\n' "$DIM" "$OFF"
    return
  fi
  # Catch the doubled-paste that silently produced an invalid key before.
  local half=$(( ${#val} / 2 ))
  if [[ ${#val} -gt 40 && $(( ${#val} % 2 )) -eq 0 && "${val:0:$half}" == "${val:$half}" ]]; then
    printf '  %s! that value is the same thing twice — looks like a double paste. Not saved.%s\n' "$RED" "$OFF"
    printf '  %s  Paste once; nothing appears on screen, that is normal.%s\n' "$DIM" "$OFF"
    return
  fi
  backup_once
  set_var "$key" "$val"
  printf '  %s✓ saved as %s%s\n' "$GRN" "$(mask "$val")" "$OFF"
}

show() {
  printf '\n%s  Current payment configuration%s   %s(%s)%s\n' "$BLD" "$OFF" "$DIM" "$ENV_FILE" "$OFF"
  printf '  %s─────────────────────────────────────────────%s\n' "$DIM" "$OFF"
  local k
  for k in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
           STRIPE_PRICE_STARTER STRIPE_PRICE_FAMILY STRIPE_PRICE_EDUCATOR STRIPE_PRICE_SCHOOL \
           PAYPAL_CLIENT_ID PAYPAL_SECRET PAYPAL_ENV PAYPAL_WEBHOOK_ID \
           PAYPAL_PLAN_STARTER_MONTHLY PAYPAL_PLAN_STARTER_ANNUAL \
           PAYPAL_PLAN_FAMILY_MONTHLY PAYPAL_PLAN_FAMILY_ANNUAL \
           PAYPAL_PLAN_EDUCATOR_MONTHLY PAYPAL_PLAN_EDUCATOR_ANNUAL \
           PAYPAL_PLAN_SCHOOL_MONTHLY PAYPAL_PLAN_SCHOOL_ANNUAL; do
    printf '  %-30s %s\n' "$k" "$(mask "$(get_val "$k")")"
  done
  echo
}

do_stripe() {
  printf '\n%s══ Stripe ══%s  %shttps://dashboard.stripe.com/apikeys%s\n' "$BLD" "$OFF" "$DIM" "$OFF"
  ask STRIPE_SECRET_KEY     'Secret key (standard sk_ or restricted rk_)' 'sk_|rk_'
  ask STRIPE_WEBHOOK_SECRET 'Webhook signing secret'                  'whsec_'
  printf '\n  %sPrice ids are optional — leave empty and the server prices\n  the subscription inline from PLANS in server.js.%s\n' "$DIM" "$OFF"
  ask STRIPE_PRICE_STARTER  'Price id — Starter (optional)'           'price_'
  ask STRIPE_PRICE_FAMILY   'Price id — Family (optional)'            'price_'
  ask STRIPE_PRICE_EDUCATOR 'Price id — Educator (optional)'          'price_'
  ask STRIPE_PRICE_SCHOOL   'Price id — School (optional)'            'price_'
}

do_paypal() {
  printf '\n%s══ PayPal ══%s  %shttps://developer.paypal.com/dashboard%s\n' "$BLD" "$OFF" "$DIM" "$OFF"
  ask PAYPAL_CLIENT_ID  'Client ID'    ''
  ask PAYPAL_SECRET     'Secret'       ''
  printf '\n  %sPAYPAL_ENV must be "sandbox" or "live" (currently: %s)%s\n' "$DIM" "$(get_val PAYPAL_ENV)" "$OFF"
  ask PAYPAL_ENV        'Environment'  ''
  printf '\n  %sWebhook ID from the PayPal dashboard. Until this is set the\n  webhook verifies nothing and deliberately ignores every event.%s\n' "$YEL" "$OFF"
  ask PAYPAL_WEBHOOK_ID 'Webhook ID'   ''
  printf '\n  %sBilling Plan ids: run  node scripts/paypal-setup.js  to create\n  them and print the lines, then paste each one here.%s\n' "$DIM" "$OFF"
  local t b
  for t in STARTER FAMILY EDUCATOR SCHOOL; do
    for b in MONTHLY ANNUAL; do
      ask "PAYPAL_PLAN_${t}_${b}" "Plan id — ${t} ${b}" 'P-'
    done
  done
}

restart_prompt() {
  # Still offer the restart when nothing was written this run — the values may
  # have been saved on an earlier run and never loaded, which looks identical
  # to "not configured" from the outside.
  if [[ -z "${BACKED_UP:-}" ]]; then
    printf '\n%s  Nothing changed this run.%s\n' "$DIM" "$OFF"
    printf '  %sIf the app still reports DEMO, the saved values were never loaded.%s\n' "$DIM" "$OFF"
  fi
  printf '\n  Restart the app now? [y/N] '
  read -r a
  if [[ "$a" =~ ^[Yy]$ ]]; then
    pm2 restart inclusion >/dev/null 2>&1 && sleep 2
    printf '\n%s' "$DIM"
    pm2 logs inclusion --lines 12 --nostream 2>/dev/null | grep -E "Stripe:|DEMO|running at" | tail -3
    printf '%s\n' "$OFF"
    printf '  %sFront-end view:%s curl -s https://inclusion-games.com/api/payments/config\n\n' "$DIM" "$OFF"
  else
    printf '\n  %sRemember: pm2 restart inclusion%s\n\n' "$YEL" "$OFF"
  fi
}

# ── main ─────────────────────────────────────────────────────
case "${1:-menu}" in
  show)   show; exit 0 ;;
  stripe) do_stripe; restart_prompt ;;
  paypal) do_paypal; restart_prompt ;;
  menu)
    show
    printf '  1) Stripe keys\n  2) PayPal keys\n  3) Both\n  q) quit\n\n  choice: '
    read -r c
    case "$c" in
      1) do_stripe ;;
      2) do_paypal ;;
      3) do_stripe; do_paypal ;;
      *) echo; exit 0 ;;
    esac
    restart_prompt
    ;;
  *) echo "usage: bash scripts/set-env.sh [stripe|paypal|show]"; exit 1 ;;
esac
