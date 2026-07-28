import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { closeCurrentWindow, retryCurrentPage } from '../src/utils/app/windowActions';
import HomeStartPanel from '../src/components/app/HomeStartPanel';
import { I18nProvider } from '../src/context/i18n';

test('retryCurrentPage delegates to location.reload', () => {
  let reloaded = false;

  retryCurrentPage({
    location: {
      reload: () => {
        reloaded = true;
      },
    },
  });

  assert.equal(reloaded, true);
});

test('closeCurrentWindow prefers the Electron bridge close handler', () => {
  let bridgeClosed = 0;
  let fallbackClosed = 0;

  closeCurrentWindow({
    svnDiff: {
      windowClose: () => {
        bridgeClosed += 1;
      },
    },
    close: () => {
      fallbackClosed += 1;
    },
  });

  assert.equal(bridgeClosed, 1);
  assert.equal(fallbackClosed, 0);
});

test('closeCurrentWindow falls back to window.close when the bridge is unavailable', () => {
  let fallbackClosed = 0;

  closeCurrentWindow({
    close: () => {
      fallbackClosed += 1;
    },
  });

  assert.equal(fallbackClosed, 1);
});

test('HomeStartPanel shows retry and close actions when an error is present', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      { initialLocale: 'zh-CN' },
      React.createElement(HomeStartPanel, {
        error: '文件加载失败：boom',
        isElectron: true,
        onPickWorkingCopy: () => {},
        onOpenLocalFileCompare: () => {},
        onOpenSvnConfig: () => {},
      }),
    ),
  );

  assert.match(html, /文件加载失败：boom/);
  assert.match(html, /重试/);
  assert.match(html, /关闭窗口/);
});
