import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { IContractStandingReadPort } from './contract-standing-read.port';

/** Q5 reemplaza este adaptador por una lectura contractual del boundary de CRM. */
@Injectable()
export class ContractStandingUnavailableAdapter implements IContractStandingReadPort {
  async standing(): Promise<{ openContractIds: string[]; lastTerminatedAt: string | null }> {
    throw new ServiceUnavailableException(
      'La integración de vigencia contractual aún no está instalada.',
    );
  }
}
