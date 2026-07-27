import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformRole, UserRole, CustomerSegment } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { BundleService } from '../services/bundle.service';
import { BundleListItemDto, CreateBundleDto, UpdateBundleDto } from '../dto/bundle.dto';
import { CommercialListMetaDto } from '../dto/commercial-list-query.dto';
import { CommercialOfferListQueryDto } from '../dto/commercial-offer-list-query.dto';

@ApiTags('commercial-bundles')
@ApiExtraModels(BundleListItemDto, CommercialListMetaDto)
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial/bundles')
export class BundleController {
  constructor(private readonly bundleService: BundleService) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.ACCOUNTANT,
    PlatformRole.SYSTEM_ADMIN,
  )
  @ApiOperation({
    summary: 'Listar bundles activos del tenant (paginación cursor)',
    description:
      'Incluye itemCount. ADR-064: limit default 20, max 100; meta.nextCursor + meta.total. Orden: name ASC, id ASC. ' +
      'Filtro `offerStatus=expiring`: vigencia en ≤7 días.',
  })
  @ApiResponse({
    status: 200,
    description: 'Respuesta `{ data, meta: { nextCursor, total } }` (ver BundleListItemDto).',
  })
  async findAll(@Query() query: CommercialOfferListQueryDto) {
    return this.bundleService.findAll(query);
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.ACCOUNTANT,
    PlatformRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Obtener bundle por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.bundleService.findOne(id);
    return { data };
  }

  @Post()
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear bundle comercial' })
  @ApiResponse({ status: 201, description: 'Bundle creado' })
  @ApiResponse({ status: 400, description: 'Mínimo 2 ítems requeridos o ítems no activos' })
  async create(@Body() dto: CreateBundleDto) {
    const data = await this.bundleService.create(dto);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar bundle' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBundleDto) {
    const data = await this.bundleService.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Desactivar bundle' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    await this.bundleService.deactivate(id);
    return { message: 'Bundle desactivado' };
  }

  @Get(':id/price')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Calcular precio dinámico del bundle para un segmento' })
  @ApiQuery({ name: 'segment', enum: CustomerSegment, required: true })
  @ApiQuery({
    name: 'optionalItemIds',
    type: [String],
    required: false,
    description: 'UUIDs de ítems opcionales seleccionados',
  })
  async calculatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('segment') segment: CustomerSegment,
    @Query('optionalItemIds') optionalItemIds?: string[],
  ) {
    const data = await this.bundleService.calculatePrice(id, segment, optionalItemIds ?? []);
    return { data };
  }
}
