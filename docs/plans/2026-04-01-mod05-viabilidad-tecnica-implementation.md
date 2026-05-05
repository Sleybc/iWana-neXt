# MOD05 Viabilidad Técnica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Resumen de la Meta

**Meta:** Reemplazar la captura libre de viabilidad técnica del expediente CRM por un flujo estructurado con resultado controlado, tecnologías candidatas, tecnología recomendada, certeza, fuente de evaluación y observación técnica.

**Arquitectura:** La implementación se divide en seis capas pequeñas: enums y contratos compartidos, migración tenant, persistencia y reglas backend, cálculo de completitud, portal tenant-aware y pruebas/documentación. Se conserva `availableTechnology` como tecnología recomendada final y se agregan campos explícitos para `candidateTechnologies`, `technicalConfidence` y `evaluationSource`.

**Pila Tecnológica:** NestJS 11, TypeORM 0.3.x, PostgreSQL multi-tenant por schema, Next.js App Router, TypeScript estricto, pnpm, Jest, Playwright.

---

### Tareas de Configuración

**Archivos:**

- Create: `packages/shared/src/enums/crm/technical-viability-result.enum.ts`
- Create: `packages/shared/src/enums/crm/technology-option.enum.ts`
- Create: `packages/shared/src/enums/crm/technical-confidence.enum.ts`
- Create: `packages/shared/src/enums/crm/evaluation-source.enum.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `pnpm --filter @iwana/portal typecheck`

---

### Task 1: Definir catálogos compartidos y exportarlos

**Archivos:**

- Create: `packages/shared/src/enums/crm/technical-viability-result.enum.ts`
- Create: `packages/shared/src/enums/crm/technology-option.enum.ts`
- Create: `packages/shared/src/enums/crm/technical-confidence.enum.ts`
- Create: `packages/shared/src/enums/crm/evaluation-source.enum.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `pnpm --filter @iwana/portal typecheck`

- [ ] **Step 1: Crear enum del resultado técnico**

```ts
export enum TechnicalViabilityResult {
  VIABLE = 'VIABLE',
  VALIDATION_REQUIRED = 'VALIDATION_REQUIRED',
  NOT_VIABLE = 'NOT_VIABLE',
}
```

- [ ] **Step 2: Crear enum de tecnologías**

```ts
export enum TechnologyOption {
  FIBER = 'FIBER',
  RADIO = 'RADIO',
  SATELLITE = 'SATELLITE',
  NETWORK_EXPANSION = 'NETWORK_EXPANSION',
  COVERAGE_REINFORCEMENT = 'COVERAGE_REINFORCEMENT',
}
```

- [ ] **Step 3: Crear enums de certeza y fuente**

```ts
export enum TechnicalConfidence {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum EvaluationSource {
  MAP = 'MAP',
  COMMERCIAL_REFERENCE = 'COMMERCIAL_REFERENCE',
  CUSTOMER_CALL = 'CUSTOMER_CALL',
  TECHNICAL_SITE_VISIT = 'TECHNICAL_SITE_VISIT',
}
```

- [ ] **Step 4: Exportar los nuevos enums en el barrel**

```ts
export * from './enums/crm/technical-viability-result.enum';
export * from './enums/crm/technology-option.enum';
export * from './enums/crm/technical-confidence.enum';
export * from './enums/crm/evaluation-source.enum';
```

- [ ] **Step 5: Ejecutar typecheck rápido del portal para validar imports compartidos**

Run: `pnpm --filter @iwana/portal typecheck`
Expected: `tsc --noEmit` termina sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/enums/crm packages/shared/src/index.ts
git commit -m "feat: add technical viability shared enums"
```

---

### Task 2: Agregar columnas tenant para viabilidad técnica estructurada

**Archivos:**

- Create: `packages/database/src/migrations/tenant/006_add_expediente_technical_viability_fields.ts`
- Modify: `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts`
- Test: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts`

- [ ] **Step 1: Escribir la migración tenant reversible**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpedienteTechnicalViabilityFields1700000000006 implements MigrationInterface {
  name = 'AddExpedienteTechnicalViabilityFields1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS candidate_technologies JSONB,
      ADD COLUMN IF NOT EXISTS technical_confidence VARCHAR(20),
      ADD COLUMN IF NOT EXISTS evaluation_source VARCHAR(30)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS evaluation_source,
      DROP COLUMN IF EXISTS technical_confidence,
      DROP COLUMN IF EXISTS candidate_technologies
    `);
  }
}
```

- [ ] **Step 2: Mapear las nuevas columnas en la entidad del expediente**

```ts
@Column({ type: 'jsonb', name: 'candidate_technologies', nullable: true })
candidateTechnologies: string[] | null;

@Column({ type: 'varchar', length: 20, name: 'technical_confidence', nullable: true })
technicalConfidence: string | null;

@Column({ type: 'varchar', length: 30, name: 'evaluation_source', nullable: true })
evaluationSource: string | null;
```

- [ ] **Step 3: Verificar que no se rompa el shape actual del expediente**

Run: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts`
Expected: La suite puede fallar por tests aún no actualizados, pero no debe fallar por error de compilación de la entidad.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/migrations/tenant/006_add_expediente_technical_viability_fields.ts apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts
git commit -m "feat: add technical viability fields to expediente"
```

---

### Task 3: Actualizar persistencia y reglas del backend

**Archivos:**

- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/completeness-calculator.service.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts`

- [ ] **Step 1: Ajustar `buildSectionUpdate()` para `TECHNICAL_FEASIBILITY`**

```ts
case ExpedienteSection.TECHNICAL_FEASIBILITY:
  if ('coverageResult' in data) {
    result.coverageResult = this.normalizeOptionalEnum(data.coverageResult);
  }
  if ('feasibility' in data) {
    result.feasibility = this.normalizeOptionalEnum(data.feasibility);
  }
  if ('availableTechnology' in data) {
    result.availableTechnology = this.normalizeOptionalEnum(data.availableTechnology);
  }
  if ('candidateTechnologies' in data) {
    result.candidateTechnologies = this.parseStringArray(data.candidateTechnologies);
  }
  if ('technicalConfidence' in data) {
    result.technicalConfidence = this.normalizeOptionalEnum(data.technicalConfidence);
  }
  if ('evaluationSource' in data) {
    result.evaluationSource = this.normalizeOptionalEnum(data.evaluationSource);
  }
  if ('technicalObservations' in data) {
    result.technicalObservations = this.normalizeOptionalText(data.technicalObservations);
  }
  break;
```

- [ ] **Step 2: Agregar helpers mínimos para arrays y enums opcionales**

```ts
private parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item) => String(item).trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

private normalizeOptionalEnum(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

private normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? this.sanitizePlainText(normalized) : null;
}
```

- [ ] **Step 3: Mantener validaciones por estado técnico en el servicio**

```ts
if (result.feasibility === TechnicalViabilityResult.VIABLE && !result.availableTechnology) {
  throw new BadRequestException({
    code: 'TECHNOLOGY_RECOMMENDATION_REQUIRED',
    message: 'La tecnologia recomendada es obligatoria cuando la viabilidad es viable.',
  });
}
```

Agregar reglas equivalentes para `VALIDATION_REQUIRED` y `NOT_VIABLE` según la spec.

- [ ] **Step 4: Ajustar `CompletenessCalculator` en fase inicial sin romper PRD**

```ts
const technical = Math.max(
  this.calculateTechnical(expediente, coverageChecks),
  this.calculateTechnicalFromStructuredFields(expediente),
);
```

Y crear un helper como:

```ts
private calculateTechnicalFromStructuredFields(expediente: ExpedienteRecord): number {
  let score = 0;
  let total = 4;

  if (expediente.feasibility) score++;
  if (expediente.availableTechnology) score++;
  if (expediente.evaluationSource) score++;
  if (expediente.technicalConfidence || expediente.technicalObservations) score++;

  return Math.round((score / total) * 100);
}
```

- [ ] **Step 5: Ejecutar pruebas backend focalizadas**

Run: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts`
Expected: FAIL inicial por casos no cubiertos todavía.

Run: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts`
Expected: FAIL inicial o assertions desactualizados sobre completitud técnica.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/crm/expedientes/expediente.service.ts apps/api/src/modules/crm/expedientes/completeness-calculator.service.ts

git commit -m "feat: persist structured technical viability data"
```

---

### Task 4: Cubrir backend con tests de regresión

**Archivos:**

- Modify: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- Modify: `apps/api/src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts`

- [ ] **Step 1: Agregar test de persistencia para resultado técnico viable**

```ts
it('persiste viabilidad tecnica estructurada con tecnologias candidatas y recomendada', async () => {
  const updated = await service.updateSection(
    'exp-1',
    {
      section: ExpedienteSection.TECHNICAL_FEASIBILITY,
      data: {
        feasibility: TechnicalViabilityResult.VIABLE,
        candidateTechnologies: [TechnologyOption.RADIO, TechnologyOption.COVERAGE_REINFORCEMENT],
        availableTechnology: TechnologyOption.RADIO,
        technicalConfidence: TechnicalConfidence.MEDIUM,
        evaluationSource: EvaluationSource.TECHNICAL_SITE_VISIT,
        technicalObservations: 'Se confirma visibilidad parcial con refuerzo de cobertura.',
      },
    },
    'actor-1',
  );

  expect(updated.feasibility).toBe(TechnicalViabilityResult.VIABLE);
  expect(updated.candidateTechnologies).toEqual([
    TechnologyOption.RADIO,
    TechnologyOption.COVERAGE_REINFORCEMENT,
  ]);
});
```

- [ ] **Step 2: Agregar test de validación para `VALIDATION_REQUIRED`**

```ts
it('exige observacion tecnica cuando la viabilidad requiere validacion tecnica', async () => {
  await expect(
    service.updateSection(
      'exp-1',
      {
        section: ExpedienteSection.TECHNICAL_FEASIBILITY,
        data: {
          feasibility: TechnicalViabilityResult.VALIDATION_REQUIRED,
          candidateTechnologies: [TechnologyOption.RADIO],
          technicalConfidence: TechnicalConfidence.LOW,
          evaluationSource: EvaluationSource.MAP,
        },
      },
      'actor-1',
    ),
  ).rejects.toThrow(BadRequestException);
});
```

- [ ] **Step 3: Agregar test del cálculo técnico estructurado**

```ts
it('eleva la completitud tecnica cuando existen campos estructurados visibles', async () => {
  mockFindOne.mockResolvedValue({
    ...baseExpediente,
    feasibility: TechnicalViabilityResult.VIABLE,
    availableTechnology: TechnologyOption.FIBER,
    technicalConfidence: TechnicalConfidence.HIGH,
    evaluationSource: EvaluationSource.TECHNICAL_SITE_VISIT,
  });

  const result = await service.calculate('exp-1');
  expect(result.technical).toBeGreaterThan(0);
});
```

- [ ] **Step 4: Ejecutar ambas suites hasta dejarlas en verde**

Run: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts`
Expected: PASS.

Run: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts apps/api/src/modules/crm/expedientes/tests/completeness-calculator.service.spec.ts
git commit -m "test: cover structured technical viability rules"
```

---

### Task 5: Actualizar contrato del portal y rediseñar la sección técnica

**Archivos:**

- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/crm/expedientes/expediente-ui.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Test: `pnpm --filter @iwana/portal typecheck`

- [ ] **Step 1: Extender `ExpedienteRecord` del portal**

```ts
feasibility?: TechnicalViabilityResult | null;
availableTechnology?: TechnologyOption | null;
candidateTechnologies?: TechnologyOption[] | null;
technicalConfidence?: TechnicalConfidence | null;
evaluationSource?: EvaluationSource | null;
technicalObservations?: string | null;
```

- [ ] **Step 2: Declarar catálogos UI en `expediente-ui.ts`**

```ts
export const TECHNICAL_VIABILITY_OPTIONS = [
  { value: TechnicalViabilityResult.VIABLE, label: 'Viable' },
  { value: TechnicalViabilityResult.VALIDATION_REQUIRED, label: 'Validación técnica requerida' },
  { value: TechnicalViabilityResult.NOT_VIABLE, label: 'No viable' },
] as const;
```

Agregar arreglos equivalentes para tecnologías, certeza y fuente.

- [ ] **Step 3: Ampliar `FIELD_LABELS`, `FIELD_PLACEHOLDERS` y `buildDraftValues()`**

```ts
candidateTechnologies: 'Tecnologías candidatas',
availableTechnology: 'Tecnología recomendada',
technicalConfidence: 'Nivel de certeza',
evaluationSource: 'Fuente de evaluación',
technicalObservations: 'Observación técnica',
```

```ts
candidateTechnologies: expediente.candidateTechnologies ?? [],
availableTechnology: expediente.availableTechnology ?? EMPTY_VALUE,
technicalConfidence: expediente.technicalConfidence ?? EMPTY_VALUE,
evaluationSource: expediente.evaluationSource ?? EMPTY_VALUE,
technicalObservations: expediente.technicalObservations ?? EMPTY_VALUE,
```

- [ ] **Step 4: Redefinir la sección `technical_feasibility`**

```ts
renderFields: [
  'feasibility',
  'candidateTechnologies',
  'availableTechnology',
  'technicalConfidence',
  'evaluationSource',
  'technicalObservations',
],
payloadFields: [
  'feasibility',
  'candidateTechnologies',
  'availableTechnology',
  'technicalConfidence',
  'evaluationSource',
  'technicalObservations',
],
completionFields: [
  'feasibility',
  'availableTechnology',
  'technicalConfidence',
  'evaluationSource',
],
```

- [ ] **Step 5: Renderizar checkboxes y selects condicionados**

```tsx
{
  field === 'candidateTechnologies' ? (
    <div className="space-y-3">
      {TECHNOLOGY_OPTIONS.map((option) => (
        <label key={option.value} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selectedCandidateTechnologies.includes(option.value)}
            onChange={() => handleCandidateTechnologyToggle(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  ) : null;
}
```

- [ ] **Step 6: Ajustar `handleSaveSection()` para enviar arrays y reglas por estado**

```ts
if (field === 'candidateTechnologies') {
  accumulator[field] = selectedCandidateTechnologies;
  return accumulator;
}
```

Y validar en cliente:

```ts
if (
  section === 'technical_feasibility' &&
  draftValues.feasibility === TechnicalViabilityResult.VIABLE &&
  !draftValues.availableTechnology
) {
  throw new Error('La tecnología recomendada es obligatoria cuando la viabilidad es viable.');
}
```

- [ ] **Step 7: Ejecutar typecheck del portal hasta dejarlo en verde**

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/portal/src/lib/api-client.ts apps/portal/src/components/crm/expedientes/expediente-ui.ts apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx
git commit -m "feat: redesign technical feasibility section in portal"
```

---

### Task 6: Cubrir flujo E2E y actualizar informe vivo

**Archivos:**

- Modify: `e2e/tests/portal-crm-expedientes.spec.ts`
- Modify: `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`

- [ ] **Step 1: Agregar fixture E2E con nuevos campos técnicos**

```ts
feasibility: 'VALIDATION_REQUIRED',
candidateTechnologies: ['RADIO', 'COVERAGE_REINFORCEMENT'],
availableTechnology: null,
technicalConfidence: 'LOW',
evaluationSource: 'MAP',
technicalObservations: 'Mapa sin cobertura concluyente; requiere visita técnica.',
```

- [ ] **Step 2: Agregar caso E2E del flujo rural**

```ts
test('CRM permite registrar viabilidad tecnica rural con validacion requerida y refuerzo de cobertura', async ({
  page,
}) => {
  await page.goto('/dashboard/crm/expedientes/exp-001');
  await page.getByRole('button', { name: /viabilidad técnica/i }).click();
  await page.getByLabel('Resultado de viabilidad').selectOption('VALIDATION_REQUIRED');
  await page.getByLabel('Fibra óptica').uncheck();
  await page.getByLabel('Radio enlace').check();
  await page.getByLabel('Refuerzo de cobertura').check();
  await page.getByLabel('Nivel de certeza').selectOption('LOW');
  await page.getByLabel('Fuente de evaluación').selectOption('MAP');
  await page
    .getByLabel('Observación técnica')
    .fill('El mapa no confirma cobertura, se requiere validación técnica en sitio.');
  await page.getByRole('button', { name: /guardar sección/i }).click();
  await expect(page.getByText(/sección actualizada correctamente/i)).toBeVisible();
});
```

- [ ] **Step 3: Agregar caso E2E de estado viable con tecnología recomendada**

```ts
test('CRM exige tecnologia recomendada cuando la viabilidad es viable', async ({ page }) => {
  await page.goto('/dashboard/crm/expedientes/exp-001');
  await page.getByRole('button', { name: /viabilidad técnica/i }).click();
  await page.getByLabel('Resultado de viabilidad').selectOption('VIABLE');
  await page.getByLabel('Radio enlace').check();
  await page.getByRole('button', { name: /guardar sección/i }).click();
  await expect(page.getByText(/tecnología recomendada es obligatoria/i)).toBeVisible();
});
```

- [ ] **Step 4: Ejecutar la suite E2E focalizada**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 5: Actualizar el informe vivo con implementación y evidencia**

Agregar una sección nueva con:

```md
### 19. Refinamiento de viabilidad técnica estructurada (2026-04-01)

- resultado técnico con catálogo controlado;
- tecnologías candidatas y recomendada;
- soporte explícito a `Refuerzo de cobertura`;
- reglas diferenciadas para `Viable`, `Validación técnica requerida` y `No viable`;
- evidencia backend, portal y E2E.
```

- [ ] **Step 6: Commit**

```bash
git add e2e/tests/portal-crm-expedientes.spec.ts docs/informes/INFORME-MOD05-DEFINICION-v1.0.md
git commit -m "test: cover structured technical feasibility flow"
```

---

## Self-Review

- Cobertura de spec: el plan cubre catálogo controlado, tecnologías candidatas, tecnología recomendada, certeza, fuente, observación, completitud visible, persistencia backend, migración tenant y evidencia E2E.
- Placeholder scan: no quedan `TBD`, `TODO` ni referencias abiertas a “similar a tarea N”.
- Consistencia de tipos: `TechnicalViabilityResult`, `TechnologyOption`, `TechnicalConfidence` y `EvaluationSource` se usan de forma consistente en shared, backend y portal.
