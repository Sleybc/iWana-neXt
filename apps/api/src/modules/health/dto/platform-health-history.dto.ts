import { ApiProperty } from '@nestjs/swagger';
import type {
  PlatformHealthDay,
  PlatformHealthDayComponent,
  PlatformHealthHistory,
  PlatformQueueSnapshot,
} from '@iwana/shared';

/** Documentación OpenAPI del contrato P2 v1.0 (el tipo vive en `@iwana/shared`). */
export class PlatformHealthDayComponentDto implements PlatformHealthDayComponent {
  @ApiProperty({ description: 'Muestras del día para el componente.' })
  samples: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Muestras OK / muestras del día (0..1); null si samples = 0 (sin dato).',
  })
  availability: number | null;
}

export class PlatformHealthDayComponentsDto {
  @ApiProperty({ type: PlatformHealthDayComponentDto })
  api: PlatformHealthDayComponentDto;

  @ApiProperty({ type: PlatformHealthDayComponentDto })
  db: PlatformHealthDayComponentDto;

  @ApiProperty({ type: PlatformHealthDayComponentDto })
  redis: PlatformHealthDayComponentDto;
}

export class PlatformHealthDayDto implements PlatformHealthDay {
  @ApiProperty({ example: '2026-11-21', description: 'Día calendario America/Bogota.' })
  date: string;

  @ApiProperty({ type: PlatformHealthDayComponentsDto })
  components: PlatformHealthDayComponentsDto;
}

export class PlatformQueueSnapshotDto implements PlatformQueueSnapshot {
  @ApiProperty({ description: 'Nombre técnico de la cola; la UI lo traduce.' })
  name: string;

  @ApiProperty()
  waiting: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ type: Number, nullable: true, description: 'null si no hay trabajos en espera.' })
  oldestWaitingSeconds: number | null;
}

export class PlatformHealthHistoryDto implements PlatformHealthHistory {
  @ApiProperty({ type: [PlatformHealthDayDto], description: '30 días, del más antiguo al actual.' })
  days: PlatformHealthDayDto[];

  @ApiProperty({ type: [PlatformQueueSnapshotDto], description: 'Colas de la última muestra.' })
  queues: PlatformQueueSnapshotDto[];

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  queuesSampledAt: string | null;

  @ApiProperty({ format: 'date-time' })
  generatedAt: string;
}

export class PlatformHealthHistoryResponseDto {
  @ApiProperty({ type: PlatformHealthHistoryDto })
  data: PlatformHealthHistoryDto;
}
