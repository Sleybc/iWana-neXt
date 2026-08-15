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
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TaxApplicationService } from '../services/tax-application.service';
import {
  CreateTaxRuleApplicationDto,
  CreateTaxRuleDto,
  SimulateTaxDto,
  UpdateTaxRuleApplicationDto,
} from '../dto/tax.dto';
import { CommercialListMetaDto, CommercialListQueryDto } from '../dto/commercial-list-query.dto';
import {
  COMMERCIAL_BILLING_WRITE_ROLES,
  COMMERCIAL_TAX_READ_ROLES,
  COMMERCIAL_TAX_SIMULATE_ROLES,
} from '../utils/commercial-roles';

@ApiTags('commercial-tax')
@ApiExtraModels(CommercialListMetaDto)
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial')
export class TaxController {
  constructor(private readonly taxApplicationService: TaxApplicationService) {}

  // ─── Reglas tributarias (listado + alta para TaxApplicationRulesManager) ─

  @Get('tax-rules')
  @Roles(...COMMERCIAL_TAX_READ_ROLES)
  @ApiOperation({
    summary: 'Listar reglas tributarias del tenant (paginación cursor)',
    description:
      'ADR-064: limit default 20, max 100; meta.nextCursor + meta.total. Orden: createdAt DESC, id DESC.',
  })
  @ApiResponse({
    status: 200,
    description: 'Respuesta `{ data, meta: { nextCursor, total } }`',
  })
  async findAllRules(@Query() query: CommercialListQueryDto) {
    return this.taxApplicationService.listRules(query);
  }

  @Post('tax-rules')
  @Roles(...COMMERCIAL_BILLING_WRITE_ROLES)
  @ApiOperation({ summary: 'Crear regla tributaria del tenant' })
  @ApiResponse({ status: 201, description: 'Regla tributaria creada' })
  async createRule(@Body() dto: CreateTaxRuleDto, @Request() req: { user: JwtPayload }) {
    const data = await this.taxApplicationService.createRule(dto, req.user.sub);
    return { data };
  }

  // ─── Simulador ────────────────────────────────────────────────────────────

  @Post('tax/simulate')
  @Roles(...COMMERCIAL_TAX_SIMULATE_ROLES)
  @ApiOperation({
    summary: 'Simulador tributario: explica qué impuestos aplican a un cliente y qué regla ganó',
  })
  @ApiResponse({ status: 201, description: 'Resultado de simulación tributaria' })
  async simulateTax(@Body() dto: SimulateTaxDto) {
    const data = await this.taxApplicationService.simulate(
      dto.segment,
      dto.stratum,
      dto.municipalityCode,
    );
    return { data };
  }

  // ─── Aplicaciones tributarias (tabla puente) ─────────────────────────────

  @Get('tax-rule-applications')
  @Roles(...COMMERCIAL_TAX_READ_ROLES)
  @ApiOperation({
    summary: 'Listar aplicaciones tributarias (paginación cursor)',
    description:
      'Tabla puente reglas ↔ catálogo. ADR-064: limit default 20, max 100; meta.nextCursor + meta.total.',
  })
  @ApiResponse({
    status: 200,
    description: 'Respuesta `{ data, meta: { nextCursor, total } }`',
  })
  async listApplications(@Query() query: CommercialListQueryDto) {
    return this.taxApplicationService.listApplications(query);
  }

  @Post('tax-rule-applications')
  @Roles(...COMMERCIAL_BILLING_WRITE_ROLES)
  @ApiOperation({ summary: 'Crear aplicación tributaria (vincular regla con definición)' })
  async createApplication(@Body() dto: CreateTaxRuleApplicationDto) {
    const data = await this.taxApplicationService.createApplication(dto);
    return { data };
  }

  @Patch('tax-rule-applications/:id')
  @Roles(...COMMERCIAL_BILLING_WRITE_ROLES)
  @ApiOperation({ summary: 'Actualizar aplicación tributaria' })
  async updateApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRuleApplicationDto,
  ) {
    const data = await this.taxApplicationService.updateApplication(id, dto);
    return { data };
  }

  @Delete('tax-rule-applications/:id')
  @Roles(...COMMERCIAL_BILLING_WRITE_ROLES)
  @ApiOperation({ summary: 'Eliminar aplicación tributaria' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteApplication(@Param('id', ParseUUIDPipe) id: string) {
    await this.taxApplicationService.deleteApplication(id);
  }
}
