'use strict';
// Optional real-browser registration layout QA. Intentionally excluded from tests/run.cjs.
// Run only where Chromium is permitted. This suite does not work around denied sockets.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname,p=path.resolve(root,'.'+pathname);if(!p.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(p,(err,data)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(p)]||'application/octet-stream'});res.end(data);});});
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin)||route.request().url().startsWith('blob:')?route.continue():route.abort());
  for(const kind of ['patient','doctor'])for(const width of [1365,820,390,320]){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/asistido-demo.html?mode=self&kind='+kind);await page.locator('#identityForm').waitFor();
   const metrics=await page.evaluate(()=>{const heading=document.getElementById('registration-title'),card=document.querySelector('.registration-card'),button=document.querySelector('#identityForm button'),field=document.querySelector('#identityForm input'),headBox=heading.getBoundingClientRect(),cardBox=card.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,align:getComputedStyle(heading).textAlign,headCenter:headBox.x+headBox.width/2,cardCenter:cardBox.x+cardBox.width/2,buttonHeight:button.getBoundingClientRect().height,fieldHeight:field.getBoundingClientRect().height,buttonWidth:button.getBoundingClientRect().width,cardWidth:cardBox.width,body:getComputedStyle(document.body).backgroundColor,accent:getComputedStyle(document.body).getPropertyValue('--accent').trim()};});
   assert.equal(metrics.overflow,false,kind+' overflow '+width);assert.equal(metrics.align,'center');assert.ok(Math.abs(metrics.headCenter-metrics.cardCenter)<=1,'Centered auth title');assert.ok(metrics.buttonHeight>= (width<=820?44:36));assert.ok(metrics.fieldHeight>= (width<=820?44:38));if(width===1365)assert.ok(metrics.buttonWidth<metrics.cardWidth*.8,'Compact desktop CTA');assert.equal(metrics.body,'rgb(7, 20, 47)');
   await page.locator('[name=existing]').check();await page.locator('[name=name]').waitFor({state:'hidden'});await page.locator('[name=phone]').waitFor({state:'hidden'});await page.locator('[name=existing]').uncheck();await page.locator('[name=name]').waitFor({state:'visible'});
   await page.locator('[name=email]').fill(kind+'-'+width+'@example.test');await page.locator('[name=name]').fill('Persona DEMO');await page.locator('[name=phone]').fill('5512340000');await page.locator('#identityForm button').click();await page.locator('#codeForm').waitFor();assert.equal(await page.locator('#verification-title').evaluate(e=>getComputedStyle(e).textAlign),'center');await page.locator('#backAuth').click();await page.locator('#identityForm').waitFor();assert.equal(await page.locator('[name=email]').inputValue(),kind+'-'+width+'@example.test');
   if(process.env.REGISTRATION_SCREENSHOT_DIR){fs.mkdirSync(process.env.REGISTRATION_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.REGISTRATION_SCREENSHOT_DIR,'registration-'+kind+'-'+width+'.png'),fullPage:true});}
  }
  assert.deepEqual(errors,[]);
  console.log('PASS browser: patient/doctor registration at 1365/820/390/320, scoped centered headings, compact desktop/mobile hit targets, no horizontal overflow, existing-account hiding, verification/back and runtime errors.');
 }finally{await browser?.close();if(server.listening)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
