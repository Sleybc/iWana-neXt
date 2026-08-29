import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, PlatformRole, UserRole, type ListResponse } from '@iwana/shared';
import { ListMetaDto } from '../../../common/pagination';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { CrmListPaginationDto } from '../dto/crm-list-pagination.dto';
import { CrmListLimitPipe, CrmListPagePipe } from '../pipes/crm-list-pagination.pipe';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { Quote } from './entities/quote.entity';
import { QuotesService } from './quotes.service';

@ApiTags('quotes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @ApiOperation({ summary: 'Crear cotizacion comercial' })
  async create(@Body() dto: CreateQuoteDto): Promise<{ data: Quote }> {
    const data = await this.quotesService.create(dto);
    return { data };
  }

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Listar cotizaciones comerciales' })
  @ApiExtraModels(CrmListPaginationDto, ListMetaDto)
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  async findAll(
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
  ): Promise<ListResponse<Quote>> {
    return this.quotesService.findAll({
      ...(page !== undefined ? { page } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Consultar cotizacion por id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Quote }> {
    const data = await this.quotesService.findOne(id);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @ApiOperation({ summary: 'Actualizar cotizacion comercial' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteDto,
  ): Promise<{ data: Quote }> {
    const data = await this.quotesService.update(id, dto);
    return { data };
  }

  @Post(':id/accept')
  @Roles(UserRole.ADMIN, UserRole.SALES, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @ApiOperation({ summary: 'Aceptar cotizacion y marcarla como aprobada' })
  async accept(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Quote }> {
    const data = await this.quotesService.accept(id);
    return { data };
  }
}
