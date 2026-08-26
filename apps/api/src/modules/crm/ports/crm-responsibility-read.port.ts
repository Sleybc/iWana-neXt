import { Injectable } from '@nestjs/common';

export interface CrmResponsibilityActorSnapshot {
  userId: string | null;
  name: string | null;
  role: string | null;
}

export interface CrmResponsibilitySnapshot {
  currentResponsibleUserId: string | null;
  currentResponsibleAssignedAt: Date | null;
  currentResponsible: CrmResponsibilityActorSnapshot;
  expedienteId: string;
}

@Injectable()
export abstract class CrmResponsibilityReadPort {
  abstract getResponsibility(expedienteId: string): Promise<CrmResponsibilitySnapshot | null>;
}
