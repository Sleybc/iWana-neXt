import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { IContractImpersonationPort } from './contract-impersonation.port';

/** Fallos cerrados hasta que CRM publique los adaptadores de la Ola 2/3. */
@Injectable()
export class ContractImpersonationUnavailableAdapter implements IContractImpersonationPort {
  async suspendForImpersonation(): Promise<{ suspendedContractIds: string[] }> {
    throw new ServiceUnavailableException(
      'La integración de suspensión de contratos aún no está instalada.',
    );
  }
}
