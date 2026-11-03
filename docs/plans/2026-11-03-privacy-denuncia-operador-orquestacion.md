# Plan de orquestación — `privacy` · Denuncia del operador (C-413 de 2025)

**Versión:** 1.0
**Estado:** Listo para lanzar. G0 del CTO el 2026-11-03
**Fecha:** 2026-11-03
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-03-privacy-suplantacion-denuncia-operador-spec.md](../specs/2026-11-03-privacy-suplantacion-denuncia-operador-spec.md) v1.0 · **Prompt:** [PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0](../prompts/PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0.md)
**Origen:** [consulta jurídica v1.1](../informes/INFORME-CONSULTA-JURIDICA-PROTECCION-DATOS-v1.1.md), preguntas 3(b) y 3(c). Se prepara antes del dictamen por orden del usuario, porque la Ley 2573 entra en vigor el 19-11-2026.

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-03 |
| --- | --- | --- |
| P1 | G0 del CTO (spec §7) | ✅ Aprobado el 2026-11-03 |
| P2 | Dictamen de las preguntas 3(b) y 3(c) | Pendiente. **No bloquea el arranque**: si cambia algo, se ajusta en una versión posterior. El 2026-11-03 llegó un texto generado por IA presentado como dictamen; se reclasificó como [borrador sin valor de dictamen](../informes/INFORME-PRIVACY-BORRADOR-POSICIONES-JURIDICAS-IA-v1.0.md) y **no cuenta** como aval de D-DO-1 a D-DO-3. Esas decisiones se sostienen en el G0 del CTO |
| P3 | `main` limpio en las rutas de B1, B2 y B3 | Se comprueba al lanzar |

### Estado tras la Ola 1 (2026-11-03): GO

- **B1:** el enum compartido tiene 4 tipos; la API crea las 4 tareas y valida la nota de 1 a 120 caracteres, sin saltos de línea; OpenAPI está actualizado. Shared: 1 suite, 8 tests. API: 3 suites, 59 tests.
- **B2:** migración `PrivacyDenunciaOperador1720000000172`, con `CHECK` de 4 tipos, backfill idempotente con conteo y un `down` que se bloquea si hay filas nuevas. PG: 2 tests; orden y sufijos: 9 tests.
- **B3:** mapas exhaustivos `Record<RequestTaskKind, …>`, ayuda de la nota según el tipo y badge «Comunicación tardía». Portal completo: 340 suites, 3.438 tests, 0 fallos; `audit-ui` sin hallazgos.
- **Para B4 y B5:** B1 solo corrió suites focales; la suite completa de la API la mide `gate-verifier` en B5. El backfill toma `impersonation_complaint_due_at` como vencimiento (columna `NOT NULL` en tareas): B4 comprueba que ninguna SUPLANTACION abierta lo tenga nulo.

### Estado tras las Olas 2 y 3 (2026-11-03): GO, con un ajuste menor

- **B4:** CA-DO-01, 08 y 09 en PASS. PG de privacidad: 6 suites y 27 tests; unitarias: 35 suites y 181 tests; E2E de Fase 1b: 5/5, todo sin omisiones. La única expectativa cambiada pasa de 2 a 4 tareas (categoría b). No hay ninguna SUPLANTACION abierta sin `impersonation_complaint_due_at`. La 172 se aplicó solo en `tenant_e2e_privacy_1b_a114bf06`, para la E2E.
- **B5:**
  - typecheck y lint de API, DB, shared y portal, sin errores;
  - unitarias completas: API 446/6.009, DB 78/426, shared 28/279 y portal 340/3.438, con 0 fallos;
  - integraciones de API 56/60, con las 4 omisiones del manifiesto; de DB, 49/49;
  - cobertura de `privacy/**`: 96,25 % de líneas y 85,19 % de ramas, sobre la base;
  - `sec-eng`, `boundary-reviewer` y `test-change-reviewer`, sin hallazgos.
- **Deriva menor:** el tipo local de la entidad de tareas tiene 2 valores en lugar de 4. Lo corrige B1-D (LAUNCH v1.2) antes del cierre.

### Cierre (2026-11-03): G6 GO

B1-D quedó corregido: la entidad usa un alias de `RequestTaskKind`, el typecheck da 0 y `privacy/**` pasa 35/181. Se emitieron el [informe de cierre](../informes/INFORME-PRIVACY-DENUNCIA-OPERADOR-CIERRE-v1.0.md) y el [HLD Privacy v1.4](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.4.md), aprobado por el CTO el 2026-11-03, que ordenó commit y push.

## 2. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · contrato y servicio | `sr-backend` | P1 | `packages/shared` (schema de privacidad) y `apps/api/.../privacy/requests` |
| B2 · migración 172 | `sr-backend` (2.ª instancia) | P1 | `packages/database/.../tenant` |
| B3 · portal | `fe-platform` | P1. El enum está congelado en la spec | `apps/portal/.../privacy` |
| B4 · PG, E2E y regresión | `sr-qa` | B1, B2 y B3 | Pruebas |
| B5 · verificación | `sec-eng`, `contract-drift-reviewer`, `test-change-reviewer` y `gate-verifier` | B4 | Solo lectura |

**Olas:** 1 = B1, B2 y B3 en paralelo; 2 = B4; 3 = B5. **Ruta crítica:** G0 → B1 → B4 → B5 → commit y push → G6.5 antes del 19-11.

## 3. Matriz agente × skill

| Bloque | Obligatorias | De apoyo | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `testing-patterns`, `iwana-test-evidence` | `typescript-expert` | `database-migration` (es de B2); las de UI |
| B2 | `iwana-tenant-migration`, `database-migration`, `postgresql`, `iwana-test-evidence` | — | — |
| B3 | `frontend-dev-guidelines`, `core-components`, `iwana-identity-ui-review`, `system-vocabulary-review` | `tailwind-patterns` | `ui-ux-pro-max` (no hay patrón visual nuevo) |
| B4 | `testing-patterns`, `e2e-testing-patterns`, `postgresql`, `iwana-test-evidence` | `systematic-debugging` | — |
| B5 `sec-eng` | `security-auditor` | — | — |

## Lanzamiento

Fuente: [`PROMPT-PRIVACY-DENUNCIA-OPERADOR-LAUNCH-v1.0.md`](../prompts/PROMPT-PRIVACY-DENUNCIA-OPERADOR-LAUNCH-v1.0.md). **El archivo prevalece si divergen.**
