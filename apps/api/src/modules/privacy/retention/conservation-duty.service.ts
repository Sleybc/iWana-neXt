import { Injectable, Optional, ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { addCalendarMonths } from '@iwana/shared';
import { bogotaCivilDate, toBogotaCivilDate } from '../ports/privacy-tenant-query';

export { toBogotaCivilDate };
import { hasPqrConservationDuty } from '../requests/pqr-retention';
import { IBillingStandingReadPort } from '../requests/ports/billing-standing-read.port';
import { IContractStandingReadPort } from '../requests/ports/contract-standing-read.port';
import { IPqrRetentionReadPort } from '../requests/ports/pqr-retention-read.port';

/** Categoría contractual del suscriptor en el catálogo de retención. */
export const SUBSCRIBER_RETENTION_CATEGORY = 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR';

const FISCAL_RETENTION_CATEGORY = 'FACTURACION_SOPORTES_CONTABLES';

export interface ConservationClock {
  /** Ancla normalizada a fecha civil de Bogotá. */
  anchor: string;
  years: number;
  /** Ancla más plazo, inclusivo: vence cuando `expiresOn <= today`. */
  expiresOn: string;
  retained: boolean;
}

export interface ConservationDutyEvaluation {
  applies: boolean;
  openContract: boolean;
  retention: boolean;
  contractRetained: boolean;
  fiscalRetained: boolean;
  pqrRetained: boolean;
  evaluatedOn: string;
  clocks: {
    contract: ConservationClock | null;
    fiscal: ConservationClock | null;
  };
}

/**
 * Evaluación compartida del deber de conservación (H-EXP B1, D-EXP-1).
 *
 * Extraída de `PrivacyRequestsService.conservationDuty`: la API humana, el CLI
 * y el job usan esta misma evaluación con `manager` explícito. Los relojes se
 * calculan sobre fechas civiles de Bogotá (`toBogotaCivilDate`), nunca con
 * `slice(0, 10)` sobre un ISO UTC. Un dato necesario ausente, categoría
 * faltante o puerto no disponible falla cerrado; nunca se interpreta como
 * plazo cero.
 */
@Injectable()
export class ConservationDutyService {
  constructor(
    private readonly standingPort: IContractStandingReadPort,
    @Optional() private readonly billingStandingPort?: IBillingStandingReadPort,
    @Optional() private readonly pqrRetentionPort?: IPqrRetentionReadPort,
  ) {}

  async evaluate(
    manager: EntityManager,
    partyId: string | null,
    requesterDocumentHmac: string | null = null,
    now: Date = new Date(),
  ): Promise<ConservationDutyEvaluation> {
    const evaluatedOn = bogotaCivilDate(now);
    const empty = {
      applies: false,
      openContract: false,
      retention: false,
      contractRetained: false,
      fiscalRetained: false,
      pqrRetained: false,
      evaluatedOn,
      clocks: { contract: null, fiscal: null },
    };
    if (!partyId && !requesterDocumentHmac) return empty;
    const standing = await this.standingPort.standing(partyId, {
      manager,
      requesterDocumentHmac,
    });
    const openContract = standing.openContractIds.length > 0;
    if (!this.billingStandingPort) throw new Error('Billing standing port is not registered');
    const fiscalDate = await this.billingStandingPort.lastFiscalDocumentAt(standing.subscriberIds, {
      manager,
    });
    const fiscalUnreconciled = await this.billingStandingPort.hasUnreconciledFiscalClock(
      standing.subscriberIds,
      { manager },
    );
    const contract = await this.clock(
      manager,
      standing.lastTerminatedAt,
      SUBSCRIBER_RETENTION_CATEGORY,
      evaluatedOn,
    );
    const fiscal = await this.clock(manager, fiscalDate, FISCAL_RETENTION_CATEGORY, evaluatedOn);
    const pqrRetained = await hasPqrConservationDuty(
      this.pqrRetentionPort,
      {
        subscriberIds: standing.subscriberIds ?? [],
        contractIds: standing.contractIds ?? [],
        expedienteIds: standing.expedienteIds ?? [],
      },
      manager,
      evaluatedOn,
    );
    const retention = Boolean(contract?.retained || fiscal?.retained || pqrRetained);
    // B4-R2 M-1 (D-EXP-1): un reloj sin conciliar nunca se interpreta como
    // plazo cero, pero solo bloquea con 409 cuando nada más justifica
    // conservar. Un contrato abierto o un reloj vigente ya conservan por sí
    // mismos; la incidencia reaparece cuando esos deberes terminan.
    if (!openContract && !retention) {
      if (standing.unreconciledContractClock) {
        throw new ConflictException({
          code: 'CONTRACT_UNRECONCILED',
          message:
            'CONTRACT_UNRECONCILED: hay contratos terminados sin fecha de terminación válida; ' +
            'se requiere conciliación antes de anonimizar.',
        });
      }
      if (fiscalUnreconciled) {
        throw new ConflictException({
          code: 'FISCAL_UNRECONCILED',
          message:
            'FISCAL_UNRECONCILED: hay documentos fiscales sin fecha de emisión válida; ' +
            'se requiere conciliación antes de anonimizar.',
        });
      }
    }
    return {
      applies: openContract || retention,
      openContract,
      retention,
      contractRetained: contract?.retained ?? false,
      fiscalRetained: fiscal?.retained ?? false,
      pqrRetained,
      evaluatedOn,
      clocks: { contract, fiscal },
    };
  }

  async hasDuty(
    manager: EntityManager,
    partyId: string | null,
    requesterDocumentHmac: string | null = null,
  ): Promise<boolean> {
    return (await this.evaluate(manager, partyId, requesterDocumentHmac)).applies;
  }

  private async clock(
    manager: EntityManager,
    anchor: string | null,
    category: string,
    today: string,
  ): Promise<ConservationClock | null> {
    if (!anchor) return null;
    const civilAnchor = toBogotaCivilDate(anchor);
    const policies = (await manager.query(
      'SELECT years FROM retention_policies WHERE category = $1',
      [category],
    )) as Array<{ years: number }>;
    const years = Number(policies[0]?.years ?? 0);
    if (!years) throw new Error(`Missing retention policy: ${category}`);
    const expiresOn = addCalendarMonths(civilAnchor, years * 12);
    return { anchor: civilAnchor, years, expiresOn, retained: expiresOn > today };
  }
}
