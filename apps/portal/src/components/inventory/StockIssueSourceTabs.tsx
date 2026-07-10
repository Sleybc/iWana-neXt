'use client';

import { Tabs, TabsList, TabsTrigger } from '@iwana/ui';

export type StockIssueSourceTab = 'suggestions' | 'catalog';

interface StockIssueSourceTabsProps {
  value: StockIssueSourceTab;
  suggestionCount: number;
  catalogCount: number;
  onValueChange: (value: StockIssueSourceTab) => void;
}

export function StockIssueSourceTabs({
  value,
  suggestionCount,
  catalogCount,
  onValueChange,
}: StockIssueSourceTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as StockIssueSourceTab)}>
      <TabsList>
        <TabsTrigger value="suggestions">Con stock ({suggestionCount})</TabsTrigger>
        <TabsTrigger value="catalog">Catálogo ({catalogCount})</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
