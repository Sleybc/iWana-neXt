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
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PromotionService } from '../services/promotion.service';
import { CreatePromotionDto, UpdatePromotionDto } from '../dto/promotion.dto';
import { CommercialListMetaDto } from '../dto/commercial-list-query.dto';
import { CommercialOfferListQueryDto } from '../dto/commercial-offer-list-query.dto';
import {
  COMMERCIAL_BILLING_WRITE_ROLES,
  COMMERCIAL_OFFER_READ_ROLES,
} from '../utils/commercial-roles';

@ApiTags('commercial-promotions')
@ApiExtraModels(CommercialListMetaDto)
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial/promotions')
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Get()
  @Roles(...COMMERCIAL_OFFER_READ_ROLES)
  @ApiOperation({
    summary: 'Listar promociones activas del tenant (paginación cursor)',
    description:
      'ADR-064: limit default 20, max 100; meta.nextCursor + meta.total. Orden: validFrom DESC, id DESC. ' +
      'Filtro `offerStatus=expiring`: vigencia ≤7 días o cerca del límite de usos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Respuesta `{ data, meta: { nextCursor, total } }`',
  })
  async findAll(@Query() query: CommercialOfferListQueryDto) {
    return this.promotionService.findAll(query);
  }

  @Get(':id')
  @Roles(...COMMERCIAL_OFFER_READ_ROLES)
  @ApiOperation({ summary: 'Obtener promoción por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.promotionService.findOne(id);
    return { data };
  }

  @Post()
  @Roles(...COMMERCIAL_BILLING_WRITE_ROLES)
  @ApiOperation({ summary: 'Crear promoción comercial' })
  @ApiResponse({ status: 201, description: 'Promoción creada' })
  @ApiResponse({ status: 409, description: 'Código de promoción ya existe en el tenant' })
  async create(@Body() dto: CreatePromotionDto, @Request() req: { user: JwtPayload }) {
    const data = await this.promotionService.create(dto, req.user.sub);
    return { data };
  }

  @Patch(':id')
  @Roles(...COMMERCIAL_BILLING_WRITE_ROLES)
  @ApiOperation({ summary: 'Actualizar promoción' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromotionDto) {
    const data = await this.promotionService.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @Roles(...COMMERCIAL_BILLING_WRITE_ROLES)
  @ApiOperation({ summary: 'Desactivar promoción' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    await this.promotionService.deactivate(id);
    return { message: 'Promoción desactivada' };
  }
}
