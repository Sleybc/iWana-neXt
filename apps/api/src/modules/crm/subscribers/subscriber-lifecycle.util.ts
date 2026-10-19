import { SubscriberStatus } from '@iwana/shared';
import { ContractStatus } from '../enums/contract-status.enum';

const LIVE_CONTRACT_STATUSES: ReadonlySet<ContractStatus> = new Set([
  ContractStatus.ACTIVE,
  ContractStatus.SUSPENDED,
]);

/**
 * Deriva el estado del suscriptor a partir de los contratos vigentes (RF-LC-01/02/03).
 * La función es pura para que el CLI de inconsistencias use la misma regla del API.
 */
export function deriveSubscriberStatusFromContracts(
  currentStatus: SubscriberStatus,
  activatedAt: Date | string | null,
  contractStatuses: readonly ContractStatus[],
): SubscriberStatus {
  if (
    activatedAt === null ||
    currentStatus === SubscriberStatus.CANCELLED ||
    !contractStatuses.some((status) => LIVE_CONTRACT_STATUSES.has(status))
  ) {
    return currentStatus;
  }

  return contractStatuses.includes(ContractStatus.ACTIVE)
    ? SubscriberStatus.ACTIVE
    : SubscriberStatus.SUSPENDED;
}
