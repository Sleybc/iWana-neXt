# PROMPT DE EJECUCIÓN — MOD05/MOD06/MOD07 · IVA de internet por punto de servicio (ADR-093)

**Version:** 1.3 — **superado** el 2026-10-12 por [v1.4](PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.4.md) (bloqueo de T11 resuelto); sus §1–§3 siguen siendo fuente
**Estado:** Emitido — G4 vigente
**Fecha:** 2026-10-12
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Plan:** [2026-10-12-mod05-iva-punto-servicio.md](../plans/2026-10-12-mod05-iva-punto-servicio.md) v1.4

## 0. Estado del cierre (Ola 3)

| Revisión | Veredicto | Disposición AI-EM-ARCH |
| --- | --- | --- |
| T7 `sec-eng` | NO-GO por **S-T7-01** (crítico) | Confirmado en código y **ampliado**, ver §1 → T11 y T12 |
| T8 `sr-qa` | GO | API 337 suites / 4.730 tests; portal 294 / 2.961; integración 13/13; cobertura por carpeta ≥ 80 % en statements y branches. **Nota:** en `crm/contracts`, sin la integración, branches queda en 75,43 %; se acepta porque la integración corre en CI. T11 añade tests unitarios de ramas al tocar ese módulo |
| `boundary-reviewer` | GO | — |
| `contract-drift-reviewer` | GO con menores | Tipo del helper de creación directa y diferencia de validación de `planId` → T11 |
| `gate-verifier` | NO-GO por «No PII in logs» | Misma causa que S-T7-01 |
| `docs-governance` | GO con menor | Estado del informe T5: **corregido por AI-EM-ARCH** |

**No re-despachar T1–T10.**

## 1. S-T7-01 ampliado: la causa raíz es transversal

T7 lo describió en `/service-point`. Verificado en el código:
- `AUDIT_PII_KEY_SUFFIX_PATTERN` (`apps/api/src/modules/audit/audit-sanitize.policy.ts:94-95`) **no cubre `fiscal_document` ni `fiscal_name`**. `fiscal_address` sí queda cubierto, por el sufijo `address`.
- `Contract` expone `fiscalName`, `fiscalDocument` y `fiscalAddress` (`contract.entity.ts:101-107`).
- **Todo** endpoint de escritura de contratos que devuelve el contrato completo (crear, crear desde expediente, editar, `/service-point`, soporte, activar, suspender, reactivar, terminar, archivar) pasa por el `AuditInterceptor` global con `response.data`.

Por tanto, el documento fiscal, y el nombre fiscal de una persona natural, **pueden estar en `audit_logs` desde antes de esta fase**. Es un hallazgo de la regla «No PII in logs», no de ADR-093.

## 2. Bloques (en paralelo)

### T11 · `sr-backend` — Sanitizador y proyección segura

**Propiedad exclusiva:** `apps/api/src/modules/audit/audit-sanitize.policy.ts` y su spec, `apps/api/src/modules/crm/contracts/**`.

1. **Sanitizador** (transversal): añadir `fiscal_document` y `fiscal_name` al patrón. Nombres por sufijo, igual que hoy; la normalización camelCase → snake ya existe. Tests de las dos formas, `fiscalDocument` y `fiscal_document`, en payload anidado y en arreglo. **No** ampliar a un sufijo genérico `document` ni `name`: se ocultarían claves técnicas.
2. **Defensa en profundidad en contratos:** los endpoints de escritura de contratos declaran `@SkipAudit()` y registran un evento explícito por `AuditService` con identificadores, transición o nombres de campos cambiados. **Nunca** valores personales. Así se sigue el patrón ya usado en suscriptores (`subscribers.controller.ts`, SWEEP-01).
3. Los dos menores de `contract-drift-reviewer`: tipo del helper de creación directa y validación de `planId` alineada entre creación directa y desde expediente.
4. Tests unitarios de ramas en `crm/contracts`, para que la cobertura de branches no dependa de la integración.

**Fuera de alcance:** `audit.interceptor.ts` (solo la política), otros módulos, y borrar o modificar filas existentes de `audit_logs`.
**Stop/go:**
- `pnpm exec turbo run test --filter=@iwana/api --force` con conteo real.
- Un test de integración contra Postgres real: tras crear, activar y `/service-point` sobre un contrato con `fiscalDocument` y `fiscalName`, ninguna fila nueva de `audit_logs` contiene esos valores.
- `crm/contracts` ≥ 80 % de branches **sin** contar la integración.

### T12 · `data-eng` — Inventario de PII histórica en `audit_logs` (solo lectura)

**Propiedad exclusiva:** `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T12-v1.0.md` y un script de consulta de solo lectura en `scripts/` (no migración).

1. Contar por tenant las filas de `audit_logs` con `entity_type` de contrato cuyo `new_value` u `old_value` contenga `fiscalDocument`, `fiscal_document`, `fiscalName` o `fiscal_name` con valor no nulo. **Contar, nunca mostrar valores.** Solo en el entorno de desarrollo.
2. Proponer, **sin ejecutar**, la redacción de esas claves en las filas históricas. Describir la restricción de solo-anexar de `audit_logs` (RLS, PRD MOD01 RF-AUD-04) y qué hay que habilitar temporalmente.

La decisión de modificar un registro de auditoría de solo-anexar es del CTO.
**Stop/go:** informe con conteos por tenant y la propuesta. Ninguna escritura.

## 3. Re-verificación (tras T11 y T12)

- `sec-eng`: **solo** S-T7-01 contra el código, y lectura de la propuesta T12.
- `gate-verifier`: gate «No PII in logs» y suites sin caché.

Con ambos en GO → G6 de la fase y cierre de SUB-C03. La redacción histórica, si el CTO la aprueba, es una tarea operativa aparte que no bloquea G6: el defecto de código queda cerrado.

## 4. Deuda registrada (no bloquea G6)

| ID | Severidad | Dueño | Destino |
| --- | --- | --- | --- |
| S-T7-02 | Media | `sr-backend` | Fase D-PDF: el uso dedicado `STRATUM_EVIDENCE` permite verificar la pertenencia |
| S-T7-03 | Baja | `fe-platform` | Fase D-PDF: `accept` del portal |
| `installationNotes` texto libre en la auditoría de contratos | Media (posible PII en texto libre) | `sr-backend` + `sec-eng` | Lo cubre el paso 2 de T11, porque el evento explícito no incluye notas. Si queda otra ruta, deuda transversal |
