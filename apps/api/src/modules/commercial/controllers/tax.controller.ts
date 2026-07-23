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
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlatformRole, UserRole } from '@iwana/shared';
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

@ApiTags('commercial-tax')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial')
export class TaxController {
  constructor(private readonly taxApplicationService: TaxApplicationService) {}

  // ─── Reglas tributarias (listado + alta para TaxApplicationRulesManager) ─

  @Get('tax-rules')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar reglas tributarias del tenant' })
  async findAllRules() {
    const data = await this.taxApplicationService.listRules();
    return { data };
  }

  @Post('tax-rules')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear regla tributaria del tenant' })
  @ApiResponse({ status: 201, description: 'Regla tributaria creada' })
  async createRule(@Body() dto: CreateTaxRuleDto, @Request() req: { user: JwtPayload }) {
    const data = await this.taxApplicationService.createRule(dto, req.user.sub);
    return { data };
  }

  // ─── Simulador ────────────────────────────────────────────────────────────

  @Post('tax/simulate')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SALES, PlatformRole.SYSTEM_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar aplicaciones tributarias (tabla puente reglas ↔ catálogo)' })
  async listApplications() {
    const data = await this.taxApplicationService.listApplications();
    return { data };
  }

  @Post('tax-rule-applications')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear aplicación tributaria (vincular regla con definición)' })
  async createApplication(@Body() dto: CreateTaxRuleApplicationDto) {
    const data = await this.taxApplicationService.createApplication(dto);
    return { data };
  }

  @Patch('tax-rule-applications/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar aplicación tributaria' })
  async updateApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRuleApplicationDto,
  ) {
    const data = await this.taxApplicationService.updateApplication(id, dto);
    return { data };
  }

  @Delete('tax-rule-applications/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Eliminar aplicación tributaria' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteApplication(@Param('id', ParseUUIDPipe) id: string) {
    await this.taxApplicationService.deleteApplication(id);
  }
}
