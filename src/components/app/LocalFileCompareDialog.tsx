import { memo, useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import {
  ArrowLeftRight,
  FileCheck2,
  File as FileIcon,
  Files,
  FolderOpen,
  GitBranch,
  HardDrive,
  LoaderCircle,
  Upload,
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
  onDropFiles: (side: LocalFilePickSide, files: File[], containsDirectory: boolean) => void;
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
  onDropFiles,
}: FileSlotProps) => {
  const { t } = useI18n();
  const dragDepthRef = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const hasFilePayload = (event: ReactDragEvent<HTMLElement>) => (
    Array.from(event.dataTransfer.types).includes('Files') || event.dataTransfer.files.length > 0
  );

  const handleDragEnter = (event: ReactDragEvent<HTMLElement>) => {
    if (busy || !hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
  };

  const handleDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    if (!isDraggingFile) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    if (busy) return;

    const containsDirectory = Array.from(event.dataTransfer.items).some((item) => (
      item.webkitGetAsEntry()?.isDirectory === true
    ));
    onDropFiles(side, Array.from(event.dataTransfer.files), containsDirectory);
  };

  return (
    <section
      className={`local-file-compare-dialog__slot ${file ? 'local-file-compare-dialog__slot--selected' : ''} ${isDraggingFile ? 'local-file-compare-dialog__slot--dragging' : ''}`}
      data-side={side}
      data-testid={`local-file-drop-${side}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="local-file-compare-dialog__index">{index}</span>
            <span className="text-text-title text-[14px] font-[850]">{label}</span>
          </div>
          <div className="text-text-secondary text-[12px] leading-relaxed">{hint}</div>
        </div>
        <FileIcon
          aria-hidden="true"
          size={20}
          className={file ? 'text-[var(--acc2)] shrink-0' : 'text-text-secondary shrink-0'}
        />
      </div>

      <div
        className="local-file-compare-dialog__file"
        data-state={isDraggingFile ? 'dragging' : file ? 'selected' : 'empty'}
        title={file?.path ?? ''}
        aria-live="polite">
        <span
          className={`local-file-compare-dialog__drop-glyph ${file && !isDraggingFile ? 'local-file-compare-dialog__drop-glyph--selected' : ''}`}
          aria-hidden="true">
          {file && !isDraggingFile
            ? <FileCheck2 size={17} strokeWidth={2.15} />
            : <Upload size={17} strokeWidth={2.25} />}
        </span>
        <div className="local-file-compare-dialog__drop-copy">
          <div className={`truncate text-[13px] font-bold ${isDraggingFile ? 'text-[var(--acc2)]' : file ? 'text-text-title' : 'text-text-primary'}`}>
            {isDraggingFile
              ? t('localFileCompareDropActive')
              : file?.name ?? t('localFileCompareDropEmpty')}
          </div>
          <div className="truncate text-[11px] font-code text-text-secondary">
            {isDraggingFile && file
              ? t('localFileCompareDropReplaceHint')
              : file?.path ?? t('localFileCompareFilePlaceholder')}
          </div>
        </div>
        {!isDraggingFile && (
          <span className="local-file-compare-dialog__drop-badge" aria-hidden="true">
            <Upload size={10} strokeWidth={2.4} />
            {file ? t('localFileCompareDropReplaceBadge') : t('localFileCompareDropBadge')}
          </span>
        )}
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

  useEffect(() => {
    const preventDroppedFileNavigation = (event: DragEvent) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      event.preventDefault();
    };
    window.addEventListener('dragover', preventDroppedFileNavigation);
    window.addEventListener('drop', preventDroppedFileNavigation);
    return () => {
      window.removeEventListener('dragover', preventDroppedFileNavigation);
      window.removeEventListener('drop', preventDroppedFileNavigation);
    };
  }, []);

  const applySelectedFile = (side: LocalFilePickSide, selected: LocalDiffFilePickResult) => {
    const nextBaseFile = side === 'base' ? selected : baseFile;
    const nextMineFile = side === 'mine' ? selected : mineFile;
    if (side === 'base') setBaseFile(selected);
    else setMineFile(selected);
    setHasSubmitted(false);

    if (
      nextBaseFile
      && nextMineFile
      && normalizeComparablePath(nextBaseFile.path) === normalizeComparablePath(nextMineFile.path)
    ) {
      setLocalError(t('localFileCompareSameFile'));
      return;
    }
    if (nextBaseFile && nextMineFile && !haveSameFileType(nextBaseFile, nextMineFile)) {
      setLocalError(t('localFileCompareTypeMismatch'));
      return;
    }
    setLocalError('');
  };

  const handlePick = async (side: LocalFilePickSide) => {
    setPickingSide(side);
    setLocalError('');
    try {
      const peerFile = side === 'base' ? mineFile : baseFile;
      const selected = await onPickFile(side, getComparableExtension(peerFile?.path ?? ''));
      if (!selected) return;
      applySelectedFile(side, selected);
    } catch (pickError) {
      setLocalError(pickError instanceof Error ? pickError.message : String(pickError));
    } finally {
      setPickingSide(null);
    }
  };

  const handleDropFiles = (
    side: LocalFilePickSide,
    files: File[],
    containsDirectory: boolean,
  ) => {
    if (containsDirectory) {
      setLocalError(t('localFileCompareDropDirectory'));
      return;
    }
    if (files.length !== 1) {
      setLocalError(t('localFileCompareDropMultiple'));
      return;
    }

    const droppedFile = files[0]!;
    let droppedPath = '';
    try {
      droppedPath = window.svnDiff?.getPathForDroppedFile?.(droppedFile)?.trim() ?? '';
    } catch {
      droppedPath = '';
    }
    if (!droppedPath) {
      droppedPath = ((droppedFile as File & { path?: string }).path ?? '').trim();
    }
    const selected = toFilePickResult(droppedPath);
    if (!selected) {
      setLocalError(t('localFileCompareDropUnavailable'));
      return;
    }
    applySelectedFile(side, {
      ...selected,
      name: droppedFile.name.trim() || selected.name,
    });
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
      className="local-file-compare-dialog w-[980px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-48px)] overflow-y-auto bg-bg-surface-solid border border-border-strong rounded-[24px] p-[24px] shadow-2xl font-ui box-border">
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

      <section className="local-file-compare-dialog__smart-mode mt-4" aria-label={t('localFileCompareSmartModeTitle')}>
        <div className="local-file-compare-dialog__smart-mode-title">
          {t('localFileCompareSmartModeTitle')}
        </div>
        <div className="local-file-compare-dialog__smart-mode-rules">
          <div
            className="local-file-compare-dialog__smart-mode-rule"
            data-mode="svn"
            title={t('localFileCompareSmartModeSvn')}>
            <GitBranch size={14} aria-hidden="true" />
            <span>{t('localFileCompareSmartModeSvn')}</span>
          </div>
          <div
            className="local-file-compare-dialog__smart-mode-rule"
            data-mode="local"
            title={t('localFileCompareSmartModeLocal')}>
            <HardDrive size={14} aria-hidden="true" />
            <span>{t('localFileCompareSmartModeLocal')}</span>
          </div>
        </div>
      </section>

      <div className="local-file-compare-dialog__pair mt-5">
        <FileSlot
          side="base"
          index="01"
          label={t('localFileCompareBaseLabel')}
          hint={t('localFileCompareBaseHint')}
          file={baseFile}
          busy={busy}
          onPick={(side) => { void handlePick(side); }}
          onDropFiles={handleDropFiles}
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
          onDropFiles={handleDropFiles}
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
