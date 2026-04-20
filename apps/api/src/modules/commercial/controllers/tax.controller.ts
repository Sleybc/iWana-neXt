import {
  Body,
  Controller,
  Delete,
  Get,
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
import {
  CreateTaxClassificationDto,
  CreateTaxRuleDto,
  UpdateTaxRuleDto,
  UpdateTaxClassificationDto,
} from '../dto/tax.dto';
import { Query } from '@nestjs/common';

@ApiTags('commercial-tax')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial')
export class TaxController {
  constructor(private readonly taxClassificationService: TaxClassificationService) {}

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
  @ApiOperation({ summary: 'Listar reglas tributarias activas del tenant' })
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
}
