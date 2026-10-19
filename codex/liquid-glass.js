/* LiquidGlass — native WebGL 1 material renderer. No DOM screenshotting.
 * Give the renderer a canvas scene; DOM elements supply accessible controls
 * and their screen-space rounded rectangles. Rendering is event-driven.
 */
(() => {
  'use strict';
  const MAX_SHAPES = 16;
  const vertex = `attribute vec2 a_position;
    void main(){gl_Position=vec4(a_position,0.0,1.0);}`;
  const fragment = `precision highp float;
    uniform sampler2D u_scene;
    uniform vec2 u_resolution;
    uniform float u_dpr;
    uniform vec4 u_rects[16];
    uniform float u_radii[16];
    uniform int u_count;
    uniform float u_refraction, u_blur, u_shine, u_tint, u_mode, u_fusion;
    uniform vec3 u_color;
    uniform vec2 u_light;

    // Rounded-rectangle signed distance and its analytic gradient.
    float roundedRect(vec2 p, vec4 rect, float radius, out vec2 normal){
      vec2 local = p - rect.xy;
      vec2 q = abs(local) - rect.zw * 0.5 + radius;
      vec2 outside = max(q, 0.0);
      float len = length(outside);
      normal = len > 0.001 ? outside / len * sign(local) :
        (q.x > q.y ? vec2(sign(local.x),0.0) : vec2(0.0,sign(local.y)));
      return len + min(max(q.x,q.y),0.0) - radius;
    }
    vec4 scene(vec2 p){return texture2D(u_scene,clamp(p/u_resolution,vec2(0.001),vec2(0.999)));}
    vec3 blurred(vec2 p,float blur){
      vec3 c = scene(p).rgb * 0.25;
      c += scene(p+vec2(blur,0.0)).rgb * 0.125;
      c += scene(p-vec2(blur,0.0)).rgb * 0.125;
      c += scene(p+vec2(0.0,blur)).rgb * 0.125;
      c += scene(p-vec2(0.0,blur)).rgb * 0.125;
      c += scene(p+vec2(blur,blur)).rgb * 0.0625;
      c += scene(p+vec2(-blur,blur)).rgb * 0.0625;
      c += scene(p+vec2(blur,-blur)).rgb * 0.0625;
      c += scene(p-vec2(blur,blur)).rgb * 0.0625;
      return c;
    }
    void main(){
      vec2 p=vec2(gl_FragCoord.x/u_dpr,u_resolution.y-gl_FragCoord.y/u_dpr);
      vec3 base=scene(p).rgb;
      float d=10000.0;
      vec2 n=vec2(0.0),center=vec2(0.0);
      for(int i=0;i<16;i++){
        if(i>=u_count)break;
        vec2 nn;
        float dd=roundedRect(p,u_rects[i],u_radii[i],nn);
        if(u_fusion>0.0 && i>0){
          float h=clamp(0.5+0.5*(dd-d)/u_fusion,0.0,1.0);
          d=mix(dd,d,h)-u_fusion*h*(1.0-h);
          n=mix(nn,n,h);
          center=mix(u_rects[i].xy,center,h);
        }else if(dd<d){d=dd;n=nn;center=u_rects[i].xy;}
      }
      if(d>1.0){gl_FragColor=vec4(base,1.0);return;}
      n=normalize(n+vec2(0.00001));
      float inside=max(-d,0.0);
      float bevel=1.0-smoothstep(0.0,24.0,inside);
      float amount=u_mode==1.0?0.0:u_refraction;
      // The center samples outward (compression); the rim reverses the
      // offset (magnification). Together these form a controllable 2D lens.
      vec2 displacement=(p-center)*0.045*amount*(1.0-bevel)
        -n*pow(bevel,1.35)*amount*29.0;
      vec2 sampleAt=p+displacement;
      float mask=1.0-smoothstep(-0.75,0.75,d);
      if(u_mode==2.0){
        vec3 map=vec3(clamp(vec2(0.5)+displacement/64.0,0.0,1.0),0.5);
        gl_FragColor=vec4(mix(base*0.45,map,mask),1.0);return;
      }
      vec3 glass=blurred(sampleAt,u_blur);
      // Small channel split at the bevel: chromatic dispersion.
      float dispersion=bevel*amount*0.85;
      glass.r=mix(glass.r,scene(sampleAt+n*dispersion).r,0.28);
      glass.b=mix(glass.b,scene(sampleAt-n*dispersion).b,0.28);
      glass=mix(glass,u_color,u_tint);
      vec2 light=normalize(u_light-p+vec2(0.0001));
      float ndl=dot(n,light);
      float rim=exp(-inside*0.83);
      float wide=exp(-inside*0.12);
      float spec=(pow(max(ndl,0.0),3.0)*0.75+pow(max(-ndl,0.0),5.0)*0.24);
      glass+=vec3(1.0)*u_shine*(rim*(0.19+spec*0.75)+wide*spec*0.13);
      glass-=vec3(0.07)*wide*max(-ndl,0.0)*u_shine;
      gl_FragColor=vec4(mix(base,glass,mask),1.0);
    }`;

  class LiquidGlass {
    constructor({canvas, container, source, elements, onStatus = () => {}, fusion = 0}) {
      this.canvas=canvas;this.container=container;this.source=source;
      this.elements=Array.from(elements || container.querySelectorAll('[data-glass]')).slice(0,MAX_SHAPES);
      this.onStatus=onStatus;this.params={refraction:55,blur:2,shine:65,tint:12,color:'#ecf4ff',mode:'glass',adaptive:false,fusion};
      this.light={x:-100,y:-100};this.frame=0;this.lost=false;this.destroyed=false;this.visible=true;
      this.rects=new Float32Array(MAX_SHAPES*4);this.radii=new Float32Array(MAX_SHAPES);
      this.contextLost=(e)=>{e.preventDefault();this.lost=true;this.useFallback('上下文中断 · 毛玻璃降级');};
      this.contextRestored=()=>{this.lost=false;this.init();this.resize();this.upload();};
      canvas.addEventListener('webglcontextlost',this.contextLost);
      canvas.addEventListener('webglcontextrestored',this.contextRestored);
      this.init();
      this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
      this.visibilityObserver=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;if(this.visible)this.invalidate();});
      this.visibilityObserver.observe(container);
      this.visibilityHandler=()=>{if(!document.hidden)this.invalidate();};
      document.addEventListener('visibilitychange',this.visibilityHandler);
      this.resize();
    }
    init(){
      try {
        this.gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
        if(!this.gl)throw new Error('WebGL unavailable');
        const gl=this.gl;
        const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const info=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(info);}return s;};
        const vert=compile(gl.VERTEX_SHADER,vertex),frag=compile(gl.FRAGMENT_SHADER,fragment);
        this.program=gl.createProgram();gl.attachShader(this.program,vert);gl.attachShader(this.program,frag);gl.linkProgram(this.program);
        gl.deleteShader(vert);gl.deleteShader(frag);
        if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
        gl.useProgram(this.program);
        this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
        const location=gl.getAttribLocation(this.program,'a_position');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
        this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        this.uniforms={};for(const name of ['scene','resolution','dpr','rects[0]','radii[0]','count','refraction','blur','shine','tint','mode','fusion','color','light'])this.uniforms[name]=gl.getUniformLocation(this.program,'u_'+name);
        this.ready=true;this.container.classList.remove('fallback');this.canvas.style.visibility='visible';this.container.style.backgroundImage='';
        this.onStatus('WebGL · 实时折射');
      }catch(error){this.ready=false;this.useFallback('WebGL 不可用 · 毛玻璃降级');console.warn('LiquidGlass fallback:',error.message);}
    }
    useFallback(message){
      this.container.classList.add('fallback');this.canvas.style.visibility='hidden';
      if(this.source.width)this.container.style.backgroundImage=`url("${this.source.toDataURL()}")`;
      this.container.style.backgroundSize='100% 100%';this.container.style.setProperty('--fallback-blur',this.params.blur+'px');
      this.onStatus(message);
    }
    resize(){
      const box=this.container.getBoundingClientRect();if(!box.width||!box.height)return;
      this.width=box.width;this.height=box.height;this.dpr=Math.min(window.devicePixelRatio||1,1.5);
      this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);
      if(this.ready&&!this.lost)this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
      this.invalidate();
    }
    upload(){
      if(this.ready&&!this.lost){const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.source);}
      else this.useFallback(this.lost?'上下文中断 · 毛玻璃降级':'WebGL 不可用 · 毛玻璃降级');
      this.invalidate();
    }
    set(next){Object.assign(this.params,next);if(!this.ready||this.lost)this.container.style.setProperty('--fallback-blur',this.params.blur+'px');this.invalidate();}
    setLight(x,y){this.light={x,y};this.invalidate();}
    invalidate(){if(this.destroyed||this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.visible&&!document.hidden)this.render();});}
    render(){
      if(!this.ready||this.lost||!this.width)return;
      const gl=this.gl,u=this.uniforms,p=this.params,root=this.container.getBoundingClientRect();
      let count=0,area=0;
      for(const el of this.elements){const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
        const cssRadius=getComputedStyle(el).borderTopLeftRadius;
        const resolvedRadius=cssRadius.includes('%')?parseFloat(cssRadius)/100*Math.min(r.width,r.height):parseFloat(cssRadius);
        const radius=Math.min(resolvedRadius||Number(el.dataset.radius)||0,r.width/2,r.height/2);
        this.rects.set([r.left-root.left+r.width/2,r.top-root.top+r.height/2,r.width,r.height],count*4);this.radii[count]=radius;
        area+=r.width*r.height-(4-Math.PI)*radius*radius;count++;
      }
      const coverage=Math.min(area/(this.width*this.height),1);
      const adaptive=p.adaptive?coverage*9:0;
      gl.useProgram(this.program);gl.uniform1i(u.scene,0);gl.uniform2f(u.resolution,this.width,this.height);gl.uniform1f(u.dpr,this.dpr);
      gl.uniform4fv(u['rects[0]'],this.rects);gl.uniform1fv(u['radii[0]'],this.radii);gl.uniform1i(u.count,count);
      gl.uniform1f(u.refraction,p.refraction/100*(p.adaptive?1-coverage*.35:1));gl.uniform1f(u.blur,p.blur+adaptive);
      gl.uniform1f(u.shine,p.shine/100);gl.uniform1f(u.tint,p.tint/100);gl.uniform1f(u.mode,p.mode==='frosted'?1:p.mode==='map'?2:0);
      gl.uniform1f(u.fusion,p.fusion);gl.uniform2f(u.light,this.light.x,this.light.y);
      const hex=p.color.replace('#','');gl.uniform3f(u.color,parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);
      gl.drawArrays(gl.TRIANGLES,0,6);
      this.lastRender={count,coverage,blur:p.blur+adaptive,mode:p.mode};
    }
    destroy(){
      this.destroyed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange',this.visibilityHandler);this.canvas.removeEventListener('webglcontextlost',this.contextLost);this.canvas.removeEventListener('webglcontextrestored',this.contextRestored);
      if(this.gl){this.gl.deleteTexture(this.texture);this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);}
    }
  }
  window.LiquidGlass=LiquidGlass;
})();
