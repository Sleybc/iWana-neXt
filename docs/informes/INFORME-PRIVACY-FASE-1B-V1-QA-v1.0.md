# INFORME — Privacy Fase 1b · V1 QA

**Fecha:** 2026-10-16  
**Agente:** `sr-qa`  
**Dictamen:** **[BLOQUEO] — no hay pruebas Playwright para los escenarios V1 de Fase 1b; no se ejecutaron E2E contra `dbiw`.**  
**Alcance:** plan v1.2; prompts Fase 1b v1.0, v1.1 y v1.2; launcher v1.3; requisitos R1–R16 y §4 del delta v1.2.

## Evidencia y motivo del bloqueo

La ruta de este informe estaba libre antes de crear el archivo. La inspección de `e2e/tests/` encontró `portal-privacy-live.spec.ts` y `portal-privacy.spec.ts`, pero no pruebas de los flujos de supresión, rechazo por deber de conservación/contrato, lectura de expedientes bloqueados, permiso `crm.blocked_data.read` ni insignia por traslado tardío.

La suite viva existente tiene tres pruebas, descubiertas sin ejecutar con:

```text
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-privacy-live.spec.ts --list
Exit code: 0
Listing tests: 3 tests in 1 file
```

Los tres casos listados son: consulta, autorización/conversión y suplantación. Referencias: `portal-privacy-live.spec.ts:212`, `:246` y `:258`. No satisfacen los casos V1. La suite `portal-privacy.spec.ts` usa respuestas simuladas y tampoco sirve como evidencia contra la API real.

**Conteo ejecutado sin caché:** 0 suites / 0 tests ejecutados para V1. La salida `--list` cuenta pruebas descubiertas (3), no ejecutadas. No ejecuté los tests existentes porque crean/modifican datos contra la API real y no verifican estos criterios. No se ejecutó ninguna operación de base de datos.

La precondición del launcher —backup y `pnpm db:migrate:all` sobre `dbiw` hasta la migración tenant 151— no se acreditó en esta verificación. La disponibilidad de una API en el puerto local, por sí sola, no demuestra conexión a `dbiw`, migración 151 ni precondiciones de dominio (texto legal publicado, consentimiento e identidad verificada). No se registraron nombres, documentos, HMAC, ciphertext, credenciales ni tokens.

## Matriz R1–R16 ↔ prueba

La columna “prueba requerida” refleja el contrato congelado. “Sin evidencia V1” significa que no se identificó una prueba Playwright aplicable en la suite viva; no afirma que una prueba de otra capa no exista.

| Regla | Prueba requerida por el contrato / alcance V1 | Evidencia Playwright de esta revisión |
|---|---|---|
| R1 | Rechazo SUPRIMIR: `DEBER_LEGAL_CONSERVACION` abre bloqueo; `DEBER_CONTRACTUAL` no lo abre (casos 2 y 3). | Sin evidencia V1. |
| R2 | Prospecto → vista previa → resolver con confirmación; anonimización atómica (caso 1). | Sin evidencia V1. |
| R3 | Prospecto sin Party suprimido; conflicto HMAC con suscriptor responde 409. | Sin evidencia V1. |
| R4 | Cambio de candidatos entre preview y resolve responde 409. | Sin evidencia V1. |
| R5 | Cuenta enlazada activa bloquea la supresión; cuenta dada de baja se anonimiza. | Sin evidencia V1. |
| R6 | Supresión conserva solicitud/eventos, autorizaciones, marcas y auditoría. | Sin evidencia V1. |
| R7 | Expediente, visita y cadena WFM/tasks del alcance anonimizados (caso 1). | Sin evidencia V1. |
| R8 | Titular bloqueado: listado/detalle/360° redactados sin permiso y completos con `privacy.read` o `crm.blocked_data.read`; seis subrecursos, 403 sin autorización y 200 auditado con permiso (v1.2 §4). | Sin evidencia V1. |
| R9 | Búsqueda de bloqueados excluye titular para quien no puede ver los datos (caso 2). | Sin evidencia V1. |
| R10 | Mutaciones sobre titular bloqueado responden 409, incluso con permiso de lectura. | Sin evidencia V1. |
| R11 | Traslado tardío muestra la insignia correspondiente (caso 4). | Sin evidencia V1. |
| R12 | Retiro de `IPersonalDataBlockPort`; el contrato prescribe verificación de módulo/búsqueda, no E2E. | No es criterio E2E; no se verificó en V1. |
| R13 | CLI usa los participantes compartidos; el contrato prescribe integración de CLI, no E2E. | No es criterio E2E; no se verificó en V1. |
| R14 | Contrato se conserva y sus datos personales/snapshots se anonimizan; el contrato prescribe integración. | Sin evidencia E2E; no se verificó integración en V1. |
| R15 | Marca en el 100 % del alcance; proyecciones y portal muestran campos «Anonimizado» e insignia (caso 1). | Sin evidencia V1. |
| R16 | `ACCOUNTANT` con `crm.blocked_data.read` ve completo y se audita `grantedBy`; sin perfil, `SALES` y `TECHNICIAN` reciben redacción. | Sin evidencia V1. |

## Resultado

**G6 permanece abierto.** Para continuar V1 hace falta una suite Playwright que implemente los cuatro casos pedidos (incluidas las autorizaciones y los subrecursos de v1.2), fixtures sintéticos aislados y evidencia de que `dbiw` fue respaldada y está migrada hasta tenant 151 con sus precondiciones de dominio. Este informe no añade ni modifica código, pruebas o contratos.
