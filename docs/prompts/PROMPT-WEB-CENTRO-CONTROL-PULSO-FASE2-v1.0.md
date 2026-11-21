# PROMPT — WEB-CENTRO-CONTROL · Pulso de plataforma · Fase 2 (P1 y P3)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Etapa:** 4 (G4 con contrafirma pendiente del receptor)
**Precondición:** G6 de la Fase 1. Contratos P1 y P3 congelados en `packages/shared` (abajo).
**Plan:** [2026-11-21-web-centro-control-pulso-plataforma.md](../plans/2026-11-21-web-centro-control-pulso-plataforma.md) · **Dirección:** [v1.1](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md) §4–§6 · **Prototipo:** [prototipo_web_centro_control.html](../prototipo/prototipo_web_centro_control.html) (bloques P1 y P3) · **Contrato DS:** consolidación v1.3 · **Gráfica:** wrapper `Chart` de `@iwana/ui` (ADR-112)

## Contratos congelados (fuente única: `packages/shared/src`)

| ID | Contrato | Origen del dato (solo schema `public`) |
| --- | --- | --- |
| P1 | `TenantStatusSummary` v1.1 (`dto/tenant-status-summary.dto.ts`): `period`, `monthly` (12 meses, antiguo → actual, huecos en 0), `oldestProvisioningAt` | `platform_audit_logs`: `entity_type='Tenant'`, `CREATE` = alta, `DELETE` (empresa distinta) = baja; mes calendario America/Bogota. `tenants.created_at` del `PROVISIONING` más viejo |
| P3 | `PlatformUsersSummary` v1.0 (`dto/platform-users-summary.dto.ts`) en `GET /api/v1/platform-users/summary` envuelto en `{ data }` | `platform_users` sin borrado lógico |
| P3b | `GET /api/v1/platform-audit-logs?excludeSessionEvents=true` excluye `AUDIT_SESSION_ACTIONS` (`enums/audit-session-actions.enum.ts`) | `platform_audit_logs` |

No hay serie histórica de empresas activas: la tendencia pinta altas y bajas por mes, y la cifra de activas es la instantánea. Las empresas ya purgadas siguen contando en `monthly` porque el registro de auditoría es append-only.

## §A — sr-backend

1. `TenantService.getStatusSummary()` llena los tres campos v1.1 con consultas fijas (sin N+1), agregando por `date_trunc('month', created_at AT TIME ZONE 'America/Bogota')`.
2. `PlatformUsersService` + `GET platform-users/summary`, mismos guards y roles que el listado de `platform-users`. Ruta declarada antes de `:id`.
3. `QueryPlatformAuditLogsDto.excludeSessionEvents` (booleano opcional, por defecto `false`) y el filtro `action NOT IN (...)` en el servicio.
4. DTOs de Swagger alineados con los contratos de `packages/shared`.
5. Pruebas: unitarias del servicio y una integración contra Postgres (`DB_NAME=test`) por endpoint, con los bordes: mes sin eventos, `DELETE` repetido de la misma empresa en el mes, sin `PROVISIONING`, usuario borrado, `lastLoginAt` nulo.

**Fuera de alcance:** `apps/web`, schemas de empresa, migraciones, cambios a `AuditAction`.

## §B — fe-platform

1. `apps/web/src/lib/api-client.ts`: tipos de `@iwana/shared`, `platformUsersApi.summary()` y `platformAuditApi.list({ excludeSessionEvents: true, limit: 5 })`; borrar el atajo de filtro en cliente de la Fase 1.
2. B1: delta del mes (altas en lima solo si el neto es positivo) en la celda de activas; antigüedad del alta más vieja en «Altas en curso»; quinta celda «Equipo interno» (total y sin verificación en dos pasos).
3. B2 izq. (8): **Tendencia** con `Chart` (altas y bajas por mes, 12 meses). Las áreas Empresas y Salud bajan a B3.
4. B3: área **Usuarios internos** (por rol, sin verificación en dos pasos, sin acceso en 30 días; enlace a `/platform-users`).
5. Cada bloque nuevo degrada solo por su fuente (estado de error con Reintentar, sin `0`).
6. Copy en `PLATFORM_UI_COPY`; `DashboardClient.spec.tsx` cubre los bloques nuevos.

**Fuera de alcance:** P2, P4 (no se montan), `apps/api`, `packages/shared`.

## §C — sr-qa

1. Mocks en `e2e/tests/helpers/web-api-mocks.ts` con la forma v1.1 y `platform-users/summary`.
2. `e2e/tests/web-centro-control-portada.spec.ts`: CA-PP2-01…06; axe `wcag22aa` a 375 y 1280 px, claro y oscuro.

## Criterios de aceptación

| ID | Criterio |
| --- | --- |
| CA-PP2-01 | La tendencia muestra 12 meses con altas y bajas y nunca una serie de muestra; sin datos o en error, estado vacío o de error |
| CA-PP2-02 | El delta del mes usa lima solo con neto positivo |
| CA-PP2-03 | «Equipo interno» y el área Usuarios internos degradan solos si falla `platform-users/summary` |
| CA-PP2-04 | Actividad reciente pide `excludeSessionEvents=true` y no filtra en cliente |
| CA-PP2-05 | P2 y P4 siguen sin montar |
| CA-PP2-06 | A 1440 × 900, B0, B1 y B2 completos sin desplazar |
| CA-PP2-07 | Integración de los tres endpoints en verde con `DB_NAME=test` |

- **Detenerse si:** el contrato no alcanza, hace falta tocar un schema de empresa o una prueba existente se pone roja y ajustarla cambia su intención: `[BLOQUEO]` a AI-EM-ARCH.

## Paso de cierre (stop/go)

- `pnpm --filter @iwana/shared --filter @iwana/api --filter @iwana/web typecheck lint test` con conteo real (`Cached: 0`) e integración de los specs nuevos con `DB_NAME=test`.
- `playwright.web.config.ts` en verde; `boundary-reviewer` sobre `apps/api`; `contract-drift-reviewer` sobre `packages/shared`; `test-change-reviewer` sobre specs modificadas.
- Revisión en vivo en `localhost:3001/dashboard` contra el prototipo; G6 y commit local con índice temporal, sin push.
