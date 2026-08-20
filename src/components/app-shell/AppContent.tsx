import {
  Suspense,
  useEffect,
  lazy,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import type {
  LayoutMode,
  TextLayoutSnapshot,
  WorkbookCompareLayoutSnapshot,
  WorkbookCompareMode,
  WorkbookDiffRegion,
  WorkbookFreezeState,
  WorkbookHorizontalLayoutSnapshot,
  WorkbookHiddenStateBySheet,
  WorkbookMetadataMap,
  WorkbookMoveDirection,
  WorkbookSelectionRequest,
  WorkbookSelectionState,
} from '@/types';
import type { LoadPhase, WorkbookContextMenuState } from '@/hooks/app';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import type { CollapseExpansionState } from '@/utils/collapse/collapseState';
import type { TextLayoutSnapshotsByMode } from '@/utils/diff/textLayoutState';
import type { WorkbookColumnWidthBySheet } from '@/utils/workbook/workbookColumnWidths';
import type { WorkbookLayoutSnapshotsByMode } from '@/utils/workbook/workbookLayoutState';
import type { WorkbookSectionRowIndex } from '@/utils/workbook/workbookSheetIndex';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';
import type { WorkbookContextMenuSection } from '@/components/workbook/WorkbookContextMenu';
import type { UnifiedPanelProps } from '@/components/diff/UnifiedPanel';
import {
  revealWorkbookColumns,
  revealWorkbookRows,
} from '@/utils/workbook/workbookManualVisibility';
import HomeStartPanel from '@/components/app/HomeStartPanel';
import WorkbookContextMenu from '@/components/workbook/WorkbookContextMenu';

const UnifiedPanel = lazy(() => import('@/components/diff/UnifiedPanel'));
const SplitPanel = lazy(() => import('@/components/diff/SplitPanel'));
const WorkbookComparePanel = lazy(() => import('@/components/workbook/WorkbookComparePanel'));
const WorkbookHorizontalPanel = lazy(() => import('@/components/workbook/WorkbookHorizontalPanel'));

type AppPanelProps = UnifiedPanelProps;

interface AppContentProps {
  loadingLabel: string;
  loadPhase: LoadPhase;
  hasLoadedDiff: boolean;
  loadError: string;
  isElectron: boolean;
  isLoadingDiff: boolean;
  isWorkbookMode: boolean;
  layout: LayoutMode;
  panelProps: AppPanelProps;
  textLayoutSnapshots: TextLayoutSnapshotsByMode;
  onTextLayoutSnapshotChange: (snapshot: TextLayoutSnapshot) => void;
  textSharedExpandedBlocks: CollapseExpansionState;
  onTextExpandedBlocksChange: (expandedBlocks: CollapseExpansionState) => void;
  baseRoleTitle: string;
  mineRoleTitle: string;
  baseVersionLabel: string;
  mineVersionLabel: string;
  activeWorkbookDiffRegion: WorkbookDiffRegion | null;
  activeWorkbookTargetCell: WorkbookSelectionState['primary'];
  workbookSelection: WorkbookSelectionState;
  onWorkbookSelectionRequest: (request: WorkbookSelectionRequest) => void;
  onWorkbookNavigationReady: (fn: ((direction: WorkbookMoveDirection) => void) | null) => void;
  baseWorkbookMetadata: WorkbookMetadataMap | null;
  mineWorkbookMetadata: WorkbookMetadataMap | null;
  workbookHiddenStateBySheet: WorkbookHiddenStateBySheet;
  workbookFreezeBySheet: Record<string, WorkbookFreezeState>;
  workbookColumnWidthBySheet: WorkbookColumnWidthBySheet;
  onWorkbookColumnWidthChange: (sheetName: string, column: number, nextWidth: number) => void;
  workbookSections: WorkbookSection[];
  workbookSectionRowIndex: WorkbookSectionRowIndex;
  modifiedWorkbookSheetNames: ReadonlySet<string>;
  activeWorkbookSheetName: string | null;
  onActiveWorkbookSheetChange: (sheetName: string | null) => void;
  workbookCompareMode: WorkbookCompareMode;
  activeWorkbookSharedExpandedBlocks: CollapseExpansionState | null;
  onWorkbookExpandedBlocksChange: (
    sheetName: string | null,
    activeRegionId: string | null,
    expandedBlocks: CollapseExpansionState,
  ) => void;
  isDevMode: boolean;
  showHiddenColumns: boolean;
  workbookLayoutSnapshots: WorkbookLayoutSnapshotsByMode;
  onWorkbookLayoutSnapshotChange: (
    snapshot: WorkbookCompareLayoutSnapshot | WorkbookHorizontalLayoutSnapshot,
  ) => void;
  workbookContextMenu: WorkbookContextMenuState | null;
  workbookContextMenuSections: WorkbookContextMenuSection[];
  onCloseWorkbookContextMenu: () => void;
  onPickWorkingCopyFile: () => void;
  onOpenLocalFileCompare: () => void;
  onOpenSvnConfig: () => void;
  setWorkbookHiddenStateBySheet: Dispatch<SetStateAction<WorkbookHiddenStateBySheet>>;
  onInitialVisualReady?: () => void;
}

function InitialVisualReadySignal({
  onReady,
}: {
  onReady: (() => void) | undefined;
}) {
  useEffect(() => {
    if (!onReady) return undefined;

    let cancelled = false;
    const useAnimationFrame = typeof requestAnimationFrame === 'function';
    const handle = useAnimationFrame
      ? requestAnimationFrame(() => {
          if (!cancelled) onReady();
        })
      : window.setTimeout(() => {
          if (!cancelled) onReady();
        }, 0);

    return () => {
      cancelled = true;
      if (useAnimationFrame && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(handle);
        return;
      }
      clearTimeout(handle);
    };
  }, [onReady]);

  return null;
}

function renderLoadingState(loadingLabel: string, onReady?: () => void) {
  return (
    <div
      data-testid="diff-loading-state"
      role="status"
      aria-live="polite"
      className="flex-1 w-full min-w-0 min-h-0 flex items-center justify-center p-6">
      <InitialVisualReadySignal onReady={onReady} />
      <div className="grid gap-2.5 justify-items-center text-text-primary">
        <div
          aria-hidden="true"
          className="size-7 rounded-full border-2 border-border-default animate-spin"
          style={{ borderTopColor: 'var(--acc2)' }}
        />
        <span className="text-[13px] font-semibold">{loadingLabel}</span>
      </div>
    </div>
  );
}

function renderLazyPanel(content: ReactNode, loadingLabel: string, onReady?: () => void) {
  return (
    <Suspense fallback={renderLoadingState(loadingLabel, onReady)}>
      <>
        <InitialVisualReadySignal onReady={onReady} />
        {content}
      </>
    </Suspense>
  );
}

export default function AppContent({
  loadingLabel, loadPhase, hasLoadedDiff, loadError,
  isElectron, isLoadingDiff, isWorkbookMode, layout, panelProps,
  textLayoutSnapshots, onTextLayoutSnapshotChange,
  textSharedExpandedBlocks, onTextExpandedBlocksChange,
  baseRoleTitle, mineRoleTitle, baseVersionLabel, mineVersionLabel,
  activeWorkbookDiffRegion, activeWorkbookTargetCell,
  workbookSelection, onWorkbookSelectionRequest, onWorkbookNavigationReady,
  baseWorkbookMetadata, mineWorkbookMetadata,
  workbookHiddenStateBySheet, workbookFreezeBySheet,
  workbookColumnWidthBySheet, onWorkbookColumnWidthChange,
  workbookSections, workbookSectionRowIndex, modifiedWorkbookSheetNames,
  activeWorkbookSheetName, onActiveWorkbookSheetChange,
  workbookCompareMode,
  activeWorkbookSharedExpandedBlocks, onWorkbookExpandedBlocksChange,
  isDevMode, showHiddenColumns,
  workbookLayoutSnapshots, onWorkbookLayoutSnapshotChange,
  workbookContextMenu, workbookContextMenuSections, onCloseWorkbookContextMenu,
  onPickWorkingCopyFile, onOpenLocalFileCompare, onOpenSvnConfig, setWorkbookHiddenStateBySheet,
  onInitialVisualReady,
}: AppContentProps) {
  const handleRevealHiddenRows = (sheetName: string, rowNumbers: number[]) => {
    setWorkbookHiddenStateBySheet((prev) => revealWorkbookRows(prev, sheetName, rowNumbers));
    onCloseWorkbookContextMenu();
  };

  const handleRevealHiddenColumns = (sheetName: string, columns: number[]) => {
    setWorkbookHiddenStateBySheet((prev) => revealWorkbookColumns(prev, sheetName, columns));
    onCloseWorkbookContextMenu();
  };

  if (!hasLoadedDiff && (loadPhase === 'loading' || loadPhase === 'bootstrapping')) {
    return renderLoadingState(loadingLabel, onInitialVisualReady);
  }

  if (!hasLoadedDiff) {
    return (
      <>
        <InitialVisualReadySignal onReady={onInitialVisualReady} />
        <HomeStartPanel
          error={loadError}
          isElectron={isElectron}
          onPickWorkingCopy={onPickWorkingCopyFile}
          onOpenLocalFileCompare={onOpenLocalFileCompare}
          onOpenSvnConfig={onOpenSvnConfig}
        />
      </>
    );
  }

  const workbookComparePanelMode = layout === 'split-v' ? 'columns' : 'stacked';
  const workbookComparePanelSnapshot = (
    layout === 'split-v'
      ? workbookLayoutSnapshots['split-v']
      : workbookLayoutSnapshots.unified
  ) as WorkbookCompareLayoutSnapshot | null;

  return (
    <div className="relative flex-1 flex overflow-hidden min-h-0 min-w-0">
      {!isWorkbookMode && layout === 'unified' && (
        renderLazyPanel(
          <UnifiedPanel
            {...panelProps}
            layoutSnapshot={textLayoutSnapshots.unified}
            onLayoutSnapshotChange={onTextLayoutSnapshotChange}
            sharedExpandedBlocks={textSharedExpandedBlocks}
            onExpandedBlocksChange={onTextExpandedBlocksChange}
          />,
          loadingLabel,
          !isLoadingDiff ? onInitialVisualReady : undefined,
        )
      )}
      {!isWorkbookMode && layout === 'split-h' && (
        renderLazyPanel(
          <SplitPanel
            {...panelProps}
            vertical={false}
            layoutSnapshot={textLayoutSnapshots['split-h']}
            onLayoutSnapshotChange={onTextLayoutSnapshotChange}
            sharedExpandedBlocks={textSharedExpandedBlocks}
            onExpandedBlocksChange={onTextExpandedBlocksChange}
          />,
          loadingLabel,
          !isLoadingDiff ? onInitialVisualReady : undefined,
        )
      )}
      {!isWorkbookMode && layout === 'split-v' && (
        renderLazyPanel(
          <SplitPanel
            {...panelProps}
            vertical
            layoutSnapshot={textLayoutSnapshots['split-v']}
            onLayoutSnapshotChange={onTextLayoutSnapshotChange}
            sharedExpandedBlocks={textSharedExpandedBlocks}
            onExpandedBlocksChange={onTextExpandedBlocksChange}
          />,
          loadingLabel,
          !isLoadingDiff ? onInitialVisualReady : undefined,
        )
      )}

      {isWorkbookMode && (
        <div className="relative flex-1 min-w-0 min-h-0">
          {layout !== 'split-h' && (
            <div className="relative flex w-full h-full min-w-0 min-h-0">
              {renderLazyPanel(
                <WorkbookComparePanel
                  {...panelProps}
                  active
                  baseTitle={baseRoleTitle}
                  mineTitle={mineRoleTitle}
                  baseVersionLabel={baseVersionLabel}
                  mineVersionLabel={mineVersionLabel}
                  mode={workbookComparePanelMode}
                  activeDiffRegion={activeWorkbookDiffRegion}
                  navigationTargetCell={activeWorkbookTargetCell}
                  selection={workbookSelection}
                  onSelectionRequest={onWorkbookSelectionRequest}
                  onWorkbookNavigationReady={onWorkbookNavigationReady}
                  baseWorkbookMetadata={baseWorkbookMetadata}
                  mineWorkbookMetadata={mineWorkbookMetadata}
                  workbookHiddenStateBySheet={workbookHiddenStateBySheet}
                  freezeStateBySheet={workbookFreezeBySheet}
                  columnWidthBySheet={workbookColumnWidthBySheet}
                  onColumnWidthChange={onWorkbookColumnWidthChange}
                  onRevealHiddenRows={handleRevealHiddenRows}
                  onRevealHiddenColumns={handleRevealHiddenColumns}
                  workbookSections={workbookSections}
                  workbookSectionRowIndex={workbookSectionRowIndex}
                  modifiedSheetNames={modifiedWorkbookSheetNames}
                  activeWorkbookSheetName={activeWorkbookSheetName}
                  onActiveWorkbookSheetChange={onActiveWorkbookSheetChange}
                  compareMode={workbookCompareMode}
                  sharedExpandedBlocks={activeWorkbookSharedExpandedBlocks}
                  onExpandedBlocksChange={onWorkbookExpandedBlocksChange}
                  showPerfDebug={isDevMode}
                  showHiddenColumns={showHiddenColumns}
                  tooltipDisabled={isLoadingDiff}
                  layoutSnapshot={workbookComparePanelSnapshot}
                  onLayoutSnapshotChange={onWorkbookLayoutSnapshotChange}
                />,
                loadingLabel,
                !isLoadingDiff ? onInitialVisualReady : undefined,
              )}
            </div>
          )}
          {layout === 'split-h' && (
            <div className="relative flex w-full h-full min-w-0 min-h-0">
              {renderLazyPanel(
                <WorkbookHorizontalPanel
                  {...panelProps}
                  active
                  baseTitle={baseRoleTitle}
                  mineTitle={mineRoleTitle}
                  baseVersionLabel={baseVersionLabel}
                  mineVersionLabel={mineVersionLabel}
                  activeDiffRegion={activeWorkbookDiffRegion}
                  navigationTargetCell={activeWorkbookTargetCell}
                  selection={workbookSelection}
                  onSelectionRequest={onWorkbookSelectionRequest}
                  onWorkbookNavigationReady={onWorkbookNavigationReady}
                  baseWorkbookMetadata={baseWorkbookMetadata}
                  mineWorkbookMetadata={mineWorkbookMetadata}
                  workbookHiddenStateBySheet={workbookHiddenStateBySheet}
                  freezeStateBySheet={workbookFreezeBySheet}
                  columnWidthBySheet={workbookColumnWidthBySheet}
                  onColumnWidthChange={onWorkbookColumnWidthChange}
                  onRevealHiddenRows={handleRevealHiddenRows}
                  onRevealHiddenColumns={handleRevealHiddenColumns}
                  workbookSections={workbookSections}
                  workbookSectionRowIndex={workbookSectionRowIndex}
                  modifiedSheetNames={modifiedWorkbookSheetNames}
                  activeWorkbookSheetName={activeWorkbookSheetName}
                  onActiveWorkbookSheetChange={onActiveWorkbookSheetChange}
                  compareMode={workbookCompareMode}
                  sharedExpandedBlocks={activeWorkbookSharedExpandedBlocks}
                  onExpandedBlocksChange={onWorkbookExpandedBlocksChange}
                  showPerfDebug={isDevMode}
                  showHiddenColumns={showHiddenColumns}
                  tooltipDisabled={isLoadingDiff}
                  layoutSnapshot={workbookLayoutSnapshots['split-h'] as WorkbookHorizontalLayoutSnapshot | null}
                  onLayoutSnapshotChange={onWorkbookLayoutSnapshotChange}
                />,
                loadingLabel,
                !isLoadingDiff ? onInitialVisualReady : undefined,
              )}
            </div>
          )}
        </div>
      )}

      {isWorkbookMode && (
        <WorkbookContextMenu
          anchorPoint={workbookContextMenu?.anchorPoint ?? null}
          sections={workbookContextMenuSections}
          onClose={onCloseWorkbookContextMenu}
        />
      )}

      {isLoadingDiff && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-bg-base/75 backdrop-blur-sm pointer-events-auto cursor-progress">
          <div
            className="grid gap-2.5 justify-items-center p-[18px_24px] rounded-2xl border border-border-default"
            style={{
              color: cssVar('t1'),
              background: cssAlpha('bg1', 'ee'),
              boxShadow: `0 24px 48px -28px ${cssVar('border2')}`,
            }}>
            <div
              aria-hidden="true"
              className="size-6 rounded-full border-2 border-border-default animate-spin"
              style={{ borderTopColor: cssVar('acc2') }}
            />
            <span className="text-[13px] font-semibold">{loadingLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
