import { Injectable } from '@nestjs/common';
import type { CustomerSegment } from '@iwana/shared';

/** Contrato que se firmó o se generó en una OT de instalación (ADR-109). */
export interface InstallationContractRef {
  contractId: string;
  /** Segmento congelado en el contrato; null si el contrato no lo tiene. */
  customerSegment: CustomerSegment | null;
}

/**
 * Puerto de MOD14 implementado por CRM: contrato asociado a una OT de instalación
 * (spec MOD14 2026-11-13, bloque A, R1). Billing nunca lee tablas de CRM.
 */
@Injectable()
export abstract class InstallationContractReadPort {
  /**
   * Contrato firmado en la OT; si no hay firma, el de la última generación de documento de la
   * OT. Debe ser del mismo titular que la OT. Null si no hay uno.
   */
  abstract findByExecutionOrder(
    executionOrderId: string,
    subscriberId: string,
  ): Promise<InstallationContractRef | null>;
}
