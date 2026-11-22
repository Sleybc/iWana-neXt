import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { PlatformQueueSnapshot } from '@iwana/shared';

/**
 * Estado de una cola en el instante de la muestra. Solo conteos, sin datos de empresa.
 * Es el mismo tipo que expone el contrato P2 (`PlatformQueueSnapshot`, F3-D5): el API
 * devuelve la última muestra tal cual se guardó, así que no pueden divergir.
 */
export type PlatformHealthSampleQueue = PlatformQueueSnapshot;

/**
 * Muestra de salud de la plataforma (migración pública 034, PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3).
 * La escribe el muestreador del worker cada 5 min y la lee el módulo `health` del API.
 * Sin `tenant_id` ni datos de empresa. Retención: 35 días, la aplica el mismo muestreador.
 */
@Entity({ schema: 'public', name: 'platform_health_samples' })
@Index('idx_platform_health_samples_sampled_at', ['sampledAt'])
export class PlatformHealthSample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sampled_at', type: 'timestamptz' })
  sampledAt: Date;

  /** `null` = el API no se midió (sin `API_INTERNAL_URL`): no cuenta como muestra. */
  @Column({ name: 'api_ok', type: 'boolean', nullable: true })
  apiOk: boolean | null;

  @Column({ name: 'db_ok', type: 'boolean' })
  dbOk: boolean;

  @Column({ name: 'redis_ok', type: 'boolean' })
  redisOk: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  queues: PlatformHealthSampleQueue[];
}
