(() => {
  'use strict';
  const $=(s,root=document)=>root.querySelector(s),$$=(s,root=document)=>Array.from(root.querySelectorAll(s));
  const stage=$('#stage'),source=document.createElement('canvas');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const defaults={refraction:55,blur:2,shine:65,tint:12,color:'#ecf4ff',mode:'glass',adaptive:false};
  const presets={clear:{refraction:55,blur:2,shine:65,tint:12},soft:{refraction:24,blur:11,shine:40,tint:23},strong:{refraction:88,blur:.5,shine:94,tint:7}};
  let scene='coast',view='home',saved=false,mergeRenderer=null,toastTimer;
  function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}

  // Original procedural artwork: one owned texture, no network, no CORS.
  function drawScene(canvas,width,height,theme,headline=true){
    const scale=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
    const ctx=canvas.getContext('2d');ctx.scale(scale,scale);const w=width,h=height;
    if(theme==='grid'){
      const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#496879');bg.addColorStop(1,'#9fafb5');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
      const cell=28;ctx.lineWidth=1;
      for(let x=0;x<w;x+=cell){ctx.strokeStyle=Math.round(x/cell)%4===0?'#dce9e68c':'#dce9e645';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
      for(let y=0;y<h;y+=cell){ctx.strokeStyle=Math.round(y/cell)%4===0?'#dce9e68c':'#dce9e645';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
      ctx.fillStyle='#f0f5ef88';ctx.font='9px monospace';for(let x=10;x<w;x+=112)for(let y=20;y<h;y+=112)ctx.fillText(`${x-10},${y-20}`,x,y);
      ctx.strokeStyle='#f4dfb9';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,h*.37);ctx.lineTo(w,h*.37);ctx.stroke();
    }else if(theme==='aurora'){
      const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#1d2e4e');bg.addColorStop(.48,'#7487a8');bg.addColorStop(1,'#c4a6c0');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
      for(let i=0;i<5;i++){
        const grad=ctx.createLinearGradient(0,h*.15+i*30,w,h*.8);grad.addColorStop(0,['#9ad4dc88','#6c80cbaa','#93bedcaa','#e8c6dcaa','#6b75a277'][i]);grad.addColorStop(.5,'#d6e7e575');grad.addColorStop(1,'#7783ab11');
        ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(-w*.2,h*(.25+i*.13));ctx.bezierCurveTo(w*.45,-h*.22+i*50,w*.5,h*1.1,w*1.2,h*(.3+i*.15));ctx.lineTo(w*1.2,h*1.3);ctx.lineTo(-w*.2,h*1.3);ctx.closePath();ctx.fill();
        ctx.strokeStyle='#f0ecff30';ctx.lineWidth=1;ctx.stroke();
      }
    }else{
      const sky=ctx.createLinearGradient(0,0,w*.2,h);sky.addColorStop(0,'#486d7e');sky.addColorStop(.28,'#9cb7be');sky.addColorStop(.52,'#d4d5c9');sky.addColorStop(.7,'#9caead');sky.addColorStop(1,'#b8a088');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
      const sunlight=ctx.createRadialGradient(w*.82,h*.16,0,w*.82,h*.16,w*.65);sunlight.addColorStop(0,'#fff2d58c');sunlight.addColorStop(.3,'#eee4c936');sunlight.addColorStop(1,'#efdfbc00');ctx.fillStyle=sunlight;ctx.fillRect(0,0,w,h);
      // Atmospheric headlands.
      ctx.fillStyle='#768c8e65';ctx.beginPath();ctx.moveTo(0,h*.4);ctx.bezierCurveTo(w*.1,h*.35,w*.23,h*.36,w*.34,h*.43);ctx.bezierCurveTo(w*.49,h*.53,w*.57,h*.36,w*.73,h*.45);ctx.lineTo(w,h*.49);ctx.lineTo(0,h*.56);ctx.fill();
      const sea=ctx.createLinearGradient(0,h*.47,0,h);sea.addColorStop(0,'#7e9b9c');sea.addColorStop(.25,'#6b9195');sea.addColorStop(1,'#b9d1c7');ctx.fillStyle=sea;ctx.beginPath();ctx.moveTo(0,h*.47);ctx.bezierCurveTo(w*.3,h*.43,w*.62,h*.46,w,h*.47);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();
      // Thin water lines make optical distortion inspectable.
      for(let i=0;i<95;i++){
        const y=h*.48+(i/95)**1.35*h*.52;const amplitude=1+i*.07;
        ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(w*.3,y-amplitude,w*.63,y+amplitude*1.4,w,y-2);ctx.lineWidth=i%5===0?1:.45;ctx.strokeStyle=`rgba(225,238,224,${.04+(i%7)*.014})`;ctx.stroke();
      }
      const sand=ctx.createLinearGradient(w*.8,h*.62,w*.3,h);sand.addColorStop(0,'#d7c5a8');sand.addColorStop(.35,'#c5ac8d');sand.addColorStop(1,'#9b816c');ctx.fillStyle=sand;
      ctx.beginPath();ctx.moveTo(w*1.1,h*.37);ctx.bezierCurveTo(w*.8,h*.54,w*.95,h*.63,w*.65,h*.8);ctx.bezierCurveTo(w*.48,h*.94,w*.25,h*.88,-w*.12,h*1.1);ctx.lineTo(w*1.1,h*1.1);ctx.closePath();ctx.fill();
      for(let i=0;i<6;i++){
        ctx.beginPath();ctx.moveTo(w*1.1+i*5,h*.37-10+i*3);ctx.bezierCurveTo(w*.8-i*4,h*.54,w*.95-i*4,h*.63,w*.65-i*4,h*.8-i*2);ctx.bezierCurveTo(w*.48-i*5,h*.94-i*2,w*.25-i*5,h*.88-i*3,-w*.12,h*1.1-i*3);
        ctx.lineWidth=i===0?3.5:1;ctx.strokeStyle=i===0?'#e9eee2a6':`rgba(231,237,219,${.27-i*.035})`;ctx.stroke();
      }
      const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,'#16384f17');shade.addColorStop(.5,'#263a3c00');shade.addColorStop(1,'#273b4333');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    }
    if(headline){
      const mobile=w<450;ctx.fillStyle='#fffdf2e6';const size=mobile?57:Math.min(85,w*.104);ctx.font=`500 ${size}px Georgia, "Times New Roman", serif`;ctx.textBaseline='top';ctx.letterSpacing='-2px';
      const text=view==='favorites'?(saved?['Keep the','good light.']:['Room for','a favorite.']):view==='explore'?['Follow','the light.']:['A little','clarity.'];
      const x=mobile?22:32,y=h*.225;ctx.fillText(text[0],x,y);ctx.fillText(text[1],x,y+size*.94);ctx.letterSpacing='0px';
    }
  }
  const renderer=new LiquidGlass({canvas:$('#glass-canvas'),container:stage,source,onStatus:s=>$('#renderer-status').textContent=s});
  const redraw=()=>{const r=stage.getBoundingClientRect();drawScene(source,r.width,r.height,scene);renderer.upload();};
  const sceneResize=new ResizeObserver(()=>{redraw();clampDraggables(stage);});sceneResize.observe(stage);redraw();
  function updateRange(input){const v=(+input.value-Number(input.min))/(Number(input.max)-Number(input.min))*100;input.style.setProperty('--progress',v+'%');}
  function syncParameters(){
    for(const key of ['refraction','blur','shine','tint']){const el=$('#'+key);el.value=renderer.params[key];updateRange(el);$('#'+key+'-value').innerHTML=(key==='blur'?Number(el.value).toFixed(1):el.value)+`<span>${key==='blur'?'px':'%'}</span>`;}
    $$('.swatches button').forEach(b=>{const yes=b.dataset.color===renderer.params.color;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',yes);});
    $('#adaptive').checked=renderer.params.adaptive;
    if(mergeRenderer)mergeRenderer.set({...renderer.params,mode:'glass',fusion:+$('#fusion').value});
  }
  for(const key of ['refraction','blur','shine','tint'])$('#'+key).addEventListener('input',e=>{
    renderer.set({[key]:+e.target.value});syncParameters();$$('[data-preset]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});
  });
  $$('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
    renderer.set(presets[button.dataset.preset]);syncParameters();$$('[data-preset]').forEach(b=>{const yes=b===button;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',yes);});
  }));
  $$('.swatches button').forEach(b=>b.addEventListener('click',()=>{renderer.set({color:b.dataset.color});syncParameters();}));
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
    renderer.set({mode:b.dataset.mode});$$('[data-mode]').forEach(x=>{const yes=x===b;x.classList.toggle('selected',yes);x.setAttribute('aria-pressed',yes);});
    if(b.dataset.mode==='map')toast('置换场：R = 水平偏移，G = 垂直偏移，中性值为 0.5');
  }));
  const scenes={coast:{name:'海岸晨光',index:'01 / COASTLINE',desc:'在光与海之间，慢下来。'},aurora:{name:'流动极光',index:'02 / AURORA',desc:'光缓缓游走，留下柔软的轮廓。'},grid:{name:'折射测试网格',index:'03 / OPTICAL GRID',desc:'把透镜放在线条上，观察边缘的弯折。'}};
  function setScene(next){scene=next;stage.dataset.theme=scene;$('#scene-name').textContent=scenes[scene].name;$('.scene-index').textContent=scenes[scene].index;$('#scene-description').textContent=scenes[scene].desc;
    $$('[data-scene]').forEach(b=>{const yes=b.dataset.scene===scene;b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',yes);});redraw();
  }
  $$('[data-scene]').forEach(b=>b.addEventListener('click',()=>setScene(b.dataset.scene)));
  $('#adaptive').addEventListener('change',e=>{renderer.set({adaptive:e.target.checked});syncParameters();});
  $('#follow-light').checked=!reducedMotion.matches;
  function pointerLight(event,container,instance){if(!$('#follow-light').checked||reducedMotion.matches)return;const r=container.getBoundingClientRect();instance.setLight(event.clientX-r.left,event.clientY-r.top);}
  stage.addEventListener('pointermove',e=>pointerLight(e,stage,renderer));stage.addEventListener('pointerleave',()=>renderer.setLight(-100,-100));
  $('#follow-light').addEventListener('change',()=>{if(!$('#follow-light').checked)renderer.setLight(-100,-100);});
  reducedMotion.addEventListener('change',()=>{$('#follow-light').checked=!reducedMotion.matches;renderer.setLight(-100,-100);});
  function clampDraggables(container){$$('[data-draggable]',container).forEach(el=>{if(!el.style.left)return;const maxX=Math.max(0,container.clientWidth-el.offsetWidth),maxY=Math.max(0,container.clientHeight-el.offsetHeight);el.style.left=Math.max(0,Math.min(parseFloat(el.style.left),maxX))+'px';el.style.top=Math.max(0,Math.min(parseFloat(el.style.top),maxY))+'px';});}
  function draggable(el,container,instance){
    el.dataset.draggable='true';let drag=null;
    const position=(x,y)=>{el.style.left=Math.max(0,Math.min(x,container.clientWidth-el.offsetWidth))+'px';el.style.top=Math.max(0,Math.min(y,container.clientHeight-el.offsetHeight))+'px';instance.invalidate();};
    el.addEventListener('pointerdown',e=>{if(e.button!==0)return;const a=el.getBoundingClientRect(),b=container.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:a.left-b.left,top:a.top-b.top,id:e.pointerId};el.setPointerCapture(e.pointerId);});
    el.addEventListener('pointermove',e=>{if(drag&&e.pointerId===drag.id)position(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);});
    const end=()=>drag=null;el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);
    el.addEventListener('keydown',e=>{const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;e.preventDefault();const a=el.getBoundingClientRect(),b=container.getBoundingClientRect(),step=e.shiftKey?20:5;position(a.left-b.left+d[0]*step,a.top-b.top+d[1]*step);});
  }
  draggable($('#lens'),stage,renderer);
  function selectView(next){view=next;const buttons=$$('[data-view]'),index=buttons.findIndex(b=>b.dataset.view===view);buttons.forEach(b=>{const yes=b.dataset.view===view;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',yes);});
    const b=buttons[index];$('.dock-indicator').style.width=b.offsetWidth+'px';$('.dock-indicator').style.transform=`translateX(${b.offsetLeft-buttons[0].offsetLeft}px)`;redraw();
    if(view==='favorites')$('#scene-description').textContent=saved?'已收藏这束光。':'点击右下角加号，收藏当前场景。';
    else $('#scene-description').textContent=view==='explore'?'试试右侧的三种背景，寻找你的光。':scenes[scene].desc;
  }
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.view)));
  new ResizeObserver(()=>selectView(view)).observe($('.dock'));
  function favorite(){saved=!saved;$('#favorite').classList.toggle('saved',saved);$('#favorite').setAttribute('aria-pressed',saved);$('#favorite').setAttribute('aria-label',saved?'取消收藏当前场景':'收藏当前场景');$('#favorite use').setAttribute('href',saved?'#i-check':'#i-plus');toast(saved?'已收藏当前场景（本次会话）':'已取消收藏');if(view==='favorites')selectView(view);}
  $('#favorite').addEventListener('click',favorite);

  // A small real, locally synthesized sound. Audio begins only on a user gesture.
  let audioContext=null,audioGain=null,oscillators=[],playing=false;
  async function toggleAudio(){
    try{
      if(playing){audioGain.gain.setTargetAtTime(0,audioContext.currentTime,.12);playing=false;await audioContext.suspend();}
      else{
        if(!audioContext){const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)throw new Error('当前浏览器不支持 Web Audio');audioContext=new AudioCtx();audioGain=audioContext.createGain();audioGain.gain.value=0;audioGain.connect(audioContext.destination);
          [130.81,196,261.63,329.63].forEach((f,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=f;osc.detune.value=(i-1.5)*3;gain.gain.value=.12;osc.connect(gain);gain.connect(audioGain);osc.start();oscillators.push(osc);});
        }
        await audioContext.resume();audioGain.gain.setTargetAtTime(+$('#volume').value/100*.24,audioContext.currentTime,.35);playing=true;
      }
      $('#play').setAttribute('aria-pressed',playing);$('#play').setAttribute('aria-label',playing?'暂停氛围音':'播放氛围音');$('#play use').setAttribute('href',playing?'#i-pause':'#i-play');$('#track-status').textContent=playing?'合成氛围音 · 正在播放':'合成氛围音 · 已暂停';
    }catch(error){toast('音频未能播放：'+error.message);}
  }
  $('#play').addEventListener('click',toggleAudio);
  $('#volume').addEventListener('input',e=>{updateRange(e.target);$('#volume-value').textContent=e.target.value;if(playing)audioGain.gain.setTargetAtTime(+e.target.value/100*.24,audioContext.currentTime,.1);});
  window.addEventListener('pagehide',()=>{if(audioContext)audioContext.suspend();});

  $('#reset').addEventListener('click',()=>{
    renderer.set({...defaults});$('#follow-light').checked=!reducedMotion.matches;renderer.setLight(-100,-100);syncParameters();
    $$('[data-preset]').forEach(b=>{const yes=b.dataset.preset==='clear';b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',yes);});
    $$('[data-mode]').forEach(b=>{const yes=b.dataset.mode==='glass';b.classList.toggle('selected',yes);b.setAttribute('aria-pressed',yes);});
    $('#lens').style.left='';$('#lens').style.top='';toast('已恢复默认材质');
  });
  $('#export-config').addEventListener('click',async()=>{
    const config=JSON.stringify({...renderer.params,followLight:$('#follow-light').checked,scene},null,2);
    try{await navigator.clipboard.writeText(config);toast('材质参数已复制');}
    catch{const blob=new Blob([config],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='liquid-glass-config.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出材质参数 JSON');}
  });
  $('#open-code').addEventListener('click',()=>$('#code-dialog').showModal());
  $$('.dialog-close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();}));
  $('#merge-open').addEventListener('click',()=>{
    $('#merge-dialog').showModal();
    if(!mergeRenderer){const container=$('#merge-stage'),mergeSource=document.createElement('canvas');
      mergeRenderer=new LiquidGlass({canvas:$('#merge-canvas'),container,source:mergeSource,fusion:+$('#fusion').value});
      const refresh=()=>{const r=container.getBoundingClientRect();if(!r.width)return;drawScene(mergeSource,r.width,r.height,'grid',false);mergeRenderer.upload();clampDraggables(container);};
      new ResizeObserver(refresh).observe(container);refresh();$$('.orb').forEach(b=>draggable(b,container,mergeRenderer));container.addEventListener('pointermove',e=>pointerLight(e,container,mergeRenderer));
    }
    syncParameters();mergeRenderer.resize();mergeRenderer.invalidate();
  });
  $('#fusion').addEventListener('input',e=>{updateRange(e.target);$('#fusion-value').textContent=e.target.value+'px';if(mergeRenderer)mergeRenderer.set({fusion:+e.target.value});});
  syncParameters();$$('input[type=range]').forEach(updateRange);
  // Small inspection hook for integration / QA.
  window.liquidLab={renderer,get mergeRenderer(){return mergeRenderer;},get scene(){return scene;},get audioState(){return audioContext?audioContext.state:'uninitialized';},drawScene};
})();
