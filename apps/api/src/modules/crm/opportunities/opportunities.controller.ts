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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
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
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear oportunidad comercial' })
  async create(@Body() dto: CreateOpportunityDto): Promise<{ data: Opportunity }> {
    const data = await this.opportunitiesService.create(dto);
    return { data };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar oportunidades comerciales' })
  @ApiQuery({ name: 'stage', required: false, enum: OpportunityStage })
  async findAll(@Query('stage') stage?: OpportunityStage): Promise<{ data: Opportunity[] }> {
    const filters: { stage?: OpportunityStage } = {};
    if (stage !== undefined) {
      filters.stage = stage;
    }

    const data = await this.opportunitiesService.findAll(filters);
    return { data };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Consultar oportunidad por id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Opportunity }> {
    const data = await this.opportunitiesService.findOne(id);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar oportunidad comercial' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpportunityDto,
  ): Promise<{ data: Opportunity }> {
    const data = await this.opportunitiesService.update(id, dto);
    return { data };
  }
}
