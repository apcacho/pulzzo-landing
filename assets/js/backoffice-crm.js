/* Backoffice CRM section: shell/navigation only. Domain engines remain unchanged. */
(function () {
  'use strict';
  const section = document.getElementById('crm');
  const app = document.getElementById('appView');
  if (!section || !app) return;
  const actorIds = ['kam_ana', 'kam_luis', 'admin_demo', 'leader_demo'];
  let workspace = null, mounted = null, mountedSession = null, mountedSessionKey = null, crmHash = '#patient/contacts', actorId = 'admin_demo', restoring = false;
  const originalSetView = window.setView;
  const originalInitApp = window.initApp;
  const originalSetSidebarOpen = window.setSidebarOpen;
  const central=()=>window.PulzzoStaffAccess;
  const centralContext=()=>central()?central().crmContext(session):null;
  const operationalSession = () => central()?!!central().resolveSession(session)&&['viewPatients','viewProviders','viewPortfolio','viewDashboard','viewDocuments','viewHistory','settings','users','roles'].some(cap=>central().can(session,cap)): !!session && ['admin', 'operations', 'risk', 'provider', 'readonly'].includes(session.role);
  const crmOnly = () => central()?authorized()&&!operationalSession(): !!session && ['kam', 'leader'].includes(session.role);
  const authorized = () => central()?!!centralContext()?.actor&&centralContext().scope!=='none'&&centralContext().isCurrent(): !!session && (session.role === 'admin' || session.role === 'leader' && session.crmActorId === 'leader_demo' || session.role === 'kam' && ['kam_ana', 'kam_luis'].includes(session.crmActorId));
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
  const sessionKey = () => central()?JSON.stringify(central().getActor(session)||null):session ? JSON.stringify([session.email || '', session.role || '', session.crmActorId || '']) : null;
  const currentSession = () => (!!central()||session === mountedSession) && sessionKey() === mountedSessionKey;
  function validHost(host) { return authorized() && currentView === 'crm' && !!workspace && workspace === host && currentSession(); }
  function dismissCRM() {
    if (mounted) mounted.app.closeDialog(true);
  }
  function teardown() {
    const previous = mounted;
    if (previous) {
      const chosen = previous.app.state.actor.id;
      if (session && currentSession() && !central()&&session.role === 'admin' && actorIds.includes(chosen)) actorId = chosen;
    }
    const previousHost = workspace;
    mounted = null; workspace = null; mountedSession = null; mountedSessionKey = null;
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
    workspace = host; mountedSession = session; mountedSessionKey = sessionKey();
    const owningSession = session;
    section.replaceChildren(host);
    try {
      mounted = window.PulzzoCRMEmbedding.mount({host, embedding:{
        actorId:central()?centralContext().actor.id:actorId,
        allowActorSwitch: !central()&&session.role === 'admin',
        isCurrent: () => validHost(host) && (!!central()||session === owningSession),
        readRoute:() => crmHash,
        renderHeader:header,
        writeRoute:(hash, replace) => window.PulzzoCRMBackoffice.navigate(host, hash, replace)
      }});
    } catch (error) {
      teardown();
      const notice = document.createElement('p');
      notice.className = 'crm-load-error'; notice.setAttribute('role', 'alert');
      notice.textContent = error.message || 'No se pudo abrir CRM. Vuelve a elegir CRM para reintentar.';
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'btn btn-primary';
      retry.textContent = 'Reintentar CRM';
      retry.addEventListener('click', function () {
        if (authorized() && currentView === 'crm' && !workspace && section.contains(retry)) showCRM(crmHash, true);
      });
      section.replaceChildren(notice, retry);
    }
  }
  function showCRM(hash, replace) {
    if (!authorized()) {
      const invalidCRMIdentity = !!session && !operationalSession();
      teardown();
      if (invalidCRMIdentity) {
        originalSetSidebarOpen(false);
        session = null;
        app.classList.add('hidden');
        document.getElementById('loginView').classList.remove('hidden');
        toast('La identidad CRM no es válida. Vuelve a elegir una sesión demo.');
      } else if (session) { originalSetView('dashboard'); toast('Esta sesión no tiene acceso al CRM demo.'); }
      return false;
    }
    if (workspace && !currentSession()) teardown();
    if (crmOnly()) actorId = session.crmActorId;
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
  navItems.splice(1, 0, {id:'crm', label:'CRM', icon:'people', roles:['admin','kam','leader']});
  window.setView = function (id, options) {
    if (id === 'crm' || !operationalSession()) return showCRM(crmHash, false);
    const leaving = currentView === 'crm' || isCRMRoute();
    teardown();
    const result = originalSetView(id, options);
    if (!restoring && (leaving || /^#bo\//.test(location.hash))) writeHash('#bo/' + id, false);
    return result;
  };
  window.initApp = function () {
    if(window.PulzzoCRMOnboarding)window.PulzzoCRMOnboarding.clearStaffSession({sessionStorage:window.sessionStorage});
    if(central()&&authorized())actorId=centralContext().actor.id;
    if (crmOnly()) { if(!central())actorId = session.crmActorId; currentView = 'crm'; }
    else if (!central()&&session && session.role === 'admin') actorId = 'admin_demo';
    const requested = isCRMRoute() ? normalize(location.hash) : null;
    restoring = true;
    try { originalInitApp(); } finally { restoring = false; }
    const logout = document.getElementById('logoutBtn'), originalLogout = logout.onclick;
    logout.onclick = function () { if(window.PulzzoCRMOnboarding)window.PulzzoCRMOnboarding.clearStaffSession({sessionStorage:window.sessionStorage}); teardown(); actorId = 'admin_demo'; originalLogout(); };
    if (requested || crmOnly()) showCRM(requested || crmHash, true);
  };
  window.setSidebarOpen = function (open, returnFocus) {
    if (open) dismissCRM();
    return originalSetSidebarOpen(open, returnFocus);
  };
  window.PulzzoCRMBackoffice = {
    getContext(host) { return validHost(host) ? {actorId:central()?centralContext().actor.id:actorId, allowActorSwitch:!central()&&session.role === 'admin', demo:true, section:'crm'} : null; },
    getApp(host) { return validHost(host) && mounted ? mounted.app : null; },
    navigate(host, hash, replace) {
      if (!validHost(host)) return false;
      crmHash = normalize(hash); header();
      const chosen = mounted && mounted.app.state.actor.id;
      if (session && currentSession() && !central()&&session.role === 'admin' && actorIds.includes(chosen)) actorId = chosen;
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
      if (isCRMRoute() || !operationalSession()) {
        const forced = crmOnly() && !isCRMRoute();
        showCRM(isCRMRoute() ? normalize(location.hash) : crmHash, true);
        if (forced) writeHash('#crm/' + crmHash.slice(1), true);
      }
      else {
        const target = /^#bo\//.test(location.hash) ? location.hash.slice(4) : 'dashboard';
        const allowed = navItems.find(item => item.id === target && (central()?typeof window.staffCanView==='function'&&window.staffCanView(item.id):item.roles.includes(session.role)));
        teardown(); const fallback=central()?navItems.find(item=>typeof window.staffCanView==='function'&&window.staffCanView(item.id)):null;originalSetView(allowed ? target : fallback?fallback.id:'dashboard');
      }
    } finally { restoring = false; }
  }
  // Older operational entry points predate CRM-only sessions and some bypass
  // setView. Keep those reads and routes in the operational shell; linked CRM
  // records are exposed through the actor-scoped CRM adapters instead.
  for (const name of ['openPatientProfile', 'openPatientProfileFromButton', 'backToPatientProfiles', 'openPatientProfileRequest', 'openPatientRequestDetail', 'openProviderProfile', 'openDashboardRecord', 'openProviderFromChart', 'openDashboardMetricDetail', 'openDashboardSlaModal', 'openDocumentReview', 'modal']) {
    const original = window[name];
    if (typeof original !== 'function') continue;
    window[name] = function (...args) {
      if (!operationalSession()) { toast('Consulta los registros vinculados desde tu cartera CRM.'); return false; }
      return original.apply(this, args);
    };
  }
  for (const bridge of [window.PulzzoBackofficeDemoBridge, window.PulzzoServicingOffice]) {
    if (bridge) for (const name of ['getDatabase', 'getSelected', 'getProvider', 'getStorageVersion', 'patientProjection', 'doctorProjection', 'identityCandidates', 'save', 'select']) {
      const original = bridge[name];
      if (typeof original !== 'function') continue;
      bridge[name] = function (...args) {
        if (!operationalSession()) throw new Error('Esta sesión no tiene acceso al puente operativo de backoffice.');
        return original.apply(this, args);
      };
    }
  }
  const publicationBO = window.PulzzoDoctorPublicationBO;
  if (publicationBO) for (const name of ['render', 'badge']) {
    const original = publicationBO[name];
    if (typeof original !== 'function') continue;
    publicationBO[name] = function (...args) {
      if (!operationalSession()) return '';
      return original.apply(this, args);
    };
  }
  updateLoginHint();
  window.addEventListener('popstate', restoreRoute);
  window.addEventListener('hashchange', restoreRoute);
  window.addEventListener('pageshow', function (event) { if (event.persisted && session) restoreRoute(); });
  window.addEventListener('pagehide', teardown);
  window.addEventListener('storage',function(){if(central()&&mounted&&!authorized()){teardown();toast('Tu acceso CRM cambió. Inicia sesión de nuevo.');}});
})();
