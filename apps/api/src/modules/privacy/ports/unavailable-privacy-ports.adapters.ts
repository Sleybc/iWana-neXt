import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ErasureCategory } from '@iwana/shared';
import { IContractImpersonationPort } from './contract-impersonation.port';
import {
  IPersonalDataErasurePort,
  type PersonalDataErasurePlan,
} from './personal-data-erasure.port';

/** Fallos cerrados hasta que CRM publique los adaptadores de la Ola 2/3. */
@Injectable()
export class ContractImpersonationUnavailableAdapter implements IContractImpersonationPort {
  async suspendForImpersonation(): Promise<{ suspendedContractIds: string[] }> {
    throw new ServiceUnavailableException(
      'La integración de suspensión de contratos aún no está instalada.',
    );
  }
}

@Injectable()
export class PersonalDataErasureUnavailableAdapter implements IPersonalDataErasurePort {
  async plan(): Promise<PersonalDataErasurePlan> {
    throw new ServiceUnavailableException('La integración de anonimización aún no está instalada.');
  }

  async anonymize(): Promise<{ categories: ErasureCategory[]; changedRows: number }> {
    throw new ServiceUnavailableException('La integración de anonimización aún no está instalada.');
  }
}
