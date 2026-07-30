# Informe — Cierre de bloqueos portal/E2E R1

**Versión:** 1.0
**Estado:** Implementación verificada en perímetro frontend
**Fecha:** 2026-07-30
**Owner:** AI-FE-PLATFORM
**Alcance:** `apps/portal`, `packages/ui` y E2E del flujo Agenda → OT → inventario

## 1. Cambios realizados

- `OperationsClient` normaliza colecciones planas y respuestas paginadas `{ data, meta }` antes de entregarlas al drawer para actividades y consumos.
- Un fallo al cargar versiones de plantilla conserva la OT seleccionada, deja la plantilla en `null` y bloquea explícitamente el cierre.
- El estado sin permiso retorna solo la alerta informativa; no renderiza resumen ni datos de la OT.
- `OperationalSidePeek` anuncia `aria-busy`, muestra «Procesando…» durante una operación y usa un cierre de al menos 44 × 44 px con `Button`.
- Se corrigieron estados oscuros de errores y labels operativos sin introducir tokens nuevos.
- El E2E usa el contrato actual (`site`, plantilla/version, `schedule`, respuestas paginadas y evidencias `{ data, meta }`) y verifica Agenda → OT con una sola CTA «Abrir OT».
- Se cargan ítems y custodias desde los clientes de inventario existentes para que el formulario use selecciones autorizadas; no se añadieron endpoints.

## 2. Restricciones respetadas

- No se modificaron backend, `@iwana/shared` ni OpenAPI.
- No se añadieron dependencias ni primitives nuevas.
- No se duplicaron CTAs de apertura ni lógica de presentación fuera de los componentes existentes.

## 3. Evidencia

| Verificación | Resultado |
| --- | --- |
| Tests focalizados de Operaciones y `@iwana/ui` | 3 suites, 103 tests aprobados |
| E2E `portal-field-flow-ticket-ot-inventory.spec.ts` | 2 tests aprobados |
| Typecheck `@iwana/portal` | Aprobado |
| Typecheck `@iwana/ui` | Aprobado |
| Lint `@iwana/portal` | 0 errores; warnings preexistentes |
| Auditoría mecánica de identidad UI | Sin hallazgos |

La suite completa del monorepo no forma parte de esta verificación focalizada.
