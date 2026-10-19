/* metaballs.js — WebGL 融球玻璃
 * 与 DOM 控件用的是同一套“边缘拉伸”折射：用 SDF 求到边缘的距离和法线，
 * 在 bezel 宽度内按圆弧轮廓把取样点向内拉。形状是多个圆的平滑并集（smooth min），
 * 所以玻璃体靠近时会自然融合。每帧只是一次全屏绘制，几十个玻璃体也不费力。
 */
(function () {
  'use strict';
  const canvas = document.getElementById('blobCanvas');
  const fpsEl = document.getElementById('fps');
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
  if (!gl) { fpsEl.textContent = '此浏览器不支持 WebGL'; return; }

  const MAX = 40;
  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform sampler2D u_tex;
uniform vec3 u_b[${MAX}];
uniform int u_n;
uniform float u_k, u_refr, u_bezel, u_blur, u_dpr;
uniform vec2 u_light;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float sdf(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= u_n) break;
    float di = length(p - u_b[i].xy) - u_b[i].z;
    d = u_k > 0.0 ? smin(d, di, u_k) : min(d, di);
  }
  return d;
}
vec3 tex(vec2 p) { return texture2D(u_tex, clamp(p / u_res, 0.0, 1.0)).rgb; }
// 12 点黄金角螺旋采样做虚化
vec3 blurTex(vec2 p) {
  if (u_blur < 0.01) return tex(p);
  vec3 acc = tex(p);
  float r = u_blur * u_dpr;
  for (int i = 1; i < 12; i++) {
    float fi = float(i);
    float a = fi * 2.39996;
    acc += tex(p + vec2(cos(a), sin(a)) * r * sqrt(fi / 11.0));
  }
  return acc / 12.0;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  float d = sdf(p);
  vec3 bg = tex(p);
  // 投影
  float sd = sdf(p - vec2(0.0, 10.0 * u_dpr));
  bg *= 1.0 - 0.28 * (1.0 - smoothstep(-4.0 * u_dpr, 26.0 * u_dpr, sd)) * step(0.0, d);
  if (d > 1.5) { gl_FragColor = vec4(bg, 1.0); return; }

  float e = 1.0;
  vec2 n = normalize(vec2(sdf(p + vec2(e, 0.0)) - sdf(p - vec2(e, 0.0)),
                          sdf(p + vec2(0.0, e)) - sdf(p - vec2(0.0, e))) + 1e-6);
  float t = max(-d, 0.0);
  float bez = max(1.0, u_bezel * u_dpr);
  float u = 1.0 - clamp(t / bez, 0.0, 1.0);
  float edge = u_refr * u_dpr * (1.0 - sqrt(max(0.0, 1.0 - u * u)));
  vec2 off = -n * edge;

  // 色散：三个通道折射量略有不同
  vec3 col;
  col.r = blurTex(p + off * 1.1).r;
  col.g = blurTex(p + off).g;
  col.b = blurTex(p + off * 0.9).b;

  col = mix(col, vec3(1.0), 0.06);
  float rim = 1.0 - smoothstep(0.0, bez * 0.7, t);
  vec2 L = normalize(u_light);
  float spec = pow(max(dot(n, L), 0.0), 2.0) * rim + pow(max(dot(n, -L), 0.0), 3.0) * rim * 0.45;
  col += spec * 0.6;
  col += (1.0 - smoothstep(0.0, 1.6 * u_dpr, t)) * 0.18;

  float a = 1.0 - smoothstep(-0.8, 0.8, d);
  gl_FragColor = vec4(mix(bg, col, a), 1.0);
}`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ['u_res', 'u_tex', 'u_b', 'u_n', 'u_k', 'u_refr', 'u_bezel', 'u_blur', 'u_dpr', 'u_light'].forEach((n) => {
    U[n] = gl.getUniformLocation(prog, n);
  });

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // ───────── 背景纹理：默认用程序生成的海报，可被上传的图片替换 ─────────
  let userImage = null;
  const bgCanvas = document.createElement('canvas');
  function paintBackground(W, H, dpr) {
    bgCanvas.width = W; bgCanvas.height = H;
    const c = bgCanvas.getContext('2d');
    if (userImage) {
      const s = Math.max(W / userImage.width, H / userImage.height);
      const w = userImage.width * s, h = userImage.height * s;
      c.drawImage(userImage, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#101a3c'); g.addColorStop(0.55, '#3a1d63'); g.addColorStop(1, '#ff7a59');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // 彩条
      const bars = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de'];
      bars.forEach((col, i) => { c.fillStyle = col; c.fillRect(W * 0.62 + i * 22 * dpr, 0, 14 * dpr, H); });
      // 网格
      c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = dpr;
      const step = 28 * dpr;
      for (let x = 0; x < W; x += step) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
      for (let y = 0; y < H; y += step) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
      // 大字
      c.fillStyle = 'rgba(255,255,255,.92)';
      c.font = `800 ${Math.round(H * 0.24)}px "Bricolage Grotesque", "PingFang SC", system-ui, sans-serif`;
      c.textBaseline = 'middle';
      c.fillText('液态玻璃', W * 0.05, H * 0.36);
      c.font = `500 ${Math.round(14 * dpr)}px "JetBrains Mono", ui-monospace, monospace`;
      c.fillStyle = 'rgba(255,255,255,.75)';
      const line = 'P\'(x,y) = P(x + S·(R − 0.5), y + S·(G − 0.5))   ';
      for (let i = 0; i < 6; i++) c.fillText(line.repeat(4), W * 0.05, H * 0.62 + i * 22 * dpr);
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgCanvas);
  }
  window.addEventListener('lg-background', (e) => { userImage = e.detail; resize(true); });

  // ───────── 玻璃体：沿 Lissajous 轨迹漂移，可被指针抓住 ─────────
  let blobs = [];
  function rand(seed) { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); }
  function makeBlobs(n) {
    const old = blobs;
    blobs = [];
    for (let i = 0; i < n; i++) {
      const prev = old[i];
      blobs.push(prev || {
        r: 26 + rand(i + 1) * 46,
        ax: 0.18 + rand(i + 11) * 0.3, ay: 0.16 + rand(i + 21) * 0.26,
        wx: 0.12 + rand(i + 31) * 0.28, wy: 0.1 + rand(i + 41) * 0.3,
        px: rand(i + 51) * 6.28, py: rand(i + 61) * 6.28,
        x: 0, y: 0, grab: 0, gx: 0, gy: 0,
      });
    }
  }

  const ctl = {
    count: document.getElementById('b-count'),
    k: document.getElementById('b-k'),
    refr: document.getElementById('b-refr'),
    blur: document.getElementById('b-blur'),
  };
  const fmt = { count: (v) => v, k: (v) => v + ' px', refr: (v) => v + ' px', blur: (v) => v + ' px' };
  for (const key in ctl) {
    const inp = ctl[key];
    const out = inp.parentElement.querySelector('output');
    const sync = () => { out.textContent = fmt[key](inp.value); if (key === 'count') makeBlobs(+inp.value); };
    inp.addEventListener('input', sync);
    sync();
  }

  let W = 0, H = 0, dpr = 1;
  function resize(force) {
    const r = canvas.getBoundingClientRect();
    const nd = Math.min(1.5, window.devicePixelRatio || 1);
    const nw = Math.round(r.width * nd), nh = Math.round(r.height * nd);
    if (!force && nw === W && nh === H) return;
    W = nw; H = nh; dpr = nd;
    canvas.width = W; canvas.height = H;
    gl.viewport(0, 0, W, H);
    paintBackground(W, H, dpr);
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => resize()).observe(canvas);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => resize(true));

  // 指针：抓住最近的一颗
  let held = null;
  function local(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e);
    let best = null, bd = Infinity;
    for (const b of blobs) { const d = Math.hypot(b.x - x, b.y - y) - b.r; if (d < bd) { bd = d; best = b; } }
    if (!best) return;
    held = best; held.gx = x; held.gy = y;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => { if (held) { const [x, y] = local(e); held.gx = x; held.gy = y; } });
  const drop = () => { held = null; canvas.style.cursor = ''; };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);

  // ───────── 渲染循环 ─────────
  const data = new Float32Array(MAX * 3);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = true, t = 0, last = performance.now(), frames = 0, fpsT = last;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    resize();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt * (reduce ? 0.15 : 1);
    const cw = W / dpr, ch = H / dpr;
    blobs.forEach((b, i) => {
      const ox = cw / 2 + Math.sin(t * b.wx + b.px) * cw * b.ax;
      const oy = ch / 2 + Math.sin(t * b.wy + b.py) * ch * b.ay;
      b.grab += ((b === held ? 1 : 0) - b.grab) * 0.15;
      const tx = ox + (b.gx - ox) * b.grab, ty = oy + (b.gy - oy) * b.grab;
      b.x = b.x ? b.x + (tx - b.x) * 0.25 : tx;
      b.y = b.y ? b.y + (ty - b.y) * 0.25 : ty;
      data[i * 3] = b.x * dpr; data[i * 3 + 1] = b.y * dpr; data[i * 3 + 2] = b.r * dpr;
    });
    gl.uniform2f(U.u_res, W, H);
    gl.uniform1i(U.u_tex, 0);
    gl.uniform3fv(U.u_b, data);
    gl.uniform1i(U.u_n, blobs.length);
    gl.uniform1f(U.u_k, +ctl.k.value * dpr);
    gl.uniform1f(U.u_refr, +ctl.refr.value);
    gl.uniform1f(U.u_bezel, 30);
    gl.uniform1f(U.u_blur, +ctl.blur.value);
    gl.uniform1f(U.u_dpr, dpr);
    gl.uniform2f(U.u_light, -0.6, -0.8);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    frames++;
    if (now - fpsT > 500) {
      fpsEl.textContent = Math.round((frames * 1000) / (now - fpsT)) + ' fps · ' + blobs.length + ' 个玻璃体';
      frames = 0; fpsT = now;
    }
  }
  resize(true);
  requestAnimationFrame(frame);
})();
