import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { SubscribersBlockedTitularGuard } from './subscribers-blocked-titular.guard';

export const BLOCKED_TITULAR_GUARD_METADATA = 'privacy:blocked-titular-guard';
export type BlockedTitularResolver = 'params.id';

/** Protege mutaciones sobre un titular que conserva una marca de bloqueo activa. */
export function GuardBlockedTitular(
  resolver: BlockedTitularResolver = 'params.id',
): MethodDecorator {
  return applyDecorators(
    SetMetadata(BLOCKED_TITULAR_GUARD_METADATA, resolver),
    UseGuards(SubscribersBlockedTitularGuard),
  );
}
