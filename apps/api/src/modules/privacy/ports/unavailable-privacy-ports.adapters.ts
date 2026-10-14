import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { IContractImpersonationPort } from './contract-impersonation.port';
import { IPersonalDataBlockPort } from './personal-data-block.port';
import { IPersonalDataErasurePort } from './personal-data-erasure.port';

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
export class PersonalDataBlockUnavailableAdapter implements IPersonalDataBlockPort {
  async block(): Promise<void> {
    throw new ServiceUnavailableException(
      'La integración de bloqueo de datos aún no está instalada.',
    );
  }

  async unblock(): Promise<void> {
    throw new ServiceUnavailableException(
      'La integración de desbloqueo de datos aún no está instalada.',
    );
  }
}

@Injectable()
export class PersonalDataErasureUnavailableAdapter implements IPersonalDataErasurePort {
  async anonymize(): Promise<{ categories: string[] }> {
    throw new ServiceUnavailableException('La integración de anonimización aún no está instalada.');
  }
}
