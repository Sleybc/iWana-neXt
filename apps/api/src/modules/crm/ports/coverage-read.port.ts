import { Injectable } from '@nestjs/common';

export interface CoverageNode {
  id: string;
  name: string;
  type: 'NODE' | 'ZONE' | 'RADIO';
  available: boolean;
}

@Injectable()
export abstract class CoverageReadPort {
  abstract checkAvailability(
    tenantId: string,
    schemaName: string,
    address: string,
    coordinates?: { lat: number; lng: number },
  ): Promise<{ available: boolean; nodes: CoverageNode[] }>;
}
