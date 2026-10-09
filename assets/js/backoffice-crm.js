/* Backoffice CRM section: shell/navigation only. Domain engines remain unchanged. */
(function () {
  'use strict';
  const section = document.getElementById('crm');
  const app = document.getElementById('appView');
  if (!section || !app) return;
  const actorIds = ['kam_ana', 'kam_luis', 'admin_demo'];
  let workspace = null, mounted = null, crmHash = '#patient/contacts', actorId = 'kam_ana', restoring = false;
  const originalSetView = window.setView;
  const originalInitApp = window.initApp;
  const originalSetSidebarOpen = window.setSidebarOpen;
  const authorized = () => !!session && session.role === 'admin';
  function normalize(hash) {
    const parts = String(hash || '').replace(/^#(?:crm\/?|)/, '').split('/');
    const type = parts[0] === 'doctor' ? 'doctor' : 'patient';
    const view = ['contacts', 'tasks', 'dashboard'].includes(parts[1]) ? parts[1] : 'contacts';
    let id = '';
    try { const decoded = decodeURIComponent(parts[2] || ''); if (/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(decoded)) id = '/' + encodeURIComponent(decoded); } catch (_) {}
    return '#' + type + '/' + view + id;
  }
  function isCRMRoute() { return /^#crm(?:\/|$)/.test(location.hash); }
  function writeHash(hash, replace) {
    if (location.hash === hash) return;
    history[replace ? 'replaceState' : 'pushState'](null, '', hash);
  }
  function validHost(host) { return authorized() && currentView === 'crm' && !!workspace && workspace === host; }
  function dismissCRM() {
    if (mounted) mounted.app.closeDialog(true);
  }
  function teardown() {
    const previous = mounted;
    if (previous) {
      const chosen = previous.app.state.actor.id;
      if (actorIds.includes(chosen)) actorId = chosen;
    }
    const previousHost = workspace;
    mounted = null; workspace = null;
    // Invalidates pending evidence intents, revokes previews and removes every
    // per-mount listener before a new actor/session can create another surface.
    if (previous) previous.destroy();
    if (previousHost) previousHost.remove();
    app.removeAttribute('data-crm-active');
  }
  function header() {
    const provider = crmHash.startsWith('#doctor/');
    document.getElementById('pageTitle').textContent = 'CRM · ' + (provider ? 'Proveedores' : 'Clientes');
    document.getElementById('pageSub').textContent = 'Prospectos, contacto, tareas y registro asistido · simulación local';
  }
  function applyCRMRoute() {
    if (!mounted) return;
    const route = crmHash.slice(1).split('/'), wasRestoring = restoring;
    restoring = true;
    try { mounted.app.navigate(route[0], route[1], route[2] ? decodeURIComponent(route[2]) : null, true); }
    finally { restoring = wasRestoring; }
  }
  function mountCRM() {
    const host = document.createElement('div');
    host.id = 'crmWorkspace';
    workspace = host;
    section.replaceChildren(host);
    try {
      mounted = window.PulzzoCRMEmbedding.mount({host, embedding:{
        actorId,
        readRoute:() => crmHash,
        renderHeader:header,
        writeRoute:(hash, replace) => window.PulzzoCRMBackoffice.navigate(host, hash, replace)
      }});
    } catch (error) {
      teardown();
      const notice = document.createElement('p');
      notice.className = 'crm-load-error'; notice.setAttribute('role', 'alert');
      notice.textContent = error.message || 'No se pudo abrir CRM. Vuelve a elegir CRM para reintentar.';
      section.replaceChildren(notice);
    }
  }
  function showCRM(hash, replace) {
    if (!authorized()) {
      teardown();
      if (session) { originalSetView('dashboard'); toast('El CRM demo está disponible desde la sesión Admin.'); }
      return false;
    }
    // Back/Forward can enter CRM while an operational BO modal is open.
    // Use existing close handlers to release focus/inert state and invalidate review work.
    let dismissedOfficeModal = false;
    if (document.getElementById('portfolioPaymentOverlay') && typeof portfolioClosePayment === 'function') {
      if (!portfolioClosePayment(false)) { writeHash('#bo/' + currentView, true); return false; }
      dismissedOfficeModal = true;
    }
    if (document.getElementById('modalBackdrop')?.classList.contains('show')) {
      if (typeof reviewContext !== 'undefined' && reviewContext && typeof closeDocumentReview === 'function') closeDocumentReview();
      else if (typeof closeModal === 'function') closeModal();
      dismissedOfficeModal = true;
    }
    crmHash = normalize(hash || crmHash);
    currentView = 'crm';
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'crm'));
    document.querySelectorAll('.nav-btn').forEach(button => {
      const active = button.dataset.id === 'crm';
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    app.setAttribute('data-crm-active', 'true');
    header();
    if (!restoring) writeHash('#crm/' + crmHash.slice(1), replace);
    if (!workspace) mountCRM();
    else applyCRMRoute();
    if (window.innerWidth < 821) originalSetSidebarOpen(false, true);
    if (dismissedOfficeModal) {
      const focus = window.innerWidth < 821 ? document.getElementById('mobileMenu') : document.querySelector('.nav-btn[data-id="crm"]');
      focus?.focus?.({preventScroll:true});
    }
    return true;
  }
  navItems.splice(1, 0, {id:'crm', label:'CRM', icon:'people', roles:['admin']});
  window.setView = function (id, options) {
    if (id === 'crm') return showCRM(crmHash, false);
    const leaving = currentView === 'crm' || isCRMRoute();
    teardown();
    const result = originalSetView(id, options);
    if (!restoring && (leaving || /^#bo\//.test(location.hash))) writeHash('#bo/' + id, false);
    return result;
  };
  window.initApp = function () {
    const requested = isCRMRoute() ? normalize(location.hash) : null;
    restoring = true;
    try { originalInitApp(); } finally { restoring = false; }
    const logout = document.getElementById('logoutBtn'), originalLogout = logout.onclick;
    logout.onclick = function () { teardown(); actorId = 'kam_ana'; originalLogout(); };
    if (requested) showCRM(requested, true);
  };
  window.setSidebarOpen = function (open, returnFocus) {
    if (open) dismissCRM();
    return originalSetSidebarOpen(open, returnFocus);
  };
  window.PulzzoCRMBackoffice = {
    getContext(host) { return validHost(host) ? {actorId, demo:true, section:'crm'} : null; },
    getApp(host) { return validHost(host) && mounted ? mounted.app : null; },
    navigate(host, hash, replace) {
      if (!validHost(host)) return false;
      crmHash = normalize(hash); header();
      const chosen = mounted && mounted.app.state.actor.id;
      if (actorIds.includes(chosen)) actorId = chosen;
      if (!restoring) writeHash('#crm/' + crmHash.slice(1), !!replace);
      return true;
    },
    sync(host) { if (!validHost(host)) return false; applyCRMRoute(); return true; }
  };
  function updateLoginHint() {
    const hint = document.getElementById('crmLoginHint');
    if (hint) hint.hidden = !isCRMRoute();
  }
  function restoreRoute() {
    updateLoginHint();
    if (!session) return;
    restoring = true;
    try {
      if (isCRMRoute()) showCRM(normalize(location.hash), true);
      else {
        const target = /^#bo\//.test(location.hash) ? location.hash.slice(4) : 'dashboard';
        const allowed = navItems.find(item => item.id === target && item.roles.includes(session.role));
        teardown(); originalSetView(allowed ? target : 'dashboard');
      }
    } finally { restoring = false; }
  }
  updateLoginHint();
  window.addEventListener('popstate', restoreRoute);
  window.addEventListener('hashchange', restoreRoute);
  window.addEventListener('pageshow', function (event) { if (event.persisted && session) restoreRoute(); });
  window.addEventListener('pagehide', teardown);
})();
