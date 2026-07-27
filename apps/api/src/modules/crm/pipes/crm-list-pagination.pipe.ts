import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { MAX_LIMIT } from '../../../common/pagination/clamp-limit';

/** DEF-2 A6: cota superior de page en boundary HTTP (defense-in-depth). */
export const MAX_PAGE = 100;

/**
 * Valida `limit` de listados CRM en el boundary HTTP (DEF-2 H-1 / Ley 1581).
 * Defense-in-depth junto a `clampLimit` en el service — dictamen AI-SEC-ENG.
 * Cap silencioso a MAX_LIMIT; valores no enteros / < 1 → 400 genérico.
 */
@Injectable()
export class CrmListLimitPipe implements PipeTransform<unknown, number | undefined> {
  transform(value: unknown, _metadata: ArgumentMetadata): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('El límite de página debe ser al menos 1');
    }
    return Math.min(parsed, MAX_LIMIT);
  }
}

/**
 * Valida `page` ≥ 1 y ≤ MAX_PAGE en el boundary HTTP (DEF-2 D-7, A6).
 */
@Injectable()
export class CrmListPagePipe implements PipeTransform<unknown, number | undefined> {
  transform(value: unknown, _metadata: ArgumentMetadata): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('El número de página debe ser al menos 1');
    }
    if (parsed > MAX_PAGE) {
      throw new BadRequestException(`El número de página no puede superar ${MAX_PAGE}`);
    }
    return parsed;
  }
}
