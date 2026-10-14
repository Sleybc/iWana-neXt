# INFORME MOD05 — T11 Sanitizador y auditoría explícita

**Versión:** 1.0 · **Fecha:** 2026-10-12 · **Bloque:** T11 — AI-SR-FULL  
**Estado:** **CERRADO — evidencia verde**  
**Fuentes:** [plan MOD05 v1.5](../plans/2026-10-12-mod05-iva-punto-servicio.md), [prompt MOD05 v1.4](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.4.md), [hallazgo S-T7-01](INFORME-MOD05-IVA-PUNTO-SERVICIO-T7-v1.0.md).

## Resultado

T11 cerró S-T7-01 en nuevas escrituras: el sanitizador reconoce los nombres fiscales específicos y las escrituras de contratos omiten la auditoría automática de respuestas completas. Cada escritura registra un evento acotado con IDs, transición o nombres de campos cambiados; los eventos no almacenan valores fiscales ni `installationNotes`.

La corrección del tipo `contractsApi.create` queda fuera de T11 y pasa al bloque P3 de D-PDF, según la enmienda del prompt v1.4. No se modificaron filas existentes de `audit_logs`.

## Implementación

- `apps/api/src/modules/audit/audit-sanitize.policy.ts`: se añadieron los sufijos `fiscal_document` y `fiscal_name`. No se añadieron los sufijos genéricos `document` o `name`.
- `apps/api/src/modules/audit/audit-sanitize.policy.spec.ts`: cubre los cuatro nombres camelCase/snake_case en estructuras anidadas con arreglos y comprueba que `document`/`name` técnicos se conservan.
- `apps/api/src/modules/crm/contracts/contracts.controller.ts`: `@SkipAudit()` cubre todas las escrituras de contratos: crear (incluida creación desde expediente), editar, punto de servicio, soporte, activar, suspender, reactivar, terminar, archivar y eliminar.
- `apps/api/src/modules/crm/contracts/contracts.service.ts`: los eventos explícitos registran solo IDs/estado, tratamiento como transición o lista permitida de nombres de campos; `installationNotes` no forma parte de la proyección. La lista de campos está acotada por allowlist.
- `apps/api/src/modules/crm/contracts/dto/create-contract.dto.ts`: `planId` no puede ser vacío, alineado con la creación desde expediente. Su spec verifica la validación.
- Tests de controlador y servicio verifican metadatos `SkipAudit`, payloads sin valores fiscales/texto libre, eventos de estado y caminos de creación, actualización y soporte.
- `apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`: añade verificación HTTP real de crear → activar → `/service-point`, y consulta solo las filas creadas en el schema aislado de prueba para afirmar que no contienen los marcadores fiscales ni `installationNotes`.

## Evidencia de verificación

| Gate                                                                                                    | Resultado real                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@iwana/api --force`                                                  | Exit 0. 338 suites aprobadas, 4 omitidas; 4.740 tests aprobados, 15 omitidos. Turbo: 4 tareas exitosas, 0 cacheadas; tareas ejecutadas con `cache bypass`.                                                                                                                                                          |
| Integración PostgreSQL real (`contracts.service.postgres.integration.spec.ts`, `E2E_TENANT_SLUG=iwana`) | 1 suite, **14/14 tests aprobados**, 0 omitidos. Incluye el recorrido con marcadores fiscales y confirma tres filas nuevas con eventos `Contract`, `Contract` y `ContractServicePoint`, sin valores fiscales ni `installationNotes`. El schema de prueba se elimina al terminar; no se modificaron filas históricas. |
| Cobertura unitaria `crm/contracts` sin integrar el spec PostgreSQL                                      | 4 suites, **72/72 tests**. Branches: **82,87 %** carpeta `crm/contracts`; **82,07 %** en `contracts.service.ts`. El denominador recoge todos los fuentes de producción de la carpeta; excluye únicamente archivos `*.spec.ts`/`*.integration.spec.ts`.                                                              |
| `pnpm --filter @iwana/api typecheck`                                                                    | Exit 0.                                                                                                                                                                                                                                                                                                             |
| ESLint de `audit-sanitize.policy.ts`, su spec y `crm/contracts/`                                        | Exit 0, sin diagnósticos.                                                                                                                                                                                                                                                                                           |

Comando de cobertura reproducible desde la raíz:

```powershell
pnpm --filter @iwana/api exec jest --runInBand --testPathPattern=modules/crm/contracts --coverage --collectCoverageFrom='modules/crm/contracts/**/*.ts' --collectCoverageFrom='!modules/crm/contracts/**/*.spec.ts' --collectCoverageFrom='!modules/crm/contracts/**/*.integration.spec.ts' --coverageThreshold='{}' --coverageReporters=text --coverageReporters=json-summary
```

La cobertura se mide con las pruebas unitarias de `crm/contracts`; el spec de integración se ejecutó por separado contra PostgreSQL real y no entra en el denominador.

## Deuda por severidad

| Severidad | Deuda                                                                              | Estado / destino                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crítica   | S-T7-01: exposición de PII en nuevas filas por respuesta de escritura de contratos | Corregido para nuevas escrituras; T7 debe revalidar el diff. Las filas históricas no se alteraron.                                                    |
| Alta      | Ninguna nueva en T11                                                               | —                                                                                                                                                     |
| Media     | Posibles valores fiscales históricos en `audit_logs` de antes del cambio           | No es deuda de código nueva. T12 dejó la propuesta de redacción en solo lectura; cualquier modificación depende del CTO y del control de solo-anexar. |
| Baja      | Tipo de `contractsApi.create` aún difiere del helper esperado                      | Fuera de alcance T11 por prompt v1.4; destino P3 de D-PDF.                                                                                            |

**Deuda técnica nueva introducida por T11:** ninguna identificada.
