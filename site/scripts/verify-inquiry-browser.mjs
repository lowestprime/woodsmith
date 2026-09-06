import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium,firefox}=require('/audit/node_modules/playwright');
const referenceImage=await require('/audit/node_modules/sharp')({create:{width:2,height:2,channels:3,background:'#806040'}}).png().toBuffer();
const base='http://woodsmith-intakeqa-b1-app:3000';
const engine=process.env.BROWSER || 'chromium';
const width=engine==='firefox'?390:1440;
assert.equal((await fetch(base+'/contact')).status,200);
const db=new DatabaseSync('/tmp/data/woodsmith.sqlite',{readOnly:true});
const count=table=>Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
const snapshot=()=>({projects:count('projects'),inquiries:count('website_inquiries'),mail:count('notification_deliveries'),media:count('media_items'),updates:count('project_updates')});
const latest=email=>db.prepare('SELECT * FROM website_inquiries WHERE json_extract(inquiry_json, \'$.customerEmail\')=? ORDER BY created_at DESC LIMIT 1').get(email);
const errors=[],crossOrigin=[],checks=[];
const browser=await ({chromium,firefox}[engine]).launch({headless:true});
const stub=`(() => {
 const widgets=new Map(); let serial=0;
 window.turnstile={render(element,options){const id=String(++serial); widgets.set(id,options); element.innerHTML='';
 for(const [label,action] of [['Complete security check',()=>options.callback('qa-valid-'+Date.now()+'-'+Math.random())],['Use invalid response',()=>options.callback('qa-invalid')],['Expire security check',()=>options['expired-callback']()],['Simulate security error',()=>options['error-callback']()]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;element.append(b);}
 return id;},remove(id){widgets.delete(id);},reset(id){if(!widgets.has(id))throw Error('Unknown QA widget');}};
})();`;
async function context(label,admin=false){
 const ctx=await browser.newContext({viewport:{width,height:1000},userAgent:`B1-${engine}-${label}-${Date.now()}`,colorScheme:engine==='firefox'?'dark':'light'});
 await ctx.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 if(admin)await ctx.addCookies([{name:'beaman_session',value:'b1-isolated-admin-session',url:base,httpOnly:true,sameSite:'Lax'}]);
 ctx.on('request',r=>{const u=new URL(r.url());if(u.origin!==base && u.href!=='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit' && !['data:','blob:'].includes(u.protocol))crossOrigin.push(u.origin+u.pathname);});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 return {ctx,page};
}
async function layout(page,label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${label}: horizontal overflow`);checks.push(`${label}: layout`);}
async function fillQuick(page,email,message){await page.locator('form.website-inquiry-form [name=customerName]').fill('B1 QA Customer');await page.locator('form.website-inquiry-form [name=email]').fill(email);await page.locator('form.website-inquiry-form [name=message]').fill(message);}
async function success(page){await page.locator('form [role=status]').filter({hasText:'Thank you.'}).waitFor();assert.equal(await page.locator('form [role=status]').filter({hasText:'Thank you.'}).evaluate(el=>el===document.activeElement),true);}
async function error(page,text){const alert=page.locator('form > [role=alert]');await alert.filter({hasText:text}).waitFor();assert.equal(await alert.evaluate(el=>el===document.activeElement),true);}
const run=process.env.CASE || 'all';
try{
 if(['all','quick'].includes(run)){
  const {ctx,page}=await context('quick');const email=`${engine}-quick-${Date.now()}@example.test`;const before=snapshot();
  await page.goto(base+'/about');assert.equal(await page.locator('form.website-inquiry-form [name=companyWebsite]').isVisible(),false);await fillQuick(page,email,'I found your website on Google. Our marketing agency needs a walnut meeting table.');await layout(page,'About');
  const key=await page.locator('form.website-inquiry-form [name=idempotencyKey]').inputValue();assert.ok(key);
  await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await error(page,'Complete the security check');
  assert.equal(await page.locator('form.website-inquiry-form [name=idempotencyKey]').inputValue(),key);
  await page.getByRole('button',{name:'Use invalid response',exact:true}).click();await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await error(page,'failed or expired');
  await page.getByRole('button',{name:'Complete security check',exact:true}).click();await page.getByRole('button',{name:'Expire security check',exact:true}).click();assert.equal(await page.locator('[name=cf-turnstile-response]').inputValue(),'');await page.getByText('The security check expired.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Retry security check',exact:true}).click();await page.getByRole('button',{name:'Simulate security error',exact:true}).click();await page.getByText('The security check could not load.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Retry security check',exact:true}).click();await page.getByRole('button',{name:'Complete security check',exact:true}).click();await page.getByRole('button',{name:'Send inquiry',exact:true}).focus();await page.keyboard.press('Enter');await success(page);
  const row=latest(email);assert.equal(row.disposition,'legitimate');assert.equal(row.project_reference,null);assert.equal(JSON.parse(row.inquiry_json).sourceRoute,'/about');assert.ok(!row.inquiry_json.includes('qa-valid'));
  assert.equal(count('projects'),before.projects);assert.equal(count('notification_deliveries'),before.mail+1);checks.push('Quick: missing/invalid/expiry/error/reset/keyboard/focus, preserved key and values, legitimate lookalike accepted without Project');
  await page.screenshot({path:`/output/${engine}-about.png`,fullPage:true});await ctx.close();
 }
 if(['all','piece'].includes(run)){
  const {ctx,page}=await context('piece');const email=`${engine}-piece-${Date.now()}@example.test`;const before=snapshot();
  await page.goto(base+'/shop');const link=page.locator('a[href*="piece=hallway-bench"][href*="intent=price-availability"]').first();await link.click();await page.locator('form.website-inquiry-form').waitFor();
  assert.equal(await page.locator('form [name=intent]').inputValue(),'price-availability');assert.equal(await page.locator('form [name=sourceRoute]').inputValue(),'/shop');
  await fillQuick(page,email,'Could you confirm the price and pickup availability?');await page.getByRole('button',{name:'Complete security check',exact:true}).click();await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await success(page);
  const inquiry=JSON.parse(latest(email).inquiry_json);assert.equal(inquiry.piece.title,'QA Walnut Desk');assert.equal(inquiry.intent,'price-availability');assert.equal(inquiry.sourceRoute,'/shop');assert.equal(count('projects'),before.projects);checks.push('Piece: shop link and server-owned title/intent/source, no Project');await layout(page,'Contact');await ctx.close();
 }
 if(['all','planner'].includes(run))for(const spam of [false,true]){
  const {ctx,page}=await context(`planner-${spam}`);const email=`${engine}-planner-${spam}-${Date.now()}@example.test`;const before=snapshot();
  const brief=spam?'We offer SEO services to boost your rankings. Schedule a call with our agency.':'A walnut writing table for a small study.';
  await page.goto(base+'/commissions');
  for(let step=1;step<=9;step++){
   const section=page.locator(`[data-commission-step="${step}"]`);await section.waitFor({state:'visible'});
   if(step===2)await section.locator('[name=referencePieceSlug]').fill('https://example.test/reference-desk');
   if(step===3){await section.locator('[name=roomLocation]').fill('Study');await section.locator('[name=roomUse]').fill('Writing');await section.locator('[name=message]').fill(brief);}
   if(step===4)for(const [name,value] of Object.entries({requestedWidth:'48',requestedDepth:'24',requestedHeight:'30'}))await section.locator(`[name=${name}]`).fill(value);
   if(step===6)await section.locator('[name=attachments]').setInputFiles({name:'b1-reference.png',mimeType:'image/png',buffer:referenceImage});
   if(step===8){await section.locator('[name=cityRegion]').fill('Los Angeles');await section.locator('[name=deliveryMode]').selectOption('pickup');}
   if(step===9){await section.locator('[name=customerName]').fill('Planner QA');await section.locator('[name=email]').fill(email);}
   await page.getByRole('button',{name:'Save and continue',exact:true}).click();
  }
  await page.locator('[name=accuracyConfirmation]').check();await layout(page,'Planner review');
  await page.locator('.commission-workflow button[type=submit]').click();await error(page,'Complete the security check');
  assert.equal(await page.locator('[name=message]').inputValue(),brief);assert.equal(await page.locator('[name=email]').inputValue(),email);assert.equal(await page.locator('[name=attachments]').evaluate(el=>el.files.length),1);
  assert.ok(await page.locator('[name=accuracyConfirmation]').isChecked());
  await page.getByRole('button',{name:'Complete security check',exact:true}).click();
  const draft=await page.evaluate(()=>Object.values(localStorage).join(''));assert.ok(!draft.includes('qa-valid-'));assert.ok(!draft.includes('cf-turnstile-response'));
  await page.locator('.commission-workflow button[type=submit]').click();
  if(spam){await success(page);assert.equal(latest(email).disposition,'quarantine');assert.deepEqual({...snapshot(),inquiries:before.inquiries},before);checks.push('Planner solicitation: quarantined before file/Project/mail/lifecycle effects');}
  else{await page.waitForURL(/\/requests\//);await page.waitForLoadState('networkidle');assert.match(new URL(page.url()).pathname,/^\/requests\//);assert.equal(count('projects'),before.projects+1);assert.equal(count('media_items'),before.media+1);assert.ok(latest(email).project_reference);assert.equal(JSON.parse(latest(email).inquiry_json).reference,'https://example.test/reference-desk');checks.push('Planner: values/files survive failed verification, free reference retained, token-free draft, retry creates one accessible Project with private upload');}
  await ctx.close();
 }
 if(['all','quarantine'].includes(run)){
  const {ctx,page}=await context('quarantine');const email=`${engine}-spam-${Date.now()}@example.test`;const before=snapshot();
  await page.goto(base+'/contact');await fillQuick(page,email,'We offer SEO services to boost your rankings. Schedule a call with our agency.');await page.getByRole('button',{name:'Complete security check',exact:true}).click();await page.getByRole('button',{name:'Send inquiry',exact:true}).click();await success(page);
  const row=latest(email);assert.equal(row.disposition,'quarantine');assert.equal(row.project_reference,null);assert.deepEqual({...snapshot(),inquiries:before.inquiries},before);
  await page.goto(base+'/studio?panel=inquiries');await page.waitForURL(/\/studio\/login/);await ctx.close();
  const admin=await context('admin',true);await admin.page.goto(base+'/studio?panel=inquiries&view=quarantine');await admin.page.getByText(email,{exact:false}).waitFor();await layout(admin.page,'Private quarantine review');await admin.page.screenshot({path:`/output/${engine}-quarantine.png`,fullPage:true});
  await admin.page.getByRole('link',{name:'Inquiries',exact:true}).last().click();await admin.page.getByRole('heading',{name:'Website inquiries',exact:true}).waitFor();checks.push('Quarantine: private review, no Project/mail/upload/lifecycle effects; unauthenticated access rejected');await admin.ctx.close();
 }
 if(run==='unavailable'){
  const {ctx,page}=await context('unavailable');const before=snapshot();await page.goto(base+'/contact');await fillQuick(page,`${engine}-unavailable@example.test`,'Could you make a desk?');
  await page.getByText('Online verification is unavailable.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Send inquiry',exact:true}).isDisabled(),true);await layout(page,'Unavailable inquiry');
  await page.getByRole('button',{name:'Send inquiry',exact:true}).evaluate(el=>{el.disabled=false;el.click();});await error(page,'Online verification is unavailable');assert.deepEqual(snapshot(),before);checks.push('Unavailable: accessible notice/disabled submit; forced client bypass rejected server-side without effects');await ctx.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(crossOrigin,[]);
 writeFileSync(`/output/browser-${engine}-${run}.json`,JSON.stringify({status:'PASS',engine,version:browser.version(),width,checks,errors,crossOrigin,provider:'Isolated client API and Siteverify doubles; live Cloudflare delivery not claimed'},null,2));
 console.log(JSON.stringify({status:'PASS',engine,width,checks}));
}catch(e){writeFileSync(`/output/browser-${engine}-${run}-failure.json`,JSON.stringify({error:String(e),stack:e.stack,checks,errors,crossOrigin},null,2));throw e;}
finally{db.close();await browser.close();}
