'use client';

import { ExecutionOrderMomentContainer } from './ExecutionOrderMomentContainer';
import type { ExecutionOrderDrawerProps } from './execution-order-console-types';
export type { ExecutionOrderCustodyOption } from './execution-order-console-types';

/** Shell estable; los actos y la política de carga tienen propietarios separados. */
export function ExecutionOrderDrawer(props: ExecutionOrderDrawerProps) {
  return <ExecutionOrderMomentContainer {...props} />;
}
