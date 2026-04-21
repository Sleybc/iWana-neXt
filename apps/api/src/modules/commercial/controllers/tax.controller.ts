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
import { UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TaxClassificationService } from '../services/tax-classification.service';
import { TaxApplicationService } from '../services/tax-application.service';
import {
  CreateTaxClassificationDto,
  CreateTaxRuleApplicationDto,
  CreateTaxRuleDto,
  ResolveTaxDto,
  SimulateTaxDto,
  UpdateTaxRuleApplicationDto,
  UpdateTaxRuleDto,
  UpdateTaxClassificationDto,
} from '../dto/tax.dto';
import { Query } from '@nestjs/common';

@ApiTags('commercial-tax')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial')
export class TaxController {
  constructor(
    private readonly taxClassificationService: TaxClassificationService,
    private readonly taxApplicationService: TaxApplicationService,
  ) {}

  // ─── Clasificaciones tributarias ──────────────────────────────────────────

  @Get('tax-classifications')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar clasificaciones tributarias del tenant' })
  async findAllClassifications() {
    const data = await this.taxClassificationService.findAllClassifications();
    return { data };
  }

  @Get('tax-classifications/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Obtener clasificación tributaria por ID' })
  async findOneClassification(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.taxClassificationService.findOneClassification(id);
    return { data };
  }

  @Post('tax-classifications')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear clasificación tributaria' })
  @ApiResponse({ status: 400, description: 'Código duplicado para el tenant' })
  async createClassification(@Body() dto: CreateTaxClassificationDto) {
    const data = await this.taxClassificationService.createClassification(dto);
    return { data };
  }

  @Patch('tax-classifications/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar clasificación tributaria' })
  async updateClassification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxClassificationDto,
  ) {
    const data = await this.taxClassificationService.updateClassification(id, dto);
    return { data };
  }

  @Delete('tax-classifications/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Eliminar clasificación tributaria' })
  async deactivateClassification(@Param('id', ParseUUIDPipe) id: string) {
    await this.taxClassificationService.deactivateClassification(id);
    return { message: 'Clasificación eliminada' };
  }

  // ─── Reglas tributarias ───────────────────────────────────────────────────

  @Get('tax-classifications/:classificationId/rules')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar reglas de una clasificación tributaria' })
  async findRulesByClassification(
    @Param('classificationId', ParseUUIDPipe) classificationId: string,
  ) {
    const data = await this.taxClassificationService.findRulesByClassification(classificationId);
    return { data };
  }

  @Get('tax-rules')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar reglas tributarias del tenant (activas e inactivas)' })
  async findAllRules(@Query('taxClassificationId') taxClassificationId?: string) {
    const data = await this.taxClassificationService.findAllRules(taxClassificationId);
    return { data };
  }

  @Post('tax-rules')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear regla tributaria configurable' })
  async createRule(@Body() dto: CreateTaxRuleDto, @Request() req: { user: JwtPayload }) {
    const data = await this.taxClassificationService.createRule(dto, req.user.sub);
    return { data };
  }

  @Patch('tax-rules/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar regla tributaria' })
  async updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaxRuleDto) {
    const data = await this.taxClassificationService.updateRule(id, dto);
    return { data };
  }

  @Delete('tax-rules/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Desactivar regla tributaria' })
  async deactivateRule(@Param('id', ParseUUIDPipe) id: string) {
    await this.taxClassificationService.deactivateRule(id);
    return { message: 'Regla tributaria desactivada' };
  }

  @Post('tax/resolve')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SALES, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Resolver clasificación tributaria dado un segmento y estrato' })
  @ApiResponse({ status: 201, description: 'Clasificación tributaria resuelta' })
  async resolveClassification(@Body() dto: ResolveTaxDto) {
    const data = await this.taxClassificationService.resolveClassification(
      dto.segment,
      dto.stratum,
    );
    return { data };
  }

  @Post('tax/simulate')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SALES, UserRole.SYSTEM_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar aplicaciones tributarias (tabla puente reglas ↔ catálogo)' })
  async listApplications() {
    const data = await this.taxApplicationService.listApplications();
    return { data };
  }

  @Post('tax-rule-applications')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear aplicación tributaria (vincular regla con definición)' })
  async createApplication(@Body() dto: CreateTaxRuleApplicationDto) {
    const data = await this.taxApplicationService.createApplication(dto);
    return { data };
  }

  @Patch('tax-rule-applications/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar aplicación tributaria' })
  async updateApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRuleApplicationDto,
  ) {
    const data = await this.taxApplicationService.updateApplication(id, dto);
    return { data };
  }

  @Delete('tax-rule-applications/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Eliminar aplicación tributaria' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteApplication(@Param('id', ParseUUIDPipe) id: string) {
    await this.taxApplicationService.deleteApplication(id);
  }
}
