import { Badge } from '@iwana/ui';

/** Precio vigente ausente: `currentPrice` null (no confundir con $0 legítimo). */
export function hasMissingCurrentPrice(item: { currentPrice?: string | null }): boolean {
  return item.currentPrice == null;
}

export function MissingCurrentPriceBadge() {
  return <Badge variant="warning">Sin precio vigente</Badge>;
}
