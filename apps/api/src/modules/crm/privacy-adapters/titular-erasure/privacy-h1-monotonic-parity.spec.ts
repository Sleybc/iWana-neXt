import {
  CONTRACT_COMMERCIAL_RULES,
  CONTRACT_FISCAL_RULES,
  CONTRACT_LOCATION_RULES,
  CRM_RULES,
} from './crm-titular-erasure.participant';
import { PRIVACY_H1_MONOTONIC_CATALOG } from '../../../../../../../packages/database/src/migrations/tenant/178_privacy_erasure_monotonic_log';
import type { FieldRule } from './titular-erasure-sql';

const SNAPSHOT_COLUMNS = ['vat_snapshot', 'plan_snapshot_json'];

function normalizeRule(rule: FieldRule): {
  column: string;
  kind: string;
  marker: string | undefined;
  fallback: string | undefined;
} {
  return {
    column: rule.column,
    kind: rule.kind,
    marker: rule.marker,
    fallback: rule.notNullFallback,
  };
}

function catalogKey(entry: { column: string; kind: string; marker?: string | undefined }): string {
  return `${entry.column}|${entry.kind}|${entry.marker ?? ''}`;
}

describe('H-1 CA-H1-04 — paridad del catálogo monótono con las reglas del borrado', () => {
  it('cubre exactamente las tres tablas de la 169', () => {
    expect(Object.keys(PRIVACY_H1_MONOTONIC_CATALOG).sort()).toEqual([
      'contracts',
      'expediente_records',
      'subscribers',
    ]);
  });

  it('subscribers coincide con CRM_RULES[subscribers]', () => {
    const rules = (CRM_RULES['subscribers'] ?? []).map(normalizeRule);
    const catalog = PRIVACY_H1_MONOTONIC_CATALOG['subscribers'] ?? [];
    expect(catalog.map((entry) => entry.column).sort()).toEqual(
      rules.map((rule) => rule.column).sort(),
    );
    for (const rule of rules) {
      const entry = catalog.find((item) => item.column === rule.column);
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe(rule.kind);
      expect(entry?.marker).toBe(rule.marker);
      expect(entry?.notNullFallback).toBe(rule.fallback);
    }
    expect(catalog.map(catalogKey).sort()).toEqual(
      rules
        .map((rule) => catalogKey({ column: rule.column, kind: rule.kind, marker: rule.marker }))
        .sort(),
    );
  });

  it('expediente_records coincide con CRM_RULES[expediente_records]', () => {
    const rules = (CRM_RULES['expediente_records'] ?? []).map(normalizeRule);
    const catalog = PRIVACY_H1_MONOTONIC_CATALOG['expediente_records'] ?? [];
    expect(catalog.map((entry) => entry.column).sort()).toEqual(
      rules.map((rule) => rule.column).sort(),
    );
    for (const rule of rules) {
      const entry = catalog.find((item) => item.column === rule.column);
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe(rule.kind);
      expect(entry?.marker).toBe(rule.marker);
      expect(entry?.notNullFallback).toBe(rule.fallback);
    }
  });

  it('contracts coincide con LOCATION + FISCAL + COMMERCIAL más snapshots', () => {
    const rules = [
      ...CONTRACT_LOCATION_RULES,
      ...CONTRACT_FISCAL_RULES,
      ...CONTRACT_COMMERCIAL_RULES,
    ].map(normalizeRule);
    const catalog = PRIVACY_H1_MONOTONIC_CATALOG['contracts'] ?? [];
    const catalogNonSnapshot = catalog.filter((entry) => !SNAPSHOT_COLUMNS.includes(entry.column));
    expect(catalogNonSnapshot.map((entry) => entry.column).sort()).toEqual(
      rules.map((rule) => rule.column).sort(),
    );
    for (const rule of rules) {
      const entry = catalogNonSnapshot.find((item) => item.column === rule.column);
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe(rule.kind);
      expect(entry?.marker).toBe(rule.marker);
    }
    for (const snapshot of SNAPSHOT_COLUMNS) {
      const entry = catalog.find((item) => item.column === snapshot);
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe('jsonb');
    }
  });

  it('ninguna tabla fuera de la 169 entra al catálogo', () => {
    const otherTables = Object.keys(CRM_RULES).filter(
      (table) => !['subscribers', 'expediente_records'].includes(table),
    );
    for (const table of otherTables) {
      expect(PRIVACY_H1_MONOTONIC_CATALOG[table]).toBeUndefined();
    }
  });
});
