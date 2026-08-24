import type {
  DiffPerformanceMetrics,
  PreparedTextAnalysis,
} from '@/types/diff';
import type {
  PreparedWorkbookAnalysis,
  WorkbookCompareMode,
  WorkbookMetadataMap,
} from '@/types/workbook';

export interface DiffAnalysisSnapshot {
  compareMode: WorkbookCompareMode;
  textAnalysis: PreparedTextAnalysis | null;
  workbookAnalysis: PreparedWorkbookAnalysis | null;
}

export interface WorkbookCompareModePayload {
  compareMode: WorkbookCompareMode;
  analysisSnapshot?: DiffAnalysisSnapshot | null;
  perf?: Pick<DiffPerformanceMetrics, 'rustDiffMs'> | null;
}

export interface WorkbookMetadataPayload {
  base: WorkbookMetadataMap | null;
  mine: WorkbookMetadataMap | null;
  analysisSnapshot?: DiffAnalysisSnapshot | null;
  perf?: Pick<DiffPerformanceMetrics, 'metadataMs'> | null;
}
