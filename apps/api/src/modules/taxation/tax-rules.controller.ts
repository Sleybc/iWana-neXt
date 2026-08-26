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
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TaxApplicationService } from './services/tax-application.service';
import {
  CreateTaxRuleApplicationDto,
  CreateTaxRuleDto,
  SimulateTaxDto,
  TaxRuleListQueryDto,
  UpdateTaxRuleApplicationDto,
} from './dto/tax-rule.dto';
import { TaxationListMetaDto } from './dto/list-tax-definition-query.dto';
import {
  TAXATION_TAX_READ_ROLES,
  TAXATION_TAX_SIMULATE_ROLES,
  TAXATION_TAX_WRITE_ROLES,
} from './utils/taxation-roles';

@ApiTags('taxation-rules')
@ApiExtraModels(TaxationListMetaDto)
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('taxation')
export class TaxRulesController {
  constructor(private readonly taxApplicationService: TaxApplicationService) {}

  @Get('tax-rules')
  @Roles(...TAXATION_TAX_READ_ROLES)
  @ApiOperation({ summary: 'Listar reglas tributarias del tenant (paginación cursor)' })
  findAllRules(@Query() query: TaxRuleListQueryDto) {
    return this.taxApplicationService.listRules(query);
  }

  @Post('tax-rules')
  @Roles(...TAXATION_TAX_WRITE_ROLES)
  @ApiOperation({ summary: 'Crear regla tributaria del tenant' })
  async createRule(@Body() dto: CreateTaxRuleDto, @Request() req: { user: JwtPayload }) {
    const data = await this.taxApplicationService.createRule(dto, req.user.sub);
    return { data };
  }

  @Post('tax/simulate')
  @Roles(...TAXATION_TAX_SIMULATE_ROLES)
  @ApiOperation({
    summary: 'Simulador tributario: explica qué impuestos aplican a un cliente y qué regla ganó',
  })
  async simulateTax(@Body() dto: SimulateTaxDto) {
    const data = await this.taxApplicationService.simulate({
      personType: dto.personType,
      segment: dto.segment,
      ...(dto.stratum != null ? { stratum: dto.stratum } : {}),
      ...(dto.municipalityCode ? { municipalityCode: dto.municipalityCode } : {}),
    });
    return { data };
  }

  @Get('tax-rule-applications')
  @Roles(...TAXATION_TAX_READ_ROLES)
  @ApiOperation({ summary: 'Listar aplicaciones tributarias (paginación cursor)' })
  listApplications(@Query() query: TaxRuleListQueryDto) {
    return this.taxApplicationService.listApplications(query);
  }

  @Post('tax-rule-applications')
  @Roles(...TAXATION_TAX_WRITE_ROLES)
  @ApiOperation({ summary: 'Crear aplicación tributaria (vincular regla con definición)' })
  async createApplication(@Body() dto: CreateTaxRuleApplicationDto) {
    const data = await this.taxApplicationService.createApplication(dto);
    return { data };
  }

  @Patch('tax-rule-applications/:id')
  @Roles(...TAXATION_TAX_WRITE_ROLES)
  @ApiOperation({ summary: 'Actualizar aplicación tributaria' })
  async updateApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRuleApplicationDto,
  ) {
    const data = await this.taxApplicationService.updateApplication(id, dto);
    return { data };
  }

  @Delete('tax-rule-applications/:id')
  @Roles(...TAXATION_TAX_WRITE_ROLES)
  @ApiOperation({ summary: 'Eliminar aplicación tributaria' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteApplication(@Param('id', ParseUUIDPipe) id: string) {
    await this.taxApplicationService.deleteApplication(id);
  }
}
