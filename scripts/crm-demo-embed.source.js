/* Canonical CRM entry and native, root-scoped Backoffice adapter. No authentication. */
(function () {
  'use strict';
  // Build-injected from the canonical CSS files; never edit the generated asset.
  const CRM_CSS = "__PULZZO_CRM_CSS__";
  // Legacy links keep their route, but no page or query flag creates another CRM shell.
  if (/\/crm-demo\.html$/.test(location.pathname)) {
    window.crmDemoEntryBlocked = true;
    const parts = location.hash.replace(/^#/, '').split('/');
    const type = parts[0] === 'doctor' ? 'doctor' : 'patient';
    const view = ['contacts', 'tasks', 'dashboard'].includes(parts[1]) ? parts[1] : 'contacts';
    let id = '';
    try { const decoded = decodeURIComponent(parts[2] || ''); if (/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(decoded)) id = '/' + encodeURIComponent(decoded); } catch (_) {}
    location.replace('backoffice.html#crm/' + type + '/' + view + id);
    return;
  }
  function mount(options) {
    const host = options.host, owner = host.ownerDocument || document;
    if (!host.attachShadow || !window.PulzzoCRMTemplate || !window.PulzzoCRMUI) throw new Error('El módulo CRM no está disponible. Recarga Backoffice para intentarlo de nuevo.');
    const root = host.attachShadow({mode:'open'});
    // Synchronous local styles: no first-interaction network waterfall or FOUC.
    // Keep the full stylesheet inside this shadow root, never in the BO head.
    const style = owner.createElement('style');
    style.textContent = CRM_CSS;
    root.appendChild(style);
    if (style.sheet === null) throw new Error('No se pudieron aplicar los estilos del CRM. Recarga Backoffice para reintentar.');
    const surface = owner.createElement('div');
    surface.className = 'crm-surface'; surface.dataset.context = 'patient';
    surface.innerHTML = window.PulzzoCRMTemplate;
    root.appendChild(surface);
    // Give the existing CRM UI only its own DOM and events. Shadow DOM isolates its
    // generic classes/IDs while the Backoffice design tokens inherit through host.
    const scopedDocument = {
      body:surface, documentElement:surface,
      get activeElement(){return root.activeElement;},
      getElementById:id => root.getElementById(id),
      querySelector:selector => root.querySelector(selector),
      querySelectorAll:selector => root.querySelectorAll(selector),
      addEventListener:(type, handler) => root.addEventListener(type, handler),
      removeEventListener:(type, handler) => root.removeEventListener(type, handler)
    };
    const holderLink = function (event) {
      const link = event.target.closest?.('a[href]');
      if (!link) return;
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname.endsWith('/asistido-demo.html')) {
        link.target = '_blank'; link.rel = 'noopener noreferrer';
      }
    };
    root.addEventListener('click', holderLink, true);
    let app;
    try {
      const embedding = Object.assign({}, options.embedding, {focusContact() {
        const detail = root.getElementById('contactDetail');
        // Explicit selection only: history restoration and ordinary renders must
        // retain the user's scroll position. No motion is needed to reveal a card.
        const topbar = owner.querySelector('.topbar');
        detail.focus({preventScroll:true});
        if (window.innerWidth > 820 && (!app || app.state.contactLayout !== 'kanban')) return;
        detail.style.scrollMarginTop = ((topbar ? topbar.getBoundingClientRect().height : 0) + 16) + 'px';
        detail.scrollIntoView({block:'start', behavior:'instant'});
      }});
      app = window.PulzzoCRMUI.createApp({window, document:scopedDocument, embedding});
      if (!app || !app.navigate) throw new Error('El CRM local no pudo iniciar. Revisa el almacenamiento de este navegador.');
    } catch (error) {
      root.removeEventListener('click', holderLink, true);
      throw error;
    }
    return {
      app,
      destroy() {root.removeEventListener('click', holderLink, true);app.destroy();}
    };
  }
  window.PulzzoCRMEmbedding = Object.freeze({mount});
})();
