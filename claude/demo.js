/* demo.js — 把 liquid-glass.js 接到演示页面的各个控件上 */
(function () {
  'use strict';
  const LG = window.LiquidGlass;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const screen = $('#screen');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  $('#support').innerHTML = LG.supported
    ? '当前浏览器：<b>Chromium 内核</b> · 置换贴图折射已启用（SVG backdrop-filter）'
    : '当前浏览器不支持 SVG backdrop-filter · 控件已<b>回退为毛玻璃</b>，下方融球演示不受影响';

  LG.attachAll('.lg', screen);

  // ───────── 参数栏 ─────────
  const css = { tint: 0.1, spec: 0.8 };
  const fmt = {
    refraction: (v) => v.toFixed(0) + ' px',
    bezel: (v) => v.toFixed(0) + ' px',
    prescale: (v) => '×' + v.toFixed(2),
    dispersion: (v) => v.toFixed(2),
    blur: (v) => v.toFixed(1) + ' px',
    saturation: (v) => v.toFixed(2),
    tint: (v) => Math.round(v * 100) + '%',
    spec: (v) => Math.round(v * 100) + '%',
  };
  const PRESETS = {
    ios: { refraction: 26, bezel: 16, prescale: 1.06, dispersion: 0.1, blur: 1.2, saturation: 1.6, tint: 0.1, spec: 0.8 },
    strong: { refraction: 52, bezel: 30, prescale: 1.16, dispersion: 0.28, blur: 0.3, saturation: 1.9, tint: 0.04, spec: 1 },
    // 传统毛玻璃：只有虚化程度和遮罩明暗两个参数
    frost: { refraction: 0, bezel: 16, prescale: 1, dispersion: 0, blur: 10, saturation: 1.4, tint: 0.38, spec: 0.3 },
  };
  const inputs = $$('.panel input[type=range]');
  let shotMode = false;

  function paramValue(key) {
    return key in css ? css[key] : LG.params[key];
  }
  function syncInputs() {
    for (const inp of inputs) {
      const key = inp.dataset.param || inp.dataset.css;
      const v = paramValue(key);
      inp.value = v;
      inp.parentElement.querySelector('output').textContent = fmt[key](v);
    }
  }
  function applyCss() {
    screen.style.setProperty('--lg-spec', css.spec);
    screen.style.setProperty('--lg-fb-blur', Math.max(6, LG.params.blur * 2.5) + 'px');
    updateAdaptive(true);
  }
  function setParam(key, v) {
    if (key in css) { css[key] = v; applyCss(); }
    else if (key === 'dispersion') { dispersionBase = v; LG.set({ dispersion: shotMode ? 0 : v }); }
    else { LG.set({ [key]: v }); if (key === 'blur') applyCss(); }
    if (['refraction', 'bezel', 'prescale'].includes(key)) drawPrinciple();
  }
  let dispersionBase = LG.params.dispersion;

  inputs.forEach((inp) => {
    inp.addEventListener('input', () => {
      const key = inp.dataset.param || inp.dataset.css;
      const v = parseFloat(inp.value);
      inp.parentElement.querySelector('output').textContent = fmt[key](v);
      setParam(key, v);
      $$('.presets button').forEach((b) => b.classList.remove('is-active'));
    });
  });

  $$('.presets button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.preset];
      $$('.presets button').forEach((b) => b.classList.toggle('is-active', b === btn));
      for (const k in p) {
        if (k in css) css[k] = p[k];
      }
      dispersionBase = p.dispersion;
      LG.set({
        refraction: p.refraction, bezel: p.bezel, prescale: p.prescale, blur: p.blur,
        saturation: p.saturation, dispersion: shotMode ? 0 : p.dispersion,
      });
      applyCss();
      syncInputs();
      drawPrinciple();
    });
  });

  // 遮罩颜色
  const swatches = $$('.swatches button');
  const custom = $('#p-tintColor');
  function setTint(rgb, el) {
    screen.style.setProperty('--lg-tint', rgb);
    swatches.forEach((b) => b.setAttribute('aria-checked', String(b === el)));
    custom.parentElement.classList.toggle('is-active', el === custom);
    // 深色遮罩时文字改成白色
    const [r, g, b] = rgb.split(' ').map(Number);
    screen.classList.toggle('dark-glass', 0.299 * r + 0.587 * g + 0.114 * b < 110);
  }
  swatches.forEach((b) => b.addEventListener('click', () => setTint(b.dataset.tint, b)));
  custom.addEventListener('input', () => {
    const h = custom.value;
    setTint([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' '), custom);
  });

  // ───────── 光线方向：跟随指针 / 陀螺仪 ─────────
  const light = { cur: 315, target: 315 };
  function angleTo(cx, cy, x, y) {
    return (Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI + 360;
  }
  screen.addEventListener('pointermove', (e) => {
    const r = screen.getBoundingClientRect();
    light.target = angleTo(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY) % 360;
  });
  screen.addEventListener('pointerleave', () => { light.target = 315; });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    light.target = (angleTo(0, 0, e.gamma, -e.beta + 45) + 360) % 360;
  });

  // ───────── 面积自适应（文章里的设想） ─────────
  const adaptive = { on: false, blur: 0, strength: 1, tint: 0, ratio: 0 };
  const targets = { blur: 0, strength: 1, tint: 0 };
  function glassRatio() {
    const sw = screen.clientWidth, sh = screen.clientHeight;
    let area = 0;
    for (const inst of LG.instances.values()) {
      const n = inst.node;
      if (!screen.contains(n) || n.offsetParent === null) continue;
      if (n.closest('.scroller')) continue; // 滚动内容里的小控件忽略不计
      if (n === sheet && !sheet.classList.contains('is-open')) continue;
      area += n.offsetWidth * n.offsetHeight;
    }
    return clamp(area / (sw * sh), 0, 1);
  }
  function updateAdaptive(force) {
    adaptive.ratio = glassRatio();
    const x = smooth(0.12, 0.5, adaptive.ratio);
    targets.blur = adaptive.on ? x * 9 : 0;
    targets.strength = adaptive.on ? 1 - x * 0.6 : 1;
    targets.tint = adaptive.on ? x * 0.32 : 0;
    if (force) screen.style.setProperty('--lg-tint-a', css.tint + adaptive.tint);
    const pct = Math.round(adaptive.ratio * 100);
    $('#meterFill').style.width = pct + '%';
    $('#meterText').textContent = adaptive.on
      ? `玻璃占比 ${pct}% → 虚化 +${targets.blur.toFixed(1)}px · 折射 ×${targets.strength.toFixed(2)}`
      : `玻璃占比 ${pct}% · 未启用`;
  }
  $('#t-adaptive').addEventListener('change', (e) => { adaptive.on = e.target.checked; updateAdaptive(); });

  // ───────── 截图层 / 显示贴图 ─────────
  $('#t-shot').addEventListener('change', (e) => {
    shotMode = e.target.checked;
    screen.classList.toggle('shot-mode', shotMode);
    LG.set({ dispersion: shotMode ? 0 : dispersionBase });
  });
  $('#t-maps').addEventListener('change', (e) => screen.classList.toggle('show-maps', e.target.checked));

  // ───────── 每帧：光线角度 + 自适应参数缓动 ─────────
  function tick() {
    const tgt = shotMode ? 315 : light.target;
    const d = ((tgt - light.cur + 540) % 360) - 180;
    // 只在角度真的变化时写入，否则每帧都会触发所有玻璃重绘
    if (Math.abs(d) > 0.1) {
      light.cur = (light.cur + d * 0.12 + 360) % 360;
      screen.style.setProperty('--lg-light', light.cur.toFixed(1) + 'deg');
    }

    const moving =
      Math.abs(adaptive.blur - targets.blur) > 0.01 ||
      Math.abs(adaptive.strength - targets.strength) > 0.002 ||
      Math.abs(adaptive.tint - targets.tint) > 0.002;
    if (moving) {
      adaptive.blur = lerp(adaptive.blur, targets.blur, 0.12);
      adaptive.strength = lerp(adaptive.strength, targets.strength, 0.12);
      adaptive.tint = lerp(adaptive.tint, targets.tint, 0.12);
      LG.set({ blurBoost: +adaptive.blur.toFixed(2), strength: +adaptive.strength.toFixed(3) });
      screen.style.setProperty('--lg-tint-a', (css.tint + adaptive.tint).toFixed(3));
    }
    requestAnimationFrame(tick);
  }

  // ───────── 按压：折射渐强 + 轻微放大 ─────────
  function pressable(el, target) {
    target = target || el;
    const down = () => { target.classList.add('is-pressed'); LG.animateStrength(target, 1.7, 220); };
    const up = () => { target.classList.remove('is-pressed'); LG.animateStrength(target, 1, 520); };
    el.addEventListener('pointerdown', down);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => el.addEventListener(t, up));
  }
  $$('.gbtn, .topbar > .icon-btn, .search-btn, #closeSheet').forEach((el) => pressable(el));
  $$('.capsule-group .icon-btn').forEach((el) => pressable(el, el.parentElement));

  // ───────── 可拖动透镜（拖动时按速度方向拉伸） ─────────
  const lens = $('#lens');
  const L = { x: 0, y: 0, vx: 0, vy: 0, sx: 0, drag: false, ox: 0, oy: 0, lt: 0 };
  function placeLens() {
    const t = Math.hypot(L.vx, L.vy);
    const s = Math.min(t / 2400, 0.22);
    L.sx = lerp(L.sx, s, 0.25);
    const a = (Math.atan2(L.vy, L.vx) * 180) / Math.PI;
    const lift = L.drag ? 1.08 : 1;
    lens.style.transform =
      `translate(${L.x}px, ${L.y}px) rotate(${a}deg) scale(${(1 + L.sx) * lift}, ${(1 - L.sx * 0.7) * lift}) rotate(${-a}deg)`;
    if (!L.drag) { L.vx *= 0.82; L.vy *= 0.82; }
    if (L.drag || L.sx > 0.002) requestAnimationFrame(placeLens);
  }
  function initLens() {
    if (!screen.clientWidth) { requestAnimationFrame(initLens); return; } // 等布局就绪
    L.x = screen.clientWidth * 0.5 - 10;
    L.y = 200;
    placeLens();
  }
  lens.addEventListener('pointerdown', (e) => {
    lens.setPointerCapture(e.pointerId);
    L.drag = true; L.ox = e.clientX - L.x; L.oy = e.clientY - L.y; L.lt = performance.now();
    lens.classList.add('is-dragging');
    LG.animateStrength(lens, 1.35, 260);
    requestAnimationFrame(placeLens);
  });
  lens.addEventListener('pointermove', (e) => {
    if (!L.drag) return;
    const now = performance.now();
    const dt = Math.max(8, now - L.lt) / 1000;
    const nx = clamp(e.clientX - L.ox, -40, screen.clientWidth - lens.offsetWidth + 40);
    const ny = clamp(e.clientY - L.oy, -40, screen.clientHeight - lens.offsetHeight + 40);
    L.vx = lerp(L.vx, (nx - L.x) / dt, 0.4);
    L.vy = lerp(L.vy, (ny - L.y) / dt, 0.4);
    L.x = nx; L.y = ny; L.lt = now;
  });
  const endLens = () => {
    if (!L.drag) return;
    L.drag = false;
    lens.classList.remove('is-dragging');
    LG.animateStrength(lens, 1, 600);
    requestAnimationFrame(placeLens);
    updateAdaptive();
  };
  lens.addEventListener('pointerup', endLens);
  lens.addEventListener('pointercancel', endLens);

  // ───────── 开关：按下时滑块化成玻璃，可点按或拖动 ─────────
  $$('.switch').forEach((sw) => {
    const thumb = $('.switch-thumb', sw);
    let startX = 0, moved = false, pointer = false;
    const set = (on) => { sw.classList.toggle('is-on', on); sw.setAttribute('aria-checked', String(on)); };
    sw.addEventListener('pointerdown', (e) => {
      pointer = true; moved = false; startX = e.clientX;
      sw.setPointerCapture(e.pointerId);
      sw.classList.add('is-pressed');
      LG.animateStrength(thumb, 1.5, 260, 0.3);
    });
    sw.addEventListener('pointermove', (e) => {
      if (!sw.classList.contains('is-pressed')) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 8) { moved = true; set(dx > 0); }
    });
    const release = () => {
      if (!sw.classList.contains('is-pressed')) return;
      sw.classList.remove('is-pressed');
      if (!moved) set(!sw.classList.contains('is-on'));
      LG.animateStrength(thumb, 1, 500);
    };
    sw.addEventListener('pointerup', release);
    sw.addEventListener('pointercancel', release);
    sw.addEventListener('click', (e) => {
      if (pointer) { pointer = false; return; } // 指针操作已在 pointerup 处理
      if (e.detail === 0) set(!sw.classList.contains('is-on')); // 键盘
    });
  });

  // ───────── 滑块 ─────────
  const slider = $('#slider');
  const sThumb = $('.slider-thumb', slider);
  function setSlider(v) {
    v = clamp(v, 0, 1);
    slider.style.setProperty('--v', v.toFixed(4));
    slider.setAttribute('aria-valuenow', Math.round(v * 100));
    $('#brightOut').textContent = Math.round(v * 100) + '%';
  }
  function sliderFromEvent(e) {
    const r = slider.getBoundingClientRect();
    setSlider((e.clientX - r.left - 20) / (r.width - 40));
  }
  slider.addEventListener('pointerdown', (e) => {
    slider.setPointerCapture(e.pointerId);
    slider.classList.add('is-pressed');
    LG.animateStrength(sThumb, 1.5, 260, 0.3);
    sliderFromEvent(e);
  });
  slider.addEventListener('pointermove', (e) => { if (slider.classList.contains('is-pressed')) sliderFromEvent(e); });
  const sliderUp = () => { slider.classList.remove('is-pressed'); LG.animateStrength(sThumb, 1, 500); };
  slider.addEventListener('pointerup', sliderUp);
  slider.addEventListener('pointercancel', sliderUp);
  slider.addEventListener('keydown', (e) => {
    const v = parseFloat(getComputedStyle(slider).getPropertyValue('--v')) || 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setSlider(v + 0.05); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setSlider(v - 0.05); e.preventDefault(); }
  });

  // ───────── 水滴指示器（分段控件、标签栏共用）：移动时横向拉长，像液体被拖动 ─────────
  function droplet(container, buttons, drop, inset) {
    let index = buttons.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    let x = 0;
    function geometry(i) {
      const cr = container.getBoundingClientRect();
      const br = buttons[i].getBoundingClientRect();
      return { x: br.left - cr.left - inset, w: br.width };
    }
    function place(animate) {
      const g = geometry(index);
      drop.style.width = g.w + 'px';
      if (animate && Math.abs(g.x - x) > 1) {
        const mid = (x + g.x) / 2;
        drop.animate(
          [
            { transform: `translateX(${x}px) scale(1, 1)` },
            { transform: `translateX(${mid}px) scale(1.28, .88)`, offset: 0.45 },
            { transform: `translateX(${g.x}px) scale(1, 1)` },
          ],
          { duration: 560, easing: 'cubic-bezier(.3, 1.15, .45, 1)' }
        );
        LG.animateStrength(drop, 1.8, 200).then(() => LG.animateStrength(drop, 1, 420));
      }
      x = g.x;
      drop.style.transform = `translateX(${x}px)`;
    }
    buttons.forEach((b, i) => b.addEventListener('click', () => {
      buttons.forEach((o, j) => o.setAttribute('aria-selected', String(i === j)));
      index = i;
      place(true);
    }));
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => place(false)).observe(container);
    place(false);
  }
  const seg = $('#seg');
  droplet(seg, $$('button', seg), $('.seg-drop', seg), 3);
  const tabbar = $('#tabbar');
  droplet(tabbar.parentElement, $$('button', tabbar), $('#tabDrop'), 4);

  // ───────── 面板：出现时折射渐入，消失时渐出 ─────────
  const sheet = $('#sheet');
  function openSheet() {
    sheet.hidden = false;
    LG.setStrength(sheet, 0);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sheet.classList.add('is-open');
      LG.animateStrength(sheet, 1, 800, 0);
      updateAdaptive();
    }));
  }
  function closeSheet() {
    sheet.classList.remove('is-open');
    LG.animateStrength(sheet, 0, 450);
    updateAdaptive();
    setTimeout(() => { if (!sheet.classList.contains('is-open')) { sheet.hidden = true; updateAdaptive(); } }, 560);
  }
  $('#openSheet').addEventListener('click', openSheet);
  $('#closeSheet').addEventListener('click', closeSheet);

  // ───────── 背景图片 ─────────
  const heroArt = $('#heroArt');
  let objectUrl = null;
  $('#bgFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(f);
    heroArt.style.background = `center / cover no-repeat url("${objectUrl}")`;
    const img = new Image();
    img.onload = () => window.dispatchEvent(new CustomEvent('lg-background', { detail: img }));
    img.src = objectUrl;
  });
  $('#bgReset').addEventListener('click', () => {
    heroArt.style.background = '';
    $('#bgFile').value = '';
    window.dispatchEvent(new CustomEvent('lg-background', { detail: null }));
  });

  // ───────── 原理图：拆解置换贴图 ─────────
  const SHAPES = {
    capsule: { w: 220, h: 96, r: 48 },
    rect: { w: 210, h: 120, r: 30 },
    circle: { w: 120, h: 120, r: 60 },
  };
  let shape = 'capsule';
  const BOX = { w: 260, h: 150 };
  const warpGrid = $('#warpGrid');
  const warpFilter = (() => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML =
      '<filter id="lg-principle" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB" x="0" y="0">' +
      '<feImage result="m" preserveAspectRatio="none" x="0" y="0"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="m" xChannelSelector="R" yChannelSelector="G"/></filter>';
    document.body.appendChild(svg);
    warpGrid.style.filter = 'url(#lg-principle)';
    return svg.firstChild;
  })();
  const outline = document.createElement('div');
  outline.style.cssText = 'position:absolute;pointer-events:none;box-shadow:inset 0 0 0 1.5px rgb(255 255 255 / .9),0 0 0 1px rgb(0 0 0 / .25)';
  $('#warpDemo').appendChild(outline);

  function shapeParams() {
    const p = LG.params;
    return { refraction: p.refraction, bezel: p.bezel, prescale: p.prescale };
  }

  function drawMapCanvas(canvas, field, scale, s, arrows) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = BOX.w * dpr;
    canvas.height = BOX.h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, BOX.w, BOX.h);
    const ox = (BOX.w - s.w) / 2, oy = (BOX.h - s.h) / 2;
    const { canvas: map } = LG.encodeField(field, scale);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ox, oy, s.w, s.h, s.r);
    ctx.clip();
    ctx.drawImage(map, ox, oy, s.w, s.h);
    ctx.restore();
    if (!arrows) return;
    const step = 12;
    const k = 9 / Math.max(1, field.max);
    ctx.strokeStyle = 'rgb(10 12 16 / .7)';
    ctx.fillStyle = 'rgb(10 12 16 / .7)';
    ctx.lineWidth = 1;
    for (let y = step / 2; y < s.h; y += step) {
      for (let x = step / 2; x < s.w; x += step) {
        const i = Math.floor(y) * field.W + Math.floor(x);
        const dx = field.vx[i] * k, dy = field.vy[i] * k;
        // 只画在形状内部
        const px = x - s.w / 2, py = y - s.h / 2;
        const qx = Math.abs(px) - (s.w / 2 - s.r), qy = Math.abs(py) - (s.h / 2 - s.r);
        const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.r;
        if (d > -2) continue;
        const X = ox + x, Y = oy + y;
        if (Math.hypot(dx, dy) < 0.6) { ctx.fillRect(X - 0.6, Y - 0.6, 1.2, 1.2); continue; }
        ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + dx, Y + dy); ctx.stroke();
        ctx.beginPath(); ctx.arc(X + dx, Y + dy, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  let principleQueued = false;
  function drawPrinciple() {
    if (principleQueued) return;
    principleQueued = true;
    requestAnimationFrame(() => {
      principleQueued = false;
      const s = SHAPES[shape];
      const p = shapeParams();
      const all = LG.computeField(s.w, s.h, s.r, p, 'all');
      const uni = LG.computeField(s.w, s.h, s.r, p, 'uniform');
      const edge = LG.computeField(s.w, s.h, s.r, p, 'edge');
      const scale = Math.max(1, Math.max(all.max, uni.max, edge.max) * 2);
      drawMapCanvas($('#mapUniform'), uni, scale, s, false);
      drawMapCanvas($('#mapEdge'), edge, scale, s, false);
      drawMapCanvas($('#mapAll'), all, scale, s, true);
      drawWarp(s, p);
    });
  }

  // 网格演示：按元素实际尺寸缩放形状，贴图外围填 50% 灰（不位移）
  function drawWarp(s, p) {
    const W = warpGrid.offsetWidth, H = warpGrid.offsetHeight;
    if (!W || !H) return;
    const f = W / BOX.w;
    const sw = s.w * f, sh = s.h * f, sr = s.r * f;
    const field = LG.computeField(sw, sh, sr, { refraction: p.refraction * f, bezel: p.bezel * f, prescale: p.prescale }, 'all');
    const { canvas: map, scale } = LG.encodeField(field);
    const c = document.createElement('canvas');
    c.width = Math.round(W); c.height = Math.round(H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(128 128 128)';
    ctx.fillRect(0, 0, c.width, c.height);
    const ox = (W - field.W) / 2, oy = (H - field.H) / 2;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(ox, oy, field.W, field.H, sr); ctx.clip();
    ctx.drawImage(map, ox, oy);
    ctx.restore();
    warpFilter.setAttribute('width', W);
    warpFilter.setAttribute('height', H);
    const img = warpFilter.querySelector('feImage');
    img.setAttribute('href', c.toDataURL());
    img.setAttribute('width', W);
    img.setAttribute('height', H);
    warpFilter.querySelector('feDisplacementMap').setAttribute('scale', scale.toFixed(2));
    Object.assign(outline.style, { left: ox + 'px', top: oy + 'px', width: field.W + 'px', height: field.H + 'px', borderRadius: sr + 'px' });
  }

  $$('.shape-pick button').forEach((b) => b.addEventListener('click', () => {
    shape = b.dataset.shape;
    $$('.shape-pick button').forEach((o) => o.classList.toggle('is-active', o === b));
    drawPrinciple();
  }));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(drawPrinciple).observe(warpGrid);

  // ───────── 启动 ─────────
  syncInputs();
  applyCss();
  initLens();
  drawPrinciple();
  requestAnimationFrame(tick);
  window.addEventListener('resize', () => updateAdaptive());
})();
