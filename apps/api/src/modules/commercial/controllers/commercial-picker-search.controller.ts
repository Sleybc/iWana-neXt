import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CatalogItemType, PlatformRole, UserRole } from '@iwana/shared';
import { CatalogPickerSearchQueryDto, PickerSearchResponseDto } from '../../../common/pagination';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CatalogService } from '../services/catalog.service';

const PICKER_ROLES = [
  UserRole.ADMIN,
  UserRole.SALES,
  UserRole.SUPPORT,
  UserRole.NOC,
  UserRole.ACCOUNTANT,
  PlatformRole.SYSTEM_ADMIN,
] as const;

/**
 * Lookups typeahead E-4 del catálogo comercial.
 * Rutas dedicadas (plan remediación): no reutilizan `GET /commercial/catalog`
 * para no mezclar listado cursor con picker.
 */
@ApiTags('commercial-picker-search')
@ApiExtraModels(PickerSearchResponseDto)
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commercial')
export class CommercialPickerSearchController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('plans/search')
  @Roles(...PICKER_ROLES)
  @ApiOperation({
    summary: 'Buscar planes para picker (typeahead)',
    description:
      'Lookup E-4: `q` ILIKE sobre nombre. Default `isActive=true`. Máx. 20 filas. ' +
      'Respuesta `{ data: { id, label, sublabel }[], total }`.',
  })
  @ApiResponse({ status: 200, type: PickerSearchResponseDto })
  searchPlans(@Query() query: CatalogPickerSearchQueryDto): Promise<PickerSearchResponseDto> {
    return this.catalogService.searchForPicker({
      type: CatalogItemType.PLAN,
      q: query.q,
      isActive: query.isActive,
      limit: query.limit,
    });
  }

  @Get('additional-products/search')
  @Roles(...PICKER_ROLES)
  @ApiOperation({
    summary: 'Buscar productos adicionales para picker (typeahead)',
    description:
      'Lookup E-4 sobre catálogo type=PRODUCT. Default `isActive=true`. Máx. 20. ' +
      'Respuesta `{ data, total }`.',
  })
  @ApiResponse({ status: 200, type: PickerSearchResponseDto })
  searchProducts(@Query() query: CatalogPickerSearchQueryDto): Promise<PickerSearchResponseDto> {
    return this.catalogService.searchForPicker({
      type: CatalogItemType.PRODUCT,
      q: query.q,
      isActive: query.isActive,
      limit: query.limit,
    });
  }

  @Get('additional-services/search')
  @Roles(...PICKER_ROLES)
  @ApiOperation({
    summary: 'Buscar servicios adicionales para picker (typeahead)',
    description:
      'Lookup E-4 sobre catálogo type=SERVICE. Default `isActive=true`. Máx. 20. ' +
      'Respuesta `{ data, total }`.',
  })
  @ApiResponse({ status: 200, type: PickerSearchResponseDto })
  searchServices(@Query() query: CatalogPickerSearchQueryDto): Promise<PickerSearchResponseDto> {
    return this.catalogService.searchForPicker({
      type: CatalogItemType.SERVICE,
      q: query.q,
      isActive: query.isActive,
      limit: query.limit,
    });
  }
}
