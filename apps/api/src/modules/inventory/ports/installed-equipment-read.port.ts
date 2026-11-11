import { Injectable } from '@nestjs/common';

export interface InstalledEquipmentRef {
  serialNumber: string;
  macAddress: string | null;
  model: string | null;
}

/** Proyección de CPE instalado por una OT, definida y servida por MOD12. */
@Injectable()
export abstract class InstalledEquipmentReadPort {
  abstract getFirstInstalledAtCustomer(
    executionOrderId: string,
    subscriberId: string,
  ): Promise<InstalledEquipmentRef | null>;

  /** Todos los CPE que la OT dejó INSTALLED_AT_CUSTOMER (contrato del cliente, ADR-109 D5). */
  abstract listInstalledAtCustomer(
    executionOrderId: string,
    subscriberId: string,
  ): Promise<InstalledEquipmentRef[]>;
}
