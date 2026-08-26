import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CatalogItemType, CustomerSegment } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CatalogService } from '../services/catalog.service';
import { PriceHistoryService } from '../services/price-history.service';
import {
  CreateCatalogItemDto,
  CreatePlanCatalogItemDto,
  CreateProductCatalogItemDto,
  CreateServiceCatalogItemDto,
} from '../dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from '../dto/update-catalog-item.dto';
import { CatalogQueryDto } from '../dto/catalog-query.dto';
import { CommercialListMetaDto } from '../dto/commercial-list-query.dto';
import { CreatePriceDto } from '../dto/create-price.dto';
import {
  COMMERCIAL_BILLING_WRITE_ROLES,
  COMMERCIAL_CATALOG_READ_ROLES,
  COMMERCIAL_CATALOG_WRITE_ROLES,
  COMMERCIAL_PRICE_READ_ROLES,
} from '../utils/commercial-roles';

@ApiTags('commercial-catalog')
@ApiExtraModels(CommercialListMetaDto)
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial/catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly priceHistoryService: PriceHistoryService,
  ) {}

  @Get()
  @Roles(...COMMERCIAL_CATALOG_READ_ROLES)
  @ApiOperation({
    summary: 'Listar ítems del catálogo con filtros y paginación cursor/page',
    description:
      'ADR-064/065: `limit` default 20, max 100; `cursor` o `page` (excluyentes). ' +
      '`total` = tamaño del conjunto filtrado; el cursor aplica después del filtro. ' +
      'Orden default: name ASC, id ASC. `sort` = CATEGORY_NAME | ACTIVE_NAME | RECENTLY_UPDATED ' +
      '(keyset coherente; cambiar sort reinicia cursor). ' +
      'Filtros servidor: `type`, `name`, `isActive`, `missingPrice`, `category` (productos), ' +
      '`model` (SALE|LOAN), `charge` (servicios). Planes en modo page: `sortBy`/`sortDir` y ' +
      '`sortableFields` de columnas de dato. Productos/servicios y modo cursor: `sortableFields: []`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Envelope H-11 `{ data: { data, meta } }` (ListMeta mode page|cursor)',
  })
  async findAll(@Query() query: CatalogQueryDto) {
    // Envelope H-11 (igual Users): { data: { data, meta } } → el FE desenvuelve / normaliza.
    const result = await this.catalogService.findAll(query);
    return { data: result };
  }

  @Get(':id')
  @Roles(...COMMERCIAL_CATALOG_READ_ROLES)
  @ApiOperation({ summary: 'Obtener ítem del catálogo por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.catalogService.findOne(id);
    return { data };
  }

  @Post()
  @Roles(...COMMERCIAL_CATALOG_WRITE_ROLES)
  @ApiOperation({ summary: 'Crear ítem en el catálogo (plan, producto o servicio)' })
  @ApiResponse({ status: 201, description: 'Ítem creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o campos de detalle faltantes' })
  async create(@Body() dto: CreateCatalogItemDto) {
    const data = await this.catalogService.create(dto);
    return { data };
  }

  @Post('plans')
  @Roles(...COMMERCIAL_CATALOG_WRITE_ROLES)
  @ApiOperation({ summary: 'Crear plan comercial' })
  async createPlan(@Body() dto: CreatePlanCatalogItemDto) {
    const data = await this.catalogService.create({ ...dto, type: CatalogItemType.PLAN });
    return { data };
  }

  @Post('products')
  @Roles(...COMMERCIAL_CATALOG_WRITE_ROLES)
  @ApiOperation({ summary: 'Crear producto comercial' })
  async createProduct(@Body() dto: CreateProductCatalogItemDto) {
    const data = await this.catalogService.create({ ...dto, type: CatalogItemType.PRODUCT });
    return { data };
  }

  @Post('services')
  @Roles(...COMMERCIAL_CATALOG_WRITE_ROLES)
  @ApiOperation({ summary: 'Crear servicio comercial adicional' })
  async createService(@Body() dto: CreateServiceCatalogItemDto) {
    const data = await this.catalogService.create({ ...dto, type: CatalogItemType.SERVICE });
    return { data };
  }

  @Patch(':id')
  @Roles(...COMMERCIAL_CATALOG_WRITE_ROLES)
  @ApiOperation({ summary: 'Actualizar ítem del catálogo' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogItemDto) {
    const data = await this.catalogService.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @Roles(...COMMERCIAL_CATALOG_WRITE_ROLES)
  @ApiOperation({ summary: 'Eliminar ítem del catálogo (soft delete)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.catalogService.remove(id);
    return { message: 'Ítem eliminado' };
  }

  // ─── Precios SCD ─────────────────────────────────────────────────────────

  @Get(':id/prices')
  @Roles(...COMMERCIAL_PRICE_READ_ROLES)
  @ApiOperation({ summary: 'Historial de precios de un ítem' })
  async getPriceHistory(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.priceHistoryService.getPriceHistory(id);
    return { data };
  }

  @Get(':id/price')
  @Roles(...COMMERCIAL_PRICE_READ_ROLES)
  @ApiOperation({ summary: 'Precio vigente de un ítem para un segmento' })
  async getCurrentPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('segment', new ParseEnumPipe(CustomerSegment)) segment: CustomerSegment,
  ) {
    const data = await this.priceHistoryService.getCurrentPrice(id, segment);
    return { data };
  }

  @Post(':id/prices')
  @Roles(...COMMERCIAL_BILLING_WRITE_ROLES)
  @ApiOperation({ summary: 'Registrar nuevo precio (SCD Tipo 2)' })
  @ApiResponse({ status: 201, description: 'Precio creado y anterior cerrado atómicamente' })
  @ApiResponse({ status: 409, description: 'Precio idéntico ya vigente' })
  async createPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePriceDto,
    @Request() req: { user: JwtPayload },
  ) {
    const data = await this.priceHistoryService.createPrice(id, dto, req.user.sub);
    return { data };
  }
}
