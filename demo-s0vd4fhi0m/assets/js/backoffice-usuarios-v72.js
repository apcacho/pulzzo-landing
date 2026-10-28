/* v72 · Pantalla «Usuarios» (solo Admin) en el menú lateral del backoffice.
   Reutiliza el módulo existente de personal (PulzzoStaffAccess + PulzzoStaffAdminUI): no duplica datos,
   permisos ni historial. Quien no tiene la capacidad «users» (reservada a Admin) no ve el elemento del menú. */
(function(root){
  'use strict';
  if(!root||!root.document)return;
  var usersMode=false;
  var USERS_ICON='<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M2 21v-1a6 6 0 0 1 9.5-4.9"/><circle cx="18" cy="17" r="2.5"/><path d="M18 12.5v2M18 19.5v2M22.5 17h-2M15.5 17h-2M21.2 13.8l-1.4 1.4M16.2 18.8l-1.4 1.4M21.2 20.2l-1.4-1.4M16.2 15.2l-1.4-1.4"/>';
  function canUsers(){try{return typeof can==='function'&&!!can('users');}catch(_){return false;}}
  function markNav(){
    if(!usersMode)return;
    var list=root.document.querySelectorAll('.nav-btn');
    for(var i=0;i<list.length;i++){var b=list[i],on=b.dataset.id==='users';b.classList.toggle('active',on);b.setAttribute('aria-current',on?'page':'false');}
    var t=root.document.getElementById('pageTitle'),s=root.document.getElementById('pageSub');
    if(t)t.textContent='Usuarios';
    if(s)s.textContent='Cuentas internas, grupos y permisos. Solo Administración.';
  }
  function install(){
    if(typeof navItems==='undefined'||typeof staffCanView!=='function'||typeof setView!=='function'||typeof renderSettings!=='function')return false;
    if(root.__pulzzoUsuariosV72)return true;root.__pulzzoUsuariosV72=true;
    if(!navItems.some(function(n){return n.id==='users';})){var at=navItems.findIndex(function(n){return n.id==='settings';});navItems.splice(at<0?navItems.length:at,0,{id:'users',label:'Usuarios',icon:'usersAdmin',capability:'users'});}
    var origIcon=backofficeNavIcon;
    backofficeNavIcon=function(name){if(name==='usersAdmin'){var base=origIcon('people');return base?base.replace(/(<svg[^>]*>)[\s\S]*(<\/svg>)$/,'$1'+USERS_ICON+'$2'):'';}return origIcon.apply(this,arguments);};
    var origCanView=staffCanView;
    staffCanView=function(id){if(id==='users')return canUsers();return origCanView.apply(this,arguments);};
    var origSetView=setView;
    setView=function(id,options){
      if(id==='users'){
        if(!canUsers())return origSetView.call(this,'users',options||{});
        usersMode=true;try{configTab='staff';}catch(_){}
        var r=origSetView.call(this,'settings',options||{});
        if(r===false){usersMode=false;return r;}
        markNav();return r;
      }
      usersMode=false;
      if(id==='settings'){try{if(configTab==='staff')configTab='product';}catch(_){}}
      return origSetView.apply(this,arguments);
    };
    var origRenderSettings=renderSettings;
    renderSettings=function(){
      if(usersMode&&currentView==='settings'){
        if(!canUsers()){usersMode=false;return origRenderSettings.apply(this,arguments);}
        var host=root.document.getElementById('settings');
        if(host){host.innerHTML='<div class="v72-usuarios" data-usuarios-v72><div id="staffAdministration"></div></div>';}
        if(typeof renderStaffAdministration==='function')renderStaffAdministration();
        markNav();return;
      }
      return origRenderSettings.apply(this,arguments);
    };
    var origRenderNav=renderNav;
    renderNav=function(){var r=origRenderNav.apply(this,arguments);if(usersMode&&!canUsers())usersMode=false;markNav();return r;};
    try{if(root.document.getElementById('nav')&&typeof staffCurrentSession==='function'&&staffCurrentSession())renderNav();}catch(_){}
    return true;
  }
  root.PulzzoUsuariosV72={install:install,isUsersMode:function(){return usersMode;}};
  install();
})(typeof window!=='undefined'?window:globalThis);
