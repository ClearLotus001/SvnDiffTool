import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { resolveAppUpdateNotice } from '../src/components/app/global-bot/sources/appUpdateNotice';
import { resolveDiffSummaryMessages } from '../src/components/app/global-bot/sources/diffSummaryMessages';
import { EMOTION_IDS } from '../src/components/app/global-bot/emotion-ball/emotionIds';
import {
  activateEngine,
  deactivateEngine,
  EMOTION_ENGINE_MAX_FPS,
} from '../src/components/app/global-bot/emotion-ball/engine/scheduler';
import { translate, type TranslationFn } from '../src/i18n/core';
import type { AppUpdateState } from '../src/types';
import type { WorkbookSection } from '../src/utils/workbook/workbookSections';

const t: TranslationFn = (key, ...args) => translate('en-US', key, ...args);

test('the shared emotion scheduler stays awake while capping engine updates at 60 FPS', () => {
  const previousWindow = globalThis.window;
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  globalThis.window = {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame: (handle: number) => {
      callbacks.delete(handle);
    },
  } as Window & typeof globalThis;

  const renderedAt: number[] = [];
  const engine = {
    onAnimationFrame: (now: number) => renderedAt.push(now),
  };
  const runNextFrame = (now: number) => {
    const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    assert.ok(next, 'an active engine should keep requesting animation frames');
    callbacks.delete(next[0]);
    next[1](now);
  };

  try {
    assert.equal(EMOTION_ENGINE_MAX_FPS, 60);
    activateEngine(engine);
    runNextFrame(0);
    runNextFrame(8);
    runNextFrame(16);
    runNextFrame(17);

    assert.deepEqual(renderedAt, [0, 17]);
    assert.equal(callbacks.size, 1);
  } finally {
    deactivateEngine(engine);
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      globalThis.window = previousWindow;
    }
  }
});

function createUpdateState(status: AppUpdateState['status']): AppUpdateState {
  return {
    status,
    platform: 'win32',
    supportsAutoUpdate: true,
    currentVersion: '1.0.35',
    availableVersion: '1.1.0',
    downloadPercent: 42,
    releaseName: '1.1.0',
    releaseNotes: null,
    publishedAt: null,
    lastCheckedAt: null,
    errorMessage: null,
  };
}

test('the global bot retains its emotion, portal, idle, drag, and Electron no-drag architecture', () => {
  const globalBot = fs.readFileSync('src/components/app/global-bot/GlobalBot.tsx', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const draggableOrb = fs.readFileSync('src/components/app/global-bot/useDraggableOrb.ts', 'utf8');
  const speechBubble = fs.readFileSync(
    'src/components/app/global-bot/GlobalBotSpeechBubble.tsx',
    'utf8',
  );
  const emotionController = fs.readFileSync(
    'src/components/app/global-bot/emotion-ball/useEmotionController.ts',
    'utf8',
  );
  const botStyles = fs.readFileSync('src/components/app/global-bot/global-bot.css', 'utf8');

  assert.equal(EMOTION_IDS.length, 32);
  assert.match(app, /lazy\(\(\) => import\('@\/components\/app\/global-bot\/GlobalBot'\)\)/);
  assert.match(app, /<Suspense fallback=\{null\}>[\s\S]*<GlobalBot/);
  assert.match(globalBot, /createPortal/);
  assert.match(globalBot, /useEmotionController\(true\)/);
  assert.match(globalBot, /useOrbChatter/);
  assert.match(globalBot, /按 F7 可以跳到下一处差异/);
  assert.match(globalBot, /这么细致地检查，结果会更可靠/);
  assert.match(draggableOrb, /setPointerCapture/);
  assert.match(draggableOrb, /versora:global-bot-position:v2/);
  assert.match(emotionController, /idle_stage/);
  assert.match(emotionController, /300_000/);
  assert.match(globalBot, /const handleActivate = useCallback\(\(\) => \{\s*onActivate\?\.\(\);/);
  assert.match(speechBubble, /onClick=\{action\.onClick\}/);
  assert.match(speechBubble, /data-wide=\{wide \? 'true' : 'false'\}/);
  assert.match(botStyles, /data-wide='true'[\s\S]*max-width: min\(460px/);
  assert.match(botStyles, /-webkit-app-region: no-drag/);
  assert.match(botStyles, /right: 24px;\s*bottom: 56px;/);
  assert.match(globalBot, /AI_LAYER_FLOOR = 100_000/);
  assert.doesNotMatch(globalBot, /className="global-bot"/);
});

test('the app update source maps updater phases into generic bot notices', () => {
  const onDownload = () => {};
  const onInstall = () => {};
  const available = resolveAppUpdateNotice({
    state: createUpdateState('available'),
    t,
    onDownload,
    onInstall,
  });
  const downloading = resolveAppUpdateNotice({
    state: createUpdateState('downloading'),
    t,
    onDownload,
    onInstall,
  });
  const downloaded = resolveAppUpdateNotice({
    state: createUpdateState('downloaded'),
    t,
    onDownload,
    onInstall,
  });

  assert.equal(available?.source, 'update');
  assert.equal(available?.delivery, 'prompt');
  assert.equal(available?.mood, 'attentive');
  assert.equal(available?.action?.onClick, onDownload);
  assert.equal(downloading?.mood, 'working');
  assert.equal(downloading?.progress?.value, 42);
  assert.equal(downloaded?.mood, 'celebrating');
  assert.equal(downloaded?.action?.onClick, onInstall);
  assert.equal(resolveAppUpdateNotice({
    state: createUpdateState('upToDate'),
    t,
    onDownload,
    onInstall,
  }), null);
});

test('diff summary messages describe text and workbook changes deterministically', () => {
  const section = (
    name: string,
    changeType: WorkbookSection['changeType'],
    renamePeerName: string | null = null,
  ): WorkbookSection => ({
    name,
    displayName: name,
    changeType,
    hasBaseSide: changeType !== 'add',
    hasMineSide: changeType !== 'delete',
    renamePeerName,
    renameRole: changeType === 'rename' ? 'target' : null,
    startLineIdx: 0,
    endLineIdx: 1,
    maxColumns: 3,
    rowCount: 2,
    firstDataLineIdx: 0,
    firstDataRowNumber: 1,
  });
  const messages = resolveDiffSummaryMessages({
    enabled: true,
    isWorkbookMode: true,
    stats: { add: 4, del: 2, chg: 3 },
    workbookSections: [
      section('Orders', 'equal'),
      section('Archive', 'add'),
      section('Old name', 'rename', 'New name'),
      section('New name', 'rename', 'Old name'),
    ],
    modifiedWorkbookSheetNames: new Set(['Orders', 'Archive', 'Old name', 'New name']),
    workbookArtifactDiff: null,
    workbookCellChangeSummary: { added: 9, removed: 3, modified: 1, strictOnly: 0 },
    t,
  });
  const text = messages.map((message) => message.text).join('\n');
  const diffMessage = messages.find((message) => message.id.startsWith('diff:'));

  assert.equal(messages[0]?.source, 'diff-summary');
  assert.equal(diffMessage?.text, 'Current worksheet:');
  assert.deepEqual(diffMessage?.tags, [
    { label: 'added', value: 9, tone: 'positive' },
    { label: 'removed', value: 3, tone: 'negative' },
    { label: 'modified', value: 1, tone: 'warning' },
  ]);
  assert.match(text, /3 worksheets/);
  assert.match(text, /1 added, 0 deleted, and 1 renamed/);
});

test('Bot diff tags keep additions deletions and modifications mutually exclusive', () => {
  const [message] = resolveDiffSummaryMessages({
    enabled: true,
    isWorkbookMode: false,
    stats: { add: 0, del: 0, chg: 2 },
    workbookSections: [],
    modifiedWorkbookSheetNames: new Set(),
    workbookArtifactDiff: null,
    t,
  });

  assert.deepEqual(message?.tags, [
    { label: 'added', value: 0, tone: 'positive' },
    { label: 'removed', value: 0, tone: 'negative' },
    { label: 'modified', value: 2, tone: 'warning' },
  ]);
});
