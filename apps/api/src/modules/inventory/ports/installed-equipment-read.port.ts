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
}
