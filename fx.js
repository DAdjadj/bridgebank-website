// Approximate US dollar prices for visitors in the United States.
// Checkout stays in euros; every dollar figure on the page says "≈" or "about".
//
// Markup:
//   data-usd="≈ {e:49}"        replaces the element's HTML for US visitors
//     {e:N}    N euros in dollars at today's rate, rounded to the dollar
//     {k:U:N}  U dollars minus N euros, rounded to the nearest ten
//   class="usd-only"           hidden unless the visitor gets dollar prices
//   ?cur=usd / ?cur=eur        forces either view (for testing)
// Launch pricing: <meta name="launch-ends" content="<ISO date>"> on the page.
// Until then, [data-launch-until] shows " until <date>"; after it, elements
// switch to their normal price: [data-after] replaces the HTML,
// [data-after-usd] the dollar template, [data-after-href] the link, and
// [data-after-hide] disappears. Runs before the dollar prices below.
(function () {
  var meta = document.querySelector('meta[name="launch-ends"]');
  // ?launch-ends=<date> previews either state (for testing).
  var forced = new URLSearchParams(location.search).get('launch-ends');
  var ends = Date.parse(forced || (meta ? meta.content : ''));
  if (!ends) return;
  if (Date.now() <= ends) {
    var label = ' until ' + new Date(ends).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    document.querySelectorAll('[data-launch-until]').forEach(function (el) { el.textContent = label; });
    return;
  }
  document.querySelectorAll('[data-after-hide]').forEach(function (el) { el.style.display = 'none'; });
  document.querySelectorAll('[data-after-href]').forEach(function (el) { el.setAttribute('href', el.getAttribute('data-after-href')); });
  document.querySelectorAll('[data-after-usd]').forEach(function (el) { el.setAttribute('data-usd', el.getAttribute('data-after-usd')); });
  document.querySelectorAll('[data-after]').forEach(function (el) { el.innerHTML = el.getAttribute('data-after'); });
})();

(function () {
  var US = /^(US|PR|GU|VI|AS|MP|UM)$/;
  var US_ZONES = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Juneau|Sitka|Nome|Yakutat|Metlakatla|Adak|Boise|Detroit|Menominee|Puerto_Rico|St_Thomas|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/(Honolulu|Guam|Saipan|Pago_Pago))$/;
  var DAY = 12 * 60 * 60 * 1000;

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { return null; }
  }

  function byTimeZone() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    return US_ZONES.test(tz) ? 'US' : '';
  }

  function country() {
    var forced = new URLSearchParams(location.search).get('cur');
    if (forced) return Promise.resolve(forced.toLowerCase() === 'usd' ? 'US' : '');
    // Cloudflare answers this on the live site; local previews fall back to the time zone.
    return fetch('/cdn-cgi/trace')
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { var m = /^loc=([A-Z]{2})$/m.exec(t); return m ? m[1] : byTimeZone(); })
      .catch(byTimeZone);
  }

  function rate() {
    var cached = store('fx-eur-usd');
    if (cached && cached.rate && Date.now() - cached.at < DAY) return Promise.resolve(cached.rate);
    // European Central Bank reference rate, published each working day.
    return fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var r = j && j.rates && j.rates.USD;
        if (!r) throw new Error('no rate');
        store('fx-eur-usd', { rate: r, at: Date.now() });
        return r;
      })
      .catch(function () { return cached && cached.rate; });
  }

  function dollars(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  function fill(template, r) {
    return template
      .replace(/\{e:([\d.]+)\}/g, function (_, n) { return dollars(n * r); })
      .replace(/\{k:([\d.]+):([\d.]+)\}/g, function (_, u, n) { return dollars(Math.round((u - n * r) / 10) * 10); });
  }

  country().then(function (c) {
    if (!US.test(c)) return;
    return rate().then(function (r) {
      if (!r) return;
      document.querySelectorAll('[data-usd]').forEach(function (el) {
        el.innerHTML = fill(el.getAttribute('data-usd'), r);
      });
      document.documentElement.classList.add('fx-usd');
    });
  });
})();
