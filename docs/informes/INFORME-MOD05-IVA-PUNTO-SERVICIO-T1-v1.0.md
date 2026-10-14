# Informe T1 — Motor canónico de IVA por punto de servicio

**Fecha:** 2026-10-12  
**Versión:** 1.0  
**Estado:** DONE  
**Contrato:** C-TAX-1 v1.0, sin cambios  
**Referencias:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) · [Plan de orquestación](../plans/2026-10-12-mod05-iva-punto-servicio.md) · [Prompt de ejecución](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.0.md)

## Entrega

Se publicaron `VatConcept`, `NetworkType`, `ServiceUsage`, `VatLegalBasis`, `InternetVatInput` e `InternetVatResult` desde `@iwana/shared`. En Taxation se añadió `IInternetVatResolverPort`, su adaptador registrado y exportado por `TaxationModule`, y `resolveInternetVat`, una función pura sin persistencia ni I/O.

El resolver exige estrato entero entre 1 y 6 cuando se proporciona y rechaza uso residencial sin estrato. Aplica el beneficio únicamente a internet fijo residencial con soporte: estratos 1–2 exentos (ET 481 lit. h), estrato 3 excluido (ET 476 num. 7); los demás casos canónicos quedan al 19 % (ET 468). Equipos en arriendo, servicios independientes y televisión mantienen `requiresAccountantReview: true`; telefonía retorna `NOT_CANONICAL`.

Rutas entregadas:

- `packages/shared/src/enums/taxation/{vat-concept,network-type,service-usage,vat-legal-basis}.enum.ts`
- `packages/shared/src/enums/taxation/internet-vat.types.ts` y `packages/shared/src/enums/taxation/index.ts`
- `packages/shared/src/enums/taxation/internet-vat.contract.spec.ts`
- `apps/api/src/modules/taxation/services/internet-vat-resolver.ts`
- `apps/api/src/modules/taxation/ports/internet-vat-resolver.{port,adapter}.ts`
- `apps/api/src/modules/taxation/taxation.module.ts`
- `apps/api/src/modules/taxation/tests/internet-vat-resolver.spec.ts`

## Evidencia

La tabla parametrizada genera **392/392 combinaciones**: 7 conceptos × 2 redes × 2 usos × 7 valores de estrato (null y 1–6) × 2 estados de soporte. Se añadieron cinco casos de estrato numérico inválido. La corrida focal obtuvo **397 tests pasados** y **100 %** en statements, branches, functions y lines del resolver.

Gate requerido, ejecutado sin caché:

```text
pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --force
Tasks: 5 successful, 5 total
Cached: 0 cached, 5 total
```

- `@iwana/api`: **330 suites pasadas**, 4 omitidas; **4.639 tests pasados**, 15 omitidos.
- `@iwana/shared`: **12 suites pasadas**; **139 tests pasados**.
- Total directo: **342 suites pasadas**, 4 omitidas; **4.778 tests pasados**, 15 omitidos; cero fallos.
- `pnpm --filter @iwana/shared typecheck` y `pnpm --filter @iwana/api typecheck`: correctos.
- Lint de `@iwana/shared` y ESLint focal de los archivos API de T1: correctos.

La prueba se escribió antes de implementar el resolver y falló inicialmente por la ausencia del módulo importado; después pasó completa.

### Verificación adicional tras revisión de deriva de contrato

Se fijaron en `@iwana/shared` los literales exactos de los cuatro enums C-TAX-1 y se añadieron las notas semánticas/cautelas del prompt a `VatConcept`; no cambiaron valores ni lógica. La corrida focal posterior pasó **1 suite y 4 tests**:

```text
pnpm --filter @iwana/shared exec jest src/enums/taxation/internet-vat.contract.spec.ts --runInBand
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

Prettier y ESLint focal también pasaron. La corrida fresca del gate completo posterior a este delta terminó con **5/5 tareas exitosas y 0 en caché**.

## Deuda nueva por severidad

- **Crítica:** 0
- **Alta:** 0
- **Media:** 0
- **Baja:** 0

No se introdujo deuda nueva ni se modificó el contrato congelado. Los conceptos que ADR-093 deja pendientes de dictamen conservan la marca de revisión contable prevista por C-TAX-1.
