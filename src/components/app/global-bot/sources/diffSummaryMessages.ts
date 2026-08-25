import type { TranslationFn } from '@/context/i18n';
import type { TextDiffStats, WorkbookArtifactDiff } from '@/types';
import type { WorkbookSection } from '@/utils/workbook/workbookSections';
import { summarizeWorkbookSectionChanges } from '@/utils/workbook/workbookSections';
import type { GlobalBotMessage } from '@/components/app/global-bot/messages/types';
import { resolveDisplayedDiffStats } from '@/utils/diff/diffStatsPresentation';
import type { WorkbookCellChangeSummary } from '@/utils/workbook/workbookCellChangeSummary';

interface ResolveDiffSummaryMessagesOptions {
  enabled: boolean;
  isWorkbookMode: boolean;
  stats: TextDiffStats;
  workbookSections: readonly WorkbookSection[];
  modifiedWorkbookSheetNames: ReadonlySet<string>;
  workbookArtifactDiff: WorkbookArtifactDiff | null;
  workbookCellChangeSummary?: WorkbookCellChangeSummary;
  t: TranslationFn;
}

function makeMessage(
  id: string,
  text: string,
  priority: number,
  mood: GlobalBotMessage['mood'] = 'attentive',
): GlobalBotMessage {
  return {
    id,
    source: 'diff-summary',
    delivery: 'ambient',
    priority,
    mood,
    text,
  };
}

function formatSheetNames(names: readonly string[], t: TranslationFn): string {
  const visibleNames = names.slice(0, 3);
  const remaining = Math.max(0, names.length - visibleNames.length);
  const summary = visibleNames.join(t('globalBotSheetNameSeparator'));
  return remaining > 0
    ? t('globalBotSheetNamesWithMore', { names: summary, count: remaining })
    : summary;
}

export function resolveDiffSummaryMessages({
  enabled,
  isWorkbookMode,
  stats,
  workbookSections,
  modifiedWorkbookSheetNames,
  workbookArtifactDiff,
  workbookCellChangeSummary,
  t,
}: ResolveDiffSummaryMessagesOptions): GlobalBotMessage[] {
  if (!enabled) return [];

  const messages: GlobalBotMessage[] = [];
  const displayedStats = isWorkbookMode && workbookCellChangeSummary
    ? workbookCellChangeSummary
    : resolveDisplayedDiffStats(stats);
  const total = displayedStats.added + displayedStats.removed + displayedStats.modified;
  if (total > 0) {
    messages.push({
      ...makeMessage(
        `diff:${displayedStats.added}:${displayedStats.removed}:${displayedStats.modified}`,
        t(isWorkbookMode ? 'globalBotWorkbookCellSummary' : 'globalBotDiffSummary'),
        60,
      ),
      tags: [
        { label: t('statsAdded'), value: displayedStats.added, tone: 'positive' },
        { label: t('statsRemoved'), value: displayedStats.removed, tone: 'negative' },
        { label: t('statsModified'), value: displayedStats.modified, tone: 'warning' },
      ],
    });
  }

  if (isWorkbookMode) {
    const structure = summarizeWorkbookSectionChanges([...workbookSections]);
    const structuralNames = new Set(
      workbookSections
        .filter((section) => section.changeType !== 'equal')
        .map((section) => section.name),
    );
    const contentModifiedNames = [...modifiedWorkbookSheetNames]
      .filter((name) => !structuralNames.has(name))
      .sort((left, right) => left.localeCompare(right));
    const changedSheetCount = contentModifiedNames.length
      + structure.added
      + structure.deleted
      + structure.renamed;
    const changedSheetNames = [...modifiedWorkbookSheetNames]
      .sort((left, right) => left.localeCompare(right));

    if (changedSheetCount > 0) {
      messages.push(makeMessage(
        `workbook-sheets:${changedSheetCount}:${changedSheetNames.join('\u001F')}`,
        changedSheetNames.length > 0
          ? t('globalBotWorkbookChangedSheetsNamed', {
              count: changedSheetCount,
              names: formatSheetNames(changedSheetNames, t),
            })
          : t('globalBotWorkbookChangedSheets', { count: changedSheetCount }),
        55,
      ));
    }

    if (structure.added + structure.deleted + structure.renamed > 0) {
      messages.push(makeMessage(
        `workbook-structure:${structure.added}:${structure.deleted}:${structure.renamed}`,
        t('globalBotWorkbookStructureSummary', {
          added: structure.added,
          deleted: structure.deleted,
          renamed: structure.renamed,
        }),
        50,
      ));
    }

    if (workbookArtifactDiff?.hasArtifactOnlyDiff) {
      messages.push(makeMessage(
        'workbook-artifact-only',
        t('globalBotWorkbookArtifactOnly'),
        70,
      ));
    }
  }

  if (messages.length === 0) {
    messages.push(makeMessage('diff:no-changes', t('globalBotNoDifferences'), 65, 'celebrating'));
  }

  return messages.sort((left, right) => right.priority - left.priority);
}
