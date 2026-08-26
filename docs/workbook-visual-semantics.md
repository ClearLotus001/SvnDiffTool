# Workbook Visual Semantics

这份说明用于约束 `Versora` 中 workbook 对比界面的视觉语义，避免不同布局、不同组件各自定义颜色和状态，导致回归时行为漂移。

当前规则主要收敛在这些文件中：

- `src/utils/workbook/workbookRowVisuals.ts`
- `src/utils/workbook/workbookCompareVisuals.ts`
- `src/utils/workbook/workbookSelectionVisual.ts`

## 1. 行级语义

统一使用 `WorkbookRowDeltaTone`：

- `equal`
- `add`
- `delete`
- `mixed`

扩展辅助语义：

- `neutral`：仅用于局部 UI 兼容，最终等价于 `equal`

### 1.1 行级颜色入口

以下能力必须优先走共享 helper，而不是在组件里直接拼颜色：

- `resolveWorkbookRowBorderColor`
- `resolveWorkbookRowRuleColor`
- `resolveWorkbookRowLineNumberColor`
- `resolveWorkbookRowSurfaceBackground`
- `resolveWorkbookRowSelectionAccent`
- `resolveWorkbookRowGutterBackground`

### 1.2 三种布局的规则

#### 左右布局 / 左右分栏

- 行级语义由整行 `rowDelta.tone` 决定
- 行号颜色、左侧 3px 标记、行边框与分隔线都按整行 tone 渲染
- 不允许因为当前虚拟列窗口不同而改变行级 tone

#### 列对比

- 与左右布局同步
- 同一逻辑行仍然按完整 `visibleColumns` 计算整行 tone
- 不允许把未 merge 的 base/mine 同列压成 shared 视觉格

#### 堆叠

- 上下 band 必须保留版本语义
- `single-equal` 才允许压缩为单 band
- `pure add` / `pure delete` 必须保留空白 counterpart band
- 当上下 band 同时存在时，行号色与 gutter accent 优先按 band side 走

## 2. 单元格级语义

单元格视觉统一从 `resolveWorkbookCompareCellVisual` 推导，不允许组件自己决定 add/delete/mixed 的背景和边框。

### 2.1 单元格 kind

统一通过：

- `resolveWorkbookCompareCellKind`

可得到：

- `equal`
- `add`
- `delete`
- `modify`
- `strict-only`

### 2.2 单元格辅助视觉

以下能力统一走共享 helper：

- tooltip badge：`getWorkbookCompareBadgeVisual`
- tooltip hint：`getWorkbookCompareHintVisual`
- merge continuation：`getWorkbookMergeContinuationVisual`

### 2.3 Diff 颜色角色

所有布局统一遵循同一组颜色角色，不能因为组件或 Canvas/DOM 渲染方式不同而互换：

- `*Bg`：整行或整个单元格的语义背景
- `*Hl`：字符级、词级的局部差异高亮
- `*Tx`：文字、前缀、行号和标签
- `*Brd`：边框、轮廓、左侧标记、分隔线和 MiniMap 标记

普通 UI 组件不得直接写固定色值；主题颜色必须由 CSS Variables 或共享视觉 helper 提供。角色插画、粒子和品牌艺术资产可维护独立的艺术调色板。

## 3. Selection 语义

Selection 相关视觉不允许在 canvas 组件里直接手写 alpha 规则，统一通过：

- `getWorkbookSelectionVisualState`
- `getWorkbookSelectionPaint`
- `getWorkbookSelectionOverlay`

`getWorkbookSelectionPaint` 是 canvas 描边、镜像选择、焦点框、轴向高亮的统一来源。

## 4. 辅助条（Aux Bars）

折叠条、隐藏行提示条、冻结工具条等辅助 UI 必须通过共享 palette 驱动：

- `resolveWorkbookAuxBarPalette`
- `resolveWorkbookAccentSurfaceVisual`

避免这些条状 UI 使用“看起来差不多”的手写配色。

## 5. Overlay / MiniMap

### 5.1 MiniMap

MiniMap 颜色统一走：

- `resolveWorkbookMiniMapColor`

### 5.2 Diff Region Overlay

Overlay box 允许携带 tone，并通过以下函数合并：

- `resolveWorkbookRegionTone`
- `mergeWorkbookSemanticTone`
- `resolveWorkbookOverlayPalette`

## 6. 回归原则

修改 workbook 视觉时，优先检查：

1. 是否能复用共享 helper，而不是在组件里新增条件分支
2. 是否会因为虚拟列窗口变化而改变行级 tone
3. 是否会因为某侧 entry 缺失而丢失 counterpart band / 行号 / 颜色
4. 是否需要补充对应测试

建议优先补这些测试：

- `tests/workbook-row-visuals.test.ts`
- `tests/workbook-compare-visuals.test.ts`
- `tests/workbook-selection-visual.test.ts`
- `tests/workbook-region-overlay.test.ts`
- `tests/line-number-tone.test.ts`

## 7. 维护建议

后续如果要继续收敛 workbook 视觉逻辑，优先顺序建议为：

1. 先扩展共享 helper
2. 再替换组件中的重复逻辑
3. 最后补回归测试

不要直接在：

- `WorkbookPaneCanvasStrip.tsx`
- `WorkbookColumnsCanvasStrip.tsx`
- `WorkbookStackedCanvasStrip.tsx`

中追加新的硬编码颜色分支，除非共享层无法表达该语义。
