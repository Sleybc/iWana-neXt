export interface CommercialNodeReference {
  id: string;
  isActive: boolean;
  deletedAt: Date | null;
}

export interface CommercialNodeSummary {
  name: string;
  isActive: boolean;
}

export abstract class CommercialNodeReadPort {
  abstract findReferenceById(id: string): Promise<CommercialNodeReference | null>;

  abstract findRouterSummaryById(id: string): Promise<CommercialNodeSummary | null>;
}
