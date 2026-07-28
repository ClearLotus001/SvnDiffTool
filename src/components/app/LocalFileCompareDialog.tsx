import { memo, useState } from 'react';
import {
  ArrowLeftRight,
  File,
  Files,
  FolderOpen,
  LoaderCircle,
  X,
} from 'lucide-react';

import type { AnimatedVisibilityState } from '@/hooks/ui/useAnimatedVisibility';
import type { LocalDiffFilePickResult, LocalFilePickSide } from '@/types';
import { useI18n } from '@/context/i18n';
import { cssAlpha, cssVar } from '@/theme/cssUtils';
import DialogFrame from '@/components/shared/DialogFrame';

interface LocalFileCompareDialogProps {
  animationState: AnimatedVisibilityState;
  loading: boolean;
  error: string;
  initialBasePath?: string;
  initialMinePath?: string;
  onPickFile: (side: LocalFilePickSide, requiredExtension?: string) => Promise<LocalDiffFilePickResult | null>;
  onCompare: (basePath: string, minePath: string) => Promise<boolean>;
  onClose: () => void;
}

interface FileSlotProps {
  side: LocalFilePickSide;
  index: string;
  label: string;
  hint: string;
  file: LocalDiffFilePickResult | null;
  busy: boolean;
  onPick: (side: LocalFilePickSide) => void;
}

function normalizeComparablePath(filePath: string): string {
  return filePath.trim().replaceAll('/', '\\').replace(/\\+$/g, '').toLocaleLowerCase();
}

function getComparableExtension(filePath: string): string {
  const fileName = filePath.trim().replaceAll('\\', '/').split('/').pop() ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(dotIndex).toLocaleLowerCase() : '';
}

function toFilePickResult(filePath: string): LocalDiffFilePickResult | null {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) return null;
  const name = normalizedPath.replaceAll('\\', '/').split('/').pop() ?? normalizedPath;
  return {
    path: normalizedPath,
    name,
  };
}

function haveSameFileType(
  baseFile: LocalDiffFilePickResult | null,
  mineFile: LocalDiffFilePickResult | null,
): boolean {
  if (!baseFile || !mineFile) return false;
  return getComparableExtension(baseFile.path) === getComparableExtension(mineFile.path);
}

const FileSlot = memo(({
  side,
  index,
  label,
  hint,
  file,
  busy,
  onPick,
}: FileSlotProps) => {
  const { t } = useI18n();
  return (
    <section
      className={`local-file-compare-dialog__slot ${file ? 'local-file-compare-dialog__slot--selected' : ''}`}
      data-side={side}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="local-file-compare-dialog__index">{index}</span>
            <span className="text-text-title text-[14px] font-[850]">{label}</span>
          </div>
          <div className="text-text-secondary text-[12px] leading-relaxed">{hint}</div>
        </div>
        <File
          aria-hidden="true"
          size={20}
          className={file ? 'text-[var(--acc2)] shrink-0' : 'text-text-secondary shrink-0'}
        />
      </div>

      <div className="local-file-compare-dialog__file" title={file?.path ?? ''}>
        <div className="min-w-0 grid gap-1">
          <div className={`truncate text-[13px] font-bold ${file ? 'text-text-title' : 'text-text-secondary'}`}>
            {file?.name ?? t('localFileCompareEmptyFile')}
          </div>
          <div className="truncate text-[11px] font-code text-text-secondary">
            {file?.path ?? t('localFileCompareFilePlaceholder')}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => onPick(side)}
        className="local-file-compare-dialog__pick-action">
        <FolderOpen size={14} />
        {file ? t('localFileCompareReplaceFile') : t('localFileCompareChooseFile')}
      </button>
    </section>
  );
});

const LocalFileCompareDialog = memo(({
  animationState,
  loading,
  error,
  initialBasePath = '',
  initialMinePath = '',
  onPickFile,
  onCompare,
  onClose,
}: LocalFileCompareDialogProps) => {
  const { t } = useI18n();
  const [baseFile, setBaseFile] = useState<LocalDiffFilePickResult | null>(
    () => toFilePickResult(initialBasePath),
  );
  const [mineFile, setMineFile] = useState<LocalDiffFilePickResult | null>(
    () => toFilePickResult(initialMinePath),
  );
  const [pickingSide, setPickingSide] = useState<LocalFilePickSide | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [localError, setLocalError] = useState('');
  const busy = loading || isSubmitting || pickingSide !== null;

  const handlePick = async (side: LocalFilePickSide) => {
    setPickingSide(side);
    setLocalError('');
    try {
      const peerFile = side === 'base' ? mineFile : baseFile;
      const selected = await onPickFile(side, getComparableExtension(peerFile?.path ?? ''));
      if (!selected) return;
      if (side === 'base') setBaseFile(selected);
      else setMineFile(selected);
      if (peerFile && getComparableExtension(selected.path) !== getComparableExtension(peerFile.path)) {
        setLocalError(t('localFileCompareTypeMismatch'));
      }
    } catch (pickError) {
      setLocalError(pickError instanceof Error ? pickError.message : String(pickError));
    } finally {
      setPickingSide(null);
    }
  };

  const handleSwap = () => {
    if (busy) return;
    setBaseFile(mineFile);
    setMineFile(baseFile);
    setLocalError('');
  };

  const handleCompare = async () => {
    setHasSubmitted(true);
    setLocalError('');
    if (!baseFile || !mineFile) {
      setLocalError(t('localFileCompareMissingFiles'));
      return;
    }
    if (normalizeComparablePath(baseFile.path) === normalizeComparablePath(mineFile.path)) {
      setLocalError(t('localFileCompareSameFile'));
      return;
    }
    if (!haveSameFileType(baseFile, mineFile)) {
      setLocalError(t('localFileCompareTypeMismatch'));
      return;
    }

    setIsSubmitting(true);
    const loaded = await onCompare(baseFile.path, mineFile.path);
    setIsSubmitting(false);
    if (loaded) onClose();
  };

  const displayError = localError || (hasSubmitted ? error : '');
  const canCompare = haveSameFileType(baseFile, mineFile)
    && normalizeComparablePath(baseFile?.path ?? '') !== normalizeComparablePath(mineFile?.path ?? '')
    && !busy;

  return (
    <DialogFrame
      animationState={animationState}
      className="local-file-compare-dialog w-[860px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-48px)] overflow-y-auto bg-bg-surface-solid border border-border-strong rounded-[24px] p-[24px] shadow-2xl font-ui box-border">
      <button
        type="button"
        disabled={busy}
        onClick={onClose}
        aria-label={t('commonClose')}
        className="absolute top-4 right-4 size-[34px] rounded-[10px] border-none bg-transparent text-text-primary cursor-pointer flex items-center justify-center hover:bg-bg-surface-hover hover:text-accent active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed">
        <X size={16} />
      </button>

      <header className="pr-12 grid gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div
            aria-hidden="true"
            className="size-11 rounded-[14px] inline-flex items-center justify-center shrink-0"
            style={{
              color: cssVar('acc2'),
              background: cssAlpha('acc2', '14'),
              border: `1px solid ${cssAlpha('acc2', '30')}`,
            }}>
            <Files size={20} />
          </div>
          <div>
            <h2 className="m-0 text-text-title text-[24px] font-[900] leading-tight tracking-tight">
              {t('localFileCompareTitle')}
            </h2>
          </div>
        </div>
        <p className="m-0 max-w-[690px] text-text-secondary text-[13px] leading-[1.75]">
          {t('localFileCompareSubtitle')}
        </p>
      </header>

      <div className="local-file-compare-dialog__pair mt-5">
        <FileSlot
          side="base"
          index="01"
          label={t('localFileCompareBaseLabel')}
          hint={t('localFileCompareBaseHint')}
          file={baseFile}
          busy={busy}
          onPick={(side) => { void handlePick(side); }}
        />

        <div className="local-file-compare-dialog__axis" aria-hidden={!baseFile && !mineFile}>
          <div className="local-file-compare-dialog__axis-line" />
          <button
            type="button"
            disabled={busy || (!baseFile && !mineFile)}
            onClick={handleSwap}
            aria-label={t('localFileCompareSwapFiles')}
            title={t('localFileCompareSwapFiles')}
            className="local-file-compare-dialog__swap">
            <ArrowLeftRight size={15} />
          </button>
          <div className="local-file-compare-dialog__axis-line" />
        </div>

        <FileSlot
          side="mine"
          index="02"
          label={t('localFileCompareMineLabel')}
          hint={t('localFileCompareMineHint')}
          file={mineFile}
          busy={busy}
          onPick={(side) => { void handlePick(side); }}
        />
      </div>

      {displayError && (
        <div
          role="alert"
          className="mt-3 rounded-[12px] border border-diff-remove-border px-3.5 py-2.5 text-diff-remove-text text-[13px] font-semibold leading-relaxed"
          style={{ background: cssAlpha('delBg', 'cc') }}>
          {displayError}
        </div>
      )}

      <footer className="mt-5 flex items-center justify-end gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="h-10 min-w-[88px] px-4 rounded-[11px] border border-border-strong bg-transparent text-text-primary font-ui text-[13px] font-bold cursor-pointer hover:bg-bg-surface-hover hover:text-accent active:scale-[0.97] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed">
          {t('localFileCompareCancel')}
        </button>
        <button
          type="button"
          disabled={!canCompare}
          onClick={() => { void handleCompare(); }}
          className="local-file-compare-dialog__compare-action h-10 min-w-[148px] px-5 rounded-[11px] border-none inline-flex items-center justify-center gap-2 font-ui text-[13px] font-extrabold transition-all duration-150">
          {isSubmitting || loading ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowLeftRight size={15} />}
          {isSubmitting || loading ? t('localFileCompareLoading') : t('localFileCompareAction')}
        </button>
      </footer>
    </DialogFrame>
  );
});

export default LocalFileCompareDialog;
