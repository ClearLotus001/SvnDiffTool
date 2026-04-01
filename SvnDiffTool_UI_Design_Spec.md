# SvnDiffTool 跨视界 UI 重构设计方案 (Design Specification)

这份文档是基于 `ui_mockup.html` 中的结构与视觉演示而编排的**核心设计规范系统 (Design System Specification)**。  
如果您或其它辅助 AI 模型准备着手修改 `SvnDiffTool` 的代码，请务必严格参照以下约束。

---

## 1. 核心视觉理念 (Core Aesthetics)

- **现代化微拟物与毛玻璃 (Glassmorphism & Flat Design)**：顶部和悬浮面板使用具有透明度和背景虚化的毛玻璃效果。
- **高对比度的三套主题 (Multi-theme System)**：提供浅色 (Light)、深色 (Dark) 和高对比 (High Contrast) 全局切换。
- **排版进化 (Typography)**：界面的操作文本使用 `Inter` 或 `System-UI`，保证文字顺滑；涉及表格与文本代码的数据区域，**必须使用** 等宽字体 `JetBrains Mono`。

---

## 2. 设计规范与色彩令牌 (Design Tokens)

请在全局样式表（建议 `src/index.css` 或全新的 `src/variables.css`）中将以下颜色映射存为 CSS Variables。组件中严禁出现硬编码（Hardcode）的色值。

### 📌 深色模式 (Dark) `.theme-dark`
*设计目标：极夜沉稳、减少视觉疲劳、色彩聚焦*
```css
--bg-base: #020617;                   /* 视窗最底部的深渊色 */
--bg-surface: rgba(15, 23, 42, 0.7);  /* 所有的面板、Toolbar（带玻璃虚化） */
--bg-surface-solid: #0f172a;          /* 实色面板背景 */
--bg-surface-hover: #1e293b;          /* 面板、按钮 hover */
--border-color: #1e293b;

--text-title: #ffffff;
--text-primary: #e2e8f0;
--text-secondary: #94a3b8;

--accent: #6366f1;                    /* 强调色：紫蓝 */
--accent-hover: #4f46e5;

/* 差异高亮体系 (Diff Highlight) */
--diff-add-bg: rgba(34, 197, 94, 0.15);
--diff-add-text: #4ade80;
--diff-add-border: rgba(34, 197, 94, 0.4);

--diff-remove-bg: rgba(239, 68, 68, 0.15);
--diff-remove-text: #f87171;
--diff-remove-border: rgba(239, 68, 68, 0.4);

--diff-modify-bg: rgba(234, 179, 8, 0.15);
--diff-modify-text: #facc15;
--diff-modify-border: rgba(234, 179, 8, 0.5);

--glass-blur: blur(12px);
```

### 📌 浅色模式 (Light) `.theme-light`
*设计目标：清晰、明亮、办公效率优先*
```css
--bg-base: #f8fafc;
--bg-surface: rgba(255, 255, 255, 0.8);
--bg-surface-solid: #ffffff;
--bg-surface-hover: #f1f5f9;
--border-color: #e2e8f0;

--text-title: #0f172a;
--text-primary: #334155;
--text-secondary: #64748b;

--accent: #4f46e5;
--accent-hover: #4338ca;

/* 针对白底进行对比度优化的指示色 */
--diff-add-bg: rgba(34, 197, 94, 0.15);
--diff-add-text: #166534;

--diff-remove-bg: rgba(239, 68, 68, 0.12);
--diff-remove-text: #991b1b;

--diff-modify-bg: rgba(234, 179, 8, 0.2);
--diff-modify-text: #854d0e;

--glass-blur: blur(20px);
```

### 📌 高对比模式 (High Contrast) `.theme-hc`
*设计目标：可及性最高、去除非必要特效（如毛玻璃和阴影）、强边缘*
```css
--bg-base: #000000;
--bg-surface: #0a0a0a;     /* 关闭无用的纯色微透明层 */
--bg-surface-solid: #0a0a0a;
--bg-surface-hover: #1a1a1a;
--border-color: #404040;

--text-title: #ffffff;
--text-primary: #ffffff;
--text-secondary: #cccccc;

--accent: #ff936d; 

--diff-add-bg: #11210e;
--diff-add-text: #c9f4a8;

--diff-remove-bg: #341915;
--diff-remove-text: #ffc0a8;

--diff-modify-bg: #40340d;
--diff-modify-text: #ffe083;

--glass-blur: blur(0px); /* 禁用玻璃态 */
```

---

## 3. 页面布局与对应组件分析地图

在开始编写 React 代码时，请对应修改 `SvnDiffTool` 的各个模块代码结构，拆解为以下区域：

### A. 全局容器与导航
**涉及文件:** `src/App.tsx`, `src/theme.ts`
1. **注入入口**: 根据用户的 Settings 状态控制 `document.body.className = "theme-XXX"`。
2. **清除旧机制**: 原有从 `theme.ts` 传入 JS object 进行内联样式的机制如果不易维护，请尽可能改写成直接指向 CSS Variables，或者让 `src/theme.ts` 返回上述提取出的 Hex CSS 标准配置对应表。

### B. 顶部主工具栏 (Toolbar.tsx)
**涉及组件:** `src/components/navigation/Toolbar.tsx`
- 背景：使用 `background: var(--bg-surface)` 结合 `backdrop-filter: var(--glass-blur)`。
- **Logo 和文件名**: 合并放置在最左侧。文件名设计为带边框（Border: 1px solid `--border-color`）的 `badge / chip` 风格。
- **视图切换与模式切换选项卡**: 提取为内部带有微小留白 (`padding: 2px`) 的组，组内的按钮切换激活 (`active`) 类名，激活态带有 `box-shadow` 和 `var(--accent)` 背景。
- **右下角主题探测器 (Theme Selector)**: 用实心小圆点展示 Light / Dark / HC 色系，提供快速切换入口。悬浮时增加 `transform: scale(1.1)` 动效。

### C. 快捷动作带与搜索栏 (ActionBar / SearchBar.tsx)
**涉及组件:** 拆分自旧的 Toolbar 或独立在 `src/components/diff/SearchBar.tsx`
- 由毛玻璃变回实体背景 `var(--bg-surface-solid)`，以明确区分层次。
- **上/下一个差异**: 收紧为一个 `prev - text - next` 的胶囊块结构。
- **内嵌的搜索器**: `background: var(--bg-base)`。使用极简风格，图标放于 Input 左侧。右侧放一些诸如“空白符 / 隐藏部分”的 checkbox。

### D. 横向对比分隔头 (SplitHeader.tsx)
**涉及组件:** `src/components/navigation/SplitHeader.tsx`
- 极简化处理（Sticky 到头部）：去除之前多余的文字色块，仅仅保留小号 `role-badge` 徽记（BASE / WORKING COPY）。
- 版本号附加小图标表示（钟表 / 磁盘提交 等 SVG）。
- 左右分界通过统一的 `border-right: 1px solid var(--border-color)` 分割。

### E. 文本视图组件 (Diff / Text Mode)
**涉及组件:** `src/components/app-shell/AppContent.tsx`, `AppPanel.tsx` (或类似)
- **Table / 逐行布局**: `font-family: var(--font-mono)`。
- **行号栏 (`.line-num`)**: 统一样式，`background: var(--bg-surface-solid)`，弱化文字。当某行处在差异层（Add/Remove）时，整行行号随之背景轻微红/绿变色。
- **折叠展示条 (Expand Context Bar)**：使用 `border-top/bottom: 1px dashed var(--border-color)` 和居中对齐图标表达。

### F. 表格视图组件 (Workbook / Excel Mode)
**涉及组件:** `src/components/workbook/WorkbookAppContent.tsx` or `WorkbookFormulaBar.tsx`
- **公式栏 (`fx`)**: 单独抽成一条附着在 Toolbar 底部，`color: var(--diff-modify-text)` 作为编辑高亮指示色。
- **数据网格 (.excel-grid)**：保留经典的表格边距，但以暗色系色调为主线。
  - 第一行 / 第一列：冻结状态 (`sticky`)。背景色指定为 `var(--bg-surface-hover)`。
  - **红绿灯高亮 (Diff States)**: 增加/删除的格子不仅有底色，还需要加内外阴影框（`inset 0 0 0 1px var(--diff-XXX-border)`）防止界限与原有 Excel 网线混淆。
  - **聚焦高亮 `.selected`**: 提供比平时更加明显的呼吸发光效果：选中单元格将会有非常强的 Accent 发光边框。

### G. 底部状态栏 (StatsBar.tsx)
**涉及组件:** `src/components/navigation/StatsBar.tsx`
- 左侧区域表示文件类型状态、右侧区域排列：增删改（圆点 `stat-dot` + 数字）摘要。
- 背景与 ActionBar 保持一致。

---

## 4. 其它 AI 助手重构指南 (Workflow for Agents)

如果您是后续的 AI Agent，请按照以下四个阶段安全推进：

1. ** Phase 1：重构主题系统 (CSS/TypeScript Tokens)**
   定义并在 `index.html` 或者入口文件引入全新的全局 CSS 文件，其中使用 `@media (prefers-color-scheme)` 绑定或借助 `document.body` 切换 3 个主题映射。更新 `src/theme/index.ts` 返回这些变量名而非实际硬编码 hex。
2. **Phase 2：重写整体框架层 (Shell/Navbar/Footer)**
   将 `App.tsx`, `Toolbar.tsx`, `SplitHeader.tsx`, `StatsBar.tsx` 中分散的历史内联样式彻底根除。将原本的组件改写成基于 CSS 类名的方案（例：`<div className="toolbar">`）。
3. **Phase 3：攻坚文本比对区 (Text Diff View)**
   精确还原对于 `+` 和 `-` 行的文本标记效果，以及隐藏上下文展板 (`Expand bar`) 的虚线互动效果。
4. **Phase 4：攻坚 Excel 比对区 (Workbook View)**
   梳理冻结列 (Freeze Columns) 跟新主题背景的关系，让激活选中框（Focus 状态）更现代化。

一切就绪后，通过 `npm run typecheck` 以及 `npm run lint` 验证。所有UI变动**绝不能破坏组件与 Electron 底层的 IPC 通讯链路与 React 生命周期**。

---

## 5. 交互动效与动画规范 (Interactive & Animation Guidelines)

作为一款现代化且能让人“WOW”的开发工具，微妙的动画能极大地提升软件的质感，但同时不能拖慢用户的效率。

- **按钮与快捷操作 (Buttons & Actions)**：
  - Hover 状态：`transition: all 0.2s ease-in-out;`。所有的按钮在 Hover 时背景色平滑过渡，同时产生轻微的放缩或位移（如 `transform: translateY(-1px);`）。
  - Active (点击) 状态：`transform: scale(0.96);` 增加按压反馈。
- **差异块高亮 (Diff Block Highlight)**：
  - 加载时：差异行采用微弱的级联淡入效果（Cascade Fade-in），或者仅在背景色做 `0.3s` 的缓动出现。
  - 聚焦时 (Focus)：当用户通过快捷键跳转或点击某一行差异时，该行的背景和边框产生一次脉冲闪烁（Pulse Flash）过度效果，以立刻引导视觉焦点。
- **面板展开与状态过渡 (Panel Transitions)**：
  - 无论是折叠代码块的展开，还是搜索框呼出，采用高度过渡或微平移滑出的方式，避免突兀的显示与隐藏，增加空间感知上的连续性。

---

## 6. 图标与矢量图形规范 (Iconography)

摒弃传统花哨复杂的图标，改用极简的单色线条图标，提升专业感和现代感。

- **图标风格与来源**：推荐使用极简线框风格组件，如 [Lucide Icons](https://lucide.dev/) 或 [Radix Icons](https://icons.radix-ui.com/)，全局线条粗细 (Stroke-width) 统一设定为 `1.5` 到 `2` 以内。
- **图标尺寸 (Sizing)**：
  - 主工具栏、面板控制图标：建议 `20x20` 或 `24x24`。
  - 行内徽章与次要状态图标：建议 `14x14` 或 `16x16`。
- **图标颜色**：一律跟随 `currentColor` 或明确指定为 `var(--text-secondary)`；在 Hover 或 Active 时，配合 `transition: color 0.15s linear` 变为 `var(--text-primary)` 或 `var(--accent)`。

---

## 7. 键盘与焦点操作体验 (Keyboard & a11y)

对于一款对比工具，高效率的键盘操作等同于其生命线。设计规范中除了视觉表现，也非常看重焦点体系的合理呈现。

- **全局快捷键提示**：在所有具备快捷键的工具栏按钮 Title 或 Tooltip 中，必须包含醒目的快捷键键位提示（如 `Ctrl + D`, `F3` 等）。
- **现代焦点环 (Focus Ring)**：
  - 彻底抛弃低像素感的浏览器默认虚线焦点。
  - 使用自定义并且美观的轮廓高亮：`:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: inherit; }`。
- **提升无障碍可用性**：所有仅由不可读图标构成的按钮，必须拥有对应的 `aria-label` 属性以确保语义化，提升开发者工具的职业规范素质。

---

## 8. 窗口响应与布局弹性 (Responsive & Adaptive)

考虑到 `SvnDiffTool` 作为工具类应用，经常会在小窗口比对或者多桌面分屏下使用，必须保证布局具有高弹性，不出现功能被完全遮挡截断的情况。

- **弹性容器分配 (Flexbox / Grid)**：
  - 顶部导航栏内容应当允许在空间不足时自动收缩。冗余的长路径或文件名应使用 `text-overflow: ellipsis; white-space: nowrap; overflow: hidden;` 平滑截断。
- **阈值下限保护 (Min-Width)**：
  - 建议整个视窗设置安全最小宽度（例如 `min-width: 600px;`），以避免过度挤压导致双栏代码完全无法辨识。
- **自定义滚动条与交互同步 (Scrollbar & Synchronize)**：
  - 提供细化版的自定义 Webkit 滚动条（`::-webkit-scrollbar`），避免原生宽大滚动条破坏 UI 风格。
  - 对比视图之间的水平或垂直滚动必须保持性能优化的同步联动，无论窗口被压缩成何种比例，左与右侧的代码行对齐感始终是第一要务。

## 9. 现有 React 组件架构与样式重构方案 (React Component Refactoring Strategy)

在对重构目标 `src/components` 目录（以 `Toolbar.tsx`, `SearchBar.tsx` 等为代表）进行彻底分析后，发现当前项目为了跨平台或者追求动态控制，存在严重的样式冗余和隐患：主要集中在**海量的内联样式对象 (Inline Styles)** 以及过于耦合的 **JS 运行时绑定主题 (`useTheme` 的 `T.bg1` 等)**。

为了将 `ui_mockup.html` 中展现的极致交互效果以优雅的工程化标准落地，接下来的组件代码重构必须分阶段解决以下痛点并参照本优化方案执行：

### 阶段一 (Phase 1)：废弃 JS 内联主题，全面拥抱 CSS Variables
- **现状之痛**：组件内充斥着 `const T = useTheme(); style={{ background: T.bg1 }}` 这样的代码，由于在 JS 中动态拼接对象进行渲染，一是不利于 React 渲染性能（切换主题引发大量不必要的 Virtual DOM Diff），二是使得 CSS 伪类 `:hover`, `:active` 实效。
- **重构方案**：将 JS 中负责在 React 层传导色值的 `T` 对象降级。主题切换逻辑只做一件事：改变全局 `document.body.className = 'theme-dark'`。所有 React 组件中的颜色应用坚决改为 `className="xxx"`，并通过定义好的 CSS 变量（例如 `var(--bg-surface)`）来实现零开销的瞬时主题热切。

### 阶段二 (Phase 2)：消灭内联样式与胖组件 (Eradicate Inline Styles)
- **现状之痛**：`Toolbar.tsx` 等文件高达 900 余行，其中大部分是用于 `display: flex; setWidth:...` 的 `style={{...}}` 行内对象。视觉代码与业务逻辑就像面条一样纠缠在一起。
- **重构方案**：为各个复杂视图或通用组件模块建立对应的独立 `.css`（或 `module.css`）文件。将布局（Flex/Gap）、外观特征（Border/Radius/Shadow）全部抽离成 CSS 类名（如 `.toolbar-btn`, `.search-input-wrapper`）。如此一来，不仅单文件代码行数能大幅缩减至 1/3，同时也彻底释放了 `CSS Transitions` 和 keyframe 渲染的全部潜力。

### 阶段三 (Phase 3)：图标库标准化接入 (Icon Standardization)
- **现状之痛**：如在 `Toolbar.tsx` 顶部所见，存在一坨使用巨大 `switch case` 返回硬编码矢量 SVG 节点的 `Icon` 渲染函数。既难扩充也缺乏响应式的动画变化。
- **重构方案**：移除落后的内联画图层声明，通过包管理器直接注入 `lucide-react` 这类现代且统一的开源图标库。像`<Search size={16} />` 这样在 JSX 里直接调用，然后由外部 CSS 变量自然赋予其颜色（`currentColor`）与过渡时间。

### 阶段四 (Phase 4)：提取公共原子组件 (Atomic UI)
- **现状之痛**：`Btn`, `Group` 在 `Toolbar.tsx` 作用域内被局部定义，甚至强绑定了某些独有判断结构，根本无法被 `SearchBar.tsx` 或者 `StatsBar.tsx` 复用，造成同类元素的尺寸或圆角出现微妙的体验割裂。
- **重构方案**：在 `src/components/shared/` 目录下提炼具备共性的 `<IconButton />`, `<ToolbarGroup />`, `<ThemePill />` 等无状态原子组件。固化 hover 动画与 focus-ring 的实现逻辑。只需暴露 `onClick`, `icon`, `tooltip` 属性供全局统一组装调用。

---
*（本文档作为 SvnDiffTool UI 设计指导纲领的最终结案。后续任何针对老旧 React 组件功能模块的拆解与重构过程，均硬性要求以上述全套系统级标准为执行基准，以确保重获新生后一致且现代化的操作体验。）*
