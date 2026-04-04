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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ContractStatus } from '../enums/contract-status.enum';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractsService } from './contracts.service';
import { Contract } from './entities/contract.entity';

@ApiTags('contracts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear contrato desde cotizacion aceptada' })
  async create(@Body() dto: CreateContractDto): Promise<{ data: Contract }> {
    const data = await this.contractsService.create(dto);
    return { data };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar contratos' })
  @ApiQuery({ name: 'status', required: false, enum: ContractStatus })
  @ApiQuery({ name: 'planId', required: false })
  async findAll(
    @Query('status') status?: ContractStatus,
    @Query('planId') planId?: string,
  ): Promise<{ data: Contract[] }> {
    const filters: { status?: ContractStatus; planId?: string } = {};
    if (status !== undefined) {
      filters.status = status;
    }
    if (planId !== undefined) {
      filters.planId = planId;
    }

    const data = await this.contractsService.findAll(filters);
    return { data };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Consultar contrato por id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Contract }> {
    const data = await this.contractsService.findOne(id);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar contrato' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar contrato (soft delete)' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.contractsService.remove(id);
  }
}
