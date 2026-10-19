# Liquid Glass · 三种原生 Web 实现

同一个液态玻璃主题，分别由 **ChatGPT 网页端 Pro、Claude、Codex** 制作的三个页面，集中保存与分享。

- **在线体验**：[打开三版本总入口](https://sneakeref.github.io/liquid-glass-three-versions/)
- **完整下载**：[三个版本 ZIP](https://github.com/Sneakeref/liquid-glass-three-versions/releases/latest/download/liquid-glass-three-versions.zip)

| 来源 | 打开页面 | 主要内容 |
| --- | --- | --- |
| ChatGPT Pro | [chatgpt-pro/index.html](chatgpt-pro/index.html) | WebGL 单文件、背景切换、透镜与玻璃融合、图片上传 |
| Claude | [claude/index.html](claude/index.html) | SVG 置换滤镜、手机控件、贴图分解、WebGL 多融球 |
| Codex | [codex/index.html](codex/index.html) | WebGL 材质控件、海岸背景、氛围音、置换场与融球实验 |

## 本地使用

下载 ZIP 并解压，使用浏览器打开根目录的 `index.html`。无需安装框架或构建工具。三个版本可以独立打开；Codex 另外提供 `codex/standalone.html` 单文件副本。

如果浏览器对本地文件有限制，在此目录运行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

然后访问 `http://127.0.0.1:8000`。

## 保存范围

- 三个版本的 HTML、CSS、JavaScript 均从原始产物复制，**13 个原始文件保持逐字节一致**。
- 新增的内容只有总入口、三个预览截图、说明与 SHA-256 文件清单。
- `SOURCE-MANIFEST.json` 记录每个原始文件的大小和校验值。
- 不包含私人对话、账户资料、本机配置或聊天历史。平台名称用于标注用户提供的来源，不等同于核验具体模型版本。
- Claude 原版的 5 个本地文件全部包含；它的 Google Fonts 在线链接保持原样，断网时字体会回退，不影响本地源文件保存的完整性。

## 验证

保存日期：2026-10-19。

- 三个归档页面均在桌面 Chrome 中打开，主要界面正常显示。
- ChatGPT Pro：实际切换棋盘背景、点击玻璃融合，状态更新正常。
- Claude：实际切换专注模式、打开面板，状态更新正常。
- Codex：归档副本加载正常；较详细的原有验证记录见 `codex/VERIFICATION.md`。
- 所有本地 HTML/CSS/JS 资源引用经过存在性检查，原始文件 SHA-256 一致。
- 不是对三个版本进行统一性能基准或功能优劣评测。Safari、Firefox 与真实触屏设备没有在本次归档中验证。

保留原始实现及其中的说明，不额外背书页面内对苹果设计内部原理或跨浏览器行为的断言。它们是 Web 模拟实验，非 Apple 官方组件。
