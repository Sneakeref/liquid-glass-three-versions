/*!
 * liquid-glass.js — 置换贴图驱动的液态玻璃（原生 JS，零依赖）
 *
 * 原理（对应 WWDC25 Liquid Glass 解析）：
 *  1. 为每个玻璃元素按它的宽高、圆角生成一张置换贴图：R 通道 = 水平偏移，G 通道 = 垂直偏移。
 *     feDisplacementMap 的取样公式：P'(x,y) = P(x + S·(R−0.5), y + S·(G−0.5))
 *     → 白色（1）从正方向取样，看起来底图向负方向偏移；黑色（0）则底图向正方向偏移；50% 灰不动。
 *  2. 贴图 = 统一缩放分量 + 边缘拉伸分量
 *     · 统一缩放：以中心为原点整体缩放取样坐标。边缘拉伸会把界面“挤小”，
 *       所以先乘一个预缩放系数做补偿（>1 放大，<1 缩小）。
 *     · 边缘拉伸：在 bezel 宽度内按圆弧轮廓把取样点向内拉，边缘被拉伸放大，形成透镜感。
 *     这是平面上的二维折射模拟，不做真实光线追踪，所以形状、强度、渐入渐出都完全可控。
 *  3. 通过 backdrop-filter: url(#filter) 作用到元素背后的内容（Chromium 内核）。
 *     其他浏览器不支持 SVG backdrop 滤镜，自动回退为 blur + saturate 的毛玻璃。
 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const ua = navigator.userAgent;
  const forceFallback = /[?&]lg=fallback/.test(location.search);
  const isChromium =
    !!(navigator.userAgentData && navigator.userAgentData.brands &&
       navigator.userAgentData.brands.some((b) => /Chromium/.test(b.brand))) ||
    (/\bChrome\/\d+/.test(ua) && !/CriOS|EdgiOS|FxiOS/.test(ua));
  const supported = isChromium && !forceFallback;

  // 全局参数。几何参数（refraction / bezel / prescale）变化需要重绘贴图，
  // 其余参数只改滤镜属性，开销很小，可以逐帧动画。
  const params = {
    refraction: 26,   // 边缘拉伸量（px）
    bezel: 16,        // 边缘弧面宽度（px）
    prescale: 1.06,   // 统一（预）缩放系数
    dispersion: 0.1,  // 色散：R/B 通道折射量的差异比例
    blur: 1.2,        // 虚化（px）
    saturation: 1.6,  // 饱和度
    strength: 1,      // 全局折射倍率（面积自适应会改它）
    blurBoost: 0,     // 全局附加虚化（面积自适应会改它）
  };
  const GEOMETRY = ['refraction', 'bezel', 'prescale'];
  const STRUCTURE = ['dispersion'];

  const instances = new Map();
  let defs = null;
  let uid = 0;

  function ensureDefs() {
    if (defs) return defs;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    defs = document.createElementNS(NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return defs;
  }

  /**
   * 计算位移场（单位 px）。返回 { W, H, vx, vy, max }。
   * part: 'all' | 'uniform' | 'edge'，用于原理演示时分别查看两个分量。
   */
  function computeField(w, h, radius, p, part) {
    part = part || 'all';
    const W = Math.max(2, Math.round(w));
    const H = Math.max(2, Math.round(h));
    const hw = W / 2, hh = H / 2;
    const rad = Math.min(Math.max(0, radius), hw, hh);
    // 小控件上边缘带不能吃掉整个内部，否则文字图标全被扭曲：最多占短边一半的 55%，
    // 折射量随边缘带等比缩小，保持用户设定的“弧面陡峭程度”。
    const want = Math.max(1, p.bezel);
    const bezel = Math.max(1, Math.min(want, Math.min(hw, hh) * 0.55));
    const refraction = p.refraction * (bezel / want);
    const m = 1 - 1 / p.prescale; // 取样点向中心收拢的比例：>0 放大，<0 缩小
    const vx = new Float32Array(W * H);
    const vy = new Float32Array(W * H);
    let max = 0;

    for (let y = 0; y < H; y++) {
      const py = y + 0.5 - hh;
      const ay = Math.abs(py);
      for (let x = 0; x < W; x++) {
        const px = x + 0.5 - hw;
        const ax = Math.abs(px);
        // 圆角矩形的有向距离场（SDF）与外法线
        const qx = ax - (hw - rad);
        const qy = ay - (hh - rad);
        let d, nx, ny;
        if (qx > 0 && qy > 0) {
          const L = Math.hypot(qx, qy);
          d = L - rad; nx = qx / L; ny = qy / L;
        } else if (qx > qy) {
          d = qx - rad; nx = 1; ny = 0;
        } else {
          d = qy - rad; nx = 0; ny = 1;
        }
        if (px < 0) nx = -nx;
        if (py < 0) ny = -ny;

        let dx = 0, dy = 0;
        if (part !== 'edge') {
          dx -= px * m;
          dy -= py * m;
        }
        if (part !== 'uniform') {
          const t = -d; // 到边缘的内向距离
          if (t < bezel) {
            const u = 1 - Math.max(0, t) / bezel;               // 边缘 u=1 → 内侧 u=0
            const e = refraction * (1 - Math.sqrt(1 - u * u)); // 圆弧轮廓：越靠边拉得越狠
            dx -= nx * e;
            dy -= ny * e;
          }
        }
        const i = y * W + x;
        vx[i] = dx;
        vy[i] = dy;
        const a = Math.max(Math.abs(dx), Math.abs(dy));
        if (a > max) max = a;
      }
    }
    return { W, H, vx, vy, max };
  }

  /** 把位移场编码成置换贴图（canvas）。scale 即 feDisplacementMap 的 scale。 */
  function encodeField(field, scale) {
    const { W, H, vx, vy } = field;
    const S = scale || Math.max(1, field.max * 2);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d = img.data;
    for (let i = 0, j = 0; i < vx.length; i++, j += 4) {
      d[j] = clamp(127.5 + (vx[i] / S) * 255);
      d[j + 1] = clamp(127.5 + (vy[i] / S) * 255);
      d[j + 2] = 128;
      d[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, scale: S };
  }

  function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }

  function readRadius(node, w, h) {
    const raw = getComputedStyle(node).borderTopLeftRadius || '0';
    const v = parseFloat(raw) || 0;
    const r = raw.indexOf('%') > -1 ? (Math.min(w, h) * v) / 100 : v;
    return Math.min(r, w / 2, h / 2);
  }

  // 元素级参数：k 同时缩放折射量和边缘宽度（小控件用小 k）；
  // zoom 是额外放大倍率（例如标签栏里的水滴），随全局折射强度一起减弱，关掉折射时也就不再放大。
  function effective(inst) {
    const o = inst.opts;
    const k = o.k != null ? o.k : 1;
    const zoom = o.zoom != null ? o.zoom : 1;
    const zoomMix = Math.min(1, params.refraction / 26);
    return {
      refraction: o.refraction != null ? o.refraction : params.refraction * k,
      bezel: o.bezel != null ? o.bezel : params.bezel * k,
      prescale: o.prescale != null ? o.prescale : params.prescale * (1 + (zoom - 1) * zoomMix),
      dispersion: o.dispersion != null ? o.dispersion : params.dispersion,
      blur: (o.blur != null ? o.blur : params.blur) + params.blurBoost,
      saturation: o.saturation != null ? o.saturation : params.saturation,
    };
  }

  // —— 构建 / 更新单个元素的 SVG 滤镜 ——
  function rebuild(inst) {
    const node = inst.node;
    const w = node.offsetWidth, h = node.offsetHeight;
    if (!w || !h) return;
    const p = effective(inst);
    const r = readRadius(node, w, h);
    const field = computeField(w, h, r, p);
    const { canvas, scale } = encodeField(field);
    inst.W = field.W;
    inst.H = field.H;
    inst.baseScale = scale;
    inst.mapCanvas = canvas;
    inst.radius = r;
    inst.disp = p.dispersion;
    inst.url = canvas.toDataURL('image/png');
    node.style.setProperty('--lg-map', 'url("' + inst.url + '")'); // 供“显示置换贴图”使用
    writeFilter(inst, p);
  }

  function writeFilter(inst, p) {
    const f = inst.filter;
    const { W, H } = inst;
    f.setAttribute('x', '0');
    f.setAttribute('y', '0');
    f.setAttribute('width', W);
    f.setAttribute('height', H);
    let s =
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${p.blur}" edgeMode="duplicate" result="b"/>` +
      `<feColorMatrix in="b" type="saturate" values="${p.saturation}" result="s"/>` +
      `<feImage href="${inst.url}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="m"/>`;
    if (p.dispersion > 0.001) {
      // 色散：三个通道各自按略有差异的强度折射，再用 screen 合成
      const ch = [
        ['r', 1 + p.dispersion, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
        ['g', 1, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
        ['bl', 1 - p.dispersion, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'],
      ];
      for (const [id, k, mat] of ch) {
        s +=
          `<feDisplacementMap in="s" in2="m" data-k="${k}" xChannelSelector="R" yChannelSelector="G" result="d${id}"/>` +
          `<feColorMatrix in="d${id}" type="matrix" values="${mat}" result="c${id}"/>`;
      }
      s += '<feBlend in="cr" in2="cg" mode="screen" result="rg"/><feBlend in="rg" in2="cbl" mode="screen"/>';
    } else {
      s += '<feDisplacementMap in="s" in2="m" data-k="1" xChannelSelector="R" yChannelSelector="G"/>';
    }
    f.innerHTML = s;
    inst.dispNodes = Array.from(f.querySelectorAll('feDisplacementMap'));
    inst.blurNode = f.querySelector('feGaussianBlur');
    inst.satNode = f.querySelector('feColorMatrix');
    applyStrength(inst);
    if (!inst.applied) {
      const v = `url(#${inst.id})`;
      inst.node.style.backdropFilter = v;
      inst.node.style.webkitBackdropFilter = v;
      inst.node.setAttribute('data-lg-ready', '');
      inst.applied = true;
    }
  }

  function applyStrength(inst) {
    if (!inst.dispNodes) return;
    const k = inst.strength * params.strength;
    for (const n of inst.dispNodes) {
      n.setAttribute('scale', (inst.baseScale * k * parseFloat(n.dataset.k)).toFixed(2));
    }
  }

  function applyCheap(inst) {
    if (!inst.blurNode) return;
    const p = effective(inst);
    inst.blurNode.setAttribute('stdDeviation', Math.max(0, p.blur));
    inst.satNode.setAttribute('values', p.saturation);
    applyStrength(inst);
  }

  // —— 批量调度：同一帧内多次请求只重绘一次 ——
  const pending = new Set();
  let raf = 0;
  function queue(inst) {
    pending.add(inst);
    if (!raf) raf = requestAnimationFrame(flush);
  }
  function flush() {
    raf = 0;
    for (const inst of pending) if (instances.has(inst.node)) rebuild(inst);
    pending.clear();
  }

  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver((entries) => {
        for (const e of entries) {
          const inst = instances.get(e.target);
          if (inst) queue(inst);
        }
      })
    : null;

  function readDataOpts(node) {
    const o = {};
    for (const k of ['k', 'zoom', 'refraction', 'bezel', 'prescale', 'dispersion', 'blur', 'saturation']) {
      const v = node.getAttribute('data-lg-' + k);
      if (v != null && v !== '') o[k] = parseFloat(v);
    }
    return o;
  }

  // —— 公共 API ——
  function attach(node, opts) {
    if (!node || instances.has(node)) return instances.get(node);
    const inst = {
      node,
      id: 'lg-filter-' + ++uid,
      opts: Object.assign(readDataOpts(node), opts || {}),
      strength: 1,
      applied: false,
    };
    instances.set(node, inst);
    if (!supported) {
      node.setAttribute('data-lg-fallback', '');
      return inst;
    }
    inst.filter = document.createElementNS(NS, 'filter');
    inst.filter.setAttribute('id', inst.id);
    inst.filter.setAttribute('filterUnits', 'userSpaceOnUse');
    inst.filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
    inst.filter.setAttribute('color-interpolation-filters', 'sRGB');
    ensureDefs().appendChild(inst.filter);
    if (ro) ro.observe(node);
    queue(inst);
    return inst;
  }

  function attachAll(selector, root) {
    return Array.from((root || document).querySelectorAll(selector)).map((n) => attach(n));
  }

  function detach(node) {
    const inst = instances.get(node);
    if (!inst) return;
    if (ro) ro.unobserve(node);
    if (inst.filter) inst.filter.remove();
    node.style.backdropFilter = '';
    node.style.webkitBackdropFilter = '';
    node.removeAttribute('data-lg-ready');
    instances.delete(node);
  }

  /** 更新全局参数：几何/结构参数会重绘贴图，其余只改属性。 */
  function set(partial) {
    let heavy = false;
    for (const k in partial) {
      if (!(k in params) || params[k] === partial[k]) continue;
      if (GEOMETRY.includes(k) || STRUCTURE.includes(k)) heavy = true;
      params[k] = partial[k];
    }
    for (const inst of instances.values()) {
      if (!supported) continue;
      if (heavy) queue(inst);
      else applyCheap(inst);
    }
  }

  /** 单个元素的局部参数（例如拖动时的透镜） */
  function configure(node, opts) {
    const inst = instances.get(node);
    if (!inst) return;
    Object.assign(inst.opts, opts);
    if (supported) queue(inst);
  }

  function setStrength(node, k) {
    const inst = instances.get(node);
    if (!inst) return;
    inst.strength = k;
    applyStrength(inst);
  }

  /** 折射的渐入渐出：在两个强度之间做缓动，只改 scale 属性，不重绘贴图。 */
  function animateStrength(node, to, ms, from) {
    const inst = instances.get(node);
    if (!inst) return Promise.resolve();
    if (inst.anim) cancelAnimationFrame(inst.anim);
    const start = from != null ? from : inst.strength;
    const dur = ms == null ? 360 : ms;
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
        inst.strength = start + (to - start) * e;
        applyStrength(inst);
        if (t < 1) inst.anim = requestAnimationFrame(step);
        else { inst.anim = 0; resolve(); }
      };
      inst.anim = requestAnimationFrame(step);
    });
  }

  function refresh(node) {
    if (!supported) return;
    if (node) { const inst = instances.get(node); if (inst) queue(inst); }
    else for (const inst of instances.values()) queue(inst);
  }

  function get(node) {
    return instances.get(node);
  }

  global.LiquidGlass = {
    supported,
    params,
    attach,
    attachAll,
    detach,
    set,
    configure,
    setStrength,
    animateStrength,
    refresh,
    get,
    computeField,
    encodeField,
    instances,
  };
})(window);
