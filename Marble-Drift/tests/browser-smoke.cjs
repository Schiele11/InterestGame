const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const output=path.resolve(__dirname,'../test-results');fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(e.message));
    const response=await page.goto('http://127.0.0.1:4173');assert.equal(response.status(),200);
    await page.locator('#fire-button').click();assert.equal(await page.locator('#ammo').textContent(),'29');
    const bounds=await page.locator('#fire-button').boundingBox();await page.mouse.move(bounds.x+40,bounds.y+30);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();assert.ok(Number(await page.locator('#ammo').textContent())<=25,'holding fires repeatedly');
    await page.locator('#pause-button').click();assert.equal(await page.locator('#machine-status').textContent(),'TAKE A BREATH');assert.equal(await page.locator('#pause-screen').isVisible(),true);await page.locator('#resume-button').click();
    await page.locator('#settings-button').click();await page.locator('#initial-ammo').fill('1');await page.locator('#bonus-every').fill('10000');for(let i=0;i<5;i++)await page.locator('#gate-'+i).fill('1');await page.locator('button[type=submit]').click();assert.equal(await page.locator('#ammo').textContent(),'1');
    await page.locator('#fire-button').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#ammo').textContent(),'0');assert.equal(await page.locator('#result-screen').isVisible(),false,'wait for falling ball before settlement');await page.locator('#result-screen').waitFor({state:'visible',timeout:20000});assert.equal(await page.locator('#result-score').textContent(),'1');
    await page.reload();assert.equal(await page.locator('#ammo').textContent(),'1');assert.equal(await page.locator('#best-score').textContent(),'1');
    await page.locator('#settings-button').click();await page.locator('#bonus-every').fill('1');await page.locator('button[type=submit]').click();await page.locator('#fire-button').click();await page.waitForFunction(()=>document.getElementById('score').textContent==='1',{},{timeout:15000});assert.equal(await page.locator('#ammo').textContent(),'1');assert.equal(await page.locator('#result-screen').isVisible(),false,'last ball can earn a bonus and keep the round alive');
    await page.locator('#settings-button').click();await page.locator('#restore-defaults').click();await page.locator('button[type=submit]').click();
    const fire=await page.locator('#fire-button').boundingBox();await page.mouse.move(fire.x+40,fire.y+30);await page.mouse.down();await page.waitForTimeout(2000);await page.mouse.up();await page.waitForTimeout(500);await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
    const desktop={score:await page.locator('#score').textContent(),ammo:await page.locator('#ammo').textContent(),active:await page.locator('#active-count').textContent()};
    const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto('http://127.0.0.1:4173');await mobile.locator('#fire-button').tap();assert.equal(await mobile.locator('#ammo').textContent(),'29');await mobile.waitForTimeout(900);assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal mobile overflow');await mobile.screenshot({path:path.join(output,'mobile.png'),fullPage:true});await mobile.locator('#settings-button').tap();assert.equal(await mobile.locator('#settings-dialog').isVisible(),true);await mobile.screenshot({path:path.join(output,'settings-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',checks:['single shot','hold to fire','pause / resume','settings','in-flight settlement','bonus survival','local persistence','mobile touch','responsive layout','no browser errors'],desktop,screenshots:output}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
