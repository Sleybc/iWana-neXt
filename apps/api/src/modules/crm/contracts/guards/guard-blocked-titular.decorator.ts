import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ContractsBlockedTitularGuard } from './contracts-blocked-titular.guard';

export const BLOCKED_TITULAR_GUARD_METADATA = 'privacy:blocked-titular-guard';
export type BlockedTitularResolver = 'params.id' | 'params.subscriberId' | 'body.subscriberId';

/** Protege una mutación de contrato o de servicios de un titular bloqueado. */
export function GuardBlockedTitular(resolver: BlockedTitularResolver): MethodDecorator {
  return applyDecorators(
    SetMetadata(BLOCKED_TITULAR_GUARD_METADATA, resolver),
    UseGuards(ContractsBlockedTitularGuard),
  );
}
