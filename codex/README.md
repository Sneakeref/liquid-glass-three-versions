# Liquid · 原生 Web 液态玻璃控件

直接用浏览器打开 `index.html` 即可运行。也可以打开上一级目录的单文件版 `liquid-glass-standalone.html`，它不依赖其他文件。无需 npm、框架、网络字体或外部素材。

本项目按用户提供的技术分析实现可控的二维透镜效果，不声称复现苹果内部实现。

## 已实现

- 圆形可拖动透镜、播放器、音量滑块、胶囊导航栏与收藏按钮。
- 折射强度、九点背景模糊、轮廓高光、染色浓度及色调。
- 清透 / 柔雾 / 水晶预设；海岸 / 极光 / 测试网格三种自绘背景。
- 液态玻璃 / 普通毛玻璃 / 置换场对照。毛玻璃模式仅将折射归零，保留当前模糊、染色等参数，以便同条件比较。
- 独立融球实验：两个圆形 SDF 通过 smooth minimum 合并，可拖动并调节融合范围。
- 光标驱动光源、按玻璃面积调节模糊和折射、参数复制（剪贴板不可用时导出 JSON）。
- 键盘方向键移动透镜与圆球，Shift 加速；对话框支持 Escape。
- 原生 Web Audio 合成的低音量氛围和弦，点击才播放。播放控件并非模拟状态切换。
- 移动端布局、减少动态效果、WebGL 不可用时 CSS 毛玻璃降级、上下文丢失后的恢复。

## 文件

- `index.html`：页面与原生可访问控件。
- `styles.css`：响应式布局和玻璃控件的基础样式。
- `liquid-glass.js`：可复用 `LiquidGlass` 类、GLSL 折射 shader、SDF 形状与资源管理。
- `app.js`：自绘背景、拖动、参数调节、导航与声音等演示逻辑。
- `VERIFICATION.md`：本次实际浏览器验证记录及边界。

本机服务启动方式（可选）：

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

随后访问 `http://127.0.0.1:4173`。不要将播放器示例中的坐标、温度和标题当作实时数据，它们是场景文案；收藏只在本次页面会话内保留。

## 渲染原理

1. **准备纹理**：Canvas 2D 生成背景，传入 WebGL texture。控件 DOM 保持清晰、可点击。
2. **形状**：读取每个 `[data-glass]` 元素的位置、尺寸和圆角，用圆角矩形 SDF 得到边界距离及法线。圆形是圆角半径等于短边一半的特例。
3. **置换**：中心轻微向外采样以压缩内容，边缘反向采样以拉伸内容。用 `uv + displacement / resolution` 取样，产生二维透镜效果。置换场是 shader 按像素实时计算的，不需要一张静态置换 PNG。
4. **材质**：九点加权采样模拟模糊，轻微 RGB 偏移模拟色散，再混合色调。距离场法线与光源方向决定高光。
5. **融合**：融球的两个距离场通过多项式 smooth minimum 合并，边缘和折射随融合后的轮廓变化。
6. **性能**：按需 requestAnimationFrame，不运行空闲动画循环；离屏/隐藏页面不绘制；DPR 上限 1.5。一个渲染器最多处理 16 个形状。未进行真实手机耗电或全浏览器性能基准测试。

SVG `feDisplacementMap` 的规范同样使用颜色通道与中性值 0.5 构造采样偏移。这里直接用 WebGL 执行等价的二维采样思路，避免依赖 `backdrop-filter: url(...)` 的跨浏览器行为。注意“源采样向右”和“画面内容向左移动”是同一映射的两种描述。

技术参考：

- [MDN: feDisplacementMap](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap)
- [MDN: Using textures in WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL)
- [MDN: texImage2D](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D)

## 接入自己的页面

先加载 `liquid-glass.js`。提供一个相对定位的容器、覆盖容器的画布、要折射的背景 Canvas，以及绝对定位的 DOM 控件。

```html
<section id="scene" style="position:relative;isolation:isolate;width:600px;height:400px">
  <canvas id="output" style="position:absolute;inset:0;width:100%;height:100%;z-index:-1"></canvas>
  <button data-glass style="position:absolute;left:30px;top:30px;width:160px;height:56px;border-radius:28px;background:transparent">玻璃按钮</button>
</section>
```

```js
const background = document.createElement('canvas');
background.width = 600;
background.height = 400;
const ctx = background.getContext('2d');
ctx.fillStyle = '#7895aa';
ctx.fillRect(0, 0, 600, 400);
// 在这里绘制图片、网格、文字或你自己的场景。

const material = new LiquidGlass({
  canvas: document.querySelector('#output'),
  container: document.querySelector('#scene'),
  source: background,
  onStatus: console.log,
});
material.upload();
material.set({refraction:55, blur:2, shine:65, tint:12, color:'#ecf4ff'});

// 参数单位：refraction / shine / tint 为百分比；blur / fusion 为 CSS 像素。
// 拖动控件或其位置发生变化后：
material.invalidate();
// 背景内容改变后：
material.upload();
// 场景卸载时：
// material.destroy();
```

容器尺寸变化时，渲染器会自动更新画布与控件位置。背景的宽高比应同步重绘；参考 `app.js` 的 ResizeObserver。要加入新的控件，可更新 `material.elements` 数组后调用 `invalidate()`，最多 16 个。

## 实际边界

- **当前折射的是传入的背景纹理，不会自动捕获任意网页 DOM。** 若需要折射网页文章、视频或其他内容，必须把该内容作为受控纹理输入，并处理同步和跨域限制。不能仅给普通元素加一个类名就宣称完成通用 DOM 折射。
- 模糊是九点近似；融合不是流体模拟；高光不是完整物理光线追踪。
- 重叠的普通控件使用最近的距离场，未实现多层玻璃的叠加折射。融球仅在专门的实验里开启。
- 自适应面积以控件面积求和近似，重叠区域可能重复计入。
- “减少动态效果”禁用光标跟随和 CSS 过渡，手动拖动仍然可用。
- 降级模式只提供背景图、CSS 模糊和轮廓，不具有 WebGL 折射或融合。
- 只验证了本机 Chromium；Safari、Firefox 和真实触屏设备尚未验证。
