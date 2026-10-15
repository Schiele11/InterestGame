(() => {
  'use strict';
  const {MarbleGame,DEFAULTS,GATE_LAYOUT,validateSettings,WIDTH,HEIGHT,RADIUS,STEP,FEVER_DURATION}=MarbleCore;
  const $=id=>document.getElementById(id),canvas=$('game-canvas'),ctx=canvas.getContext('2d');
  const store={get(key,fallback){try{const v=localStorage.getItem('marble-drift:'+key);return v===null?fallback:JSON.parse(v);}catch{return fallback;}},set(key,value){try{localStorage.setItem('marble-drift:'+key,JSON.stringify(value));}catch{}}};
  let settings=validateSettings(store.get('settings',DEFAULTS)),best=Number(store.get('best',0))||0,sound=!!store.get('sound',false),audio=null,lastSound=0,held=false,nextShot=0,wasPaused=false,toastTimer=0;
  let particles=[],floats=[],rings=[],combo={chain:0,until:0},gateNotices=Array(5).fill(-Infinity),lastFrame=performance.now(),accumulator=0,lastUI=0;
  const colors=['#e6fba0','#e8ddff','#ffc5af','#a9e3d2','#ffe6ac','#ffdc61'];
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sprites=colors.map(color=>{const c=document.createElement('canvas');c.width=c.height=30;const s=c.getContext('2d'),g=s.createRadialGradient(11,9,1,15,15,10);g.addColorStop(0,'#fffef2');g.addColorStop(.35,color);g.addColorStop(1,'#739d72');s.fillStyle=g;s.beginPath();s.arc(15,15,RADIUS,0,Math.PI*2);s.fill();s.fillStyle='#ffffffa0';s.beginPath();s.arc(13,13,1.7,0,Math.PI*2);s.fill();return c;});
  function initAudio(){if(!audio)try{audio=new(window.AudioContext||window.webkitAudioContext)();}catch{}if(audio?.state==='suspended')audio.resume().catch(()=>{});}
  function tone(kind,chain=1){if(!sound||!audio||audio.state!=='running')return;const now=audio.currentTime;if(now-lastSound<.045&&kind!=='fever')return;lastSound=now;const notes=kind==='fever'?[660,830,990]:[kind==='bonus'?880:kind==='multiply'?420*Math.pow(1.26,chain-1):kind==='score'?740:240];notes.forEach((base,i)=>{const t=now+i*.075,o=audio.createOscillator(),gain=audio.createGain();o.type='sine';o.frequency.setValueAtTime(base,t);o.frequency.exponentialRampToValueAtTime(base*(kind==='fire'?.6:1.25),t+.09);gain.gain.setValueAtTime(.035,t);gain.gain.exponentialRampToValueAtTime(.0001,t+.18);o.connect(gain).connect(audio.destination);o.start(t);o.stop(t+.19);});}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
  function burst(x,y,color,count=8){for(let i=0;i<count&&particles.length<220;i++)particles.push({x,y,vx:(Math.random()-.5)*4,vy:(Math.random()-.6)*3.4,life:1,color});}
  function onEvent(e){
    if(e.type==='multiply'){
      burst(e.x,e.y,e.color,12);
      if(game.elapsed-gateNotices[e.gateId]>200){gateNotices[e.gateId]=game.elapsed;floats=floats.filter(f=>f.gateId!==e.gateId);floats.push({gateId:e.gateId,x:e.x,y:e.y-21,text:e.multiplier===1?'能量 +1':'×'+e.multiplier+' 爆珠！',color:e.color,life:1});if(rings.length<18)rings.push({x:e.x,y:e.y,r:12,life:1,color:e.color});tone('multiply',e.chain);}
      const now=performance.now();if(e.chain>=2&&(e.chain>combo.chain||now>combo.until)){combo={chain:e.chain,until:now+1400};$('combo-title').textContent=['','','二连爆珠！','三连爆珠！','四连爆珠！','五连大爆发！'][e.chain];$('combo-detail').textContent='1 → '+format(e.totalMultiplier)+' 颗';$('combo-callout').classList.add('show');}
    }
    if(e.type==='fire'){burst(e.x,e.y-9,'#d9f775',3);tone('fire');}
    if(e.type==='score'){burst(300,746,'#d9f775',Math.min(e.count*2,8));tone('score');}
    if(e.type==='bonus'){tone('bonus');if(floats.length<14)floats.push({x:300,y:704,text:'奖励 +'+e.count,color:'#d9f775',life:1.3});}
    if(e.type==='feverStart'){burst(300,140,'#ffdc61',50);tone('fever');if(held)nextShot=Math.min(nextShot,performance.now()+75);}
    if(e.type==='over'){stopHold();best=Math.max(best,e.score);store.set('best',best);$('best-score').textContent=format(best);$('result-score').textContent=format(e.score);$('result-fired').textContent=format(game.fired);$('result-earned').textContent=format(game.earned);$('result-free').textContent=format(game.freeShots);$('result-screen').hidden=false;$('play-again').focus({preventScroll:true});}
  }
  const game=new MarbleGame(settings,onEvent);
  function format(n){return n.toLocaleString('zh-CN');}
  function drawRounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
  function star(x,y,size,color){ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.moveTo(0,-size);ctx.quadraticCurveTo(0,0,size,0);ctx.quadraticCurveTo(0,0,0,size);ctx.quadraticCurveTo(0,0,-size,0);ctx.quadraticCurveTo(0,0,0,-size);ctx.fillStyle=color;ctx.fill();ctx.restore();}
  function render(dt){
    ctx.clearRect(0,0,WIDTH,HEIGHT);const bg=ctx.createLinearGradient(0,0,0,HEIGHT);bg.addColorStop(0,game.isFever?'#3c3420':'#112c25');bg.addColorStop(.65,game.isFever?'#353a24':'#18382d');bg.addColorStop(1,'#10281f');ctx.fillStyle=bg;ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.fillStyle='#c8e3af0c';for(let y=24;y<HEIGHT;y+=28)for(let x=34;x<WIDTH;x+=28){ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#b1d28d0b';ctx.lineWidth=1;ctx.beginPath();ctx.arc(300,390,220,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(300,390,235,0,Math.PI*2);ctx.stroke();
    star(465,362,16,'#b7d78d10');star(137,185,10,'#b7d78d12');star(300,570,21,'#b7d78d0e');
    ctx.fillStyle='#b6d39120';ctx.font='9px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillText('GOOD THINGS TAKE THEIR OWN WAY',300,595);
    // Draw the actual collision polygons, so the visible slopes match the physics.
    for(const wall of game.walls){ctx.beginPath();wall.vertices.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();ctx.fillStyle='#243e32';ctx.fill();ctx.strokeStyle='#b5cf8155';ctx.lineWidth=2;ctx.stroke();}
    ctx.strokeStyle='#83996a24';ctx.lineWidth=2;ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(84,46);ctx.lineTo(516,46);ctx.stroke();ctx.setLineDash([]);
    for(const x of [84,516]){ctx.beginPath();ctx.arc(x,46,4,0,Math.PI*2);ctx.fillStyle='#7b97665c';ctx.fill();}
    const nx=game.nozzleX;drawRounded(nx-22,26,44,35,9,game.isFever?'#ffdd79':'#d4e2bc','#e8f4d0');drawRounded(nx-12,54,24,21,4,'#8caa70','#c2d7a6');drawRounded(nx-15,70,30,8,3,game.isFever?'#ffdc61':'#dcf18c');ctx.fillStyle='#6a8454';ctx.beginPath();ctx.arc(nx,41,5,0,Math.PI*2);ctx.fill();
    ctx.setLineDash([2,7]);ctx.beginPath();ctx.moveTo(nx,100);ctx.lineTo(nx,137);ctx.strokeStyle='#cbe78a55';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
    for(const g of game.gates){
      const w=g.width,x=g.x-w/2,y=g.y-17;
      if(g.flash>0){ctx.globalAlpha=g.flash*.32;drawRounded(x-10,y-9,w+20,52,14,g.color);ctx.globalAlpha=1;}
      ctx.save();const kick=reducedMotion?0:Math.sin(g.flash*Math.PI)*.1;ctx.translate(g.x,g.y);ctx.scale(1+kick,1-kick);ctx.translate(-g.x,-g.y);
      drawRounded(x,y,w,34,7,g.color);ctx.fillStyle='#263e31';ctx.textAlign='center';ctx.font='650 24px "Segoe UI",sans-serif';ctx.fillText('×'+g.multiplier,g.x,g.y+8);
      drawRounded(x-5,y-4,10,42,4,'#2e4538','#5a7353');drawRounded(x+w-5,y-4,10,42,4,'#2e4538','#5a7353');
      for(const side of [x,x+w]){ctx.fillStyle=g.color;ctx.beginPath();ctx.moveTo(side-2,g.y-3);ctx.lineTo(side+2,g.y-3);ctx.lineTo(side,g.y+3);ctx.fill();}
      ctx.font='8px "Segoe UI",sans-serif';ctx.fillStyle='#afc39a66';ctx.fillText('0'+(g.id+1),g.x,g.y-27);
      ctx.restore();
    }
    for(const b of game.balls)ctx.drawImage(sprites[game.isFever||b.plugin.golden?5:b.plugin.hue],b.position.x-15,b.position.y-15);
    const frame=game.status==='paused'?0:Math.min(dt/16.667,3);
    for(const r of rings){r.life-=.04*frame;r.r+=2.4*frame;ctx.globalAlpha=Math.max(0,r.life)*.55;ctx.strokeStyle=r.color;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(r.x,r.y,r.r,r.r*.5,0,0,Math.PI*2);ctx.stroke();}rings=rings.filter(r=>r.life>0);ctx.globalAlpha=1;
    for(const p of particles){p.life-=.025*frame;p.x+=p.vx*frame;p.y+=p.vy*frame;p.vy+=.03*frame;ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,1.8,0,Math.PI*2);ctx.fill();}particles=particles.filter(p=>p.life>0);ctx.globalAlpha=1;
    for(const f of floats){f.life-=.018*frame;f.y-=.45*frame;ctx.globalAlpha=Math.max(0,Math.min(1,f.life));ctx.font='600 17px "Segoe UI",sans-serif';ctx.fillStyle=f.color;ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y);}floats=floats.filter(f=>f.life>0);ctx.globalAlpha=1;
    ctx.strokeStyle='#c4de8750';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(248,755);ctx.lineTo(352,755);ctx.stroke();ctx.fillStyle='#bfdc92';ctx.font='11px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillText('↓  出口 +1  ↓',300,777);
  }
  function updateUI(){
    const s=game.snapshot();$('score').textContent=format(s.score);$('ammo').textContent=s.isFever?'∞':format(s.ammo);$('ammo-stock').hidden=!s.isFever;$('ammo-stock').textContent='库存 '+format(s.ammo)+' 颗';$('active-count').textContent=format(s.active);$('queue-count').textContent=format(s.pending);$('queue-label').hidden=!s.pending;
    const n=s.score%settings.bonusEvery;$('reward-progress').textContent=format(n)+' / '+format(settings.bonusEvery);$('progress-fill').style.width=(100*n/settings.bonusEvery)+'%';$('reward-bar').setAttribute('aria-valuemax',settings.bonusEvery);$('reward-bar').setAttribute('aria-valuenow',n);$('reward-note').textContent='每获得 '+format(settings.bonusEvery)+' 分，额外奖励 1 颗';
    $('screen-caption').style.opacity=s.status==='ready'?'1':'0';$('pause-screen').hidden=s.status!=='paused'||$('settings-dialog').open;$('pause-button').innerHTML=s.status==='paused'?'<span aria-hidden="true">▷</span> 继续':'<span aria-hidden="true">Ⅱ</span> 暂停';$('pause-button').disabled=s.status==='over';$('fire-button').disabled=s.status==='paused'||s.status==='over';
    const seconds=(Math.ceil(s.feverRemaining/100)/10).toFixed(1)+'s';document.body.classList.toggle('is-fever',s.isFever);$('fever-banner').hidden=!s.isFever;$('fever-countdown').textContent=seconds;$('fever-label').textContent=s.isFever?'✦ 狂热进行中':'✦ 狂热能量';$('fever-progress').textContent=s.isFever?seconds:format(s.energy)+' / '+format(settings.feverThreshold);$('fever-fill').style.width=(s.isFever?100*s.feverRemaining/FEVER_DURATION:100*s.energy/settings.feverThreshold)+'%';$('fever-bar').setAttribute('aria-valuemax',s.isFever?FEVER_DURATION:settings.feverThreshold);$('fever-bar').setAttribute('aria-valuenow',s.isFever?Math.ceil(s.feverRemaining):s.energy);$('fever-bar').setAttribute('aria-label',s.isFever?'狂热剩余时间':'狂热能量');$('fever-note').textContent=s.isFever?'弹珠无限 · 发射加速 · 倍率门变宽':'穿门 / 落袋各 +1 · 满能量狂热 5 秒';
    $('fire-button').querySelector('b').textContent=s.isFever?'无限连发':s.ammo===0&&s.status==='running'?'等待奖励弹珠':'发射弹珠';$('fire-button').querySelector('small').textContent=s.isFever?'5 秒狂热 · 发射不扣库存':'轻按一颗 · 长按连发';
    $('machine-status').textContent=s.isFever&&s.status==='running'?'FEVER · INFINITE':{ready:'READY TO PLAY',running:'LET IT FLOW',paused:'TAKE A BREATH',over:'WELL PLAYED'}[s.status];
    $('settle-note').textContent=s.isFever?'狂热期间弹珠无限，按住尽情发射！':s.status==='over'?'快乐已收好，再来一局吧。':s.ammo===0?'弹珠用尽，等待场内落球与奖励…':'不赶时间，等最后一颗落下。';
    if(performance.now()>combo.until)$('combo-callout').classList.remove('show');
  }
  function shoot(){initAudio();game.fire();updateUI();}
  function startHold(){if(held||$('settings-dialog').open||game.status==='paused'||game.status==='over')return;held=true;nextShot=performance.now()+220;$('fire-button').classList.add('is-held');shoot();}
  function stopHold(){held=false;$('fire-button').classList.remove('is-held');}
  $('fire-button').addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();$('fire-button').setPointerCapture(e.pointerId);startHold();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])$('fire-button').addEventListener(event,stopHold);
  $('fire-button').addEventListener('click',e=>{if(e.detail===0)shoot();});
  document.addEventListener('keydown',e=>{if(e.code!=='Space'||e.repeat||$('settings-dialog').open||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;if(e.target.closest('button')&&e.target!==$('fire-button'))return;e.preventDefault();startHold();});
  document.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();stopHold();}});
  window.addEventListener('blur',stopHold);
  function togglePause(){stopHold();if(game.status==='paused')game.resume();else game.pause();updateUI();}
  $('pause-button').addEventListener('click',togglePause);$('resume-button').addEventListener('click',togglePause);
  function reset(){stopHold();particles=[];floats=[];rings=[];combo={chain:0,until:0};gateNotices=Array(5).fill(-Infinity);$('combo-callout').classList.remove('show');accumulator=0;game.reset(settings);$('result-screen').hidden=true;updateUI();}
  $('restart-button').addEventListener('click',()=>{reset();toast('新的一局，新的小快乐。');});$('play-again').addEventListener('click',reset);
  function updateSoundButton(){const b=$('sound-button');b.setAttribute('aria-pressed',String(sound));b.setAttribute('aria-label',sound?'关闭音效':'开启音效');b.innerHTML=sound?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5zM15 8c3 2 3 6 0 8M18 5c5 4 5 10 0 14"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5zM16 9l5 6m0-6-5 6"/></svg>';}
  $('sound-button').addEventListener('click',()=>{sound=!sound;store.set('sound',sound);initAudio();updateSoundButton();if(sound)tone('bonus');});updateSoundButton();
  $('gate-settings').innerHTML=GATE_LAYOUT.map((g,i)=>'<div class="gate-setting"><label for="gate-'+i+'"><span class="gate-dot" style="background:'+g.color+'"></span>0'+(i+1)+' · '+g.label+'</label><span>× <input id="gate-'+i+'" name="gate-'+i+'" type="number" min="1" max="20" step="1" required aria-label="第'+(i+1)+'个门的倍率"></span></div>').join('');
  function populateForm(config){config.multipliers.forEach((n,i)=>$('gate-'+i).value=n);$('initial-ammo').value=config.initialAmmo;$('bonus-every').value=config.bonusEvery;$('fever-threshold').value=config.feverThreshold;}
  $('settings-button').addEventListener('click',()=>{stopHold();wasPaused=game.status==='paused';game.pause();populateForm(settings);$('settings-dialog').showModal();updateUI();});
  $('close-settings').addEventListener('click',()=>$('settings-dialog').close());
  $('settings-dialog').addEventListener('close',()=>{if(!wasPaused)game.resume();updateUI();});
  $('restore-defaults').addEventListener('click',()=>populateForm(DEFAULTS));
  $('settings-form').addEventListener('submit',e=>{e.preventDefault();if(!$('settings-form').reportValidity())return;settings=validateSettings({multipliers:GATE_LAYOUT.map((_,i)=>Number($('gate-'+i).value)),initialAmmo:Number($('initial-ammo').value),bonusEvery:Number($('bonus-every').value),feverThreshold:Number($('fever-threshold').value)});store.set('settings',settings);reset();$('settings-dialog').close();toast('设置已保存，新的一局准备好了。');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopHold();game.pause();updateUI();}lastFrame=performance.now();accumulator=0;});
  function frame(now){const dt=Math.min(now-lastFrame,50);lastFrame=now;if(held&&now>=nextShot){shoot();nextShot=now+game.fireInterval;}accumulator+=dt;while(accumulator>=STEP){game.advance(STEP);accumulator-=STEP;}render(dt);if(now-lastUI>80){updateUI();lastUI=now;}requestAnimationFrame(frame);}
  $('best-score').textContent=format(best);updateUI();requestAnimationFrame(frame);
})();
