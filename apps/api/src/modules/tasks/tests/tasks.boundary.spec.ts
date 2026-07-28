/**
 * Pruebas de boundary MOD11 (tasks).
 *
 * Verifican que el módulo tasks no viola los boundaries del modulith
 * importando entidades de otros módulos directamente.
 *
 * ADR-068 — Sincronización de OT de ejecución y proyecciones operativas
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readTasksSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readTasksSources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [readFileSync(path, 'utf8')]
      : [];
  });
}

describe('TasksModule — Boundaries (P0-3)', () => {
  it('rechaza imports, repositorios y entidades de Inventory dentro de Tasks', () => {
    const sources = readTasksSources(join(__dirname, '..'));
    const source = sources.join('\n');

    expect(source).not.toMatch(
      /from\s+['"][^'"]+\/inventory\/(?!ports\/|inventory\.module)[^'"]+['"]|import\s*\{[^}]*\bInventory(?:Item|Category|Movement|Repository)\b[^}]*\}\s*from\s*['"]@iwana\/db['"]/s,
    );
    expect(source).not.toMatch(/@InjectRepository\s*\(\s*Inventory/);
    expect(source).not.toMatch(/Repository\s*<\s*Inventory/);
  });

  it('EvidenceAssetProvider usa DataSource en vez de InjectRepository', () => {
    // EvidenceAssetProvider debe usar @InjectDataSource() para obtener
    // el repositorio de MediaAsset, no @InjectRepository(), para no
    // requerir que MediaAsset esté registrado en TypeOrmModule.forFeature
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../../media/evidence-asset.provider.ts'),
      'utf8',
    );

    // Debe usar InjectDataSource, no InjectRepository
    expect(source).toContain('InjectDataSource');
    // El import de MediaAsset como type está permitido (el adapter conoce la entidad)
    expect(source).not.toContain("from '@nestjs/typeorm';\nimport { Repository }");
  });

  it('tasks.module.ts no registra MediaAsset en TypeOrmModule.forFeature', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../tasks.module.ts'),
      'utf8',
    );

    // MediaAsset no debe aparecer en TypeOrmModule.forFeature del módulo tasks
    const forFeatureMatch = source.match(/TypeOrmModule\.forFeature\(\[([^\]]+)\]\)/);
    expect(forFeatureMatch).not.toBeNull();
    const entitiesInForFeature = forFeatureMatch![1];
    expect(entitiesInForFeature).not.toContain('MediaAsset');
  });
});
