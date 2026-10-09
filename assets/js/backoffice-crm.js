/* Backoffice CRM section: shell/navigation only. Domain engines remain unchanged. */
(function () {
  'use strict';
  const section = document.getElementById('crm');
  const app = document.getElementById('appView');
  if (!section || !app) return;
  const actorIds = ['kam_ana', 'kam_luis', 'admin_demo'];
  let frame = null, crmHash = '#patient/contacts', actorId = 'kam_ana', restoring = false;
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
  function validChild(child) { return authorized() && currentView === 'crm' && !!frame && frame.contentWindow === child; }
  function sizeFrame() {
    if (!frame) return;
    const topbar = document.querySelector('.topbar');
    const height = Math.max(1, window.innerHeight - (topbar ? topbar.getBoundingClientRect().height : 74));
    frame.style.height = height + 'px';
  }
  function dismissChild() {
    if (!frame) return;
    try { if (frame.contentWindow.crmDemoApp) frame.contentWindow.crmDemoApp.closeDialog(true); } catch (_) {}
  }
  function teardown() {
    if (frame) {
      try { const chosen = frame.contentWindow.crmDemoApp?.state.actor.id; if (actorIds.includes(chosen)) actorId = chosen; } catch (_) {}
      dismissChild();
      frame.remove();
      frame = null;
    }
    app.removeAttribute('data-crm-active');
  }
  function header() {
    const provider = crmHash.startsWith('#doctor/');
    document.getElementById('pageTitle').textContent = 'CRM · ' + (provider ? 'Proveedores' : 'Clientes');
    document.getElementById('pageSub').textContent = 'Prospectos, contacto, tareas y registro asistido · simulación local';
  }
  function applyChildRoute() {
    if (!frame) return;
    try {
      const child = frame.contentWindow, crm = child.crmDemoApp;
      if (!crm || !crm.navigate) return;
      const route = crmHash.slice(1).split('/');
      restoring = true;
      crm.navigate(route[0], route[1], route[2] ? decodeURIComponent(route[2]) : null, true);
    } finally { restoring = false; }
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
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'crmWorkspaceFrame';
      frame.title = 'CRM: prospectos y registro asistido DEMO';
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.src = 'crm-demo.html?embedded=backoffice' + crmHash;
      section.appendChild(frame);
      window.scrollTo?.(0, 0);
    } else applyChildRoute();
    sizeFrame();
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
    if (open) dismissChild();
    return originalSetSidebarOpen(open, returnFocus);
  };
  window.PulzzoCRMBackoffice = {
    getContext(child) { return validChild(child) ? {actorId, demo:true, section:'crm'} : null; },
    navigate(child, hash, replace) {
      if (!validChild(child)) return false;
      crmHash = normalize(hash); header();
      try { const chosen = child.crmDemoApp?.state.actor.id; if (actorIds.includes(chosen)) actorId = chosen; } catch (_) {}
      if (!restoring) writeHash('#crm/' + crmHash.slice(1), !!replace);
      return true;
    },
    sync(child) { if (!validChild(child)) return false; applyChildRoute(); sizeFrame(); return true; }
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
  window.addEventListener('resize', sizeFrame);
  if (typeof ResizeObserver === 'function') {
    const headerSize = new ResizeObserver(sizeFrame);
    headerSize.observe(document.querySelector('.topbar'));
  }
  window.addEventListener('pageshow', function (event) { if (event.persisted && session) restoreRoute(); });
  window.addEventListener('pagehide', teardown);
})();
