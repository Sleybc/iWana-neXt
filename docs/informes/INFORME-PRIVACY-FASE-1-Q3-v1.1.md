# Informe — Privacy · Fase 1 · Q3 Solicitudes

**Versión:** 1.1  
**Fecha:** 2026-10-14  
**Agente:** AI-SR-FULL · Q3  
**Estado:** Implementación parcial; cierre condicionado a dos bloqueos P1 de contrato.

## Resultado

Se implementaron las solicitudes de titular dentro de `privacy/requests/**` y sus esquemas Zod en `packages/shared/src/schemas/privacy/requests*`. El servicio cifra los datos del solicitante con AES-256-GCM, indexa el documento con HMAC, valida la evidencia de Media, calcula plazos con C-CAL-1, registra eventos y audita las operaciones sin incluir identidad. Se declararon `IContractStandingReadPort` e `IPrivacyRequestsReadPort`; el adapter de lectura proyecta `RequestSummary` sin PII. El barrel local de Q3 queda en `apps/api/src/modules/privacy/requests/index.ts`.

La radicación de suplantación invoca `IContractImpersonationPort` dentro de la operación de base de datos, registra la marca, guarda la fecha estimada de denuncia y crea las dos tareas requeridas. Las pruebas integradas cubren esas escrituras con el puerto simulado. La integración real de CRM y el adapter de vigencia contractual siguen asignados a Q5.

Se cubren las transiciones `require-info`, `complete`, `extend`, `resolve` y `reject`. La transición `transfer` queda bloqueada explícitamente: el DTO acepta un destino textual de hasta 200 caracteres, pero la DDL fija `transferred_to` como UUID. El controlador documenta el 503 y no restringe silenciosamente el DTO a UUID.

La lectura de evidencia para que el personal autorizado consulte el archivo tampoco se implementó: C-PRIV-API v1.1 no define esa ruta y el firmador genérico de Media no admite `PRIVACY_EVIDENCE`. El servicio conserva y valida el `requester_evidence_media_id`; no expone una URL firmada por un contrato inventado.

## Criterios y evidencia

| Criterio                                                                                 | Resultado                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1: identidad, cifrado, HMAC, método de verificación y referencia a evidencia            | Implementado; la URL de lectura de evidencia queda bloqueada por contrato.                                                                                                                   |
| A2 / R5: fecha de denuncia, contratos suspendidos, tareas y completitud                  | Implementado; probado en PostgreSQL real con `IContractImpersonationPort` simulado.                                                                                                          |
| A3: finalidad obligatoria en revocación y fila `REVOCATION` al resolver                  | Implementado y probado en PostgreSQL real.                                                                                                                                                   |
| A4 / R3 / R4: lectura de vigencia, retención, no procedencia y marca de datos bloqueados | Implementado con puerto tipado; pruebas reales con stub de contrato abierto y retención vigente.                                                                                             |
| A5: cuerpos Zod de seis transiciones y plazos                                            | Esquemas de las seis acciones publicados. Cinco acciones operativas; `transfer` espera resolución de contrato. Plazos probados cruzando Semana Santa y el festivo trasladado del 9 de julio. |
| A6: `RequestSummary` y `IPrivacyRequestsReadPort` sin PII                                | Implementado.                                                                                                                                                                                |
| R1: abrir y cerrar `RECLAMO_EN_TRAMITE`                                                  | Implementado al completar y al resolver o declarar no procedente.                                                                                                                            |
| R2: desistimiento a dos meses                                                            | La radicación de información faltante fija `desist_at`; la transición automática corresponde al job Q6 según el plan.                                                                        |
| R6: evento y auditoría explícita sin PII                                                 | Implementado; integración comprueba que el payload de auditoría no contiene los datos sintéticos del solicitante.                                                                            |

La suite de integración de Q3 crea y elimina un schema efímero en PostgreSQL real. La migración `146` y sus pruebas `up/down/up` son propiedad de Q1 y se reportan en su informe.

## Verificación

| Comando                                                                                                                                                                                                                                                    | Resultado real                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/api typecheck`                                                                                                                                                                                                                       | Correcto.                                                                                           |
| `pnpm --filter @iwana/shared typecheck`                                                                                                                                                                                                                    | Correcto.                                                                                           |
| `pnpm --filter @iwana/shared exec jest src/schemas/privacy/requests.spec.ts --runInBand --no-cache`                                                                                                                                                        | 1 suite, 4 tests pasaron.                                                                           |
| `pnpm --filter @iwana/api exec jest src/modules/privacy/requests/requests-domain.spec.ts --runInBand --no-cache`                                                                                                                                           | 1 suite, 5 tests pasaron.                                                                           |
| `IWANA_DB_INTEGRATION_AVAILABLE=true DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=dbiw pnpm --filter @iwana/api exec jest --config jest.integration.config.js src/modules/privacy/requests/requests.service.postgres.integration.spec.ts --runInBand --no-cache` | PostgreSQL alcanzable en `127.0.0.1:5433/dbiw`; 1 suite, 5 tests pasaron; schema efímero eliminado. |
| `pnpm exec turbo run test --filter=@iwana/api --force`                                                                                                                                                                                                     | 345 suites y 4.826 tests pasaron; 4 suites y 15 tests omitidos; 0 cache hits, 4 tareas exitosas.    |
| ESLint de los archivos TypeScript de Q3                                                                                                                                                                                                                    | Correcto.                                                                                           |
| Prettier `--check` de los archivos Q3 y este informe                                                                                                                                                                                                       | Correcto.                                                                                           |

No se hicieron commits. Antes de editar se verificó libre la propiedad `apps/api/src/modules/privacy/requests/**` y `packages/shared/src/schemas/privacy/requests*`; el wiring de `privacy.module.ts` y el trabajo concurrente de Q1/Q2 no se modificaron desde Q3.

## [BLOQUEO TÉCNICO]

**De:** AI-SR-FULL (Q3) → AI-EM-ARCH  
**Módulo/fase:** Privacy · Fase 1 · C-PRIV-API v1.1 y C-PRIV-DDL v1.1  
**Intentos:** contrastar prompt, DTO Zod y migración tenant; se dejó `transfer` en 503 y no se añadió ruta de evidencia.  
**Impacto:** falta persistir destinos de transferencia no UUID y el personal autorizado no puede abrir la evidencia de identidad desde una ruta dedicada.  
**Ayuda requerida:** publicar una decisión versionada que alinee `transferredTo` con `transferred_to` y congele el acceso firmado a la evidencia de solicitudes.

## Deuda nueva por severidad

| Severidad                    | Hallazgo                                                                                                                                                          | Resolución requerida                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **P1**                       | C-PRIV-API v1.1 acepta `transferredTo: string ≤ 200`, mientras `data_subject_requests.transferred_to` es `uuid`. La acción devuelve 503 y no registra transición. | AI-EM-ARCH versiona la corrección del DTO o de la persistencia; después se completa y prueba el traslado.                     |
| **P1**                       | No existe contrato de lectura de `requester_evidence_media_id`; el URL genérico de Media no permite `PRIVACY_EVIDENCE`.                                           | AI-EM-ARCH congela una ruta privacy con permiso y TTL del firmador dedicado; luego se integra sin abrir el firmador genérico. |
| **P2 · dependencia de fase** | Los adapters no operativos de `IContractImpersonationPort` y `IContractStandingReadPort` deben ser sustituidos por Q5. La integración de Q3 usa stubs.            | Q5 implementa ambos puertos dentro de los boundaries de CRM y ejecuta R5 de punta a punta.                                    |
| **P2 · documental**          | Sigue pendiente el HLD de Privacy antes de G7, tal como registra el plan v1.1.                                                                                    | AI-EM-ARCH emite `HLD-PRIVACY-v1.0`.                                                                                          |
