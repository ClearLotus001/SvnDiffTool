import type { ComponentProps, Dispatch, SetStateAction } from 'react';

import type {
  LayoutMode,
  Theme,
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
  theme: Theme;
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

function renderLoadingState(theme: Theme, loadingLabel: string) {
  return (
    <div
      style={{
        flex: 1,
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
      <div
        style={{
          display: 'grid',
          gap: 10,
          justifyItems: 'center',
          color: theme.t1,
        }}>
        <div
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: `2px solid ${theme.border}`,
            borderTopColor: theme.acc2,
            animation: 'spin 0.9s linear infinite',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{loadingLabel}</span>
      </div>
    </div>
  );
}

export default function AppContent({
  theme,
  loadingLabel,
  loadPhase,
  hasLoadedDiff,
  loadError,
  isElectron,
  isLoadingDiff,
  isWorkbookMode,
  layout,
  panelProps,
  baseRoleTitle,
  mineRoleTitle,
  baseVersionLabel,
  mineVersionLabel,
  activeWorkbookDiffRegion,
  activeWorkbookTargetCell,
  workbookSelection,
  onWorkbookSelectionRequest,
  onWorkbookNavigationReady,
  baseWorkbookMetadata,
  mineWorkbookMetadata,
  workbookHiddenStateBySheet,
  workbookFreezeBySheet,
  workbookColumnWidthBySheet,
  onWorkbookColumnWidthChange,
  workbookSections,
  workbookSectionRowIndex,
  activeWorkbookSheetName,
  onActiveWorkbookSheetChange,
  workbookCompareMode,
  activeWorkbookSharedExpandedBlocks,
  onWorkbookExpandedBlocksChange,
  isDevMode,
  showHiddenColumns,
  workbookLayoutSnapshots,
  onWorkbookLayoutSnapshotChange,
  workbookContextMenu,
  workbookContextMenuSections,
  onCloseWorkbookContextMenu,
  onPickWorkingCopyFile,
  onOpenSvnConfig,
  setWorkbookHiddenStateBySheet,
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
    return renderLoadingState(theme, loadingLabel);
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
    <div style={{ position: 'relative', flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
      {!isWorkbookMode && layout === 'unified' && <UnifiedPanel {...panelProps} />}
      {!isWorkbookMode && layout === 'split-h' && <SplitPanel {...panelProps} vertical={false} />}
      {!isWorkbookMode && layout === 'split-v' && <SplitPanel {...panelProps} vertical />}

      {isWorkbookMode && (
        <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0 }}>
          {layout === 'unified' && (
            <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
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
            <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
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
            <div style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(250, 249, 245, 0.74)',
            backdropFilter: 'blur(2px)',
            pointerEvents: 'auto',
            cursor: 'progress',
          }}>
          <div
            style={{
              display: 'grid',
              gap: 10,
              justifyItems: 'center',
              color: theme.t1,
              padding: '18px 24px',
              borderRadius: 16,
              background: `${theme.bg1}ee`,
              border: `1px solid ${theme.border}`,
              boxShadow: `0 24px 48px -28px ${theme.border2}`,
            }}>
            <div
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: `2px solid ${theme.border}`,
                borderTopColor: theme.acc2,
                animation: 'spin 0.9s linear infinite',
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{loadingLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
