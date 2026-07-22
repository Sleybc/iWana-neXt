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
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlatformRole, UserRole } from '@iwana/shared';
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
import { CreatePriceDto } from '../dto/create-price.dto';
import { CatalogItemType, CustomerSegment } from '@iwana/shared';

@ApiTags('commercial-catalog')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial/catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly priceHistoryService: PriceHistoryService,
  ) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.NOC,
    UserRole.ACCOUNTANT,
    PlatformRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Listar ítems del catálogo con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'Lista paginada de ítems' })
  async findAll(@Query() query: CatalogQueryDto) {
    const result = await this.catalogService.findAll(query);
    return { data: result.data, meta: { total: result.total } };
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.NOC,
    UserRole.ACCOUNTANT,
    PlatformRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Obtener ítem del catálogo por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.catalogService.findOne(id);
    return { data };
  }

  @Post()
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear ítem en el catálogo (plan, producto o servicio)' })
  @ApiResponse({ status: 201, description: 'Ítem creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o campos de detalle faltantes' })
  async create(@Body() dto: CreateCatalogItemDto) {
    const data = await this.catalogService.create(dto);
    return { data };
  }

  @Post('plans')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear plan comercial' })
  async createPlan(@Body() dto: CreatePlanCatalogItemDto) {
    const data = await this.catalogService.create({ ...dto, type: CatalogItemType.PLAN });
    return { data };
  }

  @Post('products')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear producto comercial' })
  async createProduct(@Body() dto: CreateProductCatalogItemDto) {
    const data = await this.catalogService.create({ ...dto, type: CatalogItemType.PRODUCT });
    return { data };
  }

  @Post('services')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear servicio comercial adicional' })
  async createService(@Body() dto: CreateServiceCatalogItemDto) {
    const data = await this.catalogService.create({ ...dto, type: CatalogItemType.SERVICE });
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar ítem del catálogo' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogItemDto) {
    const data = await this.catalogService.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Eliminar ítem del catálogo (soft delete)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.catalogService.remove(id);
    return { message: 'Ítem eliminado' };
  }

  // ─── Precios SCD ─────────────────────────────────────────────────────────

  @Get(':id/prices')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Historial de precios de un ítem' })
  async getPriceHistory(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.priceHistoryService.getPriceHistory(id);
    return { data };
  }

  @Get(':id/price')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Precio vigente de un ítem para un segmento' })
  async getCurrentPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('segment') segment: CustomerSegment,
  ) {
    const data = await this.priceHistoryService.getCurrentPrice(id, segment);
    return { data };
  }

  @Post(':id/prices')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, PlatformRole.SYSTEM_ADMIN)
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
