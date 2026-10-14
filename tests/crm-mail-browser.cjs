'use strict';
// Optional fixture-only browser QA, excluded from tests/run.cjs.
// PLAYWRIGHT_MODULE can point to an already installed Playwright package.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'../dist/client'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp'};
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain'}).end(data);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1365,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(origin+'/crm.html');await page.getByText('Correo real no disponible',{exact:true}).waitFor();assert.equal(await page.locator('#workspace').isVisible(),false);assert.equal(await page.locator('#connect').isDisabled(),true);
  let drafts=[],sends=0,reads=0;const contacts=[{id:'contact1',name:'Contacto fixture',email:'fixture@example.com',kind:'other'}];
  await page.route('**/api/crm/**',async route=>{const request=route.request(),url=new URL(request.url()),p=url.pathname.replace('/api/crm','');let data;
   if(p==='/status')data={csrf:'fixture-csrf',connected:true,mailbox:{id:'box1',email:'fixture@gmail.com'}};
   else if(p==='/contacts')data={contacts};
   else if(p==='/threads'&&request.method()==='GET')data={threads:[{id:'linked1',contact_id:'contact1',gmail_thread_id:'thread1',mailbox:'fixture@gmail.com'}]};
   else if(p==='/outbox'&&request.method()==='GET')data={outbox:drafts};
   else if(p==='/outbox'&&request.method()==='POST'){const body=request.postDataJSON();const draft={...body,id:'draft'+(drafts.length+1),sender:'fixture@gmail.com',recipient:'fixture@example.com',status:'draft'};drafts.unshift(draft);data={draft};}
   else if(p.endsWith('/send')){sends++;assert.deepEqual(request.postDataJSON(),{confirm:true});const d=drafts.find(d=>p.includes(d.id));d.status='sent';data={draft:d};}
   else if(p.endsWith('/refresh')){reads++;data={messages:[{from:'fixture@example.com',date:'fixture date',subject:'Fixture subject',body:'<img src="https://evil.test" onerror="window.pwned=true">',bodyNotice:''}]};}
   else throw Error('Unexpected fixture endpoint '+p);
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.reload();await page.getByText('Conectado: fixture@gmail.com',{exact:true}).waitFor();await page.locator('#contactSelect').selectOption('contact1');await page.locator('#composeForm input').fill('Asunto original');await page.locator('#composeForm textarea').fill('Contenido original');await page.locator('#reviewButton').click();await page.locator('#reviewSubject').filter({hasText:'Asunto original'}).waitFor();assert.equal(sends,0);
  await page.locator('#composeForm input').fill('Cambio sin guardar');assert.equal(await page.locator('#reviewSubject').textContent(),'Asunto original');await page.locator('#closeReview').click();assert.equal(sends,0);await page.getByRole('button',{name:'Revisar borrador'}).click();await page.locator('#send').dblclick();await page.getByText('Gmail confirmó el envío.',{exact:true}).waitFor();assert.equal(sends,1);assert.equal(drafts[0].subject,'Asunto original');
  await page.getByRole('button',{name:'Leer conversación'}).click();await page.locator('#conversation pre').waitFor();assert.equal(reads,1);assert.equal(await page.locator('#conversation img').count(),0);assert.equal(await page.evaluate(()=>window.pwned),undefined);
  for(const width of [1365,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow at '+width);}
  await page.addStyleTag({content:'html{font-size:200%}'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow at 200%');
  assert.deepEqual(errors,[]);console.log('PASS: fixture-only Chromium desktop/mobile, fail-closed UI, review/cancel, immutable draft, double-click send, safe body rendering and 200% text. No Google traffic.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
