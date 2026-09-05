import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, PlatformRole, UserRole, type ListResponse } from '@iwana/shared';
import { ListMetaDto } from '../../../common/pagination';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { CrmListPaginationDto } from '../dto/crm-list-pagination.dto';
import { CrmListLimitPipe, CrmListPagePipe } from '../pipes/crm-list-pagination.pipe';
import { ZodBodyValidationPipe } from '../pipes/zod-body-validation.pipe';
import { createPotentialSchema } from '../schemas/create-potential.schema';
import { qualifyPotentialSchema } from '../schemas/qualify-potential.schema';
import { PotentialsService } from './potentials.service';
import { CreatePotentialDto } from './dto/create-potential.dto';
import { PotentialResponseDto } from './dto/potential-response.dto';
import { QualifyPotentialDto } from './dto/qualify-potential.dto';
import { ProspectResponseDto } from '../prospects/dto/prospect-response.dto';

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/potentials')
export class PotentialsController {
  constructor(private readonly potentialsService: PotentialsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  // Audit manual limpio en PotentialsService — un solo canal (SWEEP-01).
  @SkipAudit()
  @ApiOperation({ summary: 'Crear potencial comercial', deprecated: true })
  async create(
    @Body(new ZodBodyValidationPipe(createPotentialSchema)) dto: CreatePotentialDto,
  ): Promise<{ data: PotentialResponseDto }> {
    const data = await this.potentialsService.create(dto);
    return { data };
  }

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Listar potenciales comerciales', deprecated: true })
  @ApiExtraModels(CrmListPaginationDto, ListMetaDto)
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  async findAll(
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
  ): Promise<ListResponse<PotentialResponseDto>> {
    return this.potentialsService.findAll({
      ...(page !== undefined ? { page } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  @Post(':id/qualify')
  @Roles(UserRole.ADMIN, UserRole.SALES, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Calificar potencial y convertirlo en prospecto', deprecated: true })
  async qualify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(qualifyPotentialSchema)) dto: QualifyPotentialDto,
  ): Promise<{ data: ProspectResponseDto }> {
    const data = await this.potentialsService.qualify(id, dto);
    return { data };
  }
}
