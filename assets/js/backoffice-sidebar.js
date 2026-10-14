/* Backoffice-only presentation preference. No account or business data is stored. */
(function(){
  'use strict';
  const storageKey='pulzzo.backoffice.sidebar.collapsed';
  const app=document.getElementById('appView');
  const sidebar=document.getElementById('sidebar');
  const toggle=document.getElementById('sidebarToggle');
  const mobileMenu=document.getElementById('mobileMenu');
  const close=document.getElementById('sidebarClose');
  const tooltip=document.getElementById('sidebarTooltip');
  let collapsed=false;
  try{collapsed=localStorage.getItem(storageKey)==='true';}catch(error){/* Storage may be unavailable in private/embedded contexts. */}
  const isDesktop=()=>window.innerWidth>820;
  let desktop=isDesktop();
  let hideTimer;
  function hideTooltip(){clearTimeout(hideTimer);tooltip.hidden=true;}
  function scheduleHide(){clearTimeout(hideTimer);hideTimer=setTimeout(hideTooltip,150);}
  function apply(){
    app.classList.toggle('sidebar-collapsed',collapsed);
    toggle.hidden=!isDesktop();
    toggle.setAttribute('aria-expanded',String(!collapsed));
    const label=collapsed?'Expandir menú lateral':'Contraer menú lateral';
    toggle.setAttribute('aria-label',label);
    toggle.setAttribute('title',label);
    toggle.firstElementChild.textContent=collapsed?'›':'‹';
    sidebar.inert=!isDesktop()&&!sidebar.classList.contains('open');
    hideTooltip();
  }
  toggle.addEventListener('click',()=>{
    if(!isDesktop())return;
    collapsed=!collapsed;
    try{localStorage.setItem(storageKey,String(collapsed));}catch(error){/* Keep working for this session if saving is blocked. */}
    apply();
  });
  function showTooltip(event){
    const control=event.target.closest('.nav-btn, #logoutBtn');
    if(!control||!collapsed||!isDesktop())return;
    clearTimeout(hideTimer);
    tooltip.textContent=control.getAttribute('aria-label');
    tooltip.hidden=false;
    const box=control.getBoundingClientRect();
    const tip=tooltip.getBoundingClientRect();
    tooltip.style.left=Math.max(8,Math.min(box.right+10,window.innerWidth-tip.width-8))+'px';
    tooltip.style.top=Math.max(8,Math.min(box.top+(box.height-tip.height)/2,window.innerHeight-tip.height-8))+'px';
  }
  sidebar.addEventListener('mouseover',showTooltip);
  sidebar.addEventListener('focusin',showTooltip);
  sidebar.addEventListener('mouseout',event=>{if(!event.relatedTarget||!sidebar.contains(event.relatedTarget))scheduleHide();else if(!event.relatedTarget.closest('.nav-btn, #logoutBtn'))scheduleHide();});
  tooltip.addEventListener('mouseenter',()=>clearTimeout(hideTimer));
  tooltip.addEventListener('mouseleave',hideTooltip);
  sidebar.addEventListener('focusout',hideTooltip);
  sidebar.addEventListener('click',hideTooltip);
  sidebar.addEventListener('scroll',hideTooltip);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hideTooltip();});
  window.addEventListener('resize',()=>{
    const nextDesktop=isDesktop();
    const active=document.activeElement;
    apply();
    if(nextDesktop!==desktop && !app.classList.contains('hidden')){
      // Never leave keyboard focus on a now-hidden desktop control or mobile drawer.
      if(nextDesktop&&(active===mobileMenu||active===close))toggle.focus();
      if(!nextDesktop&&sidebar.contains(active)&&!sidebar.classList.contains('open'))mobileMenu.focus();
    }
    desktop=nextDesktop;
  });
  apply();
})();
