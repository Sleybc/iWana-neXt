import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ContractsBlockedTitularGuard } from './contracts-blocked-titular.guard';

export const BLOCKED_TITULAR_GUARD_METADATA = 'privacy:blocked-titular-guard';
export const ALLOW_ANONYMIZED_TITULAR_METADATA = 'privacy:allow-anonymized-titular';
export type BlockedTitularResolver = 'params.id' | 'params.subscriberId' | 'body.subscriberId';
export interface GuardBlockedTitularOptions {
  allowAnonymized?: boolean;
}

/** Protege una mutación de contrato o de servicios de un titular bloqueado. */
export function GuardBlockedTitular(
  resolver: BlockedTitularResolver,
  options: GuardBlockedTitularOptions = {},
): MethodDecorator {
  const decorators: MethodDecorator[] = [
    SetMetadata(BLOCKED_TITULAR_GUARD_METADATA, resolver),
    UseGuards(ContractsBlockedTitularGuard),
  ];
  if (options.allowAnonymized === true) {
    decorators.push(SetMetadata(ALLOW_ANONYMIZED_TITULAR_METADATA, true));
  }
  return applyDecorators(...decorators);
}
