type DiffViewerMode = 'keep' | 'excel-only' | 'all-files';
type InstallView = 'welcome' | 'directories' | 'settings' | 'installing' | 'done' | 'error';

interface SetupContext {
  productName: string;
  version: string;
  payloadReady: boolean;
  defaultInstallDir: string;
  defaultCacheParent: string;
  managedCacheRoot: string;
  iconPath: string;
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
  badge: string;
}> = [
  {
    value: 'keep',
    title: '保持当前配置',
    description: '安装 SvnDiffTool，但不改动当前 TortoiseSVN Diff Viewer 规则。',
    badge: '稳妥默认',
  },
  {
    value: 'excel-only',
    title: '仅 Excel / 工作簿文件',
    description: '只让工作簿文件通过 SvnDiffTool 打开，其它文本 diff 保持现状。',
    badge: '工作簿优先',
  },
  {
    value: 'all-files',
    title: '全部文件差异',
    description: '统一让 TortoiseSVN 的文件差异通过 SvnDiffTool 打开。',
    badge: '完全接管',
  },
];

const phaseLabels: Record<InstallState['phase'], string> = {
  ready: '等待开始',
  prepare: '准备环境',
  install: '部署程序文件',
  configure: '写入集成设置',
  finalize: '完成收尾',
  done: '安装完成',
  error: '安装失败',
};

const phaseDescriptions: Record<InstallState['phase'], string> = {
  ready: '安装器已就绪，等待开始执行。',
  prepare: '正在检查 payload 并应用这次安装的目录与默认策略。',
  install: '正在复制应用文件并写入程序目录。',
  configure: '正在写入 Diff Viewer 集成和受控缓存配置。',
  finalize: '正在完成最后收尾，不会再弹出原生安装页面。',
  done: '安装流程已结束。',
  error: '安装过程中出现错误，需要返回配置页后再次尝试。',
};

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
  view: 'welcome',
  windowState: {
    isMaximized: false,
  },
};

function getIconUrl(): string {
  if (!state.setup?.iconPath) return '../../assets/icon.png';
  return `file:///${state.setup.iconPath.replace(/\\/g, '/')}`;
}

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
    { label: '安装后启动', value: state.launchAfterInstall ? '立即启动' : '暂不启动' },
  ];
}

function summaryValueClass(label: string): string {
  return label === '安装目录' || label === '受控缓存'
    ? 'summary-row__value mono'
    : 'summary-row__value';
}

function renderSummary(variant: 'compact' | 'receipt' | 'review' = 'review'): string {
  return `
    <div class="summary-grid summary-grid--${variant}">
      ${summaryRows().map((item) => `
        <div class="summary-row">
          <div class="summary-row__label">${item.label}</div>
          <div class="${summaryValueClass(item.label)}">${escapeHtml(item.value)}</div>
        </div>
      `).join('')}
    </div>
  `;
}


// Sidebar and Timeline functions removed to enforce a static, single-pane minimalism

function renderWelcomePanel(): string {
  return `
    <section class="panel panel--welcome">
      <div class="panel__header">
        <div class="panel__eyebrow">Welcome</div>
        <h2 class="panel__title">安装 SvnDiffTool</h2>
        <p class="panel__subtitle">欢迎使用 SvnDiffTool 安装向导。本程序将帮助您高效部署针对 Excel 和文本比较的增强版 Diff Viewer。</p>
      </div>

      ${!state.setup?.payloadReady
        ? '<div class="callout callout--error">当前未检测到内层安装器 payload，安装将无法进行。请修复打包产物。</div>'
        : '<div class="callout callout--neutral">建议在继续安装前，关闭所有正在使用的 TortoiseSVN 窗口以防写入冲突。</div>'}
    </section>
  `;
}

function renderDirectoriesPanel(): string {
  return `
    <section class="panel panel--directories">
      <div class="panel__header">
        <div class="panel__eyebrow">Location</div>
        <h2 class="panel__title">选择安装和缓存位置</h2>
        <p class="panel__subtitle">请确认程序安装目录，以及在运行时用于存放受控缓存的父级目录。</p>
      </div>

      <div class="surface-grid">
        <section class="surface" style="grid-column: 1 / -1;">
          <div class="field">
            <label class="field__label">程序安装目录</label>
            <div class="field__row">
              <input class="input" spellcheck="false" data-input="installDir" value="${escapeHtml(state.installDir)}" />
              <button class="button button--ghost" data-action="pick-install-dir">浏览</button>
            </div>
          </div>
          <div class="field">
            <label class="field__label">会话与临时文件父目录</label>
            <div class="field__row">
              <input class="input" spellcheck="false" data-input="cacheParent" value="${escapeHtml(state.cacheParent)}" />
              <button class="button button--ghost" data-action="pick-cache-parent">浏览</button>
            </div>
            <div class="field__hint">实际受控目录：<span class="mono">${escapeHtml(managedCacheRoot() || '未设置')}</span></div>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderSettingsPanel(): string {
  return `
    <section class="panel panel--settings">
      <div class="panel__header">
        <div class="panel__eyebrow">Settings</div>
        <h2 class="panel__title">配置接管策略与选项</h2>
        <p class="panel__subtitle">告诉 SvnDiffTool 您希望如何处理文件差异比较，以及是否创建桌面快捷入口。</p>
      </div>

      <div class="surface-grid">
        <section class="surface surface--blue" style="grid-column: 1 / -1;">
          <div class="surface__header">
            <div class="surface__eyebrow">Diff Viewer</div>
            <div class="surface__title">默认接管策略</div>
          </div>
          <div class="choice-list">
            ${diffModes.map((mode) => `
              <label class="choice ${state.diffViewerMode === mode.value ? 'choice--selected' : ''}">
                <input type="radio" name="diffMode" value="${mode.value}" ${state.diffViewerMode === mode.value ? 'checked' : ''} />
                <span class="choice__copy">
                  <span class="choice__top">
                    <span class="choice__title">${mode.title}</span>
                    <span class="choice__badge">${mode.badge}</span>
                  </span>
                  <span class="choice__desc">${mode.description}</span>
                </span>
              </label>
            `).join('')}
          </div>
        </section>

        <section class="surface" style="grid-column: 1 / -1;">
          <div class="surface__header">
            <div class="surface__eyebrow">Optional</div>
            <div class="surface__title">快速访问</div>
          </div>
          <div class="toggle-list" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
            <label class="toggle" style="min-height: 54px; padding: 12px 14px;">
              <input type="checkbox" data-toggle="desktopShortcut" ${state.createDesktopShortcut ? 'checked' : ''} />
              <span class="toggle__copy">
                <span class="toggle__title">创建桌面快捷方式</span>
              </span>
            </label>
            <label class="toggle" style="min-height: 54px; padding: 12px 14px;">
              <input type="checkbox" data-toggle="launchAfterInstall" ${state.launchAfterInstall ? 'checked' : ''} />
              <span class="toggle__copy">
                <span class="toggle__title">安装完成后立即启动</span>
              </span>
            </label>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderInstallingPanel(): string {
  const phaseLabel = phaseLabels[state.installState.phase];
  const phaseDescription = phaseDescriptions[state.installState.phase];

  return `
    <section class="panel panel--installing">
      <div class="panel__header">
        <div class="panel__eyebrow">Installing</div>
        <h2 class="panel__title">正在部署 SvnDiffTool</h2>
        <p class="panel__subtitle">${escapeHtml(state.installState.message || phaseDescription)}</p>
      </div>

      <section class="progress-shell">
        <div class="progress-shell__visual">
          <div class="progress__ring" style="--progress:${progressPercent()}">
            <span class="progress__value">${progressPercent()}%</span>
            <span class="progress__label">完成度</span>
          </div>
        </div>
        <div class="progress-shell__body">
          <div class="progress-shell__eyebrow">Current Phase</div>
          <div class="progress-shell__phase">${escapeHtml(phaseLabel)}</div>
          <div class="progress__bar">
            <div class="progress__fill" style="width:${progressPercent()}%"></div>
          </div>
        </div>
      </section>

      <section class="surface surface--receipt">
        <div class="surface__header">
          <div class="surface__eyebrow">Locked Settings</div>
          <div class="surface__title">本次安装正在使用的参数</div>
          <div class="surface__subtitle">这些设置已经传递给内层安装器，并将在本次静默安装中生效。</div>
        </div>
        ${renderSummary('receipt')}
      </section>

      <div class="callout callout--neutral">安装进行期间不会再弹出原生安装页面，当前进度由 outer shell 统一承接。</div>
    </section>
  `;
}

function renderDonePanel(): string {
  return `
    <section class="panel panel--done">
      <div class="panel__header">
        <div class="panel__eyebrow">Completed</div>
        <h2 class="panel__title">安装已完成</h2>
        <p class="panel__subtitle">${escapeHtml(state.installState.message || (state.launchAfterInstall ? 'SvnDiffTool 已按你的选择自动启动。' : 'SvnDiffTool 已完成安装，可以直接开始使用。'))}</p>
      </div>

      <div class="callout callout--success">安装流程、默认接管策略和受控缓存设置均已完成写入。</div>

      <section class="surface surface--receipt">
        <div class="surface__header">
          <div class="surface__eyebrow">Receipt</div>
          <div class="surface__title">本次安装回执</div>
          <div class="surface__subtitle">你可以在关闭安装器前再次核对最终设置，或直接打开安装目录。</div>
        </div>
        ${renderSummary('receipt')}
      </section>
    </section>
  `;
}

function renderErrorPanel(): string {
  const errorMessage = state.installState.error || '安装过程中出现未知错误。';

  return `
    <section class="panel panel--error">
      <div class="panel__header">
        <div class="panel__eyebrow">Recovery</div>
        <h2 class="panel__title">安装未能完成</h2>
        <p class="panel__subtitle">静默安装流程被中断。先检查错误信息与目录设置，再返回配置页重新尝试。</p>
      </div>

      <div class="callout callout--error">${escapeHtml(errorMessage)}</div>

      <section class="surface surface--receipt">
        <div class="surface__header">
          <div class="surface__eyebrow">Last Attempt</div>
          <div class="surface__title">上一次尝试使用的设置</div>
          <div class="surface__subtitle">返回配置页后，你可以基于这些设置继续调整并重新发起安装。</div>
        </div>
        ${renderSummary('receipt')}
      </section>

      <section class="surface">
        <div class="surface__header">
          <div class="surface__eyebrow">Troubleshooting</div>
          <div class="surface__title">建议先检查这些项目</div>
        </div>
        <ul class="checklist">
          <li>确认程序安装目录与缓存父目录可写且路径有效。</li>
          <li>确认当前 setup payload 完整存在，未被其它进程占用。</li>
          <li>返回配置页后可以直接重新安装，无需重启此窗口。</li>
        </ul>
      </section>
    </section>
  `;
}

function renderMainPanel(): string {
  switch (state.view) {
    case 'installing':
      return renderInstallingPanel();
    case 'done':
      return renderDonePanel();
    case 'error':
      return renderErrorPanel();
    case 'directories':
      return renderDirectoriesPanel();
    case 'settings':
      return renderSettingsPanel();
    case 'welcome':
    default:
      return renderWelcomePanel();
  }
}

function renderFooter(): string {
  if (state.view === 'done') {
    return `
      <div class="footer__meta">受控缓存目录：${escapeHtml(managedCacheRoot() || '未设置')}</div>
      <div class="footer__actions">
        <button class="button button--ghost" data-action="open-install-dir">打开安装目录</button>
        <button class="button button--primary" data-action="close">完成</button>
      </div>
    `;
  }

  if (state.view === 'error') {
    return `
      <div class="footer__meta">修正安装目录、缓存目录或打包产物后，可以直接返回重新尝试。</div>
      <div class="footer__actions">
        <button class="button button--ghost" data-action="nav-welcome">返回重试</button>
      </div>
    `;
  }

  if (state.view === 'installing') {
    return `
      <div class="footer__meta">内层静默安装器正在运行，期间不会弹出原生安装页面。</div>
      <div class="footer__actions">
        <button class="button button--ghost" disabled>正在安装...</button>
      </div>
    `;
  }

  if (state.view === 'welcome') {
    return `
      <div class="footer__meta">${state.setup?.payloadReady ? '您可以随时取消安装。' : '当前未检测到内层安装器 payload。'}</div>
      <div class="footer__actions">
        <button class="button button--ghost" data-action="close">取消</button>
        <button class="button button--primary" data-action="nav-directories" ${!state.setup?.payloadReady ? 'disabled' : ''}>下一步</button>
      </div>
    `;
  }

  if (state.view === 'directories') {
    return `
      <div class="footer__meta">SvnDiffTool 会在您选定的目录被部署。</div>
      <div class="footer__actions">
        <button class="button button--ghost" data-action="nav-welcome">上一步</button>
        <button class="button button--primary" data-action="nav-settings">下一步</button>
      </div>
    `;
  }

  // settings view
  return `
    <div class="footer__meta">确认全部选项后点击安装，将会写入所需集成。</div>
    <div class="footer__actions">
      <button class="button button--ghost" data-action="nav-directories">上一步</button>
      <button class="button button--primary" data-action="install" ${!state.setup?.payloadReady ? 'disabled' : ''}>执行安装</button>
    </div>
  `;
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

  appRoot.querySelector('[data-action="nav-welcome"]')?.addEventListener('click', () => {
    state.view = 'welcome';
    render();
  });
  
  appRoot.querySelector('[data-action="nav-directories"]')?.addEventListener('click', () => {
    state.view = 'directories';
    render();
  });

  appRoot.querySelector('[data-action="nav-settings"]')?.addEventListener('click', () => {
    const validationMessage = validateInstallOptions();
    if (validationMessage) {
      window.alert(validationMessage);
      return;
    }
    state.view = 'settings';
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
          <div class="titlebar__icon"><img src="${escapeHtml(getIconUrl())}" alt="SvnDiffTool icon" /></div>
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

      <main class="workspace">
        ${renderMainPanel()}
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
        : 'welcome';
  state.windowState = await setupBridge.getWindowState();

  setupBridge.onInstallState((payload) => {
    state.installState = payload;
    state.view = payload.status === 'success'
      ? 'done'
      : payload.status === 'error'
        ? 'error'
        : payload.status === 'running'
          ? 'installing'
          : 'welcome';
    render();
  });

  setupBridge.onWindowState((payload) => {
    state.windowState = payload;
    render();
  });

  render();
}

void initialize().catch((error) => {
  appRoot.innerHTML = `<div class="shell"><main class="workspace workspace--single"><div class="panel panel--error"><div class="callout callout--error">${escapeHtml(error instanceof Error ? error.message : String(error))}</div></div></main></div>`;
});

export {};
