import type { ComponentProps, Dispatch, SetStateAction } from 'react';

import type {
  LayoutMode,
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
import type { WorkbookColumnWidthBySheet } from '@/utils/workbook/workbookColumnWidths';
import type { WorkbookLayoutSnapshotsByMode } from '@/utils/workbook/workbookLayoutState';
import type { IndexedWorkbookSectionRows } from '@/utils/workbook/workbookSheetIndex';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';
import type { WorkbookContextMenuSection } from '@/components/workbook/WorkbookContextMenu';
import {
  revealWorkbookColumns,
  revealWorkbookRows,
} from '@/utils/workbook/workbookManualVisibility';
import HomeStartPanel from '@/components/app/HomeStartPanel';
import SplitPanel from '@/components/diff/SplitPanel';
import UnifiedPanel from '@/components/diff/UnifiedPanel';
import WorkbookComparePanel from '@/components/workbook/WorkbookComparePanel';
import WorkbookContextMenu from '@/components/workbook/WorkbookContextMenu';
import WorkbookHorizontalPanel from '@/components/workbook/WorkbookHorizontalPanel';

type AppPanelProps = ComponentProps<typeof UnifiedPanel>
  & Pick<ComponentProps<typeof WorkbookComparePanel>, 'guidedHunkRange' | 'guidedPulseNonce'>;

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
  workbookSectionRowIndex: Map<string, IndexedWorkbookSectionRows>;
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
  onOpenSvnConfig: () => void;
  setWorkbookHiddenStateBySheet: Dispatch<SetStateAction<WorkbookHiddenStateBySheet>>;
}

function renderLoadingState(loadingLabel: string) {
  return (
    <div className="flex-1 w-full min-w-0 min-h-0 flex items-center justify-center p-6">
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

export default function AppContent({
  loadingLabel, loadPhase, hasLoadedDiff, loadError,
  isElectron, isLoadingDiff, isWorkbookMode, layout, panelProps,
  baseRoleTitle, mineRoleTitle, baseVersionLabel, mineVersionLabel,
  activeWorkbookDiffRegion, activeWorkbookTargetCell,
  workbookSelection, onWorkbookSelectionRequest, onWorkbookNavigationReady,
  baseWorkbookMetadata, mineWorkbookMetadata,
  workbookHiddenStateBySheet, workbookFreezeBySheet,
  workbookColumnWidthBySheet, onWorkbookColumnWidthChange,
  workbookSections, workbookSectionRowIndex,
  activeWorkbookSheetName, onActiveWorkbookSheetChange,
  workbookCompareMode,
  activeWorkbookSharedExpandedBlocks, onWorkbookExpandedBlocksChange,
  isDevMode, showHiddenColumns,
  workbookLayoutSnapshots, onWorkbookLayoutSnapshotChange,
  workbookContextMenu, workbookContextMenuSections, onCloseWorkbookContextMenu,
  onPickWorkingCopyFile, onOpenSvnConfig, setWorkbookHiddenStateBySheet,
}: AppContentProps) {
  const handleRevealHiddenRows = (sheetName: string, rowNumbers: number[]) => {
    setWorkbookHiddenStateBySheet((prev) => revealWorkbookRows(prev, sheetName, rowNumbers));
    onCloseWorkbookContextMenu();
  };

  const handleRevealHiddenColumns = (sheetName: string, columns: number[]) => {
    setWorkbookHiddenStateBySheet((prev) => revealWorkbookColumns(prev, sheetName, columns));
    onCloseWorkbookContextMenu();
  };

  if (!hasLoadedDiff && loadPhase === 'loading') {
    return renderLoadingState(loadingLabel);
  }

  if (!hasLoadedDiff) {
    return (
      <HomeStartPanel
        error={loadError}
        isElectron={isElectron}
        onPickWorkingCopy={onPickWorkingCopyFile}
        onOpenSvnConfig={onOpenSvnConfig}
      />
    );
  }

  return (
    <div className="relative flex-1 flex overflow-hidden min-h-0 min-w-0">
      {!isWorkbookMode && layout === 'unified' && <UnifiedPanel {...panelProps} />}
      {!isWorkbookMode && layout === 'split-h' && <SplitPanel {...panelProps} vertical={false} />}
      {!isWorkbookMode && layout === 'split-v' && <SplitPanel {...panelProps} vertical />}

      {isWorkbookMode && (
        <div className="relative flex-1 min-w-0 min-h-0">
          {layout === 'unified' && (
            <div className="relative flex w-full h-full min-w-0 min-h-0">
              <WorkbookComparePanel
                {...panelProps}
                active
                baseTitle={baseRoleTitle}
                mineTitle={mineRoleTitle}
                baseVersionLabel={baseVersionLabel}
                mineVersionLabel={mineVersionLabel}
                mode="stacked"
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
                activeWorkbookSheetName={activeWorkbookSheetName}
                onActiveWorkbookSheetChange={onActiveWorkbookSheetChange}
                compareMode={workbookCompareMode}
                sharedExpandedBlocks={activeWorkbookSharedExpandedBlocks}
                onExpandedBlocksChange={onWorkbookExpandedBlocksChange}
                showPerfDebug={isDevMode}
                showHiddenColumns={showHiddenColumns}
                tooltipDisabled={isLoadingDiff}
                layoutSnapshot={workbookLayoutSnapshots.unified as WorkbookCompareLayoutSnapshot | null}
                onLayoutSnapshotChange={onWorkbookLayoutSnapshotChange}
              />
            </div>
          )}
          {layout === 'split-v' && (
            <div className="relative flex w-full h-full min-w-0 min-h-0">
              <WorkbookComparePanel
                {...panelProps}
                active
                baseTitle={baseRoleTitle}
                mineTitle={mineRoleTitle}
                baseVersionLabel={baseVersionLabel}
                mineVersionLabel={mineVersionLabel}
                mode="columns"
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
                activeWorkbookSheetName={activeWorkbookSheetName}
                onActiveWorkbookSheetChange={onActiveWorkbookSheetChange}
                compareMode={workbookCompareMode}
                sharedExpandedBlocks={activeWorkbookSharedExpandedBlocks}
                onExpandedBlocksChange={onWorkbookExpandedBlocksChange}
                showPerfDebug={isDevMode}
                showHiddenColumns={showHiddenColumns}
                tooltipDisabled={isLoadingDiff}
                layoutSnapshot={workbookLayoutSnapshots['split-v'] as WorkbookCompareLayoutSnapshot | null}
                onLayoutSnapshotChange={onWorkbookLayoutSnapshotChange}
              />
            </div>
          )}
          {layout === 'split-h' && (
            <div className="relative flex w-full h-full min-w-0 min-h-0">
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
              />
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
