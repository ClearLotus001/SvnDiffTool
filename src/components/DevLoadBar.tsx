import { memo, useState } from 'react';
import { FONT_SIZE, FONT_UI } from '../constants/typography';
import { useI18n } from '../context/i18n';
import { useTheme } from '../context/theme';

interface DevLoadBarProps {
  onLoadDemo: () => Promise<void>;
  onLoadWorkingCopyDiff: (filePath: string) => Promise<void>;
}

type LocalSelection = {
  name: string;
  path?: string;
};

const DevLoadBar = memo(({
  onLoadDemo,
  onLoadWorkingCopyDiff,
}: DevLoadBarProps) => {
  const T = useTheme();
  const { t } = useI18n();
  const [workingCopyFile, setWorkingCopyFile] = useState<LocalSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadWorkingCopy = async (nextFile: LocalSelection | null) => {
    setWorkingCopyFile(nextFile);
    setError('');

    if (!nextFile?.path) return;

    setBusy(true);
    try {
      await onLoadWorkingCopyDiff(nextFile.path);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const statusText = busy
    ? t('devLoaderLoading')
    : error
    ? t('devLoaderError', { message: error })
    : workingCopyFile
    ? t('devLoaderReadyWorkingCopy', { file: workingCopyFile.name })
    : t('devLoaderPendingWorkingCopy');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: T.bg1,
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
        minWidth: 0,
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ color: T.t0, fontSize: FONT_SIZE.sm, fontWeight: 700, fontFamily: FONT_UI }}>
          {t('devLoaderTitle')}
        </span>
        <span style={{ color: T.t2, fontSize: FONT_SIZE.sm, fontFamily: FONT_UI }}>
          {statusText}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 24, color: T.t2, fontSize: FONT_SIZE.sm, fontFamily: FONT_UI }}>
        {t('devLoaderHintElectron')}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={async () => {
            if (!window.svnDiff?.pickDiffFile) return;
            const nextFile = await window.svnDiff.pickDiffFile();
            if (nextFile) void loadWorkingCopy(nextFile);
          }}
          style={{
            height: 30,
            padding: '0 12px',
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: T.bg2,
            color: T.t0,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            fontWeight: 600,
            cursor: 'pointer',
          }}>
          {t('devLoaderWorkingCopyLabel')}: {workingCopyFile?.name ?? t('devLoaderChooseWorkingCopy')}
        </button>
        <button
          onClick={() => {
            setWorkingCopyFile(null);
            setError('');
            void onLoadDemo();
          }}
          style={{
            height: 30,
            padding: '0 12px',
            borderRadius: 10,
            border: `1px solid ${T.acc}44`,
            background: `${T.acc}18`,
            color: T.acc,
            fontFamily: FONT_UI,
            fontSize: FONT_SIZE.sm,
            fontWeight: 700,
            cursor: 'pointer',
          }}>
          {t('devLoaderLoadDemo')}
        </button>
      </div>
    </div>
  );
});

export default DevLoadBar;
