# 浏览器验证记录

日期：2026-10-19。环境：本机 Chromium，通过 Playwright 实际操作页面。

| 检查 | 实际结果 |
| --- | --- |
| JS 语法 | 两个 JS 文件 `node --check` 通过 |
| WebGL shader / 渲染 | ready=true，gl.getError()=0；桌面 5 个玻璃形状，手机隐藏音量条后为 4 个 |
| 真正置换 | 网格背景下固定 blur/shine/tint 为 0，仅将 refraction 从 0 改为 88，19,855 个像素的 RGB 差值之和大于 9；最大差值 231；共 617,646 像素 |
| 鼠标拖动 | 主透镜实际移动 (-95,+35) CSS px；融球 B 移动 (+60,+20) CSS px |
| 键盘移动 | Shift+ArrowLeft 实际移动 -20 CSS px |
| 参数 / 预设 | 水晶预设得到 refraction=88、blur=0.5；键盘 End 将折射设为 100、融合范围设为 80 |
| 背景 / 模式 | 网格、晨光与置换场切换更新渲染状态 |
| 导航 / 收藏 | 收藏按钮与导航更新文案及状态；本次会话内保留 |
| 实际声音 | 播放时 AudioContext=running，暂停时=suspended |
| 参数复制 | 从系统剪贴板重新读取 JSON，refraction=100 等参数与当前控件一致 |
| 默认重置 | 恢复 55 / 2 / 65 / 12、冰白、液态玻璃模式及初始透镜位置 |
| 320 / 390 / 768 / 1440px | 无横向溢出；320px 与 390px 导航和加号之间分别留有 8px、12px 间距，透镜处于画布内 |
| 自适应面积 | 开启后有效模糊随当前玻璃覆盖面积增加 |
| 减少动态效果 | 模拟 prefers-reduced-motion=reduce 后，光线跟随开关关闭 |
| 上下文丢失 / 恢复 | 主动触发 WebGL context lost 后进入毛玻璃降级；恢复后 ready=true、有效背景纹理、gl.getError()=0 |
| WebGL 完全不可用 | 新页面禁用 WebGL 上下文后，正确显示降级文案和背景图 |
| 单文件本地打开 | 通过 file:// 打开 standalone HTML，ready=true、gl.getError()=0，无外部脚本、样式表和图片依赖 |
| 浏览器控制台 | 正常页面最终检查 0 errors / 0 warnings |

这些结果不代表已验证 Safari、Firefox、真实手机触摸输入或设备功耗。没有宣称跨平台 60fps。降级模式不包含折射和融球。
