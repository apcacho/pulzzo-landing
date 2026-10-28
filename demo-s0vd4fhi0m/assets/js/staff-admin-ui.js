/* Staff controls for the local backoffice demo. No email delivery or server account provisioning. */
(function(root){
  'use strict';
  let selectedUser='', selectedRole='', tab='users', revision=0, invitation=null, saving=false, inviteEpoch=0;
  root.addEventListener?.('pagehide',()=>{inviteEpoch++;});
  root.addEventListener?.('keydown',event=>{if(event&&event.key==='Escape'&&editing&&root.PulzzoStaffAdminUI){const c=root.document?.getElementById?.('staffActiveConfirm');if(c&&c.dataset.open==='1')root.PulzzoStaffAdminUI.confirmActive(false);else root.PulzzoStaffAdminUI.closeEditor();}});
  root.addEventListener?.('hashchange',()=>{editing=false;});
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const access=()=>root.PulzzoStaffAccess;
  const scopeLabel={none:'Sin acceso',own:'Solo propios',all:'Todos'};
  const resourceLabel={crm:'CRM',patients:'Pacientes',providers:'Proveedores',documents:'Documentos',portfolio:'Cartera',operations:'Operación',staff:'Administración'};
  function current(){const actor=staffCurrentSession();if(!actor||!access().can(actor,'users'))throw Error('Solo Admin puede administrar usuarios y roles.');return actor;}
  function message(text){toast(text);const output=document.getElementById('staffMessage');if(output)output.textContent=text;}
  function repaint(){if(!staffSynchronizeSession()){message('Tu acceso cambió. Inicia sesión nuevamente.');return;}renderStaffAdministration();}
  function selectedRoles(){return Array.from(document.querySelectorAll('[data-staff-user-role]:checked')).map(input=>input.value);}
  // v36e: visual redesign only (same API and permissions). Styles reuse backoffice tokens.
  let rstep=1, rarea='', creatingRole=false, pendingOv={};
  let editing=false, step=1, view={users:{q:'',group:'',status:'',page:1,size:10},audit:{q:'',action:'',page:1,size:10},roles:{q:'',page:1,size:10}};
  const PAGE_SIZES=[10,20,50,100];
  const areaLabel={crm:'CRM',patients:'Solicitudes y pacientes',providers:'Doctores y clínicas',documents:'Documentos',portfolio:'Cartera',operations:'Operación',staff:'Administración'};
  const auditLabels={user_created:'Cuenta creada',user_updated:'Cuenta actualizada',user_permission_changed:'Permiso individual cambiado',approval_limits_updated:'Topes de aprobación actualizados',forgiveness_limits_updated:'Tope de condonación actualizado',payment_options_updated:'Pagos semanales actualizados',role_updated:'Grupo actualizado',role_created:'Grupo creado',invitation_created:'Invitación simulada generada',invitation_accepted:'Invitación aceptada',policy_updated:'Política actualizada'};
  // v72: fechas del historial como DD/MM/AAAA HH:mm en hora del centro de México.
  const fmtDate=v=>{try{const d=new Date(v);if(v==null||v===''||!Number.isFinite(d.getTime()))return String(v||'');const p={};for(const x of new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d))p[x.type]=x.value;return p.day+'/'+p.month+'/'+p.year+' '+p.hour+':'+p.minute+' CDMX';}catch(_){return String(v||'');}};
  // v72: pendientes del CRM a nombre de una cuenta (clientes asignados y tareas abiertas). Solo lectura.
  function crmPending(userId){const out={contacts:0,tasks:0};try{const raw=root.localStorage&&root.localStorage.getItem('pulzzo_crm_assisted_demo_v1');if(!raw)return out;const st=JSON.parse(raw)||{},ids=new Set();for(const c of Object.values(st.contacts||{}))if(c&&c.assignedKam===userId&&!c.deletedAt&&!c.archivedAt){ids.add(c.id);out.contacts++;}for(const t of Object.values(st.tasks||{}))if(t&&t.status==='open'&&ids.has(t.contactId))out.tasks++;}catch(_){}return out;}
  function pendingHtml(user){if(!user||user.active)return '';const p=crmPending(user.id);if(!p.contacts&&!p.tasks)return '<p class="cfg-helper" data-user-pending="0">Sin clientes ni tareas abiertas a su nombre en el CRM.</p>';return `<div class="sx-pending" data-user-pending="${p.contacts+p.tasks}" role="status"><strong>Falta asignar responsable</strong><span>${p.contacts} ${p.contacts===1?'cliente':'clientes'} y ${p.tasks} ${p.tasks===1?'tarea abierta':'tareas abiertas'} siguen a nombre de esta cuenta inactiva. En el CRM aparecen como «· inactivo» hasta reasignarlos.</span><button type="button" class="sx-btn sm" onclick="PulzzoStaffAdminUI.reassignInCrm('${esc(user.id)}')">Reasignar en CRM</button></div>`;}
  function userHistoryHtml(user){if(!user)return '';let entries=[];try{entries=access().listAudit(current()).filter(e=>e.subjectId===user.id);}catch(_){entries=[];}const ctx=auditContext();
    return `<section class="sx-uhist" data-user-history="${esc(user.id)}"><h4>Historial de esta cuenta</h4><p class="cfg-helper">Quién cambió qué y cuándo (hora del centro de México). Las cuentas no se borran.</p>${entries.length?`<div class="sx-list">${entries.slice(0,30).map(e=>`<article class="sx-log"><span class="dot"></span><div class="sx-main"><strong>${esc(auditLabels[e.action]||'Movimiento de personal')}</strong><small>${esc(fmtDate(e.at))} · <span class="sx-author" title="ID ${esc(e.actorId)}">${esc(e.actorName)}</span></small>${auditChanges(e,ctx)}</div></article>`).join('')}</div>`:'<p class="sx-empty">Sin movimientos registrados.</p>'}</section>`;}
  const initials=name=>String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const money=v=>v==null?'Sin tope':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(v);
  function ensureStyles(){
    if(typeof document.createElement!=='function'||!document.head||document.getElementById?.('sxStaffStyles')?.tagName)return;
    const style=document.createElement('style');style.id='sxStaffStyles';style.textContent=`
.sx{display:flex;flex-direction:column;gap:24px;font-family:var(--font-body);color:var(--navy)}
.sx-change{display:block;font-size:.82rem;color:var(--slate);margin-top:4px}
.sx h3,.sx h4{font-family:var(--font-display);color:var(--navy);margin:0}.sx h3{font-size:1.15rem}.sx h4{font-size:1rem}
.sx-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.sx-head p{color:var(--muted);margin-top:4px;max-width:680px}
.sx-pending{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:12px 0;padding:12px 14px;border:1px solid #F5C2BE;background:#FEF3F2;border-radius:12px;font-size:.88rem;color:var(--navy)}.sx-pending strong{color:#B42318}.sx-uhist{margin-top:18px;border-top:1px solid var(--line);padding-top:14px}.sx-uhist .sx-list{max-height:280px;overflow:auto}.sx-rowbtns{display:flex;gap:6px;flex-wrap:wrap}
.sx-note{background:var(--aqua-bg);border:1px solid #BDEFF2;border-radius:14px;padding:14px 18px;color:var(--slate);font-size:.9rem}
.sx-tabs{display:flex;gap:6px;background:var(--white);border:1px solid var(--line2);border-radius:14px;padding:6px;width:fit-content;max-width:100%;overflow-x:auto}
.sx-tab{border:0;background:transparent;padding:10px 16px;border-radius:10px;font-weight:600;color:var(--muted);cursor:pointer;white-space:nowrap}.sx-tab.active{background:var(--navy);color:var(--white)}
.sx-card{background:var(--white);border:1px solid var(--line2);border-radius:18px;padding:24px;display:flex;flex-direction:column;gap:18px}
.sx-toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}.sx-toolbar .sx-field{flex:1 1 180px}.sx-toolbar .sx-field.grow{flex:2 1 260px}
.sx-field{display:flex;flex-direction:column;gap:6px;font-size:.82rem;font-weight:600;color:var(--muted)}
.sx-field input,.sx-field select{height:44px;border:1px solid var(--line);border-radius:12px;padding:0 14px;font:inherit;font-weight:500;color:var(--navy);background:var(--white);width:100%}
.sx-field input:focus,.sx-field select:focus{outline:2px solid var(--aqua);outline-offset:1px}
.sx-btn{height:44px;padding:0 18px;border-radius:12px;border:1px solid var(--line);background:var(--white);color:var(--navy);font-weight:600;cursor:pointer;white-space:nowrap}
.sx-btn.primary{background:var(--aqua);border-color:var(--aqua);color:var(--midnight)}.sx-btn.dark{background:var(--navy);border-color:var(--navy);color:var(--white)}.sx-btn.sm{height:36px;padding:0 12px;font-size:.85rem}
.sx-btn.danger{background:var(--red,#C0392B);border-color:var(--red,#C0392B);color:#fff}.sx-confirm-wrap{position:fixed;inset:0;z-index:1300;background:rgba(3,10,24,.45);display:none;align-items:center;justify-content:center;padding:18px}.sx-confirm-wrap[data-open="1"]{display:flex}.sx-confirm{background:var(--white);border-radius:18px;padding:24px;max-width:440px;width:100%;display:grid;gap:12px;border:1px solid var(--line2)}.sx-confirm h4{margin:0;font-family:var(--font-display);color:var(--navy)}.sx-confirm p{margin:0;color:var(--muted);font-size:14px}.sx-confirm .sx-toolbar{justify-content:flex-end}
.sx-btn:disabled{opacity:.45;cursor:not-allowed}
.sx-list{display:flex;flex-direction:column;gap:10px}
.sx-row{display:flex;align-items:center;gap:16px;padding:16px 18px;border:1px solid var(--line2);border-radius:14px;background:var(--white)}
.sx-row:hover{border-color:var(--aqua)}.sx-row.selected{border-color:var(--aqua);background:var(--aqua-bg)}
.sx-avatar{width:44px;height:44px;border-radius:50%;background:var(--navy2);color:var(--white);display:grid;place-items:center;font-weight:700;flex:none}
.sx-main{flex:1;min-width:0}.sx-main strong{display:block}.sx-main small{color:var(--muted);display:block;overflow:hidden;text-overflow:ellipsis}
.sx-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.sx-badge{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;font-size:.76rem;font-weight:600;background:var(--line2);color:var(--slate)}
.sx-badge.aqua{background:var(--aqua-bg);color:#0B7C86}.sx-badge.green{background:var(--green-bg);color:var(--green)}.sx-badge.amber{background:var(--amber-bg);color:#92400E}.sx-badge.red{background:var(--red-bg);color:var(--red)}.sx-badge.navy{background:var(--navy);color:var(--white)}
.sx-pager{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:.88rem}.sx-pager .sx-field{flex-direction:row;align-items:center}.sx-pager select{width:auto;height:38px}.sx-pager{margin-top:16px;padding-top:14px;border-top:1px solid var(--line2)}.sx-pager .sx-toolbar{align-items:center;gap:8px}.sx-pager .sx-toolbar .sx-field{flex:0 0 auto;gap:8px}.sx-pager .sx-field span{margin:0;white-space:nowrap}
.sx-pseg.s2{grid-template-columns:repeat(2,1fr);width:264px;justify-self:end}.sx-ownhelp{margin:12px 0 4px}.sx-pgap{border-left:1px solid var(--line);background:var(--bg)}
.sx-req{color:var(--red,#C0392B);font-weight:700}.sx-field.invalid input{border-color:var(--red,#C0392B);outline:1px solid var(--red,#C0392B)}.sx-err{color:var(--red,#C0392B);font-size:.8rem;font-weight:600;margin:0}.sx-err[hidden]{display:none}
.sx-ovlist{display:flex;flex-direction:column;gap:18px}.sx-ovarea h5,.sx-effarea h5{margin:0 0 6px;font-family:var(--font-display);font-size:.9rem;color:var(--navy);display:flex;justify-content:space-between}.sx-effarea h5 span{color:var(--muted);font-weight:500;font-size:.78rem}
.sx-ovrow{display:flex;justify-content:space-between;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line2)}.sx-ovmeta{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.sx-ovscope{height:34px;border:1px solid var(--line);border-radius:10px;padding:0 8px;font:inherit;font-size:.8rem}
.sx-ovexp{display:flex;align-items:center;gap:6px;font-size:.75rem;color:var(--muted)}.sx-ovexp input{height:34px;border:1px solid var(--line);border-radius:10px;padding:0 8px;font:inherit;font-size:.8rem}
.sx-eff{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}.sx-effarea ul{list-style:none;margin:0;padding:0}.sx-effarea li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line2);font-size:.86rem}.sx-effarea li small{color:var(--muted)}.sx-effarea li.off{color:var(--muted)}
.sx-dot{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:.7rem;border:1px solid var(--line);color:var(--midnight)}.sx-effarea li.on .sx-dot{background:var(--aqua);border-color:var(--aqua)}
.sx-empty{padding:32px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:14px}
.sx-overlay{position:fixed;inset:0;background:rgba(3,10,24,.45);z-index:900;display:flex;justify-content:flex-end}
.sx-panel{width:min(620px,100%);height:100%;background:var(--bg);display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(3,10,24,.25)}
.sx-panel-head{background:var(--white);padding:22px 26px;border-bottom:1px solid var(--line2);display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.sx-steps{display:flex;gap:8px;padding:14px 26px;background:var(--white);border-bottom:1px solid var(--line2);overflow-x:auto}
.sx-step{display:flex;align-items:center;gap:8px;border:0;background:transparent;color:var(--muted);font-weight:600;padding:8px 12px;border-radius:10px;cursor:pointer;white-space:nowrap}
.sx-step b{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--line2);font-size:.78rem}.sx-step.active{background:var(--aqua-bg);color:var(--navy)}.sx-step.active b{background:var(--aqua);color:var(--midnight)}
.sx-panel-body{flex:1;overflow:auto;padding:24px 26px;display:flex;flex-direction:column;gap:18px}
.sx-panel-foot{background:var(--white);border-top:1px solid var(--line2);padding:16px 26px;display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap}
.sx-pane{display:none;flex-direction:column;gap:16px}.sx-pane.active{display:flex}
.sx-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.sx-chips{display:flex;flex-wrap:wrap;gap:10px}
.sx-chip{position:relative;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border:1px solid var(--line);border-radius:999px;background:var(--white);font-weight:600;cursor:pointer}
.sx-chip input{position:absolute;opacity:0;pointer-events:none}.sx-chip:has(input:checked){background:var(--navy);border-color:var(--navy);color:var(--white)}
.sx-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.sx-sum div{background:var(--white);border:1px solid var(--line2);border-radius:12px;padding:12px 14px}.sx-sum small{display:block;color:var(--muted);font-size:.75rem;font-weight:600}.sx-sum span{font-weight:700}
.sx-split{display:grid;grid-template-columns:320px 1fr;gap:24px;align-items:start}
.sx-rlayout{display:flex;flex-direction:column;gap:24px}.sx-gsearch{min-width:240px}
.sx-grow{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:2px}
.sx-gcard{display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;padding:14px 16px;border:1px solid var(--line2);border-radius:14px;background:var(--white);cursor:pointer;color:var(--navy);min-height:78px}
.sx-gcard strong{font-family:var(--font-display);font-size:.95rem;line-height:1.25}.sx-gcard small{color:var(--muted);font-size:.78rem}
.sx-gcard:hover{border-color:var(--aqua)}.sx-gcard.selected{border-color:var(--aqua);background:var(--aqua-bg);outline:1px solid var(--aqua)}
.sx-gnew{border-style:dashed;justify-content:center}.sx-gnew strong{color:var(--aqua-dark,var(--navy))}
.sx-rwiz{gap:18px}.sx-rsteps{padding:0;border:0;background:transparent}.sx-rpane{display:none;flex-direction:column;gap:16px}.sx-rpane.active{display:flex}
.sx-rname{max-width:480px}
.sx-atabs{display:flex;gap:6px;overflow-x:auto;border-bottom:1px solid var(--line2);padding-bottom:0}
.sx-atab{display:flex;align-items:center;gap:8px;border:0;border-bottom:2px solid transparent;background:transparent;padding:10px 12px;font-weight:600;color:var(--muted);cursor:pointer;white-space:nowrap;margin-bottom:-1px}
.sx-atab.active{color:var(--navy);border-bottom-color:var(--aqua)}.sx-acount{font-size:.72rem;font-weight:600;color:var(--muted);background:var(--line2);border-radius:999px;padding:2px 8px}
.sx-apane{display:none}.sx-apane.active{display:block}
.sx-prow{display:grid;grid-template-columns:minmax(0,1fr) 396px;align-items:center;gap:16px}
.sx-phead{grid-template-columns:minmax(0,1fr) 132px 132px 132px;gap:0;padding:12px 0 8px;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line2)}.sx-phead span:not(:first-child){text-align:center}
.sx-prow{padding:12px 0;border-bottom:1px solid var(--line2)}.sx-plabel{font-weight:500;color:var(--navy)}
.sx-pseg{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--white)}
.sx-pseg button{border:0;border-left:1px solid var(--line);background:transparent;height:36px;font-size:.8rem;font-weight:600;color:var(--muted);cursor:pointer}.sx-pseg button:first-child{border-left:0}
.sx-pseg button.on{background:var(--navy);color:var(--white)}.sx-pseg button.on[data-scope="all"]{background:var(--aqua);color:var(--midnight)}.sx-pseg button.on[data-scope="none"]{background:var(--line2);color:var(--navy)}
.sx-pseg button:disabled{cursor:not-allowed;opacity:.4}.sx-pseg button:focus-visible{outline:2px solid var(--navy);outline-offset:-2px}
.sx-tnote{margin:0}
.sx-rpane #staffApprovalLimits{padding:0;border:0}
.sx-rfoot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid var(--line2);padding-top:16px}
@media(max-width:900px){.sx-prow{grid-template-columns:1fr;gap:8px}.sx-pseg.s2{width:auto;justify-self:stretch}.sx-pager{flex-direction:column;align-items:flex-start}.sx-grow{grid-template-columns:repeat(2,minmax(0,1fr))}.sx-gsearch{min-width:0;width:100%}.sx-rfoot .sx-toolbar{width:100%}.sx-rfoot .sx-btn{flex:1}}
.sx-group{text-align:left;width:100%;cursor:pointer;flex-direction:column;align-items:flex-start;gap:6px}
.sx-area{border:1px solid var(--line2);border-radius:14px;background:var(--white)}.sx-area>summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-family:var(--font-display)}
.sx-area>summary::-webkit-details-marker{display:none}.sx-area[open]>summary{border-bottom:1px solid var(--line2)}
.sx-perm{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 18px;flex-wrap:wrap}.sx-perm+.sx-perm{border-top:1px solid var(--line2)}.sx-perm span{font-weight:500}
.sx-seg{display:inline-flex;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:3px;gap:2px}
.sx-seg button{border:0;background:transparent;padding:7px 12px;border-radius:8px;font-size:.8rem;font-weight:600;color:var(--muted);cursor:pointer}.sx-seg button.on{background:var(--white);color:var(--navy);box-shadow:0 1px 2px rgba(3,10,24,.12)}.sx-seg button.on[data-scope="all"]{background:var(--aqua);color:var(--midnight)}.sx-seg button:disabled{cursor:not-allowed;opacity:.55}
.sx-limit{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.sx-limit .lvl{border:1px solid var(--line2);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px}
.sx-limit .lvl.kam{background:var(--bg)}.sx-limit .lvl strong{font-size:1.4rem;font-family:var(--font-display)}
.sx-log{display:flex;gap:14px;padding:14px 18px;border:1px solid var(--line2);border-radius:14px;background:var(--white);align-items:flex-start}.sx-log .dot{width:10px;height:10px;border-radius:50%;background:var(--aqua);margin-top:7px;flex:none}
.sx-ov{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--line2);border-radius:12px;background:var(--white);flex-wrap:wrap}
@media(max-width:900px){.sx-split{grid-template-columns:1fr}.sx-card{padding:18px}.sx-row{align-items:flex-start;flex-wrap:wrap}.sx-row .sx-btn{width:100%}.sx-panel-head,.sx-panel-body,.sx-panel-foot,.sx-steps{padding-left:18px;padding-right:18px}.sx-perm{flex-direction:column;align-items:flex-start}.sx-seg{width:100%}.sx-seg button{flex:1}.sx-step span{display:none}}`;
    document.head.appendChild(style);
  }
  function fmtPhone(v){const P=root.PulzzoPhone;return P?P.format(v):v;}
  function pageOf(list,state){const pages=Math.max(1,Math.ceil(list.length/state.size));if(state.page>pages)state.page=pages;if(state.page<1)state.page=1;return {rows:list.slice((state.page-1)*state.size,state.page*state.size),pages};}
  function pagerHtml(kind,total,pages){const s=view[kind];return `<div class="sx-pager"><span>${total} resultado${total===1?'':'s'} · página ${s.page} de ${pages}</span><div class="sx-toolbar"><label class="sx-field" for="sx-${kind}-size"><span>Por página</span><select id="sx-${kind}-size" data-sx-size="${kind}" onchange="PulzzoStaffAdminUI.setPageSize('${kind}',this.value)">${PAGE_SIZES.map(n=>`<option value="${n}" ${s.size===n?'selected':''}>${n}</option>`).join('')}</select></label><button class="sx-btn sm" type="button" ${s.page<=1?'disabled':''} onclick="PulzzoStaffAdminUI.setPage('${kind}',${s.page-1})">Anterior</button><button class="sx-btn sm" type="button" ${s.page>=pages?'disabled':''} onclick="PulzzoStaffAdminUI.setPage('${kind}',${s.page+1})">Siguiente</button></div></div>`;}
  function statusOf(u){return !u.active?'inactive':u.status==='invited'?'invited':'active';}
  const statusBadge={active:'<span class="sx-badge green">Activa</span>',invited:'<span class="sx-badge amber">Invitación pendiente</span>',inactive:'<span class="sx-badge red">Inactiva</span>'};
  function usersListHtml(users,roles){
    const s=view.users,q=s.q.trim().toLowerCase(),label=id=>(roles.find(r=>r.id===id)||{label:id}).label;
    const list=users.filter(u=>(!q||(u.name+' '+u.email).toLowerCase().includes(q))&&(!s.group||u.roles.includes(s.group))&&(!s.status||statusOf(u)===s.status));
    const {rows,pages}=pageOf(list,s);
    return (rows.length?`<div class="sx-list">${rows.map(u=>`<article class="sx-row ${u.id===selectedUser&&editing?'selected':''}"><div class="sx-avatar">${esc(initials(u.name))}</div><div class="sx-main"><strong>${esc(u.name)}</strong><small>${esc(u.email)}${u.phone?' · '+esc(fmtPhone(u.phone)):''}</small><div class="sx-badges">${u.roles.map(r=>`<span class="sx-badge aqua">${esc(label(r))}</span>`).join('')}${statusBadge[statusOf(u)]}${Object.keys(u.overrides||{}).length?'<span class="sx-badge">+ permisos individuales</span>':''}${(p=>!u.active&&(p.contacts||p.tasks)?`<span class="sx-badge red" data-row-pending>Falta asignar responsable · ${p.contacts+p.tasks}</span>`:'')(u.active?{contacts:0,tasks:0}:crmPending(u.id))}</div></div><div class="sx-rowbtns"><button type="button" class="sx-btn sm" data-staff-user="${esc(u.id)}" onclick="PulzzoStaffAdminUI.selectUser(this.dataset.staffUser)">Editar</button>${u.active?'':`<button type="button" class="sx-btn sm" data-staff-reactivate="${esc(u.id)}" onclick="PulzzoStaffAdminUI.reactivate(this.dataset.staffReactivate)">Reactivar</button>`}</div></article>`).join('')}</div>`:'<p class="sx-empty">No hay cuentas con esos filtros.</p>')+pagerHtml('users',list.length,pages);
  }
  function permissionPreview(roles){
    if(!roles.length)return '<p class="sx-empty">Selecciona uno o más grupos para ver el resumen.</p>';void scopeLabel;
    const permissions=access().previewRoles(current(),roles),catalog=access().capabilityCatalog(),scopeBadge=s=>s==='all'?'aqua':s==='own'?'amber':'';
    const eff=Object.assign({},permissions.grants);for(const [cap,o] of Object.entries(pendingOv)){if(o.expiresAt&&Date.parse(o.expiresAt)<=Date.now())continue;if(o.scope==='none')delete eff[cap];else eff[cap]=o.scope;}
    const areas=[...new Set(catalog.map(c=>c.resource))];
    return `<div class="sx-eff">${areas.map(area=>{const caps=catalog.filter(c=>c.resource===area),n=caps.filter(c=>eff[c.id]).length;return `<section class="sx-effarea"><h5>${esc(areaLabel[area]||area)}<span>${n} de ${caps.length}</span></h5><ul>${caps.map(c=>`<li class="${eff[c.id]?'on':'off'}"><span class="sx-dot" aria-hidden="true">${eff[c.id]?'✓':''}</span><span>${esc(c.label)}</span><small>${eff[c.id]?esc(scopeLabel[eff[c.id]]):'Sin acceso'}${pendingOv[c.id]?' · individual':''}</small></li>`).join('')}</ul></section>`;}).join('')}</div><p class="cfg-helper">Los grupos se suman por área y los permisos individuales (paso 3) se aplican además. Para recibir asignaciones del CRM la cuenta debe incluir el grupo KAM activo.</p>`;
  }
  // v36i: individual permissions as on/off switches, usable while creating; saved together with the account.
  function groupGrants(roles){try{return roles.length?access().previewRoles(current(),roles).grants:{};}catch(_){return {};}}
  function overridesHtml(user,roles){
    const catalog=access().capabilityCatalog(),grants=groupGrants(roles||[]),now=Date.now(),areas=[...new Set(catalog.map(c=>c.resource))];
    const row=cap=>{const group=grants[cap.id]||'none',ov=pendingOv[cap.id],eff=ov?ov.scope:group,on=eff!=='none',locked=cap.adminOnly,lapsed=ov&&ov.expiresAt&&Date.parse(ov.expiresAt)<=now,canOwn=cap.scopes.includes('own');
      const origin=ov?(ov.scope==='none'?'<span class="sx-badge red">Quitado solo a esta cuenta</span>':'<span class="sx-badge aqua">Individual</span>'):group!=='none'?'<span class="sx-badge">Por grupo</span>':'';
      const local=(v=>v?new Date(Date.parse(v)-new Date(Date.parse(v)).getTimezoneOffset()*60000).toISOString().slice(0,16):'')(ov&&ov.expiresAt);
      return `<div class="sx-ovrow ${ov?'is-ov':''}" data-staff-override="${esc(cap.id)}"><label class="pz-switch"><input type="checkbox" role="switch" data-ov-cap="${esc(cap.id)}" ${on?'checked':''} ${locked?'disabled':''} onchange="PulzzoStaffAdminUI.ovToggle(this.dataset.ovCap,this.checked)"><span class="pz-switch-track" aria-hidden="true"></span><span class="pz-switch-text">${esc(cap.label)}</span></label><div class="sx-ovmeta">${locked?'<span class="sx-badge">Reservado a Admin</span>':origin}${lapsed?'<span class="sx-badge red">Vencido</span>':''}${on&&canOwn&&!locked?`<select class="sx-ovscope" aria-label="Alcance de ${esc(cap.label)}" title="Solo propios: ve solo los clientes que tiene asignados" onchange="PulzzoStaffAdminUI.ovScope('${esc(cap.id)}',this.value)"><option value="all" ${eff==='all'?'selected':''}>Todos</option><option value="own" ${eff==='own'?'selected':''}>Solo propios</option></select>`:''}${ov?`<label class="sx-ovexp"><span>Vence (opcional)</span><input type="datetime-local" data-ov-exp="${esc(cap.id)}" value="${esc(local)}" onchange="PulzzoStaffAdminUI.ovExpiry(this.dataset.ovExp,this.value)"></label>`:''}</div></div>`;};
    return `<section id="staffOverrides" class="sx-ovlist"><p class="sx-note">Activa o quita un permiso solo para esta cuenta, además de sus grupos. Con vencimiento deja de aplicar solo. Se guarda junto con la cuenta y queda en el historial.</p>${areas.map(area=>`<div class="sx-ovarea"><h5>${esc(areaLabel[area]||area)}</h5>${catalog.filter(c=>c.resource===area).map(row).join('')}</div>`).join('')}</section>`;
  }
  function ovRefresh(){const host=document.getElementById('staffOverridesHost');if(host)host.innerHTML=overridesHtml(null,selectedRoles());}
  function userEditor(user,roles){
    const selected=user?.roles||[],steps=['Datos','Grupos','Permisos individuales','Resumen'];
    return `<div class="sx-overlay" role="dialog" aria-modal="true" aria-label="${user?'Editar cuenta':'Crear cuenta interna'}" onclick="if(event.target===this)PulzzoStaffAdminUI.closeEditor()"><div class="sx-panel"><div class="sx-panel-head"><div><h3>${user?esc(user.name):'Crear cuenta interna'}</h3><p class="cfg-helper">${user?`${statusBadge[statusOf(user)]} · ID ${esc(user.id)}`:'En producción entrará con Google usando este correo (solo correos registrados aquí). En esta pantalla no se capturan contraseñas.'}</p></div><button type="button" class="sx-btn sm" data-sx-close onclick="PulzzoStaffAdminUI.closeEditor()" aria-label="Cerrar">✕</button></div>
<nav class="sx-steps">${steps.map((t,i)=>`<button type="button" class="sx-step ${step===i+1?'active':''}" onclick="PulzzoStaffAdminUI.setStep(${i+1})"><b>${i+1}</b><span>${t}</span></button>`).join('')}</nav>
<div class="sx-panel-body">
<section class="sx-pane ${step===1?'active':''}"><h4>1. Datos</h4><div class="sx-grid2"><label class="sx-field" for="staffName" data-required><span>Nombre <b class="sx-req" aria-hidden="true">*</b></span><input id="staffName" maxlength="100" value="${esc(user?.name||'')}" autocomplete="off"></label><label class="sx-field" for="staffEmail" data-required><span>Correo interno <b class="sx-req" aria-hidden="true">*</b></span><input id="staffEmail" type="email" maxlength="254" value="${esc(user?.email||'')}" autocomplete="off"></label><label class="sx-field" for="staffPhone" data-required><span>Celular <b class="sx-req" aria-hidden="true">*</b></span><input id="staffPhone" type="tel" inputmode="numeric" maxlength="20" data-pz-phone value="${esc(fmtPhone(user?.phone||''))}" autocomplete="off"></label></div><p class="cfg-helper"><b class="sx-req">*</b> Los tres datos son obligatorios.</p>${user?`<label class="pz-switch" for="staffActive"><input id="staffActive" type="checkbox" role="switch" ${user.active?'checked':''} data-was-active="${user.active?'1':'0'}" onchange="PulzzoStaffAdminUI.activeChanged(this)"><span class="pz-switch-track" aria-hidden="true"></span><span class="pz-switch-text">Cuenta activa</span></label><div class="sx-confirm-wrap" id="staffActiveConfirm" data-open="0"><div class="sx-confirm" role="alertdialog" aria-modal="true" aria-labelledby="staffActiveConfirmTitle"><h4 id="staffActiveConfirmTitle">¿Desactivar la cuenta de ${esc(user.name)}?</h4><p>Se cerrarán sus sesiones y sus enlaces de referido dejarán de funcionar. Conserva su historial y puedes reactivarla después. El cambio se aplica al guardar.</p><div class="sx-toolbar"><button type="button" class="sx-btn" data-sx-confirm-cancel onclick="PulzzoStaffAdminUI.confirmActive(false)">Cancelar</button><button type="button" class="sx-btn danger" data-sx-confirm-ok onclick="PulzzoStaffAdminUI.confirmActive(true)">Sí, desactivar</button></div></div></div><p class="cfg-helper">Las cuentas no se borran: se desactivan, conservan su historial y sus enlaces de referido se desactivan. Cambiar correo, grupos o estado revoca sus sesiones.</p>${pendingHtml(user)}${userHistoryHtml(user)}`:''}</section>
<section class="sx-pane ${step===2?'active':''}"><h4>2. Grupos <b class="sx-req" aria-hidden="true">*</b></h4><p class="cfg-helper">Toca para activar. Los permisos de varios grupos se suman. Elige al menos uno.</p><p class="sx-err" id="staffRolesError" hidden>Falta este dato: elige al menos un grupo.</p><div class="sx-chips" role="group" aria-label="Grupos de permisos de esta cuenta">${roles.map(role=>`<label class="sx-chip"><input data-staff-user-role type="checkbox" value="${esc(role.id)}" ${selected.includes(role.id)?'checked':''} onchange="PulzzoStaffAdminUI.previewUser()"><span>${esc(role.label)}</span></label>`).join('')}</div></section>
<section class="sx-pane ${step===3?'active':''}"><h4>3. Permisos individuales</h4><div id="staffOverridesHost">${overridesHtml(user,selected)}</div></section>
<section class="sx-pane ${step===4?'active':''}"><h4>4. Resumen de permisos efectivos</h4><div id="staffPermissionPreview">${permissionPreview(selected)}</div></section>
</div>
<div class="sx-panel-foot"><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="sx-btn" data-sx-prev ${step<=1?'disabled':''} onclick="PulzzoStaffAdminUI.stepBy(-1)">Atrás</button><button type="button" class="sx-btn" data-sx-next ${step>=4?'disabled':''} onclick="PulzzoStaffAdminUI.stepBy(1)">Siguiente</button></div><div style="display:flex;gap:10px;flex-wrap:wrap">${user&&user.active?'<button type="button" class="sx-btn" onclick="PulzzoStaffAdminUI.inviteUser()">Generar invitación simulada</button>':''}<button type="button" class="sx-btn primary" onclick="PulzzoStaffAdminUI.saveUser()">${user?'Guardar cambios':'Crear cuenta'}</button></div></div>
</div></div>`;
  }
  function limitsHtml(actor){
    const l=access().getApprovalLimits(actor);
    return `<section class="sx-card" id="staffApprovalLimits"><div><h3>Topes de aprobación por monto</h3><p class="cfg-helper">Condonaciones y otras autorizaciones de dinero. Arriba del tope se escala a Administración.</p></div><div class="sx-limit"><div class="lvl kam"><small class="sx-badge red" style="width:fit-content">KAM</small><strong>No aprueba</strong><p class="cfg-helper">Un KAM nunca aprueba montos.</p></div><div class="lvl"><small class="sx-badge aqua" style="width:fit-content">Líder / gerente</small><strong>${esc(money(l.leader))}</strong><label class="sx-field" for="staffLimitLeader"><span>Tope en MXN</span><input id="staffLimitLeader" type="number" min="0" step="0.01" value="${l.leader==null?'':esc(l.leader)}" placeholder="Sin tope"></label></div><div class="lvl"><small class="sx-badge navy" style="width:fit-content">Administración</small><strong>${esc(money(l.admin))}</strong><label class="sx-field" for="staffLimitAdmin"><span>Tope en MXN (vacío = sin tope)</span><input id="staffLimitAdmin" type="number" min="0" step="0.01" value="${l.admin==null?'':esc(l.admin)}" placeholder="Sin tope"></label></div></div><div><button type="button" class="sx-btn primary" onclick="PulzzoStaffAdminUI.saveLimits()">Guardar topes</button></div></section>`;
  }
  // v36h: group create/edit wizard, full width: 1 Nombre, 2 Permisos (one area at a time), 3 Topes, 4 Resumen.
  function topesNote(role){const id=role&&role.id;return id==='admin'?'Administración aprueba montos hasta su tope (vacío = sin tope).':id==='leader'?'El líder aprueba montos hasta su tope; arriba se escala a Administración.':id==='kam'?'Un KAM nunca aprueba montos.':'Este grupo no aprueba montos. Solo Líder y Administración tienen topes; un KAM nunca aprueba montos.';}
  function permRow(role,cap,areaOwn){const value=role.grants[cap.id]||'none',locked=cap.adminOnly;return `<div class="sx-prow"><span class="sx-plabel">${esc(cap.label)}${locked?' <span class="sx-badge">Reservado a Admin</span>':''}</span><input type="hidden" id="staffGrant-${esc(cap.id)}" data-staff-grant="${esc(cap.id)}" data-area="${esc(cap.resource)}" value="${esc(value)}"><div class="sx-pseg ${areaOwn?'s3':'s2'}" role="radiogroup" aria-label="${esc(cap.label)}">${['none','own','all'].filter(sc=>sc!=='own'||areaOwn).map(sc=>sc==='own'&&!cap.scopes.includes('own')?'<span class="sx-pgap" aria-hidden="true"></span>':`<button type="button" role="radio" aria-checked="${value===sc}" data-scope="${sc}" data-cap="${esc(cap.id)}" class="${value===sc?'on':''}" ${sc==='own'?'title="Solo propios: ve solo los clientes que tiene asignados"':''} ${locked||!cap.scopes.includes(sc)?'disabled':''} onclick="PulzzoStaffAdminUI.setGrant(this.dataset.cap,this.dataset.scope)">${esc(scopeLabel[sc])}</button>`).join('')}</div></div>`;}
  function roleEditor(role,actor){
    if(!role)return '<p class="sx-empty">Selecciona un grupo o crea uno nuevo.</p>';
    const caps=access().capabilityCatalog(),areas=[...new Set(caps.map(c=>c.resource))],isNew=!role.id;
    if(!areas.includes(rarea))rarea=areas[0];
    const count=area=>caps.filter(c=>c.resource===area&&(role.grants[c.id]||'none')!=='none').length;
    const steps=['Nombre','Permisos','Topes','Resumen'];
    return `<section class="sx-card sx-rwiz" id="sx-role-wizard" aria-label="${isNew?'Nuevo grupo':'Editar grupo'}"><div class="sx-head"><div><h3>${isNew?'Nuevo grupo':'Grupo '+esc(role.label)}</h3><p>${isNew?'Un grupo nuevo empieza sin permisos. Elige solo los que necesita.':'Los cambios aplican a todas las cuentas del grupo y revocan sus sesiones si cambia algún permiso.'}</p></div></div>
<nav class="sx-steps sx-rsteps">${steps.map((t,k)=>`<button type="button" class="sx-step sx-rstep ${rstep===k+1?'active':''}" data-rstep="${k+1}" onclick="PulzzoStaffAdminUI.setRoleStep(${k+1})"><b>${k+1}</b><span>${t}</span></button>`).join('')}</nav>
<section class="sx-rpane ${rstep===1?'active':''}"><label class="sx-field sx-rname" for="staffRoleLabel"><span>Nombre del grupo</span><input id="staffRoleLabel" maxlength="100" value="${esc(role.label)}" placeholder="Ej. Atención a clientes" autocomplete="off"></label></section>
<section class="sx-rpane ${rstep===2?'active':''}"><div class="sx-atabs" role="tablist" aria-label="Áreas de permisos">${areas.map(area=>{const n=caps.filter(c=>c.resource===area).length;return `<button type="button" role="tab" class="sx-atab ${area===rarea?'active':''}" aria-selected="${area===rarea}" data-atab="${esc(area)}" onclick="PulzzoStaffAdminUI.setArea(this.dataset.atab)">${esc(areaLabel[area]||area)}<span class="sx-acount" data-acount="${esc(area)}">${count(area)}/${n}</span></button>`;}).join('')}</div>${areas.map(area=>`<div class="sx-apane ${area===rarea?'active':''}" data-apane="${esc(area)}" role="tabpanel">${area==='crm'?'<p class="sx-note sx-ownhelp"><strong>Solo propios:</strong> ve solo los clientes que tiene asignados.</p>':''}${caps.filter(c=>c.resource===area).map(c=>permRow(role,c,caps.some(x=>x.resource===area&&x.scopes.includes('own')))).join('')}</div>`).join('')}</section>
<section class="sx-rpane ${rstep===3?'active':''}"><p class="sx-note sx-tnote">${esc(topesNote(role))}</p>${limitsHtml(actor)}</section>
<section class="sx-rpane ${rstep===4?'active':''}"><h4>Resumen</h4><div id="staffRolePreview" aria-live="polite">${roleGrantPreview(role.grants)}</div></section>
<footer class="sx-rfoot"><div class="sx-toolbar"><button type="button" class="sx-btn" data-sx-rprev ${rstep<=1?'disabled':''} onclick="PulzzoStaffAdminUI.roleStepBy(-1)">Atrás</button><button type="button" class="sx-btn" data-sx-rnext ${rstep>=4?'disabled':''} onclick="PulzzoStaffAdminUI.roleStepBy(1)">Siguiente</button></div><div class="sx-toolbar">${isNew?'<button type="button" class="sx-btn" onclick="PulzzoStaffAdminUI.cancelNewRole()">Cancelar</button>':''}<button class="sx-btn primary" type="button" onclick="PulzzoStaffAdminUI.saveRole()">${isNew?'Crear grupo':'Guardar grupo'}</button></div></footer></section>`;
  }
  function roleGrantPreview(grants){const caps=access().capabilityCatalog().filter(cap=>grants[cap.id]&&grants[cap.id]!=='none');return '<div class="sx-badges">'+(caps.map(cap=>`<span class="sx-badge ${grants[cap.id]==='all'?'aqua':'amber'}">${esc(cap.label)} · ${esc(scopeLabel[grants[cap.id]])}</span>`).join('')||'<span class="sx-badge">Sin permisos</span>')+'</div>';}
  function invitationHtml(){
    if(!invitation)return '';
    const url=new URL('backoffice.html',root.location.href);url.hash='staff-invite='+encodeURIComponent(invitation.token);
    return `<section class="cfg-impact-note"><h3>Invitación simulada lista</h3><p>${esc(invitation.email)} · vence ${esc(new Date(invitation.expiresAt).toLocaleString('es-MX'))}.</p><p>No se envió ningún correo. Este enlace solo funciona con el directorio local de este navegador. Quien reciba la invitación elige su propia contraseña de prueba; no debe usar una contraseña real.</p><label class="field" for="staffInvitationLink"><span>Enlace local de invitación</span><textarea id="staffInvitationLink" readonly>${esc(url.href)}</textarea></label><div class="action-bar"><button class="btn btn-secondary" type="button" onclick="PulzzoStaffAdminUI.copyInvitation()">Copiar enlace</button><a class="btn btn-secondary" href="${esc(url.href)}" target="_blank" rel="noopener">Abrir invitación simulada</a><button class="btn btn-secondary" type="button" onclick="PulzzoStaffAdminUI.dismissInvitation()">Cerrar enlace</button></div></section>`;
  }
  function formGrants(){return Object.fromEntries(Array.from(document.querySelectorAll('[data-staff-grant]')).map(input=>[input.dataset.staffGrant,input.value]));}
  function groupsListHtml(roles,users){
    const s=view.roles,q=s.q.trim().toLowerCase(),list=roles.filter(r=>!q||r.label.toLowerCase().includes(q)),{rows,pages}=pageOf(list,s);
    return `<div class="sx-head"><div><h3>Grupos</h3><p>Una cuenta puede tener varios grupos; sus permisos se suman.</p></div><label class="sx-field sx-gsearch" for="sx-roles-q"><span>Buscar grupo</span><input id="sx-roles-q" value="${esc(s.q)}" placeholder="Nombre del grupo" oninput="PulzzoStaffAdminUI.filter('roles','q',this.value)"></label></div><div id="sx-roles-list">${groupRowsHtml(rows,users)}${pagerHtml('roles',list.length,pages)}</div>`;
  }
  function groupRowsHtml(rows,users){return `<div class="sx-grow" role="list">${rows.map(r=>{const n=users.filter(u=>u.roles.includes(r.id)).length,c=Object.values(r.grants||{}).filter(x=>x!=='none').length;return `<button type="button" role="listitem" class="sx-gcard ${!creatingRole&&r.id===selectedRole?'selected':''}" data-staff-role="${esc(r.id)}" aria-pressed="${!creatingRole&&r.id===selectedRole}" onclick="PulzzoStaffAdminUI.selectRole(this.dataset.staffRole)"><strong>${esc(r.label)}</strong><small>${n} cuenta${n===1?'':'s'} · ${c} permiso${c===1?'':'s'}</small></button>`;}).join('')}${rows.length?'':'<p class="sx-empty">Sin grupos con ese nombre.</p>'}<button type="button" class="sx-gcard sx-gnew ${creatingRole?'selected':''}" data-sx-new-role onclick="PulzzoStaffAdminUI.newRole()"><strong>+ Nuevo grupo</strong><small>Empieza sin permisos</small></button></div>`;}
  // v66: el historial de personal muestra el cambio de permisos antes → después.
  // v66.1: el historial muestra nombres en español (grupos, cuentas, permisos), nunca IDs internos.
  function auditContext(){
    try{const actor=current(),roles=access().listRoles(actor),users=access().listUsers(actor);return {roles:Object.fromEntries(roles.map(r=>[r.id,r.label])),users:Object.fromEntries(users.map(u=>[u.id,u.name||u.email||'Cuenta'])),caps:Object.fromEntries(access().capabilityCatalog().map(c=>[c.id,c.label]))};}
    catch(_){return {roles:{},users:{},caps:{}};}
  }
  const subjectFallback={admin:'Admin',leader:'Líder / gerente KAM',kam:'KAM',operations:'Operaciones',risk:'Riesgo',portfolio:'Cartera / cobranza',provider:'Gestión de proveedores',readonly:'Solo lectura'};
  function roleName(ctx,id){return ctx.roles[id]||subjectFallback[id]||'Grupo eliminado';}
  function auditSubject(e,ctx){
    const id=e.subjectId;
    if(e.action==='approval_limits_updated')return 'Topes de aprobación';
    if(e.action==='forgiveness_limits_updated')return 'Tope de condonación';
    if(e.action==='payment_options_updated')return 'Frecuencia de pago';
    if(/^role_/.test(e.action)||e.action==='policy_updated')return 'Grupo '+roleName(ctx,id);
    if(/^(user_|invitation_)/.test(e.action))return 'Cuenta '+(ctx.users[id]||'eliminada');
    if(ctx.roles[id])return 'Grupo '+ctx.roles[id];
    if(ctx.users[id])return 'Cuenta '+ctx.users[id];
    return '';
  }
  function moneyOrNone(v){return v==null?'Sin tope':'$'+Number(v).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function auditChanges(e,ctx){
    try{
      ctx=ctx||auditContext();
      const labels=ctx.caps,cl=c=>labels[c]||'Permiso',sc=v=>scopeLabel[v||'none']||'—',b=e.before||{},a=e.after||{},out=[],rl=ids=>(ids||[]).map(id=>roleName(ctx,id)).join(', ')||'Sin grupo';
      if(e.action==='role_updated'||e.action==='role_created'){const bg=b.grants||{},ag=a.grants||{};for(const cap of [...new Set([...Object.keys(bg),...Object.keys(ag)])])if((bg[cap]||'none')!==(ag[cap]||'none'))out.push(cl(cap)+': '+sc(bg[cap])+' → '+sc(ag[cap]));if(b.label&&a.label&&b.label!==a.label)out.push('Nombre: '+b.label+' → '+a.label);if(e.action==='role_created'&&a.label&&!out.length)out.push('Nombre: '+a.label);}
      else if(e.action==='user_permission_changed'){const cap=a.capability||b.capability,be=b.entry,ae=a.entry;out.push(cl(cap)+' (individual): '+(be?sc(be.scope):'Según grupo')+' → '+(ae?sc(ae.scope):'Según grupo'));}
      else if(e.action==='user_created'){out.push('Grupos: '+rl(a.roles));}
      else if(e.action==='user_updated'){
        if(b.name!==a.name)out.push('Nombre: '+(b.name||'—')+' → '+(a.name||'—'));
        if(b.email!==a.email)out.push('Correo: '+(b.email||'—')+' → '+(a.email||'—'));
        if((b.phone||'')!==(a.phone||''))out.push('Teléfono: '+(b.phone||'—')+' → '+(a.phone||'—'));
        if(rl(b.roles)!==rl(a.roles))out.push('Grupos: '+rl(b.roles)+' → '+rl(a.roles));
        if(!!b.deactivatedAt!==!!a.deactivatedAt)out.push('Estado: '+(b.deactivatedAt?'Desactivada':'Activa')+' → '+(a.deactivatedAt?'Desactivada':'Activa'));
      }
      else if(e.action==='approval_limits_updated'){if(b.leader!==a.leader)out.push('Tope Líder KAM: '+moneyOrNone(b.leader)+' → '+moneyOrNone(a.leader));if(b.admin!==a.admin)out.push('Tope Admin: '+moneyOrNone(b.admin)+' → '+moneyOrNone(a.admin));}
      else if(e.action==='forgiveness_limits_updated'){if(b.leader!==a.leader)out.push('Tope gerente (condonación): '+moneyOrNone(b.leader)+' → '+moneyOrNone(a.leader));}
      else if(e.action==='payment_options_updated'){out.push('Permitir pagos semanales: '+(b.weekly?'Encendido':'Apagado')+' → '+(a.weekly?'Encendido':'Apagado'));}
      else if(e.action==='invitation_created'){if(a.expiresAt)out.push('Vence: '+fmtDate(a.expiresAt));}
      else if(e.action==='invitation_accepted'){out.push('Estado: Activa');}
      else if(e.action==='policy_updated'){
        const g=roleName(ctx,e.subjectId);
        for(const k of Object.keys(a))if(k!=='policyVersion'&&k!=='added'&&labels[k])out.push(cl(k)+' (grupo '+g+'): '+sc(b[k])+' → '+sc(a[k]));
        const shown=new Set(Object.keys(a).filter(k=>labels[k]));
        if(Array.isArray(a.added)){const rest=a.added.filter(c=>!shown.has(c));if(rest.length)out.push('Permisos agregados al grupo '+g+': '+rest.map(cl).join(', '));}
        else if(a.added&&typeof a.added==='object')for(const [rid,caps] of Object.entries(a.added))if(Array.isArray(caps)&&caps.length)out.push('Permisos agregados al grupo '+roleName(ctx,rid)+': '+caps.map(cl).join(', '));
      }
      return out.length?`<span class="sx-change" data-audit-change>${out.map(x=>esc(x)).join('<br>')}</span>`:'';
    }catch(_){return '';}
  }
  function auditRowsHtml(entries){
    const s=view.audit,q=s.q.trim().toLowerCase(),ctx=auditContext(),list=entries.filter(e=>(!s.action||e.action===s.action)&&(!q||[e.actorName,e.actorId,e.subjectId,auditSubject(e,ctx),auditLabels[e.action]||'Movimiento de personal'].join(' ').toLowerCase().includes(q))),{rows,pages}=pageOf(list,s);
    return (rows.length?`<div class="sx-list">${rows.map(e=>`<article class="sx-log"><span class="dot"></span><div class="sx-main"><strong>${esc(auditLabels[e.action]||'Movimiento de personal')}</strong><small>${esc(fmtDate(e.at))} · <span class="sx-author" title="ID ${esc(e.actorId)}" tabindex="0" aria-label="${esc(e.actorName)}, ID ${esc(e.actorId)}">${esc(e.actorName)}</span>${(sub=>sub?' · <span class="sx-subject" data-audit-subject>'+esc(sub)+'</span>':'')(auditSubject(e,ctx))}</small>${auditChanges(e,ctx)}</div></article>`).join('')}</div>`:'<p class="sx-empty">Sin movimientos con esos filtros.</p>')+pagerHtml('audit',list.length,pages);
  }
  function auditHtml(actor){
    const entries=access().listAudit(actor),actions=[...new Set(entries.map(e=>e.action))],s=view.audit;
    return `<section class="sx-card"><div><h3>Historial de personal</h3><p class="cfg-helper">La identidad del autor es estable aunque cambie su correo o nombre. Registro local; no sustituye una auditoría de servidor.</p></div><div class="sx-toolbar"><label class="sx-field grow" for="sx-audit-q"><span>Buscar</span><input id="sx-audit-q" value="${esc(s.q)}" placeholder="Autor, cuenta o acción" oninput="PulzzoStaffAdminUI.filter('audit','q',this.value)"></label><label class="sx-field" for="sx-audit-action"><span>Tipo</span><select id="sx-audit-action" onchange="PulzzoStaffAdminUI.filter('audit','action',this.value)"><option value="">Todos</option>${actions.map(a=>`<option value="${esc(a)}" ${s.action===a?'selected':''}>${esc(auditLabels[a]||'Movimiento de personal')}</option>`).join('')}</select></label></div><div id="sx-audit-list">${auditRowsHtml(entries)}</div></section>`;
  }
  function render(){
    try{
      const actor=current(),users=access().listUsers(actor),roles=access().listRoles(actor);revision=access().getVersion();ensureStyles();
      if(!selectedRole)selectedRole=roles[0]?.id||'';
      const user=users.find(item=>item.id===selectedUser),role=roles.find(item=>item.id===selectedRole),s=view.users;
      const tabs=[['users','Cuentas'],['roles','Plantillas de roles (grupos)'],['audit','Historial de personal']];
      const usersView=`<section class="sx-card"><div class="sx-head"><div><h3>Directorio de personal</h3><p>Cada cuenta puede tener varios grupos; sus permisos se suman.</p></div><button type="button" class="sx-btn primary" onclick="PulzzoStaffAdminUI.selectUser('')">+ Nueva cuenta</button></div><div class="sx-toolbar"><label class="sx-field grow" for="sx-users-q"><span>Buscar</span><input id="sx-users-q" value="${esc(s.q)}" placeholder="Nombre o correo" oninput="PulzzoStaffAdminUI.filter('users','q',this.value)"></label><label class="sx-field" for="sx-users-group"><span>Grupo</span><select id="sx-users-group" onchange="PulzzoStaffAdminUI.filter('users','group',this.value)"><option value="">Todos</option>${roles.map(r=>`<option value="${esc(r.id)}" ${s.group===r.id?'selected':''}>${esc(r.label)}</option>`).join('')}</select></label><label class="sx-field" for="sx-users-status"><span>Estado</span><select id="sx-users-status" onchange="PulzzoStaffAdminUI.filter('users','status',this.value)"><option value="">Todos</option><option value="active" ${s.status==='active'?'selected':''}>Activa</option><option value="invited" ${s.status==='invited'?'selected':''}>Invitación pendiente</option><option value="inactive" ${s.status==='inactive'?'selected':''}>Inactiva</option></select></label></div><div id="sx-users-list">${usersListHtml(users,roles)}</div></section>${invitationHtml()}${editing?userEditor(user,roles):''}`;
      const rolesView=`<div class="sx-rlayout"><section class="sx-card sx-gtop">${groupsListHtml(roles,users)}</section>${roleEditor(creatingRole?{id:'',label:'',grants:{}}:role,actor)}</div>`;
      return `<section class="sx" aria-label="Administración de personal"><div class="sx-head"><div><h3>Usuarios, grupos y permisos</h3><p>Solo Administración edita esta sección. Acceso efectivo por área y sesiones verificadas en cada acción.</p></div></div><aside class="sx-note" data-google-signin-note><strong>Simulación local de personal.</strong> No crea accesos reales ni envía correos. En producción el acceso será con Google y solo para correos registrados previamente aquí; esta pantalla no pide ni muestra contraseñas. Las cuentas se desactivan, nunca se borran.</aside><div class="sx-tabs" role="tablist" aria-label="Personal">${tabs.map(([id,t])=>`<button class="sx-tab tab ${tab===id?'active':''}" role="tab" aria-selected="${tab===id}" type="button" onclick="PulzzoStaffAdminUI.setTab('${id}')">${t}</button>`).join('')}</div><p id="staffMessage" role="status" aria-live="polite"></p>${tab==='audit'?auditHtml(actor):tab==='roles'?rolesView:usersView}</section>`;
    }catch(error){return `<p role="alert">${esc(error.message)}</p>`;}
  }
  function execute(action,success){
    if(saving)return false;saving=true;
    try{action(current());repaint();message(success);return true;}catch(error){message(error.message||'No se aplicó el cambio.');return false;}finally{saving=false;}
  }
  // v36d: deactivating a user also deactivates its referral links (with history in the CRM).
  function deactivateReferrals(actor,userId){try{const Store=root.PulzzoCRMStore;if(Store){const store=Store.createStore({storage:root.localStorage,actor:{id:actor.id,role:'admin'},staffAccess:access(),staffSession:access().getSession()});for(const r of store.listReferrals().filter(x=>x.kamId===userId&&x.active!==false)){const out=store.revokeReferral(r.id,'Usuario desactivado',store.snapshot().revision);if(!out.ok)message('No se pudo desactivar un enlace de referido: '+out.error);}}try{if(root.sessionStorage)root.sessionStorage.setItem('pulzzo_v1_pending_redistribute',JSON.stringify({kamId:userId,demo:true}));}catch(ignore){}}catch(error){message('Cuenta desactivada. Revisa sus enlaces de referido: '+error.message);}}
  function refreshList(kind){try{const actor=current(),host=document.getElementById('sx-'+kind+'-list');if(!host||typeof host.innerHTML!=='string'){repaint();return;}
    if(kind==='users')host.innerHTML=usersListHtml(access().listUsers(actor),access().listRoles(actor));
    else if(kind==='audit')host.innerHTML=auditRowsHtml(access().listAudit(actor));
    else{const roles=access().listRoles(actor),q=view.roles.q.trim().toLowerCase(),list=roles.filter(r=>!q||r.label.toLowerCase().includes(q)),pg=pageOf(list,view.roles);host.innerHTML=groupRowsHtml(pg.rows,access().listUsers(actor))+pagerHtml('roles',list.length,pg.pages);}
  }catch(error){message(error.message);}}
  const api={render,
    filter(kind,key,value){if(!view[kind]||!(key in view[kind]))return;view[kind][key]=String(value||'');view[kind].page=1;refreshList(kind);},
    setPage(kind,page){if(!view[kind])return;view[kind].page=Math.max(1,Number(page)||1);refreshList(kind);},
    setPageSize(kind,size){const n=Number(size);if(!view[kind]||!PAGE_SIZES.includes(n))return;view[kind].size=n;view[kind].page=1;refreshList(kind);},
    // Steps switch in place (no re-render) so typed values are kept.
    setStep(n){const v=Number(n);if(!(v>=1&&v<=4))return;if(v>step&&!api.validateUser(v))return;step=v;if(v===3)ovRefresh();const panes=document.querySelectorAll('.sx-pane'),steps=document.querySelectorAll('.sx-step');panes.forEach?.((el,i)=>el.classList.toggle('active',i===v-1));steps.forEach?.((el,i)=>el.classList.toggle('active',i===v-1));const prev=document.querySelector('[data-sx-prev]'),next=document.querySelector('[data-sx-next]');if(prev)prev.disabled=v<=1;if(next)next.disabled=v>=4;if(v===4)api.previewUser();},
    stepBy(d){api.setStep(step+Number(d||0));},
    // v36i: required fields: red outline + «Falta este dato» inline, focus the first missing one.
    validateUser(target){const checks=[['staffName',v=>v.trim()?'':'Falta este dato'],['staffEmail',v=>!v.trim()?'Falta este dato':/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())?'':'Revisa el correo (ej. nombre@pulzzo.mx)'],['staffPhone',v=>{const d=v.replace(/\D/g,'');return !d?'Falta este dato':d.length<10||d.length>15?'Escribe 10 dígitos':'';}]];let first=null;
      for(const [id,test] of checks){const input=document.getElementById(id);if(!input)continue;const label=input.closest?input.closest('.sx-field'):null,msg=test(String(input.value||''));let err=label&&label.querySelector?label.querySelector('.sx-err'):null;if(label&&label.classList)label.classList.toggle('invalid',!!msg);input.setAttribute?.('aria-invalid',msg?'true':'false');if(msg&&label&&!err&&document.createElement){err=document.createElement('small');err.className='sx-err';err.id=id+'Error';label.appendChild(err);input.setAttribute?.('aria-describedby',err.id);}if(err){err.textContent=msg;err.hidden=!msg;}if(msg&&!first)first=input;}
      const rolesErr=document.getElementById('staffRolesError'),needRoles=target===undefined||target>2,noRoles=needRoles&&!selectedRoles().length;if(rolesErr)rolesErr.hidden=!noRoles;
      if(first){if(step!==1){step=1;document.querySelectorAll('.sx-pane').forEach?.((el,k)=>el.classList.toggle('active',k===0));document.querySelectorAll('.sx-step').forEach?.((el,k)=>el.classList.toggle('active',k===0));}first.focus?.();message('Completa los datos marcados en rojo.');return false;}
      if(noRoles){if(step!==2){step=2;document.querySelectorAll('.sx-pane').forEach?.((el,k)=>el.classList.toggle('active',k===1));document.querySelectorAll('.sx-step').forEach?.((el,k)=>el.classList.toggle('active',k===1));}document.querySelector('[data-staff-user-role]')?.focus?.();message('Elige al menos un grupo.');return false;}
      return true;},
    ovToggle(cap,checked){try{const c=access().capabilityCatalog().find(x=>x.id===cap);if(!c||c.adminOnly)return;const group=groupGrants(selectedRoles())[cap]||'none',want=checked?(group!=='none'?group:'all'):'none',prev=pendingOv[cap];if(want===group)delete pendingOv[cap];else pendingOv[cap]={scope:want,expiresAt:prev?prev.expiresAt:null};ovRefresh();api.previewUser();}catch(error){message(error.message);}},
    ovScope(cap,scope){if(!['all','own'].includes(scope))return;const group=groupGrants(selectedRoles())[cap]||'none',prev=pendingOv[cap];if(scope===group)delete pendingOv[cap];else pendingOv[cap]={scope,expiresAt:prev?prev.expiresAt:null};ovRefresh();api.previewUser();},
    ovExpiry(cap,value){if(!pendingOv[cap])return;pendingOv[cap].expiresAt=value?new Date(value).toISOString():null;},
    closeEditor(){editing=false;step=1;repaint();},
    activeChanged(input){const box=document.getElementById('staffActiveConfirm');if(!box||!input)return;if(!input.checked&&input.dataset.wasActive==='1'){box.dataset.open='1';box.querySelector('[data-sx-confirm-cancel]')?.focus?.();}else box.dataset.open='0';},
    confirmActive(ok){const box=document.getElementById('staffActiveConfirm'),input=document.getElementById('staffActive');if(box)box.dataset.open='0';if(input){if(!ok)input.checked=true;input.focus?.();}},
    setGrant(cap,scope){try{current();const input=document.getElementById('staffGrant-'+cap);if(!input||!['none','own','all'].includes(scope))return;input.value=scope;for(const b of document.querySelectorAll('[data-cap="'+cap+'"][data-scope]')){b.classList.toggle('on',b.dataset.scope===scope);b.setAttribute?.('aria-checked',String(b.dataset.scope===scope));}const area=input.dataset&&input.dataset.area;if(area){const all=Array.from(document.querySelectorAll('[data-staff-grant]')).filter(x=>x.dataset.area===area),badge=document.querySelector('[data-acount="'+area+'"]');if(badge)badge.textContent=all.filter(x=>x.value!=='none').length+'/'+all.length;}api.previewRole();}catch(error){message(error.message);}},
    savePermission(){return execute(actor=>{if(!selectedUser)throw Error('Selecciona una cuenta.');const raw=document.getElementById('staffOverrideExpiry').value;access().setUserPermission(actor,selectedUser,{capability:document.getElementById('staffOverrideCap').value,scope:document.getElementById('staffOverrideScope').value,expiresAt:raw?new Date(raw).toISOString():null},revision);},'Permiso individual guardado. Quedó en el historial.');},
    clearPermission(cap){return execute(actor=>{access().setUserPermission(actor,selectedUser,{capability:cap,scope:'clear',expiresAt:null},revision);},'Excepción quitada. La cuenta vuelve a los permisos de sus grupos.');},
    saveLimits(){return execute(actor=>{const v=id=>{const x=document.getElementById(id).value.trim();return x===''?null:Number(x);};access().setApprovalLimits(actor,{leader:v('staffLimitLeader'),admin:v('staffLimitAdmin')},revision);},'Topes guardados.');},
    setTab(value){try{current();if(!['users','roles','audit'].includes(value))return;tab=value;editing=false;creatingRole=false;repaint();}catch(error){message(error.message);}},
    selectUser(id){try{const actor=current();const u=id?access().listUsers(actor).find(x=>x.id===id):null;pendingOv={};for(const [cap,o] of Object.entries((u&&u.overrides)||{}))pendingOv[cap]={scope:o.scope,expiresAt:o.expiresAt||null};selectedUser=id;invitation=null;tab='users';editing=true;step=1;repaint();}catch(error){message(error.message);}},
    selectRole(id){try{current();selectedRole=id;creatingRole=false;rstep=1;repaint();}catch(error){message(error.message);}},
    newRole(){try{current();creatingRole=true;rstep=1;rarea='';repaint();document.getElementById('staffRoleLabel')?.focus?.();}catch(error){message(error.message);}},
    cancelNewRole(){creatingRole=false;rstep=1;repaint();},
    setRoleStep(n){const v=Number(n);if(!(v>=1&&v<=4))return;rstep=v;document.querySelectorAll('.sx-rpane').forEach?.((el,k)=>el.classList.toggle('active',k===v-1));document.querySelectorAll('.sx-rstep').forEach?.((el,k)=>el.classList.toggle('active',k===v-1));const prev=document.querySelector('[data-sx-rprev]'),next=document.querySelector('[data-sx-rnext]');if(prev)prev.disabled=v<=1;if(next)next.disabled=v>=4;if(v===4)api.previewRole();},
    roleStepBy(d){api.setRoleStep(rstep+Number(d||0));},
    setArea(area){rarea=String(area||'');document.querySelectorAll('[data-atab]').forEach?.(el=>{const on=el.dataset.atab===rarea;el.classList.toggle('active',on);el.setAttribute?.('aria-selected',String(on));});document.querySelectorAll('[data-apane]').forEach?.(el=>el.classList.toggle('active',el.dataset.apane===rarea));},
    previewUser(){try{const host=document.getElementById('staffPermissionPreview');if(host)host.innerHTML=permissionPreview(selectedRoles());}catch(error){message(error.message);}},
    previewRole(){try{current();const host=document.getElementById('staffRolePreview');if(host)host.innerHTML=roleGrantPreview(formGrants());}catch(error){message(error.message);}},
    saveUser(){if(!api.validateUser())return false;return execute(actor=>{const data={name:document.getElementById('staffName').value.trim(),email:document.getElementById('staffEmail').value.trim(),phone:(document.getElementById('staffPhone')?.value||'').trim(),roles:selectedRoles()};
      const was=selectedUser?access().listUsers(actor).find(u=>u.id===selectedUser):null;
      if(selectedUser)data.active=!!document.getElementById('staffActive').checked;
      const saved=access().saveUserWithPermissions(actor,selectedUser||null,data,pendingOv,revision);selectedUser=saved.id;
      if(was&&was.active&&!saved.active)deactivateReferrals(actor,selectedUser);
      if(data.active===undefined){editing=true;step=4;}else{editing=false;step=1;}invitation=null;},'Cuenta guardada. Los permisos individuales se guardaron con la cuenta.');},
    saveRole(){if(creatingRole)return execute(actor=>{const label=document.getElementById('staffRoleLabel').value.trim(),grants=formGrants(),created=access().createRole(actor,{label},revision);selectedRole=created.id;creatingRole=false;if(Object.values(grants).some(v=>v!=='none'))access().updateRole(actor,created.id,{grants},access().getVersion());},'Grupo creado. Quedó en el historial de personal.');
      return execute(actor=>{access().updateRole(actor,selectedRole,{label:document.getElementById('staffRoleLabel').value.trim(),grants:formGrants()},revision);},'Plantilla guardada. Las sesiones afectadas deben iniciar sesión otra vez.');},
    inviteUser(){return execute(actor=>{if(!selectedUser)throw Error('Primero crea o selecciona una cuenta.');invitation=access().createInvitation(actor,selectedUser,revision);},'Invitación simulada generada. No se envió correo.');},
    dismissInvitation(){invitation=null;repaint();},
    // v72: reactivar desde la lista (queda en el historial como «Cuenta actualizada»).
    reactivate(id){return execute(actor=>{const u=access().listUsers(actor).find(x=>x.id===id);if(!u)throw Error('La cuenta no existe.');if(u.active)return;access().updateUser(actor,id,{active:true},revision);},'Cuenta reactivada. Quedó en el historial.');},
    // v72: deja preparada la reasignación de clientes y abre el CRM (regla existente de redistribución).
    reassignInCrm(id){try{current();if(root.sessionStorage)root.sessionStorage.setItem('pulzzo_v1_pending_redistribute',JSON.stringify({kamId:String(id),demo:true}));}catch(error){message(error.message);return false;}editing=false;step=1;try{repaint();}catch(_){}if(typeof root.setView==='function'){root.setView('crm');}return true;},
    fmtDate,crmPending,
    async copyInvitation(){try{current();const text=document.getElementById('staffInvitationLink')?.value;if(!text)throw Error('Genera una invitación primero.');await root.navigator.clipboard.writeText(text);current();message('Enlace copiado. No se envió correo.');}catch(error){message('No se pudo copiar automáticamente. Selecciona y copia el enlace visible.');}},
    openInvitationFromLocation(){
      const epoch=++inviteEpoch;const params=new URLSearchParams(String(root.location?.hash||'').replace(/^#/,'')),token=params.get('staff-invite');if(!token)return false;
      let invitation;try{invitation=access().inspectInvitation(token);}catch(error){}
      session=null;staffShowLoggedOut();const card=document.querySelector('#loginView .login-card');if(!card)return false;
      root.history?.replaceState?.(null,'',root.location.pathname+root.location.search);
      if(!invitation){card.innerHTML='<h2>Invitación no disponible</h2><p>El enlace venció, ya fue usado o la cuenta cambió. Solicita una nueva invitación al Admin.</p><a class="btn btn-secondary" href="backoffice.html">Volver al inicio de sesión</a>';return true;}
      card.innerHTML=`<h2>Establece tu contraseña de prueba</h2><p>${esc(invitation.name)} · ${esc(invitation.email)}</p><p>Invitación simulada en este navegador. Elige una contraseña ficticia de al menos 10 caracteres que no uses en ningún servicio real. Admin no ve ni define tu contraseña.</p><form id="staffAcceptInvitation"><label class="field" for="staffInvitePassword"><span>Contraseña de prueba</span><input id="staffInvitePassword" type="password" minlength="10" maxlength="200" autocomplete="new-password" required></label><label class="field" for="staffInviteConfirm"><span>Repetir contraseña</span><input id="staffInviteConfirm" type="password" minlength="10" maxlength="200" autocomplete="new-password" required></label><p id="staffInviteMessage" role="status" aria-live="polite"></p><button id="staffAcceptButton" class="btn btn-primary" type="submit">Activar cuenta demo</button><a class="btn btn-secondary" href="backoffice.html">Cancelar</a></form>`;
      const form=document.getElementById('staffAcceptInvitation');form.onsubmit=async event=>{event.preventDefault();const button=document.getElementById('staffAcceptButton');if(button.disabled)return;const password=document.getElementById('staffInvitePassword').value,confirmation=document.getElementById('staffInviteConfirm').value,output=document.getElementById('staffInviteMessage');if(password!==confirmation){output.textContent='Las contraseñas no coinciden.';return;}button.disabled=true;
        try{const issued=await access().acceptInvitation(token,password,{isCurrent:()=>epoch===inviteEpoch&&form.isConnected!==false});if(epoch!==inviteEpoch||form.isConnected===false){access().logout(issued);return;}document.getElementById('staffInvitePassword').value='';document.getElementById('staffInviteConfirm').value='';root.location.replace('backoffice.html');}catch(error){output.textContent=error.message;button.disabled=false;}
      };return true;
    }
  };
  root.PulzzoStaffAdminUI=Object.freeze(api);
})(window);
