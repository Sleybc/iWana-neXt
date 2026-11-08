import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { IContractStandingReadPort, type ProspectDiscardRow } from './contract-standing-read.port';

/** Q5 reemplaza este adaptador por una lectura contractual del boundary de CRM. */
@Injectable()
export class ContractStandingUnavailableAdapter implements IContractStandingReadPort {
  async standing(): Promise<{
    subscriberIds: string[];
    contractIds: string[];
    expedienteIds: string[];
    openContractIds: string[];
    lastTerminatedAt: string | null;
    unreconciledContractClock: boolean;
  }> {
    throw new ServiceUnavailableException(
      'La integración de vigencia contractual aún no está instalada.',
    );
  }

  async findProspectDiscard(): Promise<ProspectDiscardRow[]> {
    throw new ServiceUnavailableException(
      'La integración de vigencia contractual aún no está instalada.',
    );
  }

  async listProspectDiscard(): Promise<ProspectDiscardRow[]> {
    throw new ServiceUnavailableException(
      'La integración de vigencia contractual aún no está instalada.',
    );
  }
}
