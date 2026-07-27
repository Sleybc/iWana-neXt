import {
  Body,
  Controller,
  Get,
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
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunitiesService } from './opportunities.service';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunityStage } from '../enums/opportunity-stage.enum';

@ApiTags('opportunities')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear oportunidad comercial' })
  async create(@Body() dto: CreateOpportunityDto): Promise<{ data: Opportunity }> {
    const data = await this.opportunitiesService.create(dto);
    return { data };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar oportunidades comerciales' })
  @ApiExtraModels(CrmListPaginationDto, ListMetaDto)
  @ApiQuery({ name: 'stage', required: false, enum: OpportunityStage })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  async findAll(
    @Query('stage') stage?: OpportunityStage,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
  ): Promise<ListResponse<Opportunity>> {
    return this.opportunitiesService.findAll({
      ...(stage !== undefined ? { stage } : {}),
      ...(page !== undefined ? { page } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Consultar oportunidad por id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Opportunity }> {
    const data = await this.opportunitiesService.findOne(id);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar oportunidad comercial' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpportunityDto,
  ): Promise<{ data: Opportunity }> {
    const data = await this.opportunitiesService.update(id, dto);
    return { data };
  }
}
