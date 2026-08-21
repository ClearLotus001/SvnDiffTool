# Versora

[中文](./README.md) | [English](./README.en.md) | [下载最新版本](https://github.com/ClearLotus001/Versora/releases/latest)

> 面向 Windows 的文件比较工作台，用一套界面审阅文本、Excel、Git 版本与 SVN 修订。

Versora 提供成熟的文本和工作簿查看能力，同时把 Git、SVN 与普通本地文件统一为可独立识别的比较来源。

## 下载与运行

- 支持平台：Windows
- 安装包：[GitHub Releases](https://github.com/ClearLotus001/Versora/releases)
- 安装版支持应用内更新，并可选择接入 TortoiseSVN

安装后可从首页选择以下入口：

1. **打开工作副本文件**：自动识别 Git、SVN 或普通本地文件。
2. **对比两份文件**：选择两份扩展名相同的文本文件或 Excel 工作簿。
3. **接入 TortoiseSVN**：将 Versora 配置为外部 Diff Viewer。

## 主要能力

### 文本比较

- 统一视图、左右分栏和上下分栏
- 行级与字符级高亮、语法着色和空白字符显示
- 折叠未变化区域、全文搜索、差异导航、跳转与复制
- Git/SVN 来源徽标，左右文件独立识别
- 行级版本归属：显示版本、修改人和提交时间；未提交行标记为 `WC*`
- 版本归属仅在存在 Git/SVN 工作副本或修订上下文时显示

### Excel 工作簿

- 面向 `.xlsx`、`.xlsm`、`.xltx`、`.xltm` 等 OOXML 工作簿的专用表格视图
- 工作表、行、列、单元格和公式变化
- 严格模式与内容模式
- 公式栏、冻结窗格、隐藏行列、差异区域导航和迷你地图
- Rust 加速解析与差异计算
- 大型差异使用虚拟滚动、结构区域压缩和精简 IPC 载荷，避免一次性渲染或传输全部单元格状态

### Git 与 SVN

| 来源 | 默认行为 | 历史版本 | 行级归属 |
|---|---|---|---|
| Git 工作区文件 | 比较仓库版本与当前工作区内容 | 支持按文件切换提交、`HEAD` 和工作区 | Git blame |
| SVN 工作副本 | 比较仓库修订与工作副本 | 支持修订历史与工作副本切换 | SVN blame |
| 普通本地文件 | 直接使用当前文件内容 | 不显示版本选择器 | 不显示 |

两份文件对比时，每一侧都会独立检测来源。Git/SVN 一侧可以切换历史版本，普通文件一侧保持为本地内容。

所有 Git 操作均为只读。Versora 不会执行 checkout、add、commit、reset，也不会修改仓库状态。

## 使用说明

### 打开一个工作副本文件

从首页选择“打开工作副本文件”。Versora 会自动检测来源，并准备默认比较：

- Git：仓库版本与工作区文件
- SVN：仓库修订与工作副本
- 未纳入版本管理的文件：按本地文件打开，不提供版本切换

进入比较页后，可通过顶部版本选择器切换历史版本；工具栏的首页按钮会清理当前比较并返回起始页。

### 对比两份文件

从首页选择“对比两份文件”，拖入或选择左右文件。两份文件必须具有相同扩展名。点击“开始对比”后，弹窗会关闭并进入统一的“正在准备差异视图”加载页。

### TortoiseSVN 接入

安装版可从首页打开“接入 TortoiseSVN”，并选择全部文件、仅文本或仅工作簿模式。推荐使用应用内配置；如需手动配置，请将命令指向安装目录内的 SVN 启动组件：

```text
"C:\Path\To\Versora\resources\bin\svn_diff_launcher.exe" %base %mine %bname %yname %burl %yurl %brev %yrev %peg %fname
```

卸载前 Versora 会恢复 TortoiseSVN 默认查看器，避免外部查看规则指向已删除的程序。

## 兼容性与数据迁移

- Electron 渲染进程仅通过 `window.versora` 使用桥接能力
- 设置统一使用 `versora.*` 键
- Windows 受控缓存目录统一为 `Versora/Cache`
- Windows `appId` 保持不变，以延续安装升级和自动更新链路

## 开发

环境要求：Windows、Node.js 24+、npm。完整工作簿验证还需要 Rust stable。

```bash
npm install
npm run dev:app
```

| 命令 | 说明 |
|---|---|
| `npm run dev:app` | 启动 Vite、Electron 和主进程监听编译 |
| `npm run verify:static` | 运行 ESLint、未使用导出检查和 TypeScript 检查 |
| `npm run test:workbook:unit` | 运行不依赖 Rust 产物的单元测试 |
| `npm run test:workbook:rust` | 运行依赖 Rust 解析器的工作簿测试 |
| `npm run test:e2e` | 运行 Playwright 界面流程测试 |
| `npm run verify:ci` | 执行完整本地 CI 验证 |
| `npm run build:app` | 构建渲染进程和 Electron 主进程 |
| `npm run build:win` | 构建 Windows 安装包 |

## 架构

```text
本地文件 ─┐
Git 对象 ─┼─> 来源物化 ─> DiffData ─> 文本/工作簿分析 ─> 查看器
SVN 修订 ─┤
外部 CLI ─┘
```

- [比较来源架构](./docs/comparison-sources.md)
- [工作簿视觉语义](./docs/workbook-visual-semantics.md)

目录说明：

```text
Versora/
├── electron/       # Electron 主进程、Git/SVN 来源、安装与更新
├── shared/         # 主进程与渲染进程共享契约
├── src/            # React 界面、文本与工作簿查看器
├── rust/           # 工作簿解析与差异计算
├── tests/          # 单元、契约与端到端测试
├── scripts/        # 构建、验证与发布脚本
└── docs/           # 架构与视觉语义文档
```

## 发布

`package.json` 版本与 Git tag 必须一致。推送 `v*` 标签后，[Release 工作流](./.github/workflows/release.yml) 会执行静态检查、Node 测试、Rust 测试和应用构建，并发布 Windows 安装包与更新资产。

```bash
npm version patch --no-git-tag-version
git add -A
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

## 项目边界

当前版本专注于审阅变化，不包含目录树比较、三方合并、可编辑合并、自动解决冲突或版本库写操作。

## License

仓库目前未包含许可证文件。在添加明确许可证前，默认保留所有权利。
