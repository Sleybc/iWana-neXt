# RUNBOOK — Provisioning de Tenant

**Tipo:** Runbook operativo
**Módulo:** MOD01 — Auth + Tenant + Audit
**Versión:** 1.0
**Fecha:** 2026-03-15
**Autor:** AI-EM-ARCH
**Referencia:** [ADR-017](../adrs/ADR-017-Provisioning-Schema-BullMQ.md) | [ADR-018](../adrs/ADR-018-Ciclo-Vida-Tenant.md)

---

## Descripción del Proceso

Cuando se crea un tenant via `POST /api/v1/tenants`, el API responde HTTP 201 con el tenant en estado `PROVISIONING`. El worker `@iwana/worker` consume el job de la cola `tenant-provisioning` (BullMQ sobre Redis), ejecuta el DDL del schema PostgreSQL, realiza el seed del ADMIN inicial y actualiza el estado a `ACTIVE`.

Este runbook cubre los procedimientos operativos cuando el proceso falla o queda en estado inconsistente.

---

## 1. Diagnóstico de PROVISIONING_FAILED

### Síntoma
El tenant aparece con `status: PROVISIONING_FAILED` en `GET /api/v1/tenants/:id`.

### Causas comunes

| Causa | Indicador en logs |
|-------|------------------|
| PostgreSQL no disponible al momento del job | `Error: connect ECONNREFUSED` o `getaddrinfo ENOTFOUND` |
| `schemaName` con formato inválido | `UnrecoverableError: Invalid schema name` — no genera reintentos |
| Tenant no encontrado en DB al consumir el job | `UnrecoverableError: Tenant not found` — no genera reintentos |
| DDL parcialmente ejecutado (schema corrupto) | `Error: relation "users" already exists` o similar en el template SQL |
| Timeout de conexión PostgreSQL | `Error: Connection terminated unexpectedly` |
| Redis no disponible (imposible ACK al worker) | Job queda en `active` sin mover a `completed` o `failed` |

### Localizar el error en logs del worker

```bash
# Ver los últimos 200 logs del worker en Docker Compose
docker compose -f docker-compose.dev.yml logs --tail=200 worker

# Filtrar solo errores relacionados con provisioning
docker compose -f docker-compose.dev.yml logs worker 2>&1 | grep -i "provisioning\|failed\|error"

# Buscar el tenantId específico en los logs
docker compose -f docker-compose.dev.yml logs worker 2>&1 | grep "<tenantId>"
```

### Verificar el estado del tenant via API

```bash
# Requiere token de SYSTEM_ADMIN
curl -X GET https://api.iwana.local/api/v1/tenants/<tenantId> \
  -H "Authorization: Bearer <access_token>"

# Verificar el campo status en la respuesta
# Esperado en fallo: "status": "PROVISIONING_FAILED"
```

---

## 2. Inspección del Job BullMQ

BullMQ no expone una CLI oficial. Los jobs se inspeccionan via Redis CLI o via los logs del worker.

### Via Redis CLI

```bash
# Conectarse al contenedor Redis
docker compose -f docker-compose.dev.yml exec redis redis-cli

# Listar todas las claves relacionadas con la cola tenant-provisioning
KEYS "bull:tenant-provisioning:*"

# Ver los jobs en estado "failed"
LRANGE "bull:tenant-provisioning:failed" 0 -1

# Ver los jobs en estado "completed"
LRANGE "bull:tenant-provisioning:completed" 0 -1

# Ver detalle de un job específico (reemplazar <jobId>)
HGETALL "bull:tenant-provisioning:<jobId>"
```

Los campos relevantes del job son:
- `data`: payload del job (contiene `tenantId` y `schemaName`)
- `failedReason`: mensaje del último error
- `attemptsMade`: número de intentos realizados
- `stacktrace`: stacktrace del último error

### Via logs del worker con BullMQ events

El worker registra en consola los eventos `completed`, `failed` y `error` de BullMQ. Buscar en los logs:

```
[TenantProvisioningProcessor] Job <jobId> failed: <mensaje de error>
[TenantProvisioningProcessor] Attempt <N> of 3 for tenant <tenantId>
```

---

## 3. Reintento de Provisioning

### Cuándo usarlo

- El tenant está en estado `PROVISIONING_FAILED`.
- Los logs del worker muestran un error transitorio (PostgreSQL temporalmente no disponible, timeout de red, etc.).
- Se ha verificado que el error no era estructural (schema name inválido, tenant inexistente).

### Cuándo NO usarlo sin limpieza previa

- Si el error en los logs es `relation "users" already exists` u otro error que indica que el DDL se ejecutó parcialmente. En ese caso, proceder primero a la **sección 5 (Reparación Manual)** antes de reintentar.

### Comando

```bash
# Requiere token de SYSTEM_ADMIN
curl -X PATCH https://api.iwana.local/api/v1/tenants/<tenantId>/retry-provisioning \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json"
```

Respuesta esperada:
```json
{
  "id": "<tenantId>",
  "status": "PROVISIONING",
  "slug": "<slug>",
  ...
}
```

El endpoint actualiza el estado del tenant de `PROVISIONING_FAILED` a `PROVISIONING` y encola un nuevo job en BullMQ. El worker lo procesará según su disponibilidad.

### Verificar que el reintento progresó

```bash
# Sondear el estado cada 30 segundos hasta que cambie a ACTIVE o PROVISIONING_FAILED
watch -n 30 'curl -s -H "Authorization: Bearer <token>" \
  https://api.iwana.local/api/v1/tenants/<tenantId> | jq .status'
```

---

## 4. Verificación del Schema en PostgreSQL

### Conectarse a PostgreSQL

```bash
# Via Docker Compose (entorno dev)
docker compose -f docker-compose.dev.yml exec postgres psql \
  -U $DB_USER -d $DB_NAME

# Via psql directo (si tiene acceso al host)
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME
```

### Verificar que el schema existe

```sql
-- Listar todos los schemas del tenant (formato: tenant_<slug>)
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name LIKE 'tenant_%'
ORDER BY schema_name;

-- Verificar un schema específico
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name = 'tenant_<slug>';
```

### Verificar que las tablas del schema existen

```sql
-- Listar las tablas del schema del tenant
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'tenant_<slug>'
ORDER BY table_name;
```

El schema debe contener exactamente estas tablas:
- `users`
- `refresh_tokens`
- `audit_logs`

### Verificar que el ADMIN inicial fue creado

```sql
-- Cambiar search_path al schema del tenant
SET search_path TO tenant_<slug>;

-- Verificar usuario ADMIN
SELECT id, email, role, "passwordResetRequired", "createdAt"
FROM users
WHERE role = 'admin'
LIMIT 5;

-- Restaurar search_path
RESET search_path;
```

### Si el tenant quedó `ACTIVE` pero el ADMIN no recibió credenciales iniciales

Actualmente el seed inicial crea el ADMIN y marca `passwordResetRequired=true`, pero la entrega automatizada por email todavía no es el camino operativo estable del repositorio. El workaround vigente y soportado es regenerar credenciales temporales por API, no consultar logs del worker.

```bash
curl -X POST https://api.iwana.local/api/v1/tenants/<tenantId>/regenerate-admin-credentials \
  -H "Authorization: Bearer <access_token>" \
  -H "Idempotency-Key: <uuid-unico>" \
  -H "Content-Type: application/json"
```

Respuesta esperada:

```json
{
  "data": {
    "message": "Credenciales temporales regeneradas para el ADMIN inicial del tenant.",
    "adminEmail": "admin@tenant.com",
    "temporaryPassword": "<solo visible en esta respuesta>",
    "expiresAt": "2026-03-18T12:00:00.000Z"
  }
}
```

Reglas operativas:

- La credencial temporal regenerada debe tratarse como secreto operativo de un solo uso.
- No registrarla en tickets, logs, chats ni documentos permanentes.
- Si el cliente reintenta con el mismo `Idempotency-Key`, recibirá exactamente la misma respuesta mientras la ventana siga vigente.

---

## 5. Reparación Manual

### Cuándo aplica

El DDL del `tenant_template.sql` se ejecuta dentro de una transacción `BEGIN/COMMIT`. Si PostgreSQL aborta la transacción a mitad, el schema podría quedar creado pero sin todas las tablas. Esto ocurre en casos extremos como:

- Muerte del proceso PostgreSQL durante el DDL.
- OOM (Out of Memory) del servidor durante la ejecución del template.
- Interrupción manual del worker durante el procesamiento del job.

### Diagnóstico de schema parcialmente creado

```sql
-- Verificar qué tablas existen en el schema
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'tenant_<slug>'
ORDER BY table_name;

-- Si el resultado no incluye las 3 tablas (users, refresh_tokens, audit_logs),
-- el schema está incompleto y debe limpiarse.
```

### Limpieza y reintento

**Paso 1 — Eliminar el schema incompleto** (ejecutar con cuidado; esta operación es destructiva):

```sql
-- ADVERTENCIA: Esta operación elimina el schema y todos sus objetos.
-- Ejecutar SOLO si el schema está incompleto y el tenant está en PROVISIONING_FAILED.
-- Confirmar que el tenant NO tiene usuarios activos ni datos de negocio.

DROP SCHEMA IF EXISTS tenant_<slug> CASCADE;
```

Usar este paso solo como reparación manual extraordinaria. La operación destructiva del sistema ya no debe interpretarse como simple eliminación del registro en `public.tenants`; cuando se elimine un tenant debe esperarse también limpieza del schema asociado.

**Paso 2 — Verificar que el schema fue eliminado:**

```sql
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name = 'tenant_<slug>';
-- Debe retornar 0 filas.
```

**Paso 3 — Actualizar el estado del tenant en la base de datos** (si el endpoint de retry no está disponible temporalmente):

```sql
UPDATE public.tenants
SET status = 'PROVISIONING_FAILED'
WHERE id = '<tenantId>';
```

**Paso 4 — Reintentar el provisioning via API** (ver sección 3):

```bash
curl -X PATCH https://api.iwana.local/api/v1/tenants/<tenantId>/retry-provisioning \
  -H "Authorization: Bearer <access_token>"
```

**Paso 5 — Monitorear el nuevo intento** y confirmar que el schema se crea completo (ver sección 4).

---

## 6. Escalación

| Condición | Acción |
|-----------|--------|
| El error es persistente después de 3 reintentos manuales | Escalar al equipo de infraestructura — posible problema en el template SQL o en los permisos del usuario de base de datos |
| El schema existe y tiene datos reales | No eliminar sin autorización escrita del CTO y del cliente — aplica Ley 1581 (protección de datos) |
| El error involucra corrupción de datos | Activar protocolo de incidente — contactar al CTO |
| Redis no disponible | Verificar `docker compose ps redis` y revisar logs de Redis; BullMQ no puede encolar ni procesar jobs sin Redis |

---

## Referencias

- [ADR-017 — Provisioning de Schema PostgreSQL vía BullMQ Worker](../adrs/ADR-017-Provisioning-Schema-BullMQ.md)
- [ADR-018 — Ciclo de Vida del Tenant](../adrs/ADR-018-Ciclo-Vida-Tenant.md)
- [ADR-020 — Seed Inicial + Credenciales Temporales](../adrs/ADR-020-Seed-Inicial-Credenciales-Temporales.md)
- `apps/worker/src/processors/tenant-provisioning.processor.ts`
- `packages/database/src/templates/tenant_template.sql`
