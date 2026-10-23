# INFORME-MOD13 — Cierre de la Ola 9-pre

**Versión:** 1.0 · **Estado:** Cerrada · **Fecha:** 2026-10-23
**Fuentes:** [plan de ejecución](../plans/2026-10-22-mod13-aprovisionamiento.md) v1.11 · [HLD MOD13 v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) §12 · [INFORME migraciones 163-164](./INFORME-MOD13-MIGRACIONES-163-164-v1.0.md)

## Resultado

La Ola 9-pre cerró sus tres frentes: la corrección de la migración 163 con la 164 de reparación quedó aplicada y verificada en los tenants `ACTIVE`; el defecto de arranque del API por la inyección de `EventEmitter2` quedó corregido y cubierto por una prueba que compila el `AppModule` completo; y el tenant de pruebas E2E pasó a uno `ACTIVE` y migrado, con credenciales verificadas.

## Evidencia

| Frente | Verificación | Resultado |
| --- | --- | --- |
| Migraciones | Segundo `pnpm db:migrate:all` y `db:apply-least-privilege`; lectura posterior en los 6 tenants `ACTIVE` | Código de salida 0; 163 y 164 aplicadas; exactamente 1 requisito `PROVISIONING` en la última versión; CHECK ampliado; `iwana_app` con privilegios |
| Migraciones (unitarias) | Jest sin caché, specs 163, 164 y `migration-order.spec.ts` | 3 suites / 10 tests aprobados |
| Migraciones (PostgreSQL real) | Jest sin caché, integración 163/164 sobre un schema construido con las migraciones 000–162 | 1 suite / 3 tests aprobados |
| Arranque del API | `EventEmitter2` importado como valor en `network-provisioning-reconciler.processor.ts`; `pnpm --filter api dev` y `GET /api/v1/health` | «Nest application successfully started»; health 200; puerto 3000 liberado después |
| Regresión de arranque | `apps/api/src/app.module.boot.spec.ts` compila el `AppModule` completo con DataSource, `REDIS_CLIENT` y BullMQ neutralizados | 1 suite / 1 test aprobado (~21 s) |
| Calidad | ESLint sobre los archivos tocados de `@iwana/api` y `@iwana/db`; `typecheck` de ambos paquetes | Código de salida 0 en los cuatro comandos |
| Tenant E2E | `E2E_TENANT_SLUG` apunta a `srqa-mod11-r5-20261006`, `ACTIVE` y con 163/164; credenciales ADMIN regeneradas por el endpoint del producto y cambio de contraseña de primer acceso completado | Login verificado; la contraseña solo vive en `.env.development.local`, que no se versiona |

## Seguimiento

- `E2E_AUDITOR_*` y `E2E_PRIVACY_*` siguen ancladas al tenant de privacy anterior. Si se vuelve a ejecutar `portal-privacy-live.spec.ts`, hay que apuntarlas a un tenant `ACTIVE`.
- `permission-holders-read.adapter.ts` (access-control, consumido por privacy) conserva un defecto de arranque 42P10 ajeno a MOD13: un `SELECT DISTINCT` con `ORDER BY` fuera de la lista. No se incluyó en esta corrección.
- La Ola 9 queda lista para relanzarse con el launcher v1.9. Después vienen V5 y G7.
