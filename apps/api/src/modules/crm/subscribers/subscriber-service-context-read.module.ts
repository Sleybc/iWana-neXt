import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialModule } from '../../commercial/commercial.module';
import { Contract } from '../contracts/entities/contract.entity';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { Subscriber } from './entities/subscriber.entity';
import { SubscriberServiceContextReadAdapter } from './subscriber-service-context-read.adapter';
import { SubscriberServiceContextReadPort } from '../ports/subscriber-service-context-read.port';

@Module({
  imports: [TypeOrmModule.forFeature([Subscriber, Contract, ExpedienteRecord]), CommercialModule],
  providers: [
    SubscriberServiceContextReadAdapter,
    { provide: SubscriberServiceContextReadPort, useExisting: SubscriberServiceContextReadAdapter },
  ],
  exports: [SubscriberServiceContextReadPort],
})
export class SubscriberServiceContextReadModule {}
