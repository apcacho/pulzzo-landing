'use strict';
// v36 regression: a 0-day period accrues 0 days; inverted dates stop instead of charging 30 days.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','backoffice.html'),'utf8');
function extract(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);let i=html.indexOf('{',start),depth=0;for(;i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'&&--depth===0)break;}return html.slice(start,i+1);}
const names=['parseLocalDate','toLocalISODate','dispersionDateOnly','dispersionPeriodDays','dispersionPeriodsPerYearForFrequency','dispersionInterestForPeriod'];
const ctx=vm.createContext({});vm.runInContext(names.map(extract).join('\n')+'\nfunction getTodayLocalMX(){return parseLocalDate("2026-10-14");}\nglobalThis.api={'+names.join(',')+'};',ctx);
const {dispersionPeriodDays:days,dispersionInterestForPeriod:interest}=ctx.api;
assert.equal(days('2026-01-15','2026-02-15'),31,'normal month');
assert.equal(days('2026-03-01','2026-04-01'),31,'DST-safe');
assert.equal(days('2026-05-10','2026-05-10'),0,'0 days is 0, never 30');
assert.throws(()=>days('2026-06-15','2026-05-15'),e=>e.code==='NEGATIVE_PERIOD_DAYS'&&/fechas invertidas/.test(e.message));
const zero=interest({interestCalculationBase:'outstanding_balance',ordinaryAnnualRate:0.36},10000,'2026-05-10','2026-05-10');
assert.equal(zero.periodDays,0);assert.equal(zero.interest,0,'no interest charged for a 0-day insoluto period');
const month=interest({interestCalculationBase:'outstanding_balance',ordinaryAnnualRate:0.36},10000,'2026-02-15','2026-01-15');
assert.equal(month.periodDays,31);assert.equal(Math.round(month.interest*100)/100,310,'10,000 × 0.36/360 × 31');
assert.throws(()=>interest({interestCalculationBase:'outstanding_balance',ordinaryAnnualRate:0.36},10000,'2026-01-15','2026-02-15'),e=>e.code==='NEGATIVE_PERIOD_DAYS');
const global=interest({interestCalculationBase:'global',ordinaryAnnualRate:0.36,totalFinancedAmount:12000},12000,'2026-02-15','2026-01-15');
assert.equal(global.interest,360,'global base: 12,000 × 0.36/12 regardless of days');
console.log('PASS: dispersionPeriodDays returns 0 for same-day, stops on inverted dates, insoluto/global interest unchanged otherwise. VM only.');
