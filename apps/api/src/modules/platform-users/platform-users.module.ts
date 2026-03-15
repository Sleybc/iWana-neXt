import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformUser } from '@iwana/db';
import { AuditModule } from '../audit/audit.module';
import { PlatformUsersController } from './platform-users.controller';
import { PlatformUsersService } from './platform-users.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformUser]), AuditModule],
  controllers: [PlatformUsersController],
  providers: [PlatformUsersService],
  exports: [PlatformUsersService],
})
export class PlatformUsersModule {}
