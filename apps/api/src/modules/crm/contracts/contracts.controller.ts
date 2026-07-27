import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PlatformRole, UserRole, type ListResponse } from '@iwana/shared';
import { ListMetaDto } from '../../../common/pagination';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CrmListPaginationDto } from '../dto/crm-list-pagination.dto';
import { CrmListLimitPipe, CrmListPagePipe } from '../pipes/crm-list-pagination.pipe';
import { ContractStatus } from '../enums/contract-status.enum';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreateContractFromExpedienteDto } from './dto/create-contract-from-expediente.dto';
import { ContractsService } from './contracts.service';
import { Contract } from './entities/contract.entity';

@ApiTags('contracts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  // ── Endpoints anidados bajo /crm/subscribers/:subscriberId ─────────────────

  @Post('crm/subscribers/:subscriberId/contracts')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear servicio contratado para un suscriptor (estado DRAFT)' })
  async createForSubscriber(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body() dto: CreateContractDto,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.create({ ...dto, subscriberId });
    return { data };
  }

  @Get('crm/subscribers/:subscriberId/contracts')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar servicios contratados de un suscriptor' })
  @ApiExtraModels(CrmListPaginationDto, ListMetaDto)
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  async findAllBySubscriber(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
  ): Promise<ListResponse<Contract>> {
    return this.contractsService.findAllBySubscriber(subscriberId, {
      ...(page !== undefined ? { page } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  @Post('crm/subscribers/:subscriberId/contracts/from-expediente')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'Crear contrato DRAFT a partir del interés comercial en el expediente',
  })
  async createFromExpediente(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body() dto: CreateContractFromExpedienteDto,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.createFromExpediente(subscriberId, dto);
    return { data };
  }

  // ── Endpoints de recurso /crm/contracts ────────────────────────────────────

  @Post('crm/contracts')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear contrato (uso directo sin subscriber en path)' })
  async create(@Body() dto: CreateContractDto): Promise<{ data: Contract }> {
    const data = await this.contractsService.create(dto);
    return { data };
  }

  @Get('crm/contracts')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar contratos con filtros opcionales' })
  @ApiExtraModels(CrmListPaginationDto, ListMetaDto)
  @ApiQuery({ name: 'status', required: false, enum: ContractStatus })
  @ApiQuery({ name: 'planId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  async findAll(
    @Query('status') status?: ContractStatus,
    @Query('planId') planId?: string,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
  ): Promise<ListResponse<Contract>> {
    return this.contractsService.findAll({
      ...(status !== undefined ? { status } : {}),
      ...(planId !== undefined ? { planId } : {}),
      ...(page !== undefined ? { page } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  @Get('crm/contracts/:id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Consultar contrato por id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Contract }> {
    const data = await this.contractsService.findOne(id);
    return { data };
  }

  @Patch('crm/contracts/:id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar datos del contrato (no cambia estado)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.update(id, dto);
    return { data };
  }

  @Delete('crm/contracts/:id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar contrato (solo en estado DRAFT)' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.contractsService.remove(id);
  }

  // ── Transiciones de estado ──────────────────────────────────────────────────

  @Post('crm/contracts/:id/activate')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar contrato (DRAFT → ACTIVE — firma del cliente)' })
  async activate(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Contract }> {
    const data = await this.contractsService.activate(id);
    return { data };
  }

  @Post('crm/contracts/:id/suspend')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender contrato (ACTIVE → SUSPENDED)' })
  async suspend(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Contract }> {
    const data = await this.contractsService.suspend(id);
    return { data };
  }

  @Post('crm/contracts/:id/reactivate')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar contrato (SUSPENDED → ACTIVE)' })
  async reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Contract }> {
    const data = await this.contractsService.reactivate(id);
    return { data };
  }

  @Post('crm/contracts/:id/terminate')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminar contrato (ACTIVE | SUSPENDED → TERMINATED)' })
  async terminate(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Contract }> {
    const data = await this.contractsService.terminate(id);
    return { data };
  }

  @Post('crm/contracts/:id/archive')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archivar contrato (SUSPENDED | TERMINATED → ARCHIVED)' })
  async archive(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Contract }> {
    const data = await this.contractsService.archive(id);
    return { data };
  }
}
