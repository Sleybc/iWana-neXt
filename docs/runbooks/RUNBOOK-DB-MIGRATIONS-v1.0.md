# RUNBOOK — Migraciones de Base de Datos

**Tipo:** Runbook operativo
**Módulo:** TRANSVERSAL — Base de datos / Tenancy
**Versión:** 1.0
**Fecha:** 2026-03-17
**Autor:** AI-EM-ARCH
**Referencia:** [ADR-017](../adrs/ADR-017-Provisioning-Schema-BullMQ.md) | [ADR-018](../adrs/ADR-018-Ciclo-Vida-Tenant.md)

---

## Descripción

Este runbook cubre la operación normal de migraciones en `@iwana/db` para los dos flujos vigentes del repositorio:

- Migraciones del schema público via TypeORM.
- Migraciones retroactivas sobre schemas tenant via runner centralizado.

No cubre cambios de modelo nuevos ni generación de migraciones; cubre ejecución, validación y rollback operativo cuando el artefacto ya existe en el repositorio.

---

## 1. Prerrequisitos

- El package `@iwana/db` debe compilar sin errores.
- PostgreSQL y Redis deben estar accesibles según `.env`.
- No ejecutar migraciones tenant durante incidentes de conectividad inestables.
- Validar primero el estado de la base si hubo fallos previos de provisioning o migraciones parciales.

Comandos de validación rápida:

```bash
pnpm --filter @iwana/db typecheck
pnpm --filter @iwana/db build
```

---

## 2. Migraciones del Schema Público

### Mostrar migraciones

```bash
pnpm --filter @iwana/db migration:show
```

### Ejecutar migraciones pendientes

```bash
pnpm --filter @iwana/db migration:run
```

### Revertir la última migración pública

```bash
pnpm --filter @iwana/db migration:revert
```

### Cómo funciona

- TypeORM usa `dist/data-source.js`.
- El `DataSource` resuelve migraciones públicas por glob: `dist/migrations/public/*.js`.
- No se deben crear scripts manuales por número de migración para este flujo.

---

## 3. Migraciones Retroactivas sobre Tenants

### Ejecutar migraciones tenant

```bash
pnpm --filter @iwana/db migration:tenant:run
```

### Cómo funciona

- El runner operativo vive en `packages/database/src/migrations/tenant/run-all.ts`.
- En `dist`, descubre automáticamente archivos con convención `NNN_*.js`.
- Ejecuta las migraciones tenant en orden lexicográfico ascendente por prefijo numérico.
- Cada módulo debe exportar `runMigration(dataSource)`.

### Señales esperadas en salida

```text
[tenant-migration] Ejecutando N migracion(es) tenant...
[tenant-migration] → 003_add_user_profile_fields.js
[tenant-migration] ✓ tenant_xxx
[tenant-migration] → 004_add_mfa_required_to_users.js
```

### Fallos esperables

| Falla | Indicador | Acción |
| --- | --- | --- |
| Módulo sin `runMigration(dataSource)` | `no exporta runMigration(dataSource)` | Corregir el archivo de migración antes de reintentar. |
| Schema inválido | `Schema name invalido` | Revisar datos en `public.tenants`; no forzar ejecución manual. |
| Resultado parcial por tenant | logs `✗ tenant_xxx` y error final | Revisar schema afectado antes de reintentar globalmente. |

---

## 4. Verificación Posterior

### Verificar migraciones públicas aplicadas

```sql
SELECT *
FROM public.typeorm_migrations
ORDER BY id DESC;
```

### Verificar tenants activos

```sql
SELECT id, slug, schema_name, status
FROM public.tenants
ORDER BY created_at DESC;
```

### Verificar una tabla/columna esperada en tenant

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'tenant_<slug>'
  AND table_name = 'users'
ORDER BY ordinal_position;
```

---

## 5. Criterios de Reintento Seguro

- Reintentar migraciones públicas solo si el fallo fue transitorio y no dejó la DB en estado intermedio no reversible.
- Reintentar migraciones tenant solo después de revisar los schemas fallidos.
- Si una migración tenant usa `IF NOT EXISTS`, el reintento puede ser seguro; si no, revisar el DDL antes de reejecutar.
- No modificar manualmente el runner para apuntar a una sola migración salvo diagnóstico controlado y documentado.

---

## 6. Escalación

| Condición | Acción |
| --- | --- |
| Fallo repetido en migración pública con impacto de disponibilidad | Escalar al CTO y congelar cambios de schema. |
| Fallo tenant en múltiples schemas activos | Escalar como incidente operativo; revisar integridad antes de nuevos reintentos. |
| Propuesta de `synchronize: true` o bypass del runner | Bloquear el cambio; no permitido por política del repo. |

---

## Referencias

- `packages/database/package.json`
- `packages/database/src/data-source.ts`
- `packages/database/src/migrations/public/`
- `packages/database/src/migrations/tenant/run-all.ts`
