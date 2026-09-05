export interface ExecutionOrderCompletionSource {
  progress?: unknown;
  completed?: unknown;
  total?: unknown;
}

export interface ExecutionOrderCompletionDisplay {
  value: number;
  label: string;
  isComplete: boolean;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function roundPercentage(value: number): number {
  return Math.round(clampPercentage(value) * 100) / 100;
}

export function getExecutionOrderCompletionDisplay(
  completion: ExecutionOrderCompletionSource | null | undefined,
): ExecutionOrderCompletionDisplay {
  const completed = finiteNumber(completion?.completed);
  const total = finiteNumber(completion?.total);

  if (completed !== null && total !== null) {
    const safeCompleted = Math.max(0, completed);
    const safeTotal = Math.max(0, total);
    const value = safeTotal > 0 ? roundPercentage((safeCompleted / safeTotal) * 100) : 0;

    return {
      value,
      label: `${safeCompleted} de ${safeTotal}`,
      isComplete: safeTotal > 0 ? safeCompleted >= safeTotal : safeCompleted === 0,
    };
  }

  const progress = finiteNumber(completion?.progress);
  if (progress !== null) {
    const value = roundPercentage(progress);
    return {
      value,
      label: `${value}%`,
      isComplete: value >= 100,
    };
  }

  return {
    value: 0,
    label: 'Progreso no disponible',
    isComplete: false,
  };
}
