import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttributionsController } from './attributions.controller';
import { AttributionsService } from './attributions.service';
import { SalesAttribution } from './entities/sales-attribution.entity';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SalesAttribution, ExpedienteRecord])],
  controllers: [AttributionsController],
  providers: [AttributionsService],
  exports: [AttributionsService],
})
export class AttributionsModule {}
