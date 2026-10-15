(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./vendor/matter.min.js'));else root.MarbleCore=factory(root.Matter);})(typeof globalThis!=='undefined'?globalThis:this,function(Matter){
  'use strict';
  const {Engine,Bodies,Body,Composite,Vector}=Matter;
  const WIDTH=600,HEIGHT=780,RADIUS=5.5,MAX_ACTIVE=400,STEP=1000/120;
  const DEFAULTS=Object.freeze({multipliers:Object.freeze([5,5,20,3,3]),initialAmmo:30,bonusEvery:100});
  const GATE_LAYOUT=[
    {y:207,center:370,travel:118,speed:.57,phase:.5,color:'#e6e995',label:'上方 · 第一门'},
    {y:304,center:294,travel:163,speed:.48,phase:3.4,color:'#ffc296',label:'中部 · 第二门'},
    {y:402,center:290,travel:160,speed:.65,phase:4.5,color:'#f3aabb',label:'中部 · 第三门'},
    {y:511,center:171,travel:70,speed:.68,phase:2.6,color:'#bdb5f2',label:'下方 · 左门'},
    {y:511,center:429,travel:70,speed:.68,phase:5.74,color:'#a4dace',label:'下方 · 右门'}
  ];
  function validateSettings(input={}){
    if(!input||typeof input!=='object')input={};
    const bounded=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Math.round(Number(value)))):fallback;
    return {multipliers:DEFAULTS.multipliers.map((n,i)=>bounded(input.multipliers?.[i],n,1,20)),initialAmmo:bounded(input.initialAmmo,30,1,1000),bonusEvery:bounded(input.bonusEvery,100,1,10000)};
  }
  class MarbleGame{
    constructor(settings={},onEvent=()=>{},random=Math.random){this.onEvent=onEvent;this.random=random;this.reset(settings);}
    reset(settings=this.settings){
      if(this.engine){Composite.clear(this.engine.world,false);Engine.clear(this.engine);}
      this.settings=validateSettings(settings);this.engine=Engine.create({enableSleeping:false,positionIterations:8,velocityIterations:6});this.engine.gravity.y=1;this.engine.gravity.scale=.001;
      this.balls=[];this.pending=new Map();this.pendingCount=0;this.score=0;this.ammo=this.settings.initialAmmo;this.fired=0;this.earned=0;this.gateHits=0;this.elapsed=0;this.drainClock=0;this.status='ready';this.spawnSerial=0;
      this.gates=GATE_LAYOUT.map((g,i)=>({...g,id:i,multiplier:this.settings.multipliers[i],x:g.center+Math.sin(g.phase)*g.travel,width:112,flash:0}));
      const wallOptions={isStatic:true,restitution:.52,friction:.03,slop:.02};
      const wall=(x,y,w,h,angle=0)=>Bodies.rectangle(x,y,w,h,{...wallOptions,angle});
      // Thick boundary bodies and 120 Hz steps keep each movement below a ball diameter.
      this.walls=[wall(14,350,28,760),wall(586,350,28,760),wall(300,-25,600,50),wall(115,663,270,24,.35),wall(485,663,270,24,-.35),wall(226,744,20,88),wall(374,744,20,88)];
      Composite.add(this.engine.world,this.walls);this.updateGates(0);this.onEvent({type:'reset'});
    }
    get nozzleX(){return 300+Math.sin(this.elapsed*.00068)*205;}
    get remainingToBonus(){return this.settings.bonusEvery-this.score%this.settings.bonusEvery;}
    updateGates(dt){for(const g of this.gates){g.x=g.center+Math.sin(this.elapsed*.001*g.speed+g.phase)*g.travel;g.flash=Math.max(0,g.flash-dt*.003);}}
    emit(type,data={}){this.onEvent({type,...data});}
    makeBall(x,y,passed=0,vx=0,vy=1.8){
      const body=Bodies.circle(x,y,RADIUS,{restitution:.58,friction:.025,frictionStatic:.01,frictionAir:.0007,density:.001,slop:.015});
      body.plugin={passed,hue:this.spawnSerial++%5,previous:{x,y}};Body.setVelocity(body,{x:vx,y:vy});this.balls.push(body);Composite.add(this.engine.world,body);return body;
    }
    isFree(x,y,hash){
      if(x<35||x>565||y>625)return false;
      const size=RADIUS*2+1,cx=Math.floor(x/size),cy=Math.floor(y/size),min=size*size;
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const bucket=hash.get((cx+dx)+','+(cy+dy));if(bucket)for(const b of bucket)if((b.position.x-x)**2+(b.position.y-y)**2<min)return false;}
      return true;
    }
    putHash(hash,b){const size=RADIUS*2+1,key=Math.floor(b.position.x/size)+','+Math.floor(b.position.y/size);if(!hash.has(key))hash.set(key,[]);hash.get(key).push(b);}
    positionHash(){const hash=new Map();for(const b of this.balls)this.putHash(hash,b);return hash;}
    fire(){
      if(this.status==='paused'||this.status==='over'||this.ammo===0||this.balls.length>=MAX_ACTIVE)return false;
      const x=this.nozzleX,y=88;if(!this.isFree(x,y,this.positionHash()))return false;
      this.makeBall(x,y,0,(this.random()-.5)*.9,2.4);this.ammo--;this.fired++;this.status='running';this.emit('fire',{x,y});return true;
    }
    multiply(ball,gate){
      const bit=1<<gate.id;if(ball.plugin.passed&bit)return;
      ball.plugin.passed|=bit;this.gateHits++;gate.flash=1;
      const extra=gate.multiplier-1;
      if(extra){const key=gate.id+':'+ball.plugin.passed;let batch=this.pending.get(key);if(!batch){batch={gateId:gate.id,passed:ball.plugin.passed,count:0,cursor:0};this.pending.set(key,batch);}batch.count+=extra;this.pendingCount+=extra;}
      this.emit('multiply',{x:ball.position.x,y:gate.y,multiplier:gate.multiplier,color:gate.color});
    }
    releasePending(){
      if(!this.pendingCount||this.balls.length>=MAX_ACTIVE)return;
      const hash=this.positionHash();let spawned=0;
      // Aggregate by gate and inherited hit mask: memory stays bounded even at high multipliers.
      for(const [key,batch] of this.pending){
        const gate=this.gates[batch.gateId];let tries=0;
        while(batch.count&&this.balls.length<MAX_ACTIVE&&spawned<18&&tries<40){
          const slot=batch.cursor++%40;tries++;
          const col=slot%8,row=Math.floor(slot/8),x=gate.x+(col-3.5)*12,y=gate.y+20+row*12;
          if(!this.isFree(x,y,hash))continue;
          const b=this.makeBall(x,y,batch.passed,(col-3.5)*.13,1+this.random()*.4);this.putHash(hash,b);batch.count--;this.pendingCount--;spawned++;
        }
        if(batch.count===0)this.pending.delete(key);
        if(spawned>=18||this.balls.length>=MAX_ACTIVE)break;
      }
    }
    credit(count){const before=Math.floor(this.score/this.settings.bonusEvery);this.score+=count;const reward=Math.floor(this.score/this.settings.bonusEvery)-before;if(reward){this.ammo+=reward;this.earned+=reward;this.emit('bonus',{count:reward});}this.emit('score',{count});}
    advance(dt=STEP){
      if(this.status==='paused'||this.status==='over')return;
      // Subdivide external steps too, so background lag never becomes one large physics jump.
      let remaining=Math.min(Math.max(dt,0),100);
      while(remaining>0){const h=Math.min(STEP,remaining);this.tick(h);remaining-=h;if(this.status==='over')break;}
    }
    tick(dt){
      this.elapsed+=dt;this.updateGates(dt);if(this.status==='ready')return;
      for(const b of this.balls){b.plugin.previous={...b.position};const speed=Vector.magnitude(b.velocity);if(speed>7)Body.setVelocity(b,Vector.mult(b.velocity,7/speed));}
      Engine.update(this.engine,dt);
      const exited=[];
      for(const b of this.balls){
        const prev=b.plugin.previous,now=b.position;
        for(const g of this.gates){
          if(prev.y<g.y&&now.y>=g.y&&!(b.plugin.passed&(1<<g.id))){const t=(g.y-prev.y)/(now.y-prev.y),x=prev.x+(now.x-prev.x)*t;if(Math.abs(x-g.x)<g.width/2-RADIUS)this.multiply(b,g);}
        }
        if(now.y>HEIGHT+RADIUS)exited.push(b);
      }
      if(exited.length){const ids=new Set(exited.map(b=>b.id));this.balls=this.balls.filter(b=>!ids.has(b.id));for(const b of exited)Composite.remove(this.engine.world,b);this.credit(exited.length);}
      this.releasePending();
      if(this.ammo===0&&this.balls.length===0&&this.pendingCount===0){this.drainClock+=dt;if(this.drainClock>=250){this.status='over';this.emit('over',{score:this.score});}}else this.drainClock=0;
    }
    pause(){if(this.status==='running'||this.status==='ready'){this.beforePause=this.status;this.status='paused';return true;}return false;}
    resume(){if(this.status==='paused')this.status=this.beforePause||'running';}
    snapshot(){return {status:this.status,score:this.score,ammo:this.ammo,active:this.balls.length,pending:this.pendingCount,fired:this.fired,earned:this.earned,gateHits:this.gateHits};}
  }
  return {MarbleGame,DEFAULTS,GATE_LAYOUT,validateSettings,WIDTH,HEIGHT,RADIUS,MAX_ACTIVE,STEP};
});
