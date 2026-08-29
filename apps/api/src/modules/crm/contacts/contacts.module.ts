import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriberContact } from './entities/subscriber-contact.entity';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { AccessControlModule } from '../../access-control/access-control.module';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([SubscriberContact]), AccessControlModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
