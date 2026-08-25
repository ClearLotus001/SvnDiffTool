import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGroup } from 'framer-motion';

import { useI18n } from '@/context/i18n';
import type { GlobalBotMessage } from './messages/types';
import GlobalBotOrbButton from './GlobalBotOrbButton';
import { GlobalBotSpeechBubble } from './GlobalBotSpeechBubble';
import { useEmotionController } from './emotion-ball/useEmotionController';
import { useOrbChatter } from './useOrbChatter';

interface GlobalBotProps {
  notice: GlobalBotMessage | null;
  ambientMessages?: readonly GlobalBotMessage[];
  onActivate?: () => void;
}

const AI_LAYER_FLOOR = 100_000;
const AI_LAYER_GAP = 100;
const AI_LAYER_CEILING = 2_147_483_647;
const CONTEXT_MESSAGE_DELAY_MS = 1_400;
const CONTEXT_MESSAGE_DURATION_MS = 6_200;
const EMPTY_MESSAGES: readonly GlobalBotMessage[] = [];

const CHATTER_LINES = {
  'zh-CN': [
    '我会在这里陪你看差异。',
    '可以把我拖到顺手的位置。',
    '先看修改项，通常能更快找到重点。',
    '工作簿变化多时，可以从页签开始。',
    '新增、删除和修改，我会分别帮你数清。',
    '有些格式变化不会改变实际内容。',
    '需要安静查看时，可以在“显示”里关闭我。',
    '双击我，我会转个圈。',
    '先处理影响范围最大的变化吧。',
    '别忘了确认公式和隐藏列。',
    // 操作引导
    '按 F7 可以跳到下一处差异。',
    '按 Shift+F7 可以回到上一处差异。',
    '差异很多时，先用 Ctrl+F 缩小范围会更轻松。',
    '打开“仅差异”可以暂时收起没有变化的内容。',
    '工作簿里可以从变化页签开始，再逐行核对。',
    '公式和显示值不一致时，记得一起检查公式栏。',
    // 克制的鼓励
    '你已经开始认真核对了，这一步很重要。',
    '一处一处确认，你处理得很稳。',
    '这么细致地检查，结果会更可靠。',
    '复杂文件也在被你慢慢梳理清楚。',
    '能注意到这些变化，说明你很认真。',
    '保持这个节奏，很快就能看完重点。',
  ],
  'en-US': [
    'I will stay here and keep an eye on the differences.',
    'Drag me somewhere that feels convenient.',
    'Start with modifications; they often reveal the important changes fastest.',
    'For busy workbooks, begin with the changed worksheets.',
    'I will count additions, deletions, and modifications separately.',
    'Some formatting changes do not alter the actual content.',
    'You can hide me from Display when you need a quieter workspace.',
    'Double-click me and I will take a spin.',
    'Consider the changes with the widest impact first.',
    'Remember to review formulas and hidden columns.',
    // Actionable guidance
    'Press F7 to jump to the next difference.',
    'Press Shift+F7 to return to the previous difference.',
    'When there are many changes, use Ctrl+F to narrow the field.',
    'Differences only can temporarily fold away unchanged content.',
    'For workbooks, start with changed worksheets and review row by row.',
    'When formulas and displayed values disagree, review the formula bar too.',
    // Quiet encouragement
    'Starting a careful review is already an important step.',
    'One change at a time—you are handling this steadily.',
    'This level of care makes the result more reliable.',
    'Even a complex file becomes clearer as you work through it.',
    'Noticing these details shows real attentiveness.',
    'Keep this pace and the important changes will be covered soon.',
  ],
} as const;

function useContextMessage(
  enabled: boolean,
  messages: readonly GlobalBotMessage[],
): GlobalBotMessage | null {
  const [current, setCurrent] = useState<GlobalBotMessage | null>(null);
  const first = messages[0] ?? null;
  const firstId = first?.id ?? null;
  const firstText = first?.text ?? null;

  useEffect(() => {
    setCurrent(null);
    if (!enabled || !first || !firstId || !firstText) return;

    let hideTimer: number | null = null;
    const showTimer = window.setTimeout(() => {
      setCurrent(first);
      hideTimer = window.setTimeout(() => setCurrent(null), CONTEXT_MESSAGE_DURATION_MS);
    }, CONTEXT_MESSAGE_DELAY_MS);

    return () => {
      window.clearTimeout(showTimer);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
    };
  }, [enabled, first, firstId, firstText]);

  return enabled ? current : null;
}

function messageToPlainText(message: GlobalBotMessage): string {
  const tagText = message.tags
    ?.map((tag) => `${tag.label} ${tag.value}`)
    .join(', ');
  return tagText ? `${message.text} ${tagText}` : message.text;
}

function syncAiRootLayer(root: HTMLElement): void {
  let highestExternalLayer = AI_LAYER_FLOOR - AI_LAYER_GAP;

  document.body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (element === root || root.contains(element)) return;
    const style = window.getComputedStyle(element);
    if (style.position === 'static' || style.zIndex === 'auto') return;
    const layer = Number.parseInt(style.zIndex, 10);
    if (Number.isFinite(layer)) highestExternalLayer = Math.max(highestExternalLayer, layer);
  });

  const nextLayer = Math.min(
    AI_LAYER_CEILING,
    Math.max(AI_LAYER_FLOOR, highestExternalLayer + AI_LAYER_GAP),
  );
  root.style.setProperty('--cl-ai-dynamic-z', String(nextLayer));
  root.dataset.layerZ = String(nextLayer);
}

export default function GlobalBot({
  notice,
  ambientMessages = EMPTY_MESSAGES,
  onActivate,
}: GlobalBotProps) {
  const { locale, t } = useI18n();
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const previousMessageIdRef = useRef<string | null>(null);
  const {
    command,
    ambientAppearanceVariant,
    ambientAppearanceActive,
    setHovered,
    loading,
    semantic,
    done,
    rest,
  } = useEmotionController(true);

  const contextMessage = useContextMessage(!notice, ambientMessages);
  const chatterLines = useMemo(
    () => [...ambientMessages.map(messageToPlainText), ...CHATTER_LINES[locale]],
    [ambientMessages, locale],
  );
  const chatterLine = useOrbChatter({
    enabled: !notice && !contextMessage && ambientAppearanceActive,
    lines: chatterLines,
  });

  const expressiveMessage = notice ?? contextMessage;
  const expressiveMessageId = expressiveMessage?.id ?? null;
  const expressiveMessageMood = expressiveMessage?.mood ?? null;
  useEffect(() => {
    if (!expressiveMessageId || !expressiveMessageMood) {
      if (previousMessageIdRef.current) rest();
      previousMessageIdRef.current = null;
      return;
    }
    if (previousMessageIdRef.current === expressiveMessageId) return;
    previousMessageIdRef.current = expressiveMessageId;

    if (expressiveMessageMood === 'working') {
      loading();
      return;
    }
    semantic(expressiveMessageMood === 'celebrating' ? '19' : '13');
    done();
  }, [done, expressiveMessageId, expressiveMessageMood, loading, rest, semantic]);

  useEffect(() => {
    const node = document.createElement('div');
    node.className = 'cl-ai-root';
    document.body.appendChild(node);
    syncAiRootLayer(node);
    setPortalNode(node);
    return () => {
      node.remove();
      setPortalNode(null);
    };
  }, []);

  useEffect(() => {
    if (!portalNode) return;
    let frame: number | null = null;
    const scheduleLayerSync = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        syncAiRootLayer(portalNode);
      });
    };
    const observer = new MutationObserver(scheduleLayerSync);
    observer.observe(document.body, { childList: true });
    window.addEventListener('resize', scheduleLayerSync, { passive: true });
    scheduleLayerSync();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', scheduleLayerSync);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [portalNode]);

  const speechLine = useMemo(() => {
    if (!notice) return contextMessage?.text ?? chatterLine;
    if (notice.progress) {
      const value = Math.min(100, Math.max(0, Math.round(notice.progress.value)));
      return `${notice.text} · ${value}%`;
    }
    return notice.text;
  }, [chatterLine, contextMessage, notice]);

  const handleActivate = useCallback(() => {
    onActivate?.();
  }, [onActivate]);

  const label = notice
    ? notice.text
    : t('globalBotName');

  if (!portalNode) return null;

  return createPortal(
    <LayoutGroup id="cl-ai-assistant-bot-layout">
      <div
        className="cl-ai-orb-anchor"
        ref={orbRef}
        data-panel-open="false"
        data-message-source={expressiveMessage?.source}>
        <GlobalBotSpeechBubble
          line={speechLine}
          messageKey={notice?.id ?? contextMessage?.id}
          wide={Boolean(notice || contextMessage)}
          tags={notice?.tags ?? contextMessage?.tags}
          action={notice?.action}
        />
        <GlobalBotOrbButton
          command={command}
          appearanceVariant={ambientAppearanceActive ? ambientAppearanceVariant : undefined}
          label={label}
          onActivate={handleActivate}
          onHoverChange={setHovered}
          anchorRef={orbRef}
        />
      </div>
    </LayoutGroup>,
    portalNode,
  );
}
