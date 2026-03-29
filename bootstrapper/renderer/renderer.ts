type DiffViewerMode = 'keep' | 'excel-only' | 'all-files';
type InstallView = 'configure' | 'installing' | 'done' | 'error';
type NoticeTone = 'neutral' | 'info' | 'success' | 'danger';
type TimelineStepKey = 'configure' | 'install' | 'complete';
type TimelineState = 'pending' | 'current' | 'done' | 'error';

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

function renderPill(text: string, tone: NoticeTone): string {
  return `<span class="pill pill--${tone}">${escapeHtml(text)}</span>`;
}

function railStatus(): { tone: NoticeTone; label: string; title: string; description: string } {
  if (!state.setup?.payloadReady) {
    return {
      tone: 'danger',
      label: '缺少 payload',
      title: '当前无法启动安装',
      description: '未检测到内层安装器 payload，请先修复打包产物后再继续。',
    };
  }

  if (state.view === 'installing') {
    return {
      tone: 'info',
      label: phaseLabels[state.installState.phase],
      title: '正在静默安装',
      description: '外层 setup shell 正在驱动安装流程，期间不会再显示原生安装向导。',
    };
  }

  if (state.view === 'done') {
    return {
      tone: 'success',
      label: '已完成',
      title: '安装与配置已完成',
      description: state.launchAfterInstall
        ? 'SvnDiffTool 已按你的选择启动。'
        : '现在可以关闭安装器或直接打开安装目录。',
    };
  }

  if (state.view === 'error') {
    return {
      tone: 'danger',
      label: '需要处理',
      title: '安装未能完成',
      description: '请检查目录与权限设置，返回配置页后可再次发起安装。',
    };
  }

  return {
    tone: 'neutral',
    label: '等待配置',
    title: '确认本次安装设置',
    description: '这里会汇总目录、Diff Viewer 策略与安装后动作，再通过静默模式执行。',
  };
}

function timelineStepState(step: TimelineStepKey): TimelineState {
  if (step === 'configure') {
    return state.view === 'configure' ? 'current' : 'done';
  }

  if (step === 'install') {
    if (state.view === 'error') return 'error';
    if (state.view === 'installing') return 'current';
    if (state.view === 'done') return 'done';
    return 'pending';
  }

  if (state.view === 'done') return 'current';
  return 'pending';
}

function timelineStateLabel(value: TimelineState): string {
  switch (value) {
    case 'done':
      return '已完成';
    case 'current':
      return '进行中';
    case 'error':
      return '需处理';
    case 'pending':
    default:
      return '待执行';
  }
}

function renderTimeline(): string {
  const steps: Array<{ key: TimelineStepKey; title: string; description: string }> = [
    {
      key: 'configure',
      title: '配置安装参数',
      description: '确认程序目录、缓存目录和默认接管策略。',
    },
    {
      key: 'install',
      title: '执行静默安装',
      description: '调用内层 installer 并写入程序集成配置。',
    },
    {
      key: 'complete',
      title: '完成与交付',
      description: '展示安装回执，并提供打开目录或关闭安装器。',
    },
  ];

  return `
    <div class="timeline">
      ${steps.map((step) => {
        const currentState = timelineStepState(step.key);
        return `
          <div class="timeline__item timeline__item--${currentState}">
            <div class="timeline__dot"></div>
            <div class="timeline__content">
              <div class="timeline__top">
                <div class="timeline__title">${step.title}</div>
                <div class="timeline__state">${timelineStateLabel(currentState)}</div>
              </div>
              <div class="timeline__desc">${step.description}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSidebar(): string {
  const status = railStatus();

  return `
    <aside class="sidebar">
      <section class="sidebar__hero">
        <div class="sidebar__eyebrow">Setup Control Desk</div>
        <h1 class="sidebar__title">${escapeHtml(state.setup?.productName || 'SvnDiffTool')} 安装工作台</h1>
        <p class="sidebar__subtitle">把关键设置、安装状态和最终回执放在同一块控制台里，整个过程由独立 bootstrapper 接管。</p>
        <div class="sidebar__meta-row">
          ${renderPill(`v${state.setup?.version || '0.0.0'}`, 'neutral')}
          ${renderPill(state.setup?.payloadReady ? 'Payload Ready' : 'Payload Missing', state.setup?.payloadReady ? 'success' : 'danger')}
        </div>
      </section>

      <section class="sidebar-card sidebar-card--focus">
        <div class="sidebar-card__pills">
          ${renderPill(status.label, status.tone)}
          ${renderPill(state.view === 'configure' ? '配置中' : state.view === 'installing' ? '安装中' : state.view === 'done' ? '已完成' : '异常', status.tone)}
        </div>
        <div class="sidebar-card__title">${status.title}</div>
        <p class="sidebar-card__text">${status.description}</p>
      </section>

      <section class="sidebar-card">
        <div class="sidebar-card__eyebrow">Installation Flow</div>
        ${renderTimeline()}
      </section>

      <section class="sidebar-card">
        <div class="sidebar-card__eyebrow">Current Summary</div>
        ${renderSummary('compact')}
      </section>
    </aside>
  `;
}

function renderConfigurePanel(): string {
  return `
    <section class="panel panel--configure">
      <div class="panel__header">
        <div class="panel__eyebrow">Configure</div>
        <h2 class="panel__title">确认安装位置与默认接管方式</h2>
        <p class="panel__subtitle">这里只保留真正需要你决定的内容：程序目录、受控缓存目录、Diff Viewer 策略，以及两个常用安装选项。</p>
      </div>

      ${!state.setup?.payloadReady
        ? '<div class="callout callout--error">当前未检测到内层安装器 payload，安装按钮会保持禁用，需先修复打包产物。</div>'
        : '<div class="callout callout--neutral">确认后将由当前 setup shell 以静默方式调用内层 installer，期间不会再出现原生安装页面。</div>'}

      <div class="surface-grid">
        <section class="surface">
          <div class="surface__header">
            <div class="surface__eyebrow">Directories</div>
            <div class="surface__title">程序与缓存目录</div>
            <div class="surface__subtitle">安装目录决定程序位置，缓存父目录会自动生成受控的 <span class="mono">SvnDiffTool\\Cache</span> 子目录。</div>
          </div>
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
        </section>

        <section class="surface surface--blue">
          <div class="surface__header">
            <div class="surface__eyebrow">Diff Viewer</div>
            <div class="surface__title">默认接管策略</div>
            <div class="surface__subtitle">你可以保持当前 TortoiseSVN 配置，也可以让 SvnDiffTool 接管工作簿或全部文件 diff。</div>
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

        <section class="surface">
          <div class="surface__header">
            <div class="surface__eyebrow">Optional</div>
            <div class="surface__title">安装后动作</div>
            <div class="surface__subtitle">只保留两个最常用的安装后选项，避免让安装页变成复杂的配置面板。</div>
          </div>
          <div class="toggle-list">
            <label class="toggle">
              <input type="checkbox" data-toggle="desktopShortcut" ${state.createDesktopShortcut ? 'checked' : ''} />
              <span class="toggle__copy">
                <span class="toggle__title">创建桌面快捷方式</span>
                <span class="toggle__desc">为常用入口保留一个直接启动点。</span>
              </span>
            </label>
            <label class="toggle">
              <input type="checkbox" data-toggle="launchAfterInstall" ${state.launchAfterInstall ? 'checked' : ''} />
              <span class="toggle__copy">
                <span class="toggle__title">安装完成后立即启动 SvnDiffTool</span>
                <span class="toggle__desc">完成安装后直接进入应用，无需再次手动打开。</span>
              </span>
            </label>
          </div>
        </section>

        <section class="surface surface--receipt">
          <div class="surface__header">
            <div class="surface__eyebrow">Review</div>
            <div class="surface__title">安装前摘要</div>
            <div class="surface__subtitle">点击安装前，这里会汇总本次将写入的关键设置。</div>
          </div>
          ${renderSummary('review')}
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
          <div class="progress-shell__hint">${escapeHtml(phaseDescription)}</div>
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
    case 'configure':
    default:
      return renderConfigurePanel();
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
        <button class="button button--ghost" data-action="back-to-configure">返回修改</button>
      </div>
    `;
  }

  if (state.view === 'installing') {
    return `
      <div class="footer__meta">内层静默安装器正在运行，期间不会再弹出原生安装页面。</div>
      <div class="footer__actions">
        <button class="button button--ghost" disabled>安装中</button>
      </div>
    `;
  }

  return `
    <div class="footer__meta">${state.setup?.payloadReady
      ? '安装程序将使用当前设置静默调用内层 installer。'
      : '当前未检测到内层安装器 payload，安装按钮已禁用。'}</div>
    <div class="footer__actions">
      <button class="button button--ghost" data-action="close">取消</button>
      <button class="button button--primary" data-action="install" ${!state.setup?.payloadReady ? 'disabled' : ''}>安装</button>
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

      <main class="workspace">
        ${renderSidebar()}
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
  appRoot.innerHTML = `<div class="shell"><main class="workspace workspace--single"><div class="panel panel--error"><div class="callout callout--error">${escapeHtml(error instanceof Error ? error.message : String(error))}</div></div></main></div>`;
});

export {};
