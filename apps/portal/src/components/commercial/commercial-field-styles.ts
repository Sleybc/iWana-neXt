import {
  portalFieldClassName,
  portalSelectTriggerClassName,
  portalTableRowHoverClassName,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';

/** @deprecated Preferir `portalFieldClassName` de portal-ui. */
export const commercialFieldClassName = portalFieldClassName;

export const commercialTextareaClassName = portalTextareaClassName;

/** @deprecated Preferir `portalSelectTriggerClassName` de portal-ui. */
export const commercialSelectTriggerClassName = portalSelectTriggerClassName;

export const commercialTableHeadRowClassName =
  'border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3';

/** Alias del token canónico de portal-ui — no duplicar definición. */
export { portalTableRowHoverClassName as commercialTableRowHoverClassName };
