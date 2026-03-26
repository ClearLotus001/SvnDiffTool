# SvnDiffTool

[中文](./README.md) | [英文](./README.en.md)

> 一个面向 TortoiseSVN 的 Windows 外部差异查看工具，使用 Electron + React + Rust 提供更清晰的文本与工作簿对比体验。

`SvnDiffTool` 用来替代 TortoiseSVN 默认的差异窗口。它保留外部对比工具的接入方式，同时提供更现代的界面、更强的导航与搜索能力，以及面向工作簿文件的专用对比视图。

如果你的核心诉求是“更舒服地看 SVN 差异”，这就是它的目标；如果你的诉求是“完整办公文档语义级比对与合并”，它目前还不是那类重型工具。

## 适用场景

| 场景 | 适配度 | 说明 |
|------|--------|------|
| TortoiseSVN 日常文件对比 | 很适合 | 可直接作为外部对比工具接入 |
| 文本类文件审阅 | 很适合 | 行级差异、字符级高亮、搜索、跳转、折叠都已覆盖 |
| 工作簿差异浏览 | 适合 | 支持工作表、行列、单元格维度的可视化对比 |
| 超大文本文件阅读 | 适合 | 内置虚拟滚动、折叠和性能保护策略 |
| 办公文档全语义比对或合并 | 有边界 | 不是专门做批注、样式、图表、宏合并的工具 |

## 核心能力

### 文本对比

- 支持统一视图、左右分栏、上下分栏三种布局
- 支持行级差异与字符级高亮
- 支持折叠未变化区域，减少长文件干扰
- 支持普通搜索、正则、大小写匹配
- 支持行号跳转、差异块跳转和快捷键导航
- 支持空白字符可视化、字体缩放、整份文本复制

### SVN 集成

- 兼容 TortoiseSVN 外部对比参数传递
- 支持同一 SVN 文件的版本切换与重新加载
- 开发模式下可直接选择工作副本文件进行本地调试

### 工作簿对比

- 针对工作簿文件提供独立对比面板，而不是简单把内容压平成纯文本
- 支持工作表切换、差异区域定位、单元格级变化高亮
- 支持严格模式与内容模式两种对比模式
- 支持公式栏、冻结区域、行列隐藏与恢复、选择同步等交互能力
- 使用 Rust 工作簿解析链路提升复杂文件和大文件场景下的稳定性

### 桌面体验

- 内置中文和英文界面
- 提供浅色、深色、高对比三套主题
- Windows 安装版支持基于 GitHub 发布页的自动更新

## 技术栈

- 前端：React 18 + TypeScript
- 桌面容器：Electron 28
- 构建：Vite
- 工作簿解析与差异计算：Rust + `calamine` + `quick-xml`
- 测试：Node.js 自带测试运行器 + `tsx`

## 环境要求

### 运行安装版

- Windows
- TortoiseSVN（仅当你需要把它接成外部对比工具时）

### 从源码开发或构建

- Windows
- Node.js 18+
- npm
- Rust 稳定版与 `cargo`

> 注意：`npm run build` 会同时构建前端、Electron 主进程和 Rust 解析器，因此本地打包时需要可用的 Rust 工具链。

## 快速开始

```bash
npm install
npm run typecheck
npm run dev:app
```

如果你不是通过 TortoiseSVN 传参启动，而是直接运行开发环境，应用会进入开发态。此时可以：

- 选择一个 SVN 工作副本文件做本地对比调试
- 使用内置示例数据观察界面行为

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev:app` | 启动 Vite、Electron，以及主进程 TypeScript 监听编译 |
| `npm run typecheck` | 执行前端、主进程和脚本三部分类型检查 |
| `npm run test:workbook` | 运行仓库中的测试集，包含工作簿相关回归测试 |
| `npm run verify:single-instance-cache` | 验证单实例与缓存相关逻辑 |
| `npm run build` | 构建前端、Electron 主进程与 Rust 产物 |
| `npm run build:win` | 生成 Windows NSIS 安装包 |

本地打包完成后，安装包默认输出到：

```text
release/SvnDiffTool-<version>.exe
```

## 接入 TortoiseSVN

1. 打开 `TortoiseSVN -> Settings -> Diff Viewer`
2. 勾选 `External`
3. 将外部对比命令设置为：

```text
"C:\Path\To\SvnDiffTool.exe" %base %mine %bname %yname %yurl %fname
```

参数说明：

| 参数 | 说明 |
|------|------|
| `%base` | 旧版本临时文件路径 |
| `%mine` | 新版本临时文件路径 |
| `%bname` | 旧版本显示名称 |
| `%yname` | 新版本显示名称 |
| `%yurl` | SVN 仓库 URL |
| `%fname` | 当前文件名 |

接入时建议注意：

- 可执行文件路径如果包含空格，请保留双引号
- 参数顺序不要调整，主进程按固定顺序解析
- 可以在 `Advanced...` 中按扩展名单独指定，例如 `.ts`、`.tsx`、`.js`、`.json`、`.xml`

## 支持的文件类型与能力边界

### 文本类文件

当前版本最适合：

- `.js`
- `.ts`
- `.tsx`
- `.json`
- `.xml`
- `.py`
- `.java`
- `.txt`
- 以及其他以文本方式查看差异的文件

### 工作簿文件

工作簿对比是这个项目的重点能力之一。

- OpenXML 系列文件如 `.xlsx`、`.xlsm`、`.xltx`、`.xltm` 有明确支持
- `.xls`、`.xlsb` 等格式可进入 Rust 工作簿解析链路，实际效果取决于文件内容与解析兼容性
- 当前更偏向“结构化查看差异”，而不是“完整办公文档语义合并”

这意味着它擅长的是：

- 看哪些工作表、行、列、单元格发生了变化
- 辅助代码审查、数据回溯、版本检查

它暂时不以这些能力为目标：

- 批注、图表、样式、宏、透视表等办公文档全量语义合并
- 作为 Excel 编辑器直接修改并回写文件

## 常用快捷键

| 快捷键 | 功能 |
|--------|------|
| `F7` | 下一个差异块 |
| `Shift+F7` | 上一个差异块 |
| `Ctrl+F` | 打开或关闭搜索栏 |
| `Enter` / `F3` | 下一个搜索结果 |
| `Shift+Enter` | 上一个搜索结果 |
| `Ctrl+G` | 跳转到指定行 |
| `Ctrl+]` | 增大字体 |
| `Ctrl+[` | 减小字体 |
| `Ctrl+\` | 切换空白字符显示 |
| `Escape` | 关闭搜索栏或对话框 |
| `?` | 打开快捷键帮助面板 |

## 自动更新

- 当前只有 Windows 安装版支持自动更新
- 应用会从 GitHub 发布页检查稳定版更新
- 发现新版本后会提示你手动下载
- 下载完成后可从应用内触发安装

## 发布流程

本仓库已经内置 GitHub 发布工作流：

- 触发条件：推送 `v*` 格式的版本标签
- 持续集成环境：`windows-latest`
- 构建内容：Node.js 依赖、Rust 解析器、Electron 安装包
- 发布方式：`electron-builder --publish always`

典型发版流程：

```bash
# 更新版本号
npm version 1.1.0

# 推送代码
git push origin main

# 推送版本标签，触发 GitHub 发布流程
git push origin v1.1.0
```

## 项目结构

```text
SvnDiffTool/
├── .github/workflows/        # GitHub 发布工作流
├── assets/                   # 图标等静态资源
├── electron/                 # Electron 主进程、预加载与自动更新逻辑
├── rust/                     # 工作簿解析与差异计算链路
├── scripts/                  # 开发与构建脚本
├── src/
│   ├── components/           # 界面组件
│   ├── context/              # 主题与国际化上下文
│   ├── engine/               # 差异计算、搜索和分词核心逻辑
│   ├── hooks/                # 自定义 Hook
│   ├── locales/              # 中英文文案
│   ├── types/                # 共享类型
│   └── utils/                # 工作簿、缓存、设置等工具逻辑
├── tests/                    # 回归、性能与工作簿相关测试
├── package.json
└── vite.config.mts
```

## 常见问题

### 1. 点击差异对比没有打开工具

优先检查这三项：

- `SvnDiffTool.exe` 路径是否正确
- 外部命令路径是否带双引号
- 参数顺序是否仍然是 `%base %mine %bname %yname %yurl %fname`

### 2. 直接启动应用后没有内容

这通常不是故障。直接运行开发环境或手动启动可执行文件时，如果没有收到 TortoiseSVN 传入的文件参数，应用会进入开发态，等待你选择工作副本文件或加载示例数据。

### 3. 严格模式和内容模式有什么区别

- 严格模式：对空白、公式文本等更敏感，适合精确比对
- 内容模式：更偏向内容归一化后的比较，适合弱化某些“严格但不重要”的差异

### 4. `npm run build` 报找不到 `cargo`

这是因为构建流程会一起编译 Rust 解析器。安装 Rust 稳定版，并确保 `cargo` 在 `PATH` 中即可。

### 5. 超大文件会不会打不开

当前实现已经为大文本与复杂工作簿加入了虚拟滚动、缓存和性能保护策略，但超大文件仍然可能增加初次解析和渲染时间。这属于性能边界，不是固定大小的硬性拦截。

## 开发建议

推荐的本地开发节奏：

```bash
npm install
npm run typecheck
npm run test:workbook
npm run dev:app
```

提交前至少执行：

```bash
npm run build
```

这样可以同时覆盖类型检查、前端构建和 Rust 解析器构建链路。
