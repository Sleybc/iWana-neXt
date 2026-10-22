import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetLoanAssignment, InventoryItem, SerializedAsset } from '@iwana/db';
import { InstalledEquipmentReadAdapter } from './installed-equipment-read.adapter';
import { InstalledEquipmentReadPort } from './installed-equipment-read.port';

@Module({
  imports: [TypeOrmModule.forFeature([AssetLoanAssignment, InventoryItem, SerializedAsset])],
  providers: [
    InstalledEquipmentReadAdapter,
    { provide: InstalledEquipmentReadPort, useExisting: InstalledEquipmentReadAdapter },
  ],
  exports: [InstalledEquipmentReadPort],
})
export class InstalledEquipmentReadModule {}
