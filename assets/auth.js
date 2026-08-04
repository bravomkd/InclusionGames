/* ============================================================
 * InclusionGames — shared client auth helper (window.IG)
 * One source of truth for tokens, API calls and route guards.
 * Replaces the old Supabase logic everywhere.
 * ============================================================ */
(function () {
  'use strict';

  const TOKEN_KEY = 'ig_token';
  const USER_KEY = 'ig_user';

  const IG = {
    // API lives on the same origin as the site.
    api: '/api',

    token() { return localStorage.getItem(TOKEN_KEY); },

    user() {
      try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
      catch { return null; }
    },

    isAuthed() { return !!this.token(); },

    setSession(token, user) {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    },

    clear() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },

    /* fetch() wrapper that attaches the bearer token and parses JSON.
       Throws an Error with the server's message on non-2xx. */
    async apiFetch(path, opts = {}) {
      const headers = Object.assign(
        { 'Content-Type': 'application/json' },
        opts.headers || {}
      );
      const t = this.token();
      if (t) headers.Authorization = 'Bearer ' + t;
      const res = await fetch(this.api + path, Object.assign({}, opts, { headers }));
      let data = null;
      try { data = await res.json(); } catch { /* no body */ }
      if (res.status === 401) { this.clear(); }
      if (!res.ok) {
        const err = new Error((data && data.error) || 'Request failed');
        err.status = res.status;
        throw err;
      }
      return data;
    },

    /* Refresh the cached user from the server. Returns user or null. */
    async refresh() {
      if (!this.token()) return null;
      try {
        const { user } = await this.apiFetch('/auth/me');
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        return user;
      } catch { return null; }
    },

    /* Guard a protected page — bounce to login if not signed in. */
    requireAuth(redirect = 'login.html') {
      if (!this.isAuthed()) { window.location.href = redirect; return false; }
      return true;
    },

    /* On auth pages: if already signed in, skip to the dashboard. */
    redirectIfAuthed(to = 'dashboard.html') {
      if (this.isAuthed()) window.location.href = to;
    },

    logout(to = 'index.html') {
      const done = () => { this.clear(); window.location.href = to; };
      fetch(this.api + '/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {}).finally(done);
    },
  };

  window.IG = IG;
})();
