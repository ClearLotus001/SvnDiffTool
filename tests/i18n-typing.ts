import { electronT } from '../electron/i18n';
import type { TranslationFn } from '@/context/i18n';

declare const t: TranslationFn;

t('commonClose');
t('gotoPreview', { lineNo: 12 });
t('tooltipAddedHint', { mineLabel: 'Local', baseLabel: 'Base' });
electronT('dialogPickWorkingCopyTitle');
electronT('filePayloadReadRevisionError', { revision: 123, message: 'boom' });

// @ts-expect-error missing required params
t('gotoPreview');
// @ts-expect-error wrong param name
t('gotoPreview', { totalLines: 12 });
// @ts-expect-error params not allowed for placeholder-free keys
t('commonClose', { lineNo: 1 });
// @ts-expect-error missing required electron params
electronT('filePayloadReadError');
// @ts-expect-error wrong electron param shape
electronT('filePayloadReadRevisionError', { revision: 1 });

export {};
