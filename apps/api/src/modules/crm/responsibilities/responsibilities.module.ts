import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResponsibilitiesController } from './responsibilities.controller';
import { ResponsibilitiesService } from './responsibilities.service';
import { OperationalResponsibilityHistory } from './entities/operational-responsibility-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OperationalResponsibilityHistory])],
  controllers: [ResponsibilitiesController],
  providers: [ResponsibilitiesService],
  exports: [ResponsibilitiesService],
})
export class ResponsibilitiesModule {}
