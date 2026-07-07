import { InventoryItemKind } from '../enums/inventory/inventory-item-kind.enum';
import { sanitizeAlnumUpper, tokenizeCategoryName } from './inventory-category-code';

const SKU_MAX_LENGTH = 60;
const SKU_COLLISION_SUFFIX_LENGTH = 4; // -001

const SKU_SEGMENT_LENGTHS = {
  category: 3,
  kind: 3,
  name: 5,
  brand: 3,
  model: 5,
} as const;

export const INVENTORY_ITEM_KIND_SKU_CODES: Record<InventoryItemKind, string> = {
  [InventoryItemKind.STOCK]: 'STK',
  [InventoryItemKind.CONSUMABLE]: 'CON',
  [InventoryItemKind.SERIALIZED]: 'SER',
  [InventoryItemKind.SERVICE]: 'SVC',
};

export interface CompositeSkuInput {
  categoryCodePrefix: string;
  itemKind: InventoryItemKind;
  name: string;
  brand?: string | null;
  model?: string | null;
}

function abbreviateToken(token: string, maxLength: number): string {
  const sanitized = sanitizeAlnumUpper(token);
  if (!sanitized || maxLength <= 0) {
    return '';
  }

  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  const consonantSkeleton = sanitized[0] + sanitized.slice(1).replace(/[AEIOU]/g, '');
  if (consonantSkeleton.length >= 2) {
    return consonantSkeleton.slice(0, maxLength);
  }

  return sanitized.slice(0, maxLength);
}

function abbreviateMultiTokenSegment(tokens: string[], maxLength: number): string {
  if (tokens.length === 0) {
    return '';
  }

  const [firstToken] = tokens;
  if (!firstToken) {
    return '';
  }

  if (tokens.length === 1) {
    return abbreviateToken(firstToken, maxLength);
  }

  if (tokens.length >= 3) {
    const initials = tokens.map((token) => token[0] ?? '').join('');
    if (initials.length >= maxLength) {
      return initials.slice(0, maxLength);
    }

    const lastToken = tokens[tokens.length - 1];
    if (!lastToken) {
      return initials.slice(0, maxLength);
    }

    const remainder = maxLength - initials.length;
    const extra = abbreviateToken(lastToken, remainder + 1).slice(1);
    return (initials + extra).slice(0, maxLength);
  }

  const secondToken = tokens[1];
  if (!secondToken) {
    return abbreviateToken(firstToken, maxLength);
  }

  const firstPart = firstToken.length <= 3 ? firstToken : abbreviateToken(firstToken, 3);
  const remaining = maxLength - firstPart.length;
  if (remaining <= 0) {
    return firstPart.slice(0, maxLength);
  }

  const secondPart =
    secondToken.length <= remaining ? secondToken : abbreviateToken(secondToken, remaining);
  return (firstPart + secondPart).slice(0, maxLength);
}

function abbreviateNameSegment(name: string, maxLength: number): string {
  const tokens = tokenizeCategoryName(name);
  return abbreviateMultiTokenSegment(tokens, maxLength);
}

function abbreviateBrandSegment(brand: string, maxLength: number): string {
  const sanitized = sanitizeAlnumUpper(brand);
  if (!sanitized) {
    return '';
  }

  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  return abbreviateToken(sanitized, maxLength);
}

function abbreviateModelSegment(model: string, maxLength: number): string {
  const tokens = tokenizeCategoryName(model);
  if (tokens.length === 0) {
    return '';
  }

  if (tokens.length >= 2) {
    const modelCode = tokens[tokens.length - 1];
    const productLine = tokens[tokens.length - 2];
    if (modelCode && productLine && modelCode.length <= maxLength && /\d/.test(modelCode)) {
      const combined = `${productLine[0] ?? ''}${modelCode}`;
      if (combined.length <= maxLength) {
        return combined;
      }
      return modelCode;
    }
  }

  return abbreviateMultiTokenSegment(tokens, maxLength);
}

function normalizeCategorySegment(value: string | null | undefined, maxLength: number): string {
  return sanitizeAlnumUpper(value ?? '').slice(0, maxLength);
}

export function buildCompositeSkuBase(input: CompositeSkuInput): string {
  const segments = [
    normalizeCategorySegment(input.categoryCodePrefix, SKU_SEGMENT_LENGTHS.category),
    INVENTORY_ITEM_KIND_SKU_CODES[input.itemKind],
    abbreviateNameSegment(input.name, SKU_SEGMENT_LENGTHS.name),
    abbreviateBrandSegment(input.brand ?? '', SKU_SEGMENT_LENGTHS.brand),
    abbreviateModelSegment(input.model ?? '', SKU_SEGMENT_LENGTHS.model),
  ].filter((segment) => segment.length > 0);

  return segments.join('-').slice(0, SKU_MAX_LENGTH);
}

export function appendCollisionSuffix(base: string, attempt: number): string {
  const suffix = `-${attempt.toString().padStart(3, '0')}`;
  const truncatedBase = base.slice(0, SKU_MAX_LENGTH - SKU_COLLISION_SUFFIX_LENGTH);
  return `${truncatedBase}${suffix}`;
}

export function buildCompositeSku(input: CompositeSkuInput, attempt = 0): string {
  const base = buildCompositeSkuBase(input);
  return attempt > 0 ? appendCollisionSuffix(base, attempt) : base;
}

export function isValidCompositeSku(value: string): boolean {
  return (
    value.length > 0 && value.length <= SKU_MAX_LENGTH && /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value)
  );
}
