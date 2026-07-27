import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CommercialListQueryDto } from './commercial-list-query.dto';

/** Filtro de ofertas en riesgo / por vencer (alineado a FE `offerStatus=expiring`). */
export const COMMERCIAL_OFFER_STATUS_VALUES = ['expiring'] as const;
export type CommercialOfferStatusFilter = (typeof COMMERCIAL_OFFER_STATUS_VALUES)[number];

/**
 * Query de listado cursor para bundles / promociones (ADR-064).
 * `offerStatus=expiring` aplica la ventana de 7 días + umbral de usos (promos).
 */
export class CommercialOfferListQueryDto extends CommercialListQueryDto {
  @ApiPropertyOptional({
    enum: COMMERCIAL_OFFER_STATUS_VALUES,
    description:
      'Filtra ofertas por vencer: vigencia en ≤7 días (y, en promociones, cerca del límite de usos).',
    example: 'expiring',
  })
  @IsOptional()
  @IsIn(COMMERCIAL_OFFER_STATUS_VALUES)
  offerStatus?: CommercialOfferStatusFilter;
}
