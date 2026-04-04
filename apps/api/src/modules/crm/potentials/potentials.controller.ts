import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/potentials')
export class PotentialsController {
  constructor(private readonly potentialsService: PotentialsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear potencial comercial', deprecated: true })
  @UsePipes(new ZodBodyValidationPipe(createPotentialSchema))
  async create(@Body() dto: CreatePotentialDto): Promise<{ data: PotentialResponseDto }> {
    const data = await this.potentialsService.create(dto);
    return { data };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar potenciales comerciales', deprecated: true })
  async findAll(): Promise<{ data: PotentialResponseDto[] }> {
    const data = await this.potentialsService.findAll();
    return { data };
  }

  @Post(':id/qualify')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Calificar potencial y convertirlo en prospecto', deprecated: true })
  @UsePipes(new ZodBodyValidationPipe(qualifyPotentialSchema))
  async qualify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QualifyPotentialDto,
  ): Promise<{ data: ProspectResponseDto }> {
    const data = await this.potentialsService.qualify(id, dto);
    return { data };
  }
}
