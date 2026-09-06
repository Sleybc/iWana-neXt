import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockIssueStatus } from '@iwana/shared';

/**
 * Grupo de seriales de una línea de salida (MOD12 S2 · B2).
 *
 * Una fila por cada serial comprometido por la línea. La columna espejo
 * `issue_status` replica el estado de la cabecera y habilita el índice único
 * parcial `uq_stock_issue_line_serials_active_asset` (PostgreSQL no admite
 * predicados que referencien otras tablas); se sincroniza en las transiciones
 * a estado terminal (despacho y cancelación) dentro de la misma transacción.
 *
 * `ON DELETE CASCADE` desde `stock_issue_lines`: el reemplazo de líneas del
 * borrador (delete + reinsert) arrastra sus filas hijas sin pasos extra.
 * `ON DELETE RESTRICT` desde `stock_issues`: un borrado accidental de la
 * cabecera no debe liberar seriales comprometidos en silencio.
 */
@Index('idx_stock_issue_line_serials_line', ['lineId', 'createdAt'])
// S2.1 · B1: lectura por salida (`loadIssueSerials`) y espejo por salida
// (`syncSerialMirrorStatus`) — paridad con el DDL de la migración 126.
@Index('idx_stock_issue_line_serials_issue', ['tenantId', 'issueId'])
@Entity({ name: 'stock_issue_line_serials' })
export class StockIssueLineSerial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'line_id', type: 'uuid' })
  lineId: string;

  @Column({ name: 'issue_id', type: 'uuid' })
  issueId: string;

  @Column({
    name: 'issue_status',
    type: 'enum',
    enum: StockIssueStatus,
    enumName: 'stock_issue_status',
  })
  issueStatus: StockIssueStatus;

  @Column({ name: 'serialized_asset_id', type: 'uuid' })
  serializedAssetId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
