'use client';

import { Tabs, TabsList, TabsTrigger } from '@iwana/ui';

interface PurchaseSourceTabsProps {
  value: 'suggestions' | 'catalog';
  suggestionCount: number;
  catalogCount: number;
  onValueChange: (value: 'suggestions' | 'catalog') => void;
}

export function PurchaseSourceTabs({
  value,
  suggestionCount,
  catalogCount,
  onValueChange,
}: PurchaseSourceTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as 'suggestions' | 'catalog')}>
      <TabsList>
        <TabsTrigger value="suggestions">Sugeridos ({suggestionCount})</TabsTrigger>
        <TabsTrigger value="catalog">Catálogo ({catalogCount})</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
