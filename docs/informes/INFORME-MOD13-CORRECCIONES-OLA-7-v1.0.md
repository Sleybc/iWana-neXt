# Informe de correcciones MOD13 — Ola 7

**Fecha:** 2026-10-22  
**Alcance:** B-fix (V2/V3) y F-fix (V4), según `PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` y HLD v1.1 §12.  
**Estado:** código corregido; la verificación transaccional contra PostgreSQL queda pendiente porque el servicio local no está disponible.

## Correcciones

### Backend

- `regularize` audita la liberación de una provisión `FAILED` reemplazada con acción `RELEASE`, motivo `REPLACED`, estado previo e IP, dentro de la misma transacción. Se añadieron casos de rollback ante fallo de cualquiera de las dos auditorías.
- IPAM responde `NETWORK_NOT_IN_ROUTER` para una red no disponible y el conflicto de IP responde `IP_IN_USE`. Se añadió una prueba arquitectónica con allowlist cerrada `NETWORK_ERROR_CODES` más `FORBIDDEN` y `VALIDATION_ERROR`. La guarda de tenant conserva el 401 y ya no agrega un código fuera de contrato.
- CRM obtiene `SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT` desde `NetworkCommercialStatusModule`, que solo exporta ese puerto.
- La lectura de usuarios de tenant filtra por el `tenantId` autenticado; las consultas de usuarios de plataforma siguen separadas.
- El alta de router registra en auditoría los nombres de campos opcionales enviados, nunca sus valores.

### Portal

- La ficha de una orden permite pedir el contexto para la cuenta con lectura de órdenes. Si la respuesta es la proyección del técnico asignado, muestra esa vista; ante HTTP 403 muestra el estado de falta de acceso.
- Las pestañas de la bandeja usan las clases compartidas `portalModuleTabs*`.
- El vacío del catálogo de routers invita a registrar solo cuando está disponible la acción.
- Se añadió cobertura explícita para el requisito `PROVISIONING`.

## Evidencia de validación

### Backend

| Verificación | Resultado |
| --- | --- |
| Red TDD antes del cambio | 3 suites, 9 tests; 4 fallos esperados por los defectos del encargo |
| Pruebas enfocadas finales | 6 suites, 33 tests aprobados; después del último ajuste, 2 suites y 3 tests aprobados para guarda y arquitectura |
| `network`, `tasks` y `crm` | 113 suites y 1.714 tests aprobados al repetir fuera del sandbox que bloqueaba listeners locales |
| Worker | 21 suites y 173 tests aprobados |
| `pnpm --filter @iwana/api typecheck` | Aprobado |
| `pnpm --filter @iwana/api lint` | Sin errores; 7 advertencias preexistentes fuera de las rutas de este arreglo |
| `git diff --check` | Aprobado; solo advertencias de normalización CRLF en documentos preexistentes |

La integración `service-provisioning.audit.postgres.integration.spec.ts` contiene seis casos para la auditoría y sus reversiones. La corrida final omitió 1 suite y 6 tests porque el global setup recibió `ECONNREFUSED` en `127.0.0.1:5433/dbiw`. Solo se ejecutó la comprobación de disponibilidad: no se inicializó el `DataSource`, no se ejecutaron DDL o migraciones y no se modificaron tenants. Docker Desktop tampoco tenía un daemon disponible para levantar la base local.

### Portal

| Verificación | Resultado |
| --- | --- |
| Jest enfocado | 3 suites, 32 tests aprobados |
| Suite portal completa | 322 suites aprobadas; 3.251 tests aprobados, 1 omitido preexistente y 3.252 total |
| `pnpm --filter @iwana/portal lint` | Sin errores; 43 advertencias preexistentes en otros componentes |
| `pnpm --filter @iwana/portal typecheck` | Aprobado |
| `audit-ui.mjs` en componentes afectados | Sin hallazgos |
| `git diff --check` en rutas del portal | Aprobado |

No se repitió el build del portal: la ejecución anterior terminó con `EPERM` durante el prerender de `.next`, y §F-fix indica no forzarlo.

## Deuda pendiente

- **P1 — evidencia PostgreSQL:** falta ejecutar los seis casos de auditoría/rollback con la base de integración disponible. La suite está escrita y el código compila, pero el comportamiento transaccional no se declara verificado en runtime.
- **P2 — build portal:** el entorno conserva el bloqueo `EPERM` del prerender de `.next`; no afecta lint, typecheck ni Jest.

No se modificaron contratos congelados ni HLD, no se ejecutaron migraciones y no se creó ningún commit.
