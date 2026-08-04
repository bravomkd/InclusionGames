/* ============================================================
 * InclusionGames — lightweight i18n engine
 * English is the source. Switching language walks the DOM text
 * nodes + input placeholders and swaps any string found in the
 * dictionary below; anything not yet translated stays English.
 *
 * To add a translation: add the exact English string as a key
 * under the language. To add a language: add a new block + an
 * <option> in the language selector.
 * ============================================================ */
(function () {
  'use strict';

  const LANGS = ['en', 'de', 'pl', 'es'];
  const STORE_KEY = 'ig_lang';

  // ── Dictionaries (key = exact English source text) ─────────
  const T = {
    de: {
      // Nav
      'Games': 'Spiele', 'How It Works': 'So funktioniert’s', 'Pricing': 'Preise',
      'Our Mission': 'Unsere Mission', 'Custom Games': 'Eigene Spiele',
      'Log in': 'Anmelden', 'Sign in': 'Anmelden', 'Start Free Trial': 'Kostenlos testen',
      'No account? Sign up free →': 'Kein Konto? Kostenlos registrieren →',
      'Already have an account? Sign in →': 'Schon ein Konto? Anmelden →',
      // Hero
      'Every Child Deserves to': 'Jedes Kind verdient es zu', 'Play': 'Spielen',
      '🎮 Start Free Trial — 3 Days': '🎮 Kostenlos testen — 3 Tage',
      'See All Games': 'Alle Spiele ansehen',
      'Games available': 'Spiele verfügbar', 'Languages': 'Sprachen',
      'Age range': 'Altersgruppe', 'Equipment needed': 'Geräte nötig',
      // Banners
      'Get started →': 'Loslegen →',
      // How it works
      'Simple setup': 'Einfache Einrichtung', 'Ready in 60 seconds': 'In 60 Sekunden startklar',
      'Any computer + webcam': 'Jeder Computer + Webcam',
      'Choose your language': 'Sprache wählen',
      'Show your hand & play': 'Hand zeigen & spielen',
      'Celebrate every win': 'Jeden Erfolg feiern',
      // Sections
      'A game for every child': 'Ein Spiel für jedes Kind',
      'Built for inclusion': 'Für Inklusion gemacht',
      'Every setting, every child': 'Jede Einstellung, jedes Kind',
      'What families say': 'Was Familien sagen',
      'Real stories, real smiles': 'Echte Geschichten, echtes Lächeln',
      'Simple pricing': 'Einfache Preise', 'Start free, stay forever': 'Kostenlos starten, dauerhaft bleiben',
      'Questions': 'Fragen', 'Frequently asked questions': 'Häufig gestellte Fragen',
      // Pricing
      'Monthly': 'Monatlich', 'Starter': 'Starter', 'Family': 'Familie',
      'Educator': 'Pädagog:innen', 'School': 'Schule',
      'For individual home use': 'Für die private Einzelnutzung',
      'For home with multiple children': 'Für zu Hause mit mehreren Kindern',
      'For teachers & therapists': 'Für Lehrkräfte & Therapeut:innen',
      'For schools & institutions': 'Für Schulen & Einrichtungen',
      'Start My Free Trial →': 'Kostenlose Testphase starten →',
      'Contact us': 'Kontakt aufnehmen',
      // Payment modal
      'Choose how to pay': 'Zahlungsart wählen',
      'Credit / Debit Card': 'Kredit-/Debitkarte',
      'PayPal': 'PayPal', 'Start my free trial →': 'Kostenlose Testphase starten →',
      // CTA
      'Ready to watch your child shine?': 'Bereit, Ihr Kind strahlen zu sehen?',
      '🎈 Start Free Trial': '🎈 Kostenlos testen', 'Browse all games': 'Alle Spiele ansehen',
      // Footer
      'Platform': 'Plattform', 'Company': 'Unternehmen',
      'Privacy Policy': 'Datenschutz', 'Terms of Service': 'AGB', 'Cookie Policy': 'Cookie-Richtlinie',
      'Contact Us': 'Kontakt',
      // Auth pages
      'Welcome back': 'Willkommen zurück',
      'Sign in to continue your child’s learning journey.': 'Melden Sie sich an, um die Lernreise Ihres Kindes fortzusetzen.',
      'Email address': 'E-Mail-Adresse', 'Password': 'Passwort',
      'Enter your password': 'Passwort eingeben', 'Forgot password?': 'Passwort vergessen?',
      'Remember me': 'Angemeldet bleiben',
      'Don’t have an account?': 'Noch kein Konto?', 'Sign up free': 'Kostenlos registrieren',
      'Create your account': 'Konto erstellen',
      'Start your free trial — no credit card required.': 'Starten Sie Ihre kostenlose Testphase — keine Kreditkarte nötig.',
      'Full name': 'Vollständiger Name', 'Minimum 8 characters': 'Mindestens 8 Zeichen',
      'Create account': 'Konto erstellen', 'Already have an account?': 'Schon ein Konto?',
      'Forgot password?': 'Passwort vergessen?',
      'No worries! Enter your email address and we’ll send you a link to reset your password.':
        'Kein Problem! Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen.',
      'Send reset link': 'Link zum Zurücksetzen senden',
      '← Back to sign in': '← Zurück zur Anmeldung',
      'Set a new password': 'Neues Passwort festlegen',
      'Choose a strong new password for your account.': 'Wählen Sie ein sicheres neues Passwort für Ihr Konto.',
      'New password': 'Neues Passwort', 'Confirm password': 'Passwort bestätigen',
      'Update password': 'Passwort aktualisieren',
    },
    pl: {
      'Games': 'Gry', 'How It Works': 'Jak to działa', 'Pricing': 'Cennik',
      'Our Mission': 'Nasza misja', 'Custom Games': 'Gry na zamówienie',
      'Log in': 'Zaloguj się', 'Sign in': 'Zaloguj się', 'Start Free Trial': 'Wypróbuj za darmo',
      'No account? Sign up free →': 'Nie masz konta? Zarejestruj się za darmo →',
      'Already have an account? Sign in →': 'Masz już konto? Zaloguj się →',
      'Every Child Deserves to': 'Każde dziecko zasługuje, by', 'Play': 'grać',
      '🎮 Start Free Trial — 3 Days': '🎮 Wypróbuj za darmo — 3 dni',
      'See All Games': 'Zobacz wszystkie gry',
      'Games available': 'Dostępne gry', 'Languages': 'Języki',
      'Age range': 'Przedział wiekowy', 'Equipment needed': 'Potrzebny sprzęt',
      'Get started →': 'Zaczynamy →',
      'Simple setup': 'Prosta konfiguracja', 'Ready in 60 seconds': 'Gotowe w 60 sekund',
      'Any computer + webcam': 'Dowolny komputer + kamera',
      'Choose your language': 'Wybierz język',
      'Show your hand & play': 'Pokaż dłoń i graj',
      'Celebrate every win': 'Świętuj każdy sukces',
      'A game for every child': 'Gra dla każdego dziecka',
      'Built for inclusion': 'Stworzone dla włączania',
      'Every setting, every child': 'Każde ustawienie, każde dziecko',
      'What families say': 'Co mówią rodziny',
      'Real stories, real smiles': 'Prawdziwe historie, prawdziwe uśmiechy',
      'Simple pricing': 'Prosty cennik', 'Start free, stay forever': 'Zacznij za darmo, zostań na zawsze',
      'Questions': 'Pytania', 'Frequently asked questions': 'Najczęściej zadawane pytania',
      'Monthly': 'Miesięcznie', 'Starter': 'Starter', 'Family': 'Rodzina',
      'Educator': 'Nauczyciel', 'School': 'Szkoła',
      'For individual home use': 'Do użytku domowego',
      'For home with multiple children': 'Dla domu z kilkorgiem dzieci',
      'For teachers & therapists': 'Dla nauczycieli i terapeutów',
      'For schools & institutions': 'Dla szkół i instytucji',
      'Start My Free Trial →': 'Rozpocznij darmowy okres próbny →',
      'Contact us': 'Skontaktuj się',
      'Choose how to pay': 'Wybierz sposób płatności',
      'Credit / Debit Card': 'Karta kredytowa / debetowa',
      'PayPal': 'PayPal', 'Start my free trial →': 'Rozpocznij darmowy okres próbny →',
      'Ready to watch your child shine?': 'Gotowy, by zobaczyć, jak Twoje dziecko błyszczy?',
      '🎈 Start Free Trial': '🎈 Wypróbuj za darmo', 'Browse all games': 'Przeglądaj wszystkie gry',
      'Platform': 'Platforma', 'Company': 'Firma',
      'Privacy Policy': 'Polityka prywatności', 'Terms of Service': 'Regulamin', 'Cookie Policy': 'Polityka cookies',
      'Contact Us': 'Kontakt',
      'Welcome back': 'Witaj ponownie',
      'Sign in to continue your child’s learning journey.': 'Zaloguj się, aby kontynuować naukę swojego dziecka.',
      'Email address': 'Adres e-mail', 'Password': 'Hasło',
      'Enter your password': 'Wpisz hasło', 'Forgot password?': 'Nie pamiętasz hasła?',
      'Remember me': 'Zapamiętaj mnie',
      'Don’t have an account?': 'Nie masz konta?', 'Sign up free': 'Zarejestruj się za darmo',
      'Create your account': 'Utwórz konto',
      'Start your free trial — no credit card required.': 'Rozpocznij darmowy okres próbny — bez karty kredytowej.',
      'Full name': 'Imię i nazwisko', 'Minimum 8 characters': 'Minimum 8 znaków',
      'Create account': 'Utwórz konto', 'Already have an account?': 'Masz już konto?',
      'No worries! Enter your email address and we’ll send you a link to reset your password.':
        'Bez obaw! Podaj swój adres e-mail, a wyślemy Ci link do zresetowania hasła.',
      'Send reset link': 'Wyślij link resetujący',
      '← Back to sign in': '← Powrót do logowania',
      'Set a new password': 'Ustaw nowe hasło',
      'Choose a strong new password for your account.': 'Wybierz silne nowe hasło dla swojego konta.',
      'New password': 'Nowe hasło', 'Confirm password': 'Potwierdź hasło',
      'Update password': 'Zaktualizuj hasło',
    },
    es: {
      'Games': 'Juegos', 'How It Works': 'Cómo funciona', 'Pricing': 'Precios',
      'Our Mission': 'Nuestra misión', 'Custom Games': 'Juegos a medida',
      'Log in': 'Iniciar sesión', 'Sign in': 'Iniciar sesión', 'Start Free Trial': 'Prueba gratis',
      'No account? Sign up free →': '¿Sin cuenta? Regístrate gratis →',
      'Already have an account? Sign in →': '¿Ya tienes cuenta? Inicia sesión →',
      'Every Child Deserves to': 'Cada niño merece', 'Play': 'jugar',
      '🎮 Start Free Trial — 3 Days': '🎮 Prueba gratis — 3 días',
      'See All Games': 'Ver todos los juegos',
      'Games available': 'Juegos disponibles', 'Languages': 'Idiomas',
      'Age range': 'Edades', 'Equipment needed': 'Equipo necesario',
      'Get started →': 'Empezar →',
      'Simple setup': 'Configuración sencilla', 'Ready in 60 seconds': 'Listo en 60 segundos',
      'Any computer + webcam': 'Cualquier ordenador + cámara',
      'Choose your language': 'Elige tu idioma',
      'Show your hand & play': 'Muestra tu mano y juega',
      'Celebrate every win': 'Celebra cada logro',
      'A game for every child': 'Un juego para cada niño',
      'Built for inclusion': 'Creado para la inclusión',
      'Every setting, every child': 'Cada ajuste, cada niño',
      'What families say': 'Lo que dicen las familias',
      'Real stories, real smiles': 'Historias reales, sonrisas reales',
      'Simple pricing': 'Precios sencillos', 'Start free, stay forever': 'Empieza gratis, quédate para siempre',
      'Questions': 'Preguntas', 'Frequently asked questions': 'Preguntas frecuentes',
      'Monthly': 'Mensual', 'Starter': 'Inicial', 'Family': 'Familia',
      'Educator': 'Educadores', 'School': 'Colegio',
      'For individual home use': 'Para uso individual en casa',
      'For home with multiple children': 'Para hogares con varios niños',
      'For teachers & therapists': 'Para docentes y terapeutas',
      'For schools & institutions': 'Para colegios e instituciones',
      'Start My Free Trial →': 'Comenzar mi prueba gratis →',
      'Contact us': 'Contáctanos',
      'Choose how to pay': 'Elige cómo pagar',
      'Credit / Debit Card': 'Tarjeta de crédito / débito',
      'PayPal': 'PayPal', 'Start my free trial →': 'Comenzar mi prueba gratis →',
      'Ready to watch your child shine?': '¿Listo para ver brillar a tu hijo?',
      '🎈 Start Free Trial': '🎈 Prueba gratis', 'Browse all games': 'Explorar todos los juegos',
      'Platform': 'Plataforma', 'Company': 'Empresa',
      'Privacy Policy': 'Política de privacidad', 'Terms of Service': 'Términos del servicio', 'Cookie Policy': 'Política de cookies',
      'Contact Us': 'Contacto',
      'Welcome back': 'Bienvenido de nuevo',
      'Sign in to continue your child’s learning journey.': 'Inicia sesión para continuar el aprendizaje de tu hijo.',
      'Email address': 'Correo electrónico', 'Password': 'Contraseña',
      'Enter your password': 'Introduce tu contraseña', 'Forgot password?': '¿Olvidaste tu contraseña?',
      'Remember me': 'Recuérdame',
      'Don’t have an account?': '¿No tienes cuenta?', 'Sign up free': 'Regístrate gratis',
      'Create your account': 'Crea tu cuenta',
      'Start your free trial — no credit card required.': 'Comienza tu prueba gratis — sin tarjeta de crédito.',
      'Full name': 'Nombre completo', 'Minimum 8 characters': 'Mínimo 8 caracteres',
      'Create account': 'Crear cuenta', 'Already have an account?': '¿Ya tienes cuenta?',
      'No worries! Enter your email address and we’ll send you a link to reset your password.':
        '¡Tranquilo! Introduce tu correo y te enviaremos un enlace para restablecer tu contraseña.',
      'Send reset link': 'Enviar enlace de restablecimiento',
      '← Back to sign in': '← Volver a iniciar sesión',
      'Set a new password': 'Establece una nueva contraseña',
      'Choose a strong new password for your account.': 'Elige una contraseña nueva y segura para tu cuenta.',
      'New password': 'Nueva contraseña', 'Confirm password': 'Confirmar contraseña',
      'Update password': 'Actualizar contraseña',
    },
  };

  // ── Engine ─────────────────────────────────────────────────
  const originals = new WeakMap();      // textNode  -> original string
  const phOriginals = new WeakMap();    // element   -> original placeholder
  let titleOriginal = null;

  function dictFor(lang) { return T[lang] || null; }

  function translateText(original, dict) {
    const trimmed = original.trim();
    if (!trimmed) return original;
    const hit = dict[trimmed];
    if (!hit) return original;
    const lead = original.match(/^\s*/)[0];
    const tail = original.match(/\s*$/)[0];
    return lead + hit + tail;
  }

  function apply(lang) {
    lang = LANGS.includes(lang) ? lang : 'en';
    document.documentElement.lang = lang;
    const dict = dictFor(lang);

    // Text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (!originals.has(node)) originals.set(node, node.nodeValue);
      const orig = originals.get(node);
      node.nodeValue = dict ? translateText(orig, dict) : orig;
    });

    // Placeholders
    document.querySelectorAll('[placeholder]').forEach((el) => {
      if (!phOriginals.has(el)) phOriginals.set(el, el.getAttribute('placeholder'));
      const orig = phOriginals.get(el);
      el.setAttribute('placeholder', dict ? translateText(orig, dict) : orig);
    });

    // <title>
    if (titleOriginal === null) titleOriginal = document.title;
    if (dict && dict[titleOriginal.trim()]) document.title = dict[titleOriginal.trim()];
    else document.title = titleOriginal;

    // Sync selector(s)
    document.querySelectorAll('.lang-sel, #lang-select').forEach((sel) => { sel.value = lang; });
  }

  function set(lang) {
    if (!LANGS.includes(lang)) lang = 'en';
    localStorage.setItem(STORE_KEY, lang);
    apply(lang);
  }

  function current() { return localStorage.getItem(STORE_KEY) || 'en'; }

  window.I18N = { apply: () => apply(current()), set, current, langs: LANGS };
  // index.html and others call setLang(value) from the <select>.
  window.setLang = set;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply(current()));
  } else {
    apply(current());
  }
})();
