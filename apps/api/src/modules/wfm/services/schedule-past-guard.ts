import { BadRequestException } from '@nestjs/common';

export const SCHEDULE_PAST_NOT_ALLOWED_MESSAGE =
  'No se pueden agendar tareas en una fecha u hora anterior al momento actual';

export function assertScheduleStartNotInPast(
  scheduledStartAt: Date | string,
  referenceDate: Date = new Date(),
): void {
  const startMs = new Date(scheduledStartAt).getTime();

  if (!Number.isFinite(startMs)) {
    throw new BadRequestException('La fecha de inicio no es valida');
  }

  if (startMs < referenceDate.getTime()) {
    throw new BadRequestException(SCHEDULE_PAST_NOT_ALLOWED_MESSAGE);
  }
}
