import type { SvnDiffBridge } from '@/types/bridge';

interface WindowActionHost {
  close?: () => void;
  location?: {
    reload: () => void;
  };
  svnDiff?: Pick<SvnDiffBridge, 'windowClose'>;
}

export function retryCurrentPage(host: WindowActionHost = window): void {
  host.location?.reload();
}

export function closeCurrentWindow(host: WindowActionHost = window): void {
  if (host.svnDiff?.windowClose) {
    host.svnDiff.windowClose();
    return;
  }

  host.close?.();
}
