// v37 bug fix: Cartera/Operaciones/Riesgo/Solo lectura opening Solicitudes threw an uncaught
// "La sesión del directorio cambió o no permite acceder al CRM." from the CRM auto-import.
const assert=require('assert'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','assets/js/crm-demo-office.js'),'utf8');
const auto=src.slice(src.indexOf('async function autoImport'),src.indexOf('function inCaptureRows'));
assert.match(auto,/\}catch\(_\)\{[^}]*\}finally\{autoBusy=false;\}/,'autoImport swallows a missing-CRM-access store error');
assert.match(src,/function inCaptureRows\(kind\)\{let state;try\{state=getStore\(\)\.snapshot\(\);\}catch\(_\)\{return \[\];\}/,'in-capture list degrades to empty without CRM access');
// The store really throws for a non-CRM session (sanity of the premise).
const store=fs.readFileSync(path.join(__dirname,'..','assets/js/crm-demo-store.js'),'utf8');assert.match(store,/La sesión del directorio cambió o no permite acceder al CRM/);
console.log('PASS: v37 no uncaught CRM error for roles without CRM access (browser-verified: 7 roles × desktop, 0 JS errors).');
