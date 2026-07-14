import { cn } from '@iwana/ui';
import { interactiveFocusClassName, portalTextareaClassName } from '@/components/shared/portal-ui';

export const commercialFieldClassName = cn(
  'portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  interactiveFocusClassName,
);

export const commercialTextareaClassName = portalTextareaClassName;

export const commercialSelectTriggerClassName = cn(
  'portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  interactiveFocusClassName,
);

export const commercialTableHeadRowClassName =
  'border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3';

export const commercialTableRowHoverClassName =
  'transition-colors hover:bg-iwana-surface-soft/80 dark:hover:bg-dark-surface-3/80';
