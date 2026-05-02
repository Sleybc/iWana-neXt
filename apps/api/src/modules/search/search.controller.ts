import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PlatformRole } from '@iwana/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GlobalSearchQueryDto } from './dto/global-search-query.dto';
import {
  GlobalSearchRebuildResponseDto,
  GlobalSearchResponseDto,
} from './dto/global-search-response.dto';
import { SearchService } from './search.service';

@Controller('search')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('search')
@ApiBearerAuth('access-token')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('global')
  @Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @ApiOperation({ summary: 'Buscar empresas, usuarios y módulos desde la consola de plataforma' })
  @ApiOkResponse({ type: GlobalSearchResponseDto })
  @ApiUnauthorizedResponse({ description: 'Requiere JWT de plataforma válido.' })
  async searchGlobal(
    @Query() query: GlobalSearchQueryDto,
  ): Promise<{ data: GlobalSearchResponseDto }> {
    const data = await this.searchService.searchGlobal(query.q, query.limit ?? 5);
    return { data };
  }

  @Post('global/rebuild')
  @Roles(PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Reconstruir los índices de búsqueda global en Typesense' })
  @ApiOkResponse({ type: GlobalSearchRebuildResponseDto })
  async rebuildGlobalIndex(): Promise<{ data: GlobalSearchRebuildResponseDto }> {
    const data = await this.searchService.rebuildGlobalIndex();
    return { data };
  }
}
