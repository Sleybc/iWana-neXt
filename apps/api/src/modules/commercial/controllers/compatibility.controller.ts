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
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CompatibilityService } from '../services/compatibility.service';
import {
  CreateCompatibilityRuleDto,
  UpdateCompatibilityRuleDto,
  ValidateCombinationDto,
} from '../dto/compatibility.dto';
import { CommercialListMetaDto, CommercialListQueryDto } from '../dto/commercial-list-query.dto';
import {
  COMMERCIAL_CATALOG_WRITE_ROLES,
  COMMERCIAL_COMPAT_READ_ROLES,
} from '../utils/commercial-roles';

@ApiTags('commercial-compatibility')
@ApiExtraModels(CommercialListMetaDto)
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial')
export class CompatibilityController {
  constructor(private readonly compatibilityService: CompatibilityService) {}

  @Get('compatibility-rules')
  @Roles(...COMMERCIAL_COMPAT_READ_ROLES)
  @ApiOperation({
    summary: 'Listar reglas de compatibilidad activas (paginación cursor)',
    description:
      'ADR-064: limit default 20, max 100; meta.nextCursor + meta.total. Orden: createdAt DESC, id DESC.',
  })
  @ApiResponse({
    status: 200,
    description: 'Respuesta `{ data, meta: { nextCursor, total } }`',
  })
  async findAll(@Query() query: CommercialListQueryDto) {
    return this.compatibilityService.findAll(query);
  }

  @Post('compatibility-rules')
  @Roles(...COMMERCIAL_CATALOG_WRITE_ROLES)
  @ApiOperation({ summary: 'Crear regla de compatibilidad entre ítems' })
  @ApiResponse({ status: 201, description: 'Regla creada' })
  @ApiResponse({ status: 400, description: 'source y target deben ser distintos' })
  async create(@Body() dto: CreateCompatibilityRuleDto) {
    const data = await this.compatibilityService.create(dto);
    return { data };
  }

  @Delete('compatibility-rules/:id')
  @Roles(...COMMERCIAL_CATALOG_WRITE_ROLES)
  @ApiOperation({ summary: 'Desactivar regla de compatibilidad' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    await this.compatibilityService.deactivate(id);
    return { message: 'Regla desactivada' };
  }

  @Post('compatibility/validate')
  @Roles(...COMMERCIAL_COMPAT_READ_ROLES)
  @ApiOperation({ summary: 'Validar combinación de ítems contra reglas activas' })
  @ApiResponse({ status: 200, description: 'Resultado de validación con errores y warnings' })
  async validateCombination(@Body() dto: ValidateCombinationDto) {
    const data = await this.compatibilityService.validateCombination(dto.itemIds);
    return { data };
  }

  @Patch('compatibility-rules/:id')
  @Roles(...COMMERCIAL_CATALOG_WRITE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar nota, vigencia o estado de regla de compatibilidad' })
  @ApiResponse({ status: 200, description: 'Regla actualizada' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompatibilityRuleDto) {
    const data = await this.compatibilityService.update(id, dto);
    return { data };
  }
}
