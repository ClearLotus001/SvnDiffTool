import { memo } from 'react';
import { Layers3, Minus, Pencil, Plus } from 'lucide-react';

import type { DiffTypeFilter } from '@/types';
import { useI18n } from '@/context/i18n';
import Tooltip from '@/components/shared/Tooltip';

interface DiffFilterToolbarProps {
  value: DiffTypeFilter;
  onChange: (value: DiffTypeFilter) => void;
}

const FILTER_OPTIONS: Array<{
  value: DiffTypeFilter;
  labelKey: 'diffFilterAll' | 'diffFilterAdded' | 'diffFilterModified' | 'diffFilterDeleted';
  titleKey: 'diffFilterAllTitle' | 'diffFilterAddedTitle' | 'diffFilterModifiedTitle' | 'diffFilterDeletedTitle';
  icon: typeof Layers3;
  color: string;
  background: string;
}> = [
  {
    value: 'all',
    labelKey: 'diffFilterAll',
    titleKey: 'diffFilterAllTitle',
    icon: Layers3,
    color: 'var(--accent)',
    background: 'color-mix(in srgb, var(--accent) 12%, var(--bg-surface-solid) 88%)',
  },
  {
    value: 'add',
    labelKey: 'diffFilterAdded',
    titleKey: 'diffFilterAddedTitle',
    icon: Plus,
    color: 'var(--diff-add-text)',
    background: 'color-mix(in srgb, var(--diff-add-bg) 74%, var(--bg-surface-solid) 26%)',
  },
  {
    value: 'modify',
    labelKey: 'diffFilterModified',
    titleKey: 'diffFilterModifiedTitle',
    icon: Pencil,
    color: 'var(--diff-modify-text)',
    background: 'color-mix(in srgb, var(--diff-modify-bg) 76%, var(--bg-surface-solid) 24%)',
  },
  {
    value: 'delete',
    labelKey: 'diffFilterDeleted',
    titleKey: 'diffFilterDeletedTitle',
    icon: Minus,
    color: 'var(--diff-remove-text)',
    background: 'color-mix(in srgb, var(--diff-remove-bg) 74%, var(--bg-surface-solid) 26%)',
  },
];

const DiffFilterToolbar = memo(({
  value,
  onChange,
}: DiffFilterToolbarProps) => {
  const { t } = useI18n();

  return (
    <div
      className="diff-filter-toolbar relative z-[45] min-h-10 px-2.5 py-1.5 shrink-0 border-b border-border-default bg-bg-surface flex items-center overflow-x-auto"
      data-testid="diff-filter-toolbar">
      <div
        role="radiogroup"
        aria-label={t('diffFilterLabel')}
        className="inline-flex items-center gap-1 p-0.5 rounded-[11px] border border-border-default bg-bg-surface-hover shrink-0">
        {FILTER_OPTIONS.map((option) => {
          const active = value === option.value;
          const Icon = option.icon;
          const button = (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`diff-filter-${option.value}`}
              onClick={() => onChange(option.value)}
              className="h-7 min-w-[68px] px-2.5 rounded-lg border inline-flex items-center justify-center gap-1.5 font-ui text-[12px] font-bold cursor-pointer transition-[color,background,border-color,box-shadow,transform] duration-150 hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              style={{
                color: active ? option.color : 'var(--text-primary)',
                background: active ? option.background : 'transparent',
                borderColor: active
                  ? `color-mix(in srgb, ${option.color} 38%, var(--border-color) 62%)`
                  : 'transparent',
                boxShadow: active
                  ? `inset 0 -2px 0 color-mix(in srgb, ${option.color} 72%, transparent), 0 5px 12px -10px ${option.color}`
                  : 'none',
              }}>
              <Icon size={12} strokeWidth={2.25} />
              <span>{t(option.labelKey)}</span>
            </button>
          );
          return <Tooltip key={option.value} content={t(option.titleKey)}>{button}</Tooltip>;
        })}
      </div>
    </div>
  );
});

export default DiffFilterToolbar;
