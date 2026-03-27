type DiffViewerMode = 'keep' | 'excel-only' | 'all-files';
type InstallView = 'configure' | 'installing' | 'done' | 'error';

interface SetupContext {
  productName: string;
  version: string;
  payloadReady: boolean;
  defaultInstallDir: string;
  defaultCacheParent: string;
  managedCacheRoot: string;
}

interface InstallState {
  status: 'idle' | 'running' | 'success' | 'error';
  phase: 'ready' | 'prepare' | 'install' | 'configure' | 'finalize' | 'done' | 'error';
  progress: number;
  message: string;
  error: string;
}

interface InstallOptions {
  installDir: string;
  cacheParent: string;
  diffViewerMode: DiffViewerMode;
  createDesktopShortcut: boolean;
  launchAfterInstall: boolean;
}

interface WindowStatePayload {
  isMaximized: boolean;
}

interface SetupBridge {
  getContext(): Promise<SetupContext>;
  pickInstallDir(): Promise<string | null>;
  pickCacheParent(): Promise<string | null>;
  startInstall(options: InstallOptions): Promise<{ ok: true }>;
  getInstallState(): Promise<InstallState>;
  onInstallState(listener: (payload: InstallState) => void): () => void;
  openPath(targetPath: string): Promise<void>;
  getWindowState(): Promise<WindowStatePayload>;
  onWindowState(listener: (payload: WindowStatePayload) => void): () => void;
  windowMinimize(): void;
  windowMaximize(): void;
  windowClose(): void;
}

declare global {
  interface Window {
    setupBridge?: SetupBridge;
  }
}

interface AppState {
  setup: SetupContext | null;
  installDir: string;
  cacheParent: string;
  diffViewerMode: DiffViewerMode;
  createDesktopShortcut: boolean;
  launchAfterInstall: boolean;
  installState: InstallState;
  view: InstallView;
  windowState: WindowStatePayload;
}

const bridge = window.setupBridge;
const root = document.getElementById('app');

if (!bridge || !root) {
  throw new Error('Bootstrapper UI bridge is unavailable.');
}

const setupBridge: SetupBridge = bridge;
const appRoot: HTMLElement = root;

const diffModes: Array<{
  value: DiffViewerMode;
  title: string;
  description: string;
}> = [
  {
    value: 'keep',
    title: '保持当前配置',
    description: '安装 SvnDiffTool，但不改动当前 TortoiseSVN Diff Viewer 规则。',
  },
  {
    value: 'excel-only',
    title: '仅 Excel / 工作簿文件',
    description: '只让工作簿文件通过 SvnDiffTool 打开，其它文本 diff 保持现状。',
  },
  {
    value: 'all-files',
    title: '全部文件差异',
    description: '统一让 TortoiseSVN 的文件差异通过 SvnDiffTool 打开。',
  },
];

const state: AppState = {
  setup: null,
  installDir: '',
  cacheParent: '',
  diffViewerMode: 'keep',
  createDesktopShortcut: true,
  launchAfterInstall: true,
  installState: {
    status: 'idle',
    phase: 'ready',
    progress: 0,
    message: '',
    error: '',
  },
  view: 'configure',
  windowState: {
    isMaximized: false,
  },
};

function managedCacheRoot(): string {
  return state.cacheParent
    ? `${state.cacheParent}\\SvnDiffTool\\Cache`
    : '';
}

function diffViewerLabel(mode: DiffViewerMode): string {
  return diffModes.find((item) => item.value === mode)?.title ?? mode;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function progressPercent(): number {
  return Math.round(state.installState.progress * 100);
}

function validateInstallOptions(): string {
  if (!state.installDir.trim()) {
    return '请先选择程序安装目录。';
  }
  if (!state.cacheParent.trim()) {
    return '请先选择会话与临时文件的父目录。';
  }
  return '';
}

function summaryRows(): Array<{ label: string; value: string }> {
  return [
    { label: '安装目录', value: state.installDir || '未设置' },
    { label: '受控缓存', value: managedCacheRoot() || '未设置' },
    { label: 'Diff Viewer', value: diffViewerLabel(state.diffViewerMode) },
    { label: '桌面快捷方式', value: state.createDesktopShortcut ? '创建' : '不创建' },
  ];
}

async function pickInstallDir() {
  const picked = await setupBridge.pickInstallDir();
  if (!picked) return;
  state.installDir = picked;
  render();
}

async function pickCacheParent() {
  const picked = await setupBridge.pickCacheParent();
  if (!picked) return;
  state.cacheParent = picked;
  render();
}

async function startInstall() {
  const validationMessage = validateInstallOptions();
  if (validationMessage) {
    window.alert(validationMessage);
    return;
  }

  state.view = 'installing';
  state.installState = {
    status: 'running',
    phase: 'prepare',
    progress: 0.06,
    message: 'Preparing installation',
    error: '',
  };
  render();

  try {
      await setupBridge.startInstall({
      installDir: state.installDir,
      cacheParent: state.cacheParent,
      diffViewerMode: state.diffViewerMode,
      createDesktopShortcut: state.createDesktopShortcut,
      launchAfterInstall: state.launchAfterInstall,
    });
  } catch (error) {
    state.view = 'error';
    state.installState = {
      status: 'error',
      phase: 'error',
      progress: 0,
      message: 'Installation failed',
      error: error instanceof Error ? error.message : String(error),
    };
    render();
  }
}

function renderConfigure(): string {
  return `
    <section class="card">
      <div class="card__header">
        <div class="card__eyebrow">Install Options</div>
        <h1 class="card__title">简洁安装设置</h1>
        <p class="card__subtitle">只保留真正需要确认的内容：程序目录、会话与临时文件目录、Diff Viewer 接管方式，以及两个常用选项。</p>
      </div>

      <div class="section">
        <div class="section__title">程序与缓存目录</div>
        <div class="field">
          <label class="field__label">程序安装目录</label>
          <div class="field__row">
            <input class="input" data-input="installDir" value="${escapeHtml(state.installDir)}" />
            <button class="button button--ghost" data-action="pick-install-dir">浏览</button>
          </div>
        </div>
        <div class="field">
          <label class="field__label">会话与临时文件父目录</label>
          <div class="field__row">
            <input class="input" data-input="cacheParent" value="${escapeHtml(state.cacheParent)}" />
            <button class="button button--ghost" data-action="pick-cache-parent">浏览</button>
          </div>
          <div class="field__hint">实际受控目录：<span class="mono">${escapeHtml(managedCacheRoot() || '未设置')}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="section__title">默认接管策略</div>
        <div class="choice-list">
          ${diffModes.map((mode) => `
            <label class="choice ${state.diffViewerMode === mode.value ? 'choice--selected' : ''}">
              <input type="radio" name="diffMode" value="${mode.value}" ${state.diffViewerMode === mode.value ? 'checked' : ''} />
              <span class="choice__copy">
                <span class="choice__title">${mode.title}</span>
                <span class="choice__desc">${mode.description}</span>
              </span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="section">
        <div class="section__title">其他选项</div>
        <label class="toggle">
          <input type="checkbox" data-toggle="desktopShortcut" ${state.createDesktopShortcut ? 'checked' : ''} />
          <span class="toggle__text">创建桌面快捷方式</span>
        </label>
        <label class="toggle">
          <input type="checkbox" data-toggle="launchAfterInstall" ${state.launchAfterInstall ? 'checked' : ''} />
          <span class="toggle__text">安装完成后立即启动 SvnDiffTool</span>
        </label>
      </div>
    </section>
  `;
}

function renderInstalling(): string {
  return `
    <section class="card card--progress">
      <div class="card__header">
        <div class="card__eyebrow">Installing</div>
        <h1 class="card__title">${state.installState.status === 'error' ? '安装失败' : '正在安装 SvnDiffTool'}</h1>
        <p class="card__subtitle">${escapeHtml(state.installState.message || '正在准备安装。')}</p>
      </div>

      <div class="progress">
        <div class="progress__ring" style="--progress:${progressPercent()}">
          <span>${progressPercent()}%</span>
        </div>
        <div class="progress__body">
          <div class="progress__bar">
            <div class="progress__fill" style="width:${progressPercent()}%"></div>
          </div>
          <div class="progress__phase">${escapeHtml(state.installState.phase)}</div>
        </div>
      </div>

      ${state.installState.status === 'error'
        ? `<div class="message message--error">${escapeHtml(state.installState.error || '安装过程中出现未知错误。')}</div>`
        : ''}
    </section>
  `;
}

function renderDone(): string {
  return `
    <section class="card">
      <div class="card__header">
        <div class="card__eyebrow">Completed</div>
        <h1 class="card__title">安装完成</h1>
        <p class="card__subtitle">${state.launchAfterInstall ? 'SvnDiffTool 已按你的选择自动启动。' : 'SvnDiffTool 已安装完成。'}</p>
      </div>

      <div class="summary">
        ${summaryRows().map((item) => `
          <div class="summary__row">
            <div class="summary__label">${item.label}</div>
            <div class="summary__value">${escapeHtml(item.value)}</div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderMain(): string {
  switch (state.view) {
    case 'installing':
    case 'error':
      return renderInstalling();
    case 'done':
      return renderDone();
    case 'configure':
    default:
      return renderConfigure();
  }
}

function renderFooter(): string {
  if (state.view === 'done') {
    return `
      <div class="footer__meta">受控缓存目录：${escapeHtml(managedCacheRoot())}</div>
      <div class="footer__actions">
        <button class="button button--ghost" data-action="open-install-dir">打开安装目录</button>
        <button class="button button--primary" data-action="close">完成</button>
      </div>
    `;
  }

  if (state.view === 'installing') {
    return `
      <div class="footer__meta">正在调用内层静默安装器，期间不会再弹出原生安装页面。</div>
      <div class="footer__actions">
        <button class="button button--ghost" disabled>安装中</button>
      </div>
    `;
  }

  if (state.view === 'error') {
    return `
      <div class="footer__meta">修正安装选项后可以再次尝试。</div>
      <div class="footer__actions">
        <button class="button button--ghost" data-action="back-to-configure">返回修改</button>
      </div>
    `;
  }

  return `
    <div class="footer__meta">安装程序将使用这组设置静默调用内层 installer。</div>
    <div class="footer__actions">
      <button class="button button--ghost" data-action="close">取消</button>
      <button class="button button--primary" data-action="install" ${!state.setup?.payloadReady ? 'disabled' : ''}>安装</button>
    </div>
  `;
}

function bindEvents() {
  appRoot.querySelector('[data-action="pick-install-dir"]')?.addEventListener('click', () => {
    void pickInstallDir();
  });

  appRoot.querySelector('[data-action="pick-cache-parent"]')?.addEventListener('click', () => {
    void pickCacheParent();
  });

  appRoot.querySelector('[data-input="installDir"]')?.addEventListener('input', (event) => {
    state.installDir = (event.target as HTMLInputElement).value;
    render();
  });

  appRoot.querySelector('[data-input="cacheParent"]')?.addEventListener('input', (event) => {
    state.cacheParent = (event.target as HTMLInputElement).value;
    render();
  });

  appRoot.querySelector('[data-toggle="desktopShortcut"]')?.addEventListener('change', (event) => {
    state.createDesktopShortcut = (event.target as HTMLInputElement).checked;
    render();
  });

  appRoot.querySelector('[data-toggle="launchAfterInstall"]')?.addEventListener('change', (event) => {
    state.launchAfterInstall = (event.target as HTMLInputElement).checked;
    render();
  });

  appRoot.querySelectorAll<HTMLInputElement>('input[name="diffMode"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      state.diffViewerMode = (event.target as HTMLInputElement).value as DiffViewerMode;
      render();
    });
  });

  appRoot.querySelector('[data-action="install"]')?.addEventListener('click', () => {
    void startInstall();
  });

  appRoot.querySelector('[data-action="close"]')?.addEventListener('click', () => {
    setupBridge.windowClose();
  });

  appRoot.querySelector('[data-action="open-install-dir"]')?.addEventListener('click', () => {
    void setupBridge.openPath(state.installDir);
  });

  appRoot.querySelector('[data-action="back-to-configure"]')?.addEventListener('click', () => {
    state.view = 'configure';
    state.installState = {
      status: 'idle',
      phase: 'ready',
      progress: 0,
      message: '',
      error: '',
    };
    render();
  });

  appRoot.querySelector('[data-window="minimize"]')?.addEventListener('click', () => {
    setupBridge.windowMinimize();
  });
  appRoot.querySelector('[data-window="maximize"]')?.addEventListener('click', () => {
    setupBridge.windowMaximize();
  });
  appRoot.querySelector('[data-window="close"]')?.addEventListener('click', () => {
    setupBridge.windowClose();
  });
}

function render() {
  appRoot.innerHTML = `
    <div class="shell">
      <header class="titlebar">
        <div class="titlebar__brand">
          <div class="titlebar__icon"><img src="../../assets/icon.png" alt="SvnDiffTool icon" /></div>
          <div class="titlebar__meta">
            <div class="titlebar__title">SvnDiffTool Setup</div>
            <div class="titlebar__subtitle">v${escapeHtml(state.setup?.version || '0.0.0')}</div>
          </div>
        </div>
        <div class="titlebar__actions">
          <button class="window-button" data-window="minimize" title="最小化">—</button>
          <button class="window-button" data-window="maximize" title="最大化">${state.windowState.isMaximized ? '❐' : '□'}</button>
          <button class="window-button" data-window="close" title="关闭">✕</button>
        </div>
      </header>

      <main class="main">
        <section class="hero">
          <div class="hero__eyebrow">Custom Bootstrapper</div>
          <h2 class="hero__title">更简洁的安装体验</h2>
          <p class="hero__subtitle">只展示关键安装信息，并通过独立 setup shell 接管整个安装过程。</p>
        </section>

        ${!state.setup?.payloadReady
          ? '<div class="message message--error">当前未检测到内层安装器 payload，暂时无法继续安装。</div>'
          : ''}

        ${renderMain()}
      </main>

      <footer class="footer">
        ${renderFooter()}
      </footer>
    </div>
  `;

  bindEvents();
}

async function initialize() {
  state.setup = await setupBridge.getContext();
  state.installDir = state.setup.defaultInstallDir;
  state.cacheParent = state.setup.defaultCacheParent;
  state.installState = await setupBridge.getInstallState();
  state.view = state.installState.status === 'success'
    ? 'done'
    : state.installState.status === 'error'
      ? 'error'
      : state.installState.status === 'running'
        ? 'installing'
        : 'configure';
  state.windowState = await setupBridge.getWindowState();

  setupBridge.onInstallState((payload) => {
    state.installState = payload;
    state.view = payload.status === 'success'
      ? 'done'
      : payload.status === 'error'
        ? 'error'
        : payload.status === 'running'
          ? 'installing'
          : 'configure';
    render();
  });

  setupBridge.onWindowState((payload) => {
    state.windowState = payload;
    render();
  });

  render();
}

void initialize().catch((error) => {
  appRoot.innerHTML = `<div class="shell"><main class="main"><div class="message message--error">${escapeHtml(error instanceof Error ? error.message : String(error))}</div></main></div>`;
});

export {};
