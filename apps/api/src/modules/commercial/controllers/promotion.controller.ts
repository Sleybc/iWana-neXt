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
import { PromotionService } from '../services/promotion.service';
import { CreatePromotionDto, UpdatePromotionDto } from '../dto/promotion.dto';

@ApiTags('commercial-promotions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial/promotions')
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.ACCOUNTANT,
    UserRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Listar promociones activas del tenant' })
  async findAll() {
    const data = await this.promotionService.findAll();
    return { data };
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.ACCOUNTANT,
    UserRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Obtener promoción por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.promotionService.findOne(id);
    return { data };
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear promoción comercial' })
  @ApiResponse({ status: 201, description: 'Promoción creada' })
  @ApiResponse({ status: 409, description: 'Código de promoción ya existe en el tenant' })
  async create(@Body() dto: CreatePromotionDto, @Request() req: { user: JwtPayload }) {
    const data = await this.promotionService.create(dto, req.user.sub);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar promoción' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromotionDto) {
    const data = await this.promotionService.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Desactivar promoción' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    await this.promotionService.deactivate(id);
    return { message: 'Promoción desactivada' };
  }
}
