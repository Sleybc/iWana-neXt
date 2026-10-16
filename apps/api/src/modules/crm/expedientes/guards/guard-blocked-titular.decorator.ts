import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ExpedientesBlockedTitularGuard } from './expedientes-blocked-titular.guard';

export const BLOCKED_TITULAR_GUARD_METADATA = 'privacy:blocked-titular-guard';
export type BlockedTitularResolver = 'params.id';

/** Protege mutaciones del expediente ligado a un titular con bloqueo activo. */
export function GuardBlockedTitular(
  resolver: BlockedTitularResolver = 'params.id',
): MethodDecorator {
  return applyDecorators(
    SetMetadata(BLOCKED_TITULAR_GUARD_METADATA, resolver),
    UseGuards(ExpedientesBlockedTitularGuard),
  );
}
