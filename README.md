# SvnDiffTool

SvnDiffTool 是一个面向 TortoiseSVN 的外部 Diff 查看器，用更直观的 Electron 界面替代系统默认文本比较窗口。  
它不局限于 Excel，既适合常见文本文件，也支持部分工作簿文件的差异查看。  
界面风格参考 Beyond Compare，适合在代码审查、版本回溯和日常 SVN 对比时更快看清差异。

当前版本更适合 `.js`、`.ts`、`.tsx`、`.json`、`.xml`、`.py`、`.java`、`.txt` 这类文本文件。  
如果你需要真正的 Excel 单元格级对比，当前实现还不属于“表格语义 diff”工具。

## 功能概览

- 统一视图、左右分栏、上下分栏三种布局
- 行级 diff + 字符级高亮
- 折叠未变化区域，减少长文件干扰
- 搜索栏支持普通搜索、正则、大小写匹配
- 行号跳转
- 空白字符可视化
- 字体大小调节
- 一键复制 Base / Mine 全量内容
- 界面支持中文 / English，默认中文
- Dark / Light / High Contrast 三套主题
- 开发模式下可直接选择一个 SVN 工作副本文件，默认按同文件不同 revision 进入对比

## 适用场景

- 替换 TortoiseSVN 默认外部对比体验
- 阅读较大的文本差异文件
- 快速跳转 diff hunk、搜索关键字、复制完整文件内容
- 在深色主题下做代码评审

## 环境要求

- Windows
- Node.js 18+（建议，用于本地开发和打包）
- npm
- TortoiseSVN（如果你要把它作为外部 Diff 工具接入）

## 快速开始

```bash
npm install
npm run typecheck
npm run dev:app
```

常用命令：

```bash
# 开发模式
npm run dev:app

# 类型检查
npm run typecheck

# 生产构建
npm run build

# 打包 Windows 便携版
npm run build:win
```

打包完成后，输出文件位于：

```text
release/SvnDiffTool-1.0.0.exe
```

这是 portable 形式，可直接分发和使用，无需安装；文件名现在默认不再带空格。

## 接入 TortoiseSVN

1. 打开 `TortoiseSVN -> Settings -> Diff Viewer`
2. 勾选 `External`
3. 将外部 Diff 命令设置为：

```text
"C:\Path\To\SvnDiffTool.exe" %base %mine %bname %yname %yurl %fn
```

参数含义：

| 参数 | 说明 |
|------|------|
| `%base` | 旧版本临时文件路径 |
| `%mine` | 新版本临时文件路径 |
| `%bname` | 旧版本显示名称 |
| `%yname` | 新版本显示名称 |
| `%yurl` | SVN 仓库 URL |
| `%fn` | 当前文件名 |

建议：

- 路径里如果有空格，务必保留双引号
- 参数顺序不要改，主进程按这个顺序解析
- 可以在 `Advanced...` 里按扩展名单独配置，例如 `.ts`、`.tsx`、`.js`、`.json`、`.xml`

## 日常使用

通过 TortoiseSVN 打开差异后，你可以直接在工具栏完成常见操作：

- 切换布局：`Unified` / `Split` / `Vertical`
- 切换是否折叠未变化区域
- 搜索内容，支持正则和大小写匹配
- 调整字体大小
- 显示或隐藏空白字符
- 复制 Base 或 Mine 的完整文本
- 切换主题

## 开发调试

推荐直接运行：

```bash
npm run dev:app
```

开发模式下建议优先使用应用内的“开发测试”栏：

- 选择一个 SVN 工作副本文件
- 应用会默认按“同一个文件的不同 revision”加载对比
- 后续可以继续使用顶部版本切换下拉调试同文件的 revision 组合

“加载示例”仅作为 UI 演示和兜底数据，不是主调试路径。

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `F7` | 下一个差异块 |
| `Shift+F7` | 上一个差异块 |
| `Ctrl+F` | 打开 / 关闭搜索栏 |
| `Enter` / `F3` | 下一个搜索结果 |
| `Shift+Enter` | 上一个搜索结果 |
| `Ctrl+G` | 跳转到指定行 |
| `Ctrl+]` | 增大字体 |
| `Ctrl+[` | 减小字体 |
| `Ctrl+\` | 切换空白字符显示 |
| `Escape` | 关闭搜索栏 / 对话框 |
| `?` | 打开快捷键帮助面板 |

## 项目结构

```text
SvnDiffTool/
├── electron/
│   ├── main.ts              # Electron 主进程入口
│   └── preload.ts           # 预加载桥接层
├── src/
│   ├── App.tsx              # 应用入口与状态编排
│   ├── main.tsx             # React 挂载入口
│   ├── theme.ts             # 主题定义与 token 配色
│   ├── components/          # UI 组件
│   ├── context/
│   │   ├── i18n.tsx         # 语言上下文与 JSON 词典加载
│   │   └── theme.ts         # ThemeContext / useTheme
│   ├── constants/
│   │   └── layout.ts        # 布局常量
│   ├── engine/              # diff / search / tokenizer 核心逻辑
│   ├── hooks/               # 自定义 hooks
│   ├── locales/             # 中英文 JSON 文案配置
│   ├── types/               # 全局类型定义
│   └── utils/
│       └── clipboard.ts     # 剪贴板工具
├── package.json
├── tsconfig.electron.json
├── tsconfig.json
└── vite.config.ts
```

## 技术说明

- 前端：React 18 + TypeScript
- 容器：Electron
- 构建：Vite
- Diff 计算：行级 diff + 字符级高亮
- 性能策略：虚拟滚动、token 缓存、大文件回退策略

## 常见问题

### 1. 点击 Diff 没有打开工具

优先检查：

- `SvnDiffTool.exe` 路径是否正确
- 路径是否加了双引号
- 外部命令参数是否仍然是 `%base %mine %bname %yname %yurl %fn`

### 2. 打开后内容为空

如果你是手动启动 exe 或在开发模式直接启动 app，而不是由 TortoiseSVN 传参启动，应用会进入开发态等待选择工作副本文件；如果你点击了“加载示例”，则会显示 demo 数据。这不是故障。

### 3. 为什么某些文件看起来不像“表格语义 diff”

当前工具本质上是文本差异查看器，更适合文本类文件。  
对于二进制 `.xls` / `.xlsx`，如果需要按工作表、单元格、公式来比较，需要额外的 Excel 解析与渲染能力。

### 4. 超大文件打不开

当前版本已经取消固定的 50 MB 读取门槛。  
如果你打开的是特别大的文本文件，差异计算和渲染时间仍然可能变长，这属于性能问题，不再是硬性拦截。

## 开发说明

开发时推荐流程：

```bash
npm install
npm run typecheck
npm run dev:app
```

提交前至少执行：

```bash
npm run build
```

这样可以同时覆盖 TypeScript 检查和前端打包流程。
