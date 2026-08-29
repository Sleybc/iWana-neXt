import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, CatalogItemType, UserRole } from '@iwana/shared';
import { CatalogPickerSearchQueryDto, PickerSearchResponseDto } from '../../../common/pagination';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CatalogService } from '../services/catalog.service';
import { COMMERCIAL_CATALOG_READ_ROLES } from '../utils/commercial-roles';

/**
 * Lookups typeahead E-4 del catálogo comercial.
 * Rutas dedicadas (plan remediación): no reutilizan `GET /commercial/catalog`
 * para no mezclar listado cursor con picker.
 */
@ApiTags('commercial-picker-search')
@ApiExtraModels(PickerSearchResponseDto)
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('commercial')
export class CommercialPickerSearchController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('plans/search')
  @Roles(...COMMERCIAL_CATALOG_READ_ROLES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.COMMERCIAL_CATALOG_READ)
  @ApiOperation({
    summary: 'Buscar planes para picker (typeahead)',
    description:
      'Lookup E-4: `q` ILIKE sobre nombre y tecnología (plan_details). Default `isActive=true`. ' +
      'Máx. 20 filas. `sublabel` incluye tecnología y velocidades para distinguir planes homónimos. ' +
      'Respuesta `{ data: { id, label, sublabel }[], total }`.',
  })
  @ApiResponse({ status: 200, type: PickerSearchResponseDto })
  searchPlans(@Query() query: CatalogPickerSearchQueryDto): Promise<PickerSearchResponseDto> {
    return this.searchPicker(CatalogItemType.PLAN, query);
  }

  @Get('additional-products/search')
  @Roles(...COMMERCIAL_CATALOG_READ_ROLES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.COMMERCIAL_CATALOG_READ)
  @ApiOperation({
    summary: 'Buscar productos adicionales para picker (typeahead)',
    description:
      'Lookup E-4 sobre catálogo type=PRODUCT. Default `isActive=true`. Máx. 20. ' +
      'Respuesta `{ data, total }`.',
  })
  @ApiResponse({ status: 200, type: PickerSearchResponseDto })
  searchProducts(@Query() query: CatalogPickerSearchQueryDto): Promise<PickerSearchResponseDto> {
    return this.searchPicker(CatalogItemType.PRODUCT, query);
  }

  @Get('additional-services/search')
  @Roles(...COMMERCIAL_CATALOG_READ_ROLES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.COMMERCIAL_CATALOG_READ)
  @ApiOperation({
    summary: 'Buscar servicios adicionales para picker (typeahead)',
    description:
      'Lookup E-4 sobre catálogo type=SERVICE. Default `isActive=true`. Máx. 20. ' +
      'Respuesta `{ data, total }`.',
  })
  @ApiResponse({ status: 200, type: PickerSearchResponseDto })
  searchServices(@Query() query: CatalogPickerSearchQueryDto): Promise<PickerSearchResponseDto> {
    return this.searchPicker(CatalogItemType.SERVICE, query);
  }

  private searchPicker(
    type: CatalogItemType,
    query: CatalogPickerSearchQueryDto,
  ): Promise<PickerSearchResponseDto> {
    return this.catalogService.searchForPicker({
      type,
      q: query.q,
      isActive: query.isActive,
      limit: query.limit,
    });
  }
}
