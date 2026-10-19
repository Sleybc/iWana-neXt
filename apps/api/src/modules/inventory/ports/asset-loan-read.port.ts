import { Injectable } from '@nestjs/common';
import { AssetLoanService } from '../services/asset-loan.service';

/**
 * Puerto mínimo de lectura de comodatos consumido por otros módulos.
 * El caller aporta contratos candidatos; el tenant se resuelve en Inventory.
 */
@Injectable()
export abstract class AssetLoanReadPort {
  abstract findOpenContractIds(contractIds: string[]): Promise<string[]>;
}

/** Adaptador del contrato del puerto al servicio propietario de MOD12. */
@Injectable()
export class AssetLoanReadPortAdapter extends AssetLoanReadPort {
  constructor(private readonly assetLoanService: AssetLoanService) {
    super();
  }

  findOpenContractIds(contractIds: string[]): Promise<string[]> {
    return this.assetLoanService.findOpenContractIds(contractIds);
  }
}
