export type MatrixSelectionSource = 'recommendation' | 'manual';

export interface MatrixCellSelection {
  technicianId: string;
  date: string;
  dayLabel: string;
  availabilityLabel: string;
  riskMessages: string[];
}

export interface MatrixManualScheduleDraft extends MatrixCellSelection {
  startTime: string;
  duration: string;
  source: MatrixSelectionSource;
}

export function buildMatrixCellKey(technicianId: string, date: string): string {
  return `${technicianId}::${date}`;
}
