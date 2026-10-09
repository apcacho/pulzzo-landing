'use strict';
const assert=require('node:assert/strict');
module.exports=function restorePreSidebar(html){
// The approved sidebar feature changes only these three navigation/presentation functions.
// Restore their pre-feature text for the original all-other-business-code invariant.
const sidebarBefore=require('./backoffice-sidebar-before.json');
let behaviorHtml=html;
// Only the separately tested icon registry and primary history-entry decoration may differ.
const navStart=behaviorHtml.indexOf('const navItems=');
const navEnd=behaviorHtml.indexOf('const permissions=',navStart);
assert.ok(navStart>=0&&navEnd>navStart);
behaviorHtml=behaviorHtml.slice(0,navStart)+require('./backoffice-navigation-before.json')+behaviorHtml.slice(navEnd);
behaviorHtml=behaviorHtml.replace("${backofficeNavIcon('history')}Historial operativo",'Historial operativo');
for(const [name,before] of Object.entries(sidebarBefore)){
 const start=behaviorHtml.indexOf('function '+name+'(');
 const end=name==='setSidebarOpen'?behaviorHtml.indexOf('\ndocument.addEventListener',start):behaviorHtml.indexOf('\nfunction ',start+1);
 assert.ok(start>=0&&end>start);
 behaviorHtml=behaviorHtml.slice(0,start)+before+behaviorHtml.slice(end);
}
behaviorHtml=behaviorHtml.replace(".filter(control=>control.id!=='sidebarToggle')",'').replace('<script src="assets/js/backoffice-sidebar.js"></script>','');
// The approved credit-bound payment surface adds optional quote/quiet arguments to these
// seven shared functions. Their allocation parity, isolation and guards are verified in
// portfolio-payment-drawer.cjs and payment-integrity.cjs; pin every other script byte.
for(const [name,before] of Object.entries(require('./backoffice-payment-before.json'))){
 const start=behaviorHtml.indexOf('function '+name+'('),end=behaviorHtml.indexOf('\nfunction ',start+1);
 assert.ok(start>=0&&end>start);behaviorHtml=behaviorHtml.slice(0,start)+before+behaviorHtml.slice(end);
}
behaviorHtml=behaviorHtml.replace('<script src="assets/js/backoffice-portfolio-payment.js"></script>','');
return behaviorHtml;
};
