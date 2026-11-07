import { Module } from '@nestjs/common';
import { SupplierProfileReadAdapter } from './supplier-profile-read.adapter';

@Module({ providers: [SupplierProfileReadAdapter], exports: [SupplierProfileReadAdapter] })
export class InventoryPrivacyModule {}
