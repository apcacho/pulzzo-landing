/* Canonical CRM entry and same-origin Backoffice navigation adapter. No authentication. */
(function () {
  'use strict';
  let shell = null, context = null;
  try {
    if (window.parent !== window && new URLSearchParams(location.search).get('embedded') === 'backoffice' && window.parent.location.origin === location.origin) {
      shell = window.parent.PulzzoCRMBackoffice;
      context = shell && shell.getContext(window);
    }
  } catch (_) {}
  if (!context) {
    window.crmDemoEntryBlocked = true;
    const parts = location.hash.replace(/^#/, '').split('/');
    const type = parts[0] === 'doctor' ? 'doctor' : 'patient';
    const view = ['contacts', 'tasks', 'dashboard'].includes(parts[1]) ? parts[1] : 'contacts';
    let id = '';
    try { const decoded = decodeURIComponent(parts[2] || ''); if (/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(decoded)) id = '/' + encodeURIComponent(decoded); } catch (_) {}
    location.replace('backoffice.html#crm/' + type + '/' + view + id);
    return;
  }
  document.documentElement.classList.add('crm-embedded');
  window.PulzzoCRMEmbedding = {
    actorId: context.actorId,
    writeRoute(hash, replace) {
      if (!shell.getContext(window)) return false;
      // The Backoffice is the only history owner. A child never adds joint entries.
      history.replaceState(null, '', hash);
      return shell.navigate(window, hash, replace);
    },
    ready() { shell.sync(window); }
  };
  document.addEventListener('click', function (event) {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    // Holder onboarding is its own portal and must not replace the CRM frame.
    if (url.origin === location.origin && url.pathname.endsWith('/asistido-demo.html')) {
      link.target = '_blank'; link.rel = 'noopener noreferrer';
    }
  }, true);
})();
