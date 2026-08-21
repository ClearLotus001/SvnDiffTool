import type { VersoraBridge } from '@/types/bridge';

interface WindowActionHost {
  close?: () => void;
  location?: {
    reload: () => void;
  };
  versora?: Pick<VersoraBridge, 'windowClose'>;
}

export function retryCurrentPage(host: WindowActionHost = window): void {
  host.location?.reload();
}

export function closeCurrentWindow(host: WindowActionHost = window): void {
  if (host.versora?.windowClose) {
    host.versora.windowClose();
    return;
  }

  host.close?.();
}
