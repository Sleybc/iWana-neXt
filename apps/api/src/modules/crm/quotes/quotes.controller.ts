import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { Quote } from './entities/quote.entity';
import { QuotesService } from './quotes.service';

@ApiTags('quotes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear cotizacion comercial' })
  async create(@Body() dto: CreateQuoteDto): Promise<{ data: Quote }> {
    const data = await this.quotesService.create(dto);
    return { data };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar cotizaciones comerciales' })
  async findAll(): Promise<{ data: Quote[] }> {
    const data = await this.quotesService.findAll();
    return { data };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Consultar cotizacion por id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Quote }> {
    const data = await this.quotesService.findOne(id);
    return { data };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar cotizacion comercial' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuoteDto,
  ): Promise<{ data: Quote }> {
    const data = await this.quotesService.update(id, dto);
    return { data };
  }

  @Post(':id/accept')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Aceptar cotizacion y marcarla como aprobada' })
  async accept(@Param('id', ParseUUIDPipe) id: string): Promise<{ data: Quote }> {
    const data = await this.quotesService.accept(id);
    return { data };
  }
}
