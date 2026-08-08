# RUNBOOK — SEC-P1: expand/contract HMAC + cierre residual S-1

**Tipo:** Runbook operativo  
**Módulo:** TRANSVERSAL — PII / hashes con clave / audit trail  
**Versión:** 1.1  
**Fecha:** 2026-08-06  
**Autor:** AI-EM-ARCH (plan) · Ejecutor: AI-PLAT-OPS  
**Estado del plan:** Congelado — secuencia **S1 + A1/A2 + B1** (recomendación EM-ARCH adoptada 2026-08-06)  
**Estado de ejecución (actualizar casillas al completar cada entorno):**

| Entorno | Ventana 1 | Soak B1 | Ventana 2 | Residual S-1 |
| --- | --- | --- | --- | --- |
| **dev local** | [x] 2026-08-06 | N/A (dev) | [x] 2026-08-06 | **Cerrado** (ACTIVE) |
| **staging** | [ ] | [ ] | [ ] | Abierto |
| **producción** | [ ] | [ ] | [ ] | Abierto |

**Referencias:**  
- [INFORME-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md](../informes/INFORME-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md)  
- [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) (propuesto) D3/P1  
- [RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md](./RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md) §1 y §6bis  
- Prompt G6.5 + staging: [PROMPT-OPERATIVO-SEC-P1-G65-STAGING-v1.0.md](../prompts/PROMPT-OPERATIVO-SEC-P1-G65-STAGING-v1.0.md)  
- Prompt cierre staging→prod: [PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md](../prompts/PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md)

> **Regla de casillas:** marcar `[x]` solo con evidencia del **entorno indicado** (fecha + owner en el informe vivo). No colapsar “dev = cerrado” en staging/prod.

---

## Propósito

Cerrar del todo la iniciativa SEC-P1 en entornos reales (staging → producción) según el plan adoptado:

| Código | Significado |
| --- | --- |
| **S1** | Staging primero, luego prod |
| **A1/A2** | Secret store; **clave distinta por entorno** (nunca reutilizar staging→prod) |
| **B1** | Periodo de confianza **corto** (3–7 días) con **fecha hard** de ventana 2 |

**Fuera de alcance:** rotar `PII_HASH_KEY` (eso es §6bis del runbook de cifrado); oleadas por tenant (NO-GO sin ADR); clave “temporal” en disco (rechazada salvo excepción CTO).

---

## 0. Prerrequisitos (antes de cualquier entorno)

Marcar cuando el ítem es verdadero **para el entorno que se va a tocar**. Los de “conocido” / cableado en repo se marcan una vez a nivel de programa.

### 0.1 Programa / repo (compartido)

- [x] Código SEC-P1 **mergeado** (021/022, 108–110, fix A-4, `assertTenantMigrationParity`, contracts diferidos, N-1 provisioning). *Merge a `main`: `1452d631` (2026-08-06). G6.5 = CI sobre este tip.*
- [x] `PII_HASH_KEY` **no** está en git ni en dumps (solo placeholders en `*.example`).
- [x] A1/A2 **aprobado por CTO** (2026-08-06): claves por entorno; staging ≠ prod.
- [x] Owner PLAT-OPS asignado; CTO informado del plan S1 (plan congelado en informe).
- [x] Conocido: `pnpm db:migrate:all` = build `@iwana/db` + públicas + tenants + least-privilege. **En prod** la vía es el contenedor `migrator-prod` (solo públicas + tenants).
- [x] Conocido: sin `PII_HASH_KEY` el bootstrap Joi **falla** (fail-fast).
- [x] **Cableado (artefacto prod):** `PII_HASH_KEY` declarada en `api-prod`, `worker-prod` y `migrator-prod` (`docker-compose.prod.yml`). `IWANA_APPLY_PII_CONTRACT` opcional solo en `migrator-prod` (inyectar en ventana 2 §4.2 paso 3; retirar §4.2 paso 7). *Inyectar el valor real en el secret store sigue siendo por entorno (§1).*
- [x] Conocido: **schemas `MARKED_FOR_DELETION` no se migran ni se verifican** (solo `ACTIVE`). Reactivación → expand/contract previo (§4.2 paso 9). **Antes de reactivar: medición de volumen de la 108 sobre el schema** (`scripts/sql/medicion-volumen-108.sql`) — ver §4.2 paso 9. Timeline de DROP = pendiente humano (F-1).

### 0.2 Por entorno (repetir antes de ventana 1)

| Prerrequisito | dev | staging | prod |
| --- | --- | --- | --- |
| Backup/restore del entorno **probado** (drill reciente) | [x] (local ops) | [ ] | [ ] |
| Secret store / env del entorno listo (§1) | [x] (dev) | [ ] | [ ] |
| Binario SEC-P1 **desplegable** en el entorno (post-merge) | [x] (local) | [ ] | [ ] |

---

## 1. Generación y fijación de `PII_HASH_KEY` (A1/A2)

```bash
openssl rand -hex 32
```

Reglas:

1. Generar **fuera** del repo; 64 hex `[0-9a-f]`.
2. Guardar en **secret store** del entorno (mismo patrón operativo que `MFA_ENCRYPTION_KEY`).
3. **Clave distinta** en staging y en producción. Nunca copiar.
4. Independiente de `MFA_ENCRYPTION_KEY` (ADR-078 D-A / runbook §6bis).
5. Inyectar en procesos que migran y en API/worker **antes** del arranque.
6. Rechazar entropía nula / placeholders (el código ya lo hace).

Checklist por entorno:

| Entorno | Quién da el go | Condición | Hecho |
| --- | --- | --- | --- |
| staging | EM-ARCH + owner staging | Secret inyectado; healthcheck arranca; sin valor en logs | [ ] |
| producción | **CTO** | Staging ventana 1 OK (o dry-run aceptado); secret distinto; plan de rollback escrito | [ ] |

*Dev local: clave de desarrollo ya operativa para migraciones/API locales (no es staging ni prod).*

---

## 2. Ventana 1 — expand (parada de servicio)

Aplica en **cada** entorno (staging, luego prod) con el binario SEC-P1 ya desplegable.

### 2.1 Preflight (conteos, nunca valores)

```sql
-- Por cada schema ACTIVE (ajustar schema):
SELECT count(*) AS empty_email
FROM users
WHERE email IS NULL OR octet_length(email) = 0;
-- Debe ser 0. Si > 0, remediar antes: el backfill 108 aborta el tenant.
```

Opcional (prod / flota grande): re-medir `reltuples`/`relpages` de `users`, `subscribers`, `expediente_records`. Si peak ≥ ~100k → **stop** y consultar EM-ARCH (umbral 108 / ADR-066).

| Preflight | dev | staging | prod |
| --- | --- | --- | --- |
| Emails vacíos = 0 (ACTIVE) | [x] | [ ] | [ ] |
| Peak `reltuples` revisado (si aplica) | [x] (perfil mínimo ADR-078) | [ ] | [ ] |

### 2.2 Ejecución

1. Detener API, web, portal y worker.
2. Confirmar `PII_HASH_KEY` (y `MFA_ENCRYPTION_KEY` si hay ciphertext) visibles al proceso migrator.
3. Ejecutar sin el contract:
   - **Host (staging/dev):** `pnpm db:migrate:all`
   - **Contenedor (prod):** `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production --env-file .env.production run --rm --no-deps migrator-prod`
4. Leer resumen `[MIGRATOR]`:
   - Todos los ACTIVE `Done`
   - `Paridad de migraciones OK: N tenant(s) ACTIVE con M migraciones idénticas (alineadas con M del código)`
   - Anuncio de diferidas `022` y `109` **si aún no constan aplicadas** (con texto de gobernanza ventana 2)
5. **Stop criterion:** si algún tenant falla o la paridad rompe → **no rearrancar** con flota mixta; remediar o alinear rollback.
6. Arrancar servicios solo si pasos 4–5 OK.
7. Smoke (AI-SR-QA / ops):

| Smoke | dev | staging | prod |
| --- | --- | --- | --- |
| `GET /api/v1/health` | [ ] *(re-verificar al arrancar stack completo)* | [ ] | [ ] |
| Login plataforma | [ ] | [ ] | [ ] |
| Login tenant | [ ] | [ ] | [ ] |
| Búsqueda por documento / email / teléfono | [ ] | [ ] | [ ] |

| Ventana 1 — resultado migrator | dev | staging | prod |
| --- | --- | --- | --- |
| ACTIVE todos `Done` + paridad OK (alineada con código) | [x] 2026-08-06 (10×106) | [ ] | [ ] |
| Diferidas 022/109 anunciadas **si aún pendientes** | [x] (tras expand; luego aplicadas en ventana 2) | [ ] | [ ] |

### 2.3 Criterio 6 (redacción audit — permanente)

Ejecutar **por schema ACTIVE** el SQL del informe SEC-P1 § criterio 6 (CTE `new_value` ∪ `old_value`, solo escalares `string`/`number`).  
`pending` debe ser **0**. No volcar payloads.

| Criterio 6 `pending = 0` | dev | staging | prod |
| --- | --- | --- | --- |
| Verificado | [x] 2026-08-06 (10/10 ACTIVE) | [ ] | [ ] |

---

## 3. Periodo de confianza B1 (3–7 días)

El CTO fija al aprobar el plan / go de ventana 1 **prod**:

| Campo | Valor congelado (completar en go) |
| --- | --- |
| Fecha hard ventana 2 (prod) | **D+___** tras ventana 1 prod estable (recomendado 3–7) |
| Owner de seguimiento | PLAT-OPS |
| Criterio de extensión | Solo CTO; no silencioso |

Durante el soak (por entorno que aplique B1 — tipicamente **prod**; staging opcional si se acuerda):

| Soak | staging | prod |
| --- | --- | --- |
| Sin incidentes de login / búsqueda HMAC | [ ] | [ ] |
| Sin flota mixta (paridad intacta) | [ ] | [ ] |
| Diferimiento **no** se alarga sin nueva fecha hard (concern F-2) | [ ] | [ ] |
| Fecha hard registrada | [ ] | [ ] |

---

## 4. Ventana 2 — contract (cierre residual S-1)

**Irreversible sin backup.** A partir de aquí, rollback = restore.

### 4.1 Go / no-go

| Condición | Obligatorio | staging | prod |
| --- | --- | --- | --- |
| Ventana 1 estable en el entorno | Sí | [ ] | [ ] |
| Fecha hard alcanzada o go CTO anticipado | Sí | [ ] | [ ] |
| Backup restaurable verificado **el mismo día** | Sí | [ ] | [ ] |
| `pending` criterio 6 = 0 | Sí | [ ] | [ ] |
| Paridad migraciones OK | Sí | [ ] | [ ] |
| Go CTO producción | Sí (prod) | N/A | [ ] |

*Dev local: go/no-go histórico cumplido 2026-08-06 (ventana 2 aplicada; ver informe). No sustituye staging/prod.*

### 4.2 Ejecución

1. Detener API, web, portal y worker (recomendado; DDL + DROP).
2. Backup fresco + smoke de restore (o evidencia de drill del día).
3. Ejecutar con el contract activo:
   - **Host (staging/dev):** `IWANA_APPLY_PII_CONTRACT=true pnpm db:migrate:all`
   - **Contenedor (prod):** `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production --env-file .env.production run --rm --no-deps -e IWANA_APPLY_PII_CONTRACT=true migrator-prod`. La variable puede ir en `.env.production` durante la ventana, pero **no** debe sumarse al secret store permanente. El literal debe ser **exactamente** `true` (minúsculas): el contract es fail-closed, cualquier otro valor lo deja diferido sin error (ver paso 5).
4. Leer `[MIGRATOR]`:
   - `022` y `109` **aplicadas** (ya no anunciadas como diferidas)
   - Paridad OK en todos los ACTIVE
5. **Stop criterion (ventana 2):** si tras la corrida `022`/`109` **siguen anunciadas como `DIFERIDA`**, la ventana **no se completó**: revisar la inyección/ortografía del env — el contract **solo** se habilita con el literal exacto `true` en minúsculas (fail-closed; `TRUE`, `1`, `yes` o `on` dejan la migración diferida sin error. `envValueIsTrue` ya no abre el contract: únicamente alimenta el aviso F-3 del env residual) — y los guardianes de 022/109. No retirar el env ni registrar el cierre S-1. Si algún tenant falla o la paridad rompe → **no rearrancar** con flota mixta; remediar o alinear rollback.
6. Arrancar + smoke §2.2 paso 7.
7. **Retirar `IWANA_APPLY_PII_CONTRACT`** del mecanismo usado (env-file / `-e`). Matiz de timing: el aviso F-3 («variable activa sin contracts pendientes») se emite al final de la **propia corrida de la ventana 2** y es esperado; el indicador de env residual es que el aviso **aparezca en corridas posteriores** ya sin la variable prevista. Si aparece, retirarla del lugar donde quedó.
8. Verificación estructural (conteos / existencia de columna, **nunca valores**):

```sql
-- Pública: email_hash no debe existir
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'platform_users'
    AND column_name = 'email_hash'
) AS platform_email_hash_exists;  -- esperado: f

-- Por tenant ACTIVE: no deben quedar columnas *_hash de búsqueda PII
-- (solo *_hmac). Ajustar schema.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name IN ('users', 'subscribers', 'expediente_records')
  AND column_name LIKE '%_hash'
ORDER BY 1;  -- esperado: 0 filas de búsqueda PII (email_hash, document_number_hash, …)
```

9. Actualizar informe vivo: residual S-1 **cerrado** en ese entorno; anotar evidencia (conteos, paridad, fecha). La verificación estructural y de paridad cubre **solo schemas `ACTIVE`** (concern F-1): los `MARKED_FOR_DELETION` retienen sus columnas `*_hash` SHA-256 hasta que se eliminen o se reactiven (en cuyo caso pasan primero su propio expand/contract antes de servir tráfico). Un **tenant nuevo** provisionado tras la ventana 2 nace con el contract aplicado automáticamente (el provisioning resuelve el estado de la flota — N-1): el flag es un gate de **primera aplicación**, no humano por corrida — a partir del primer contract aplicado en la flota el provisioning lo replica solo, y la presencia del flag no debe leerse como «hace falta autorización por tenant».

> **Antes de reactivar un tenant `MARKED_FOR_DELETION`:** ejecutar sobre **su** schema la medición de volumen de la 108 (SQL v2 en `scripts/sql/medicion-volumen-108.sql`): el veredicto KEEP `transactional = true` se sostiene sobre una medición del universo `ACTIVE`, y un tenant reactivado aporta volumen que esa medición nunca vio. Si su peak en `users`, `subscribers` o `expediente_records` supera ~50 k, el expand/contract de reactivación se planifica con el orquestador antes de correrlo. Los no-ACTIVE no se migran por diseño; si quedaron rezagados en el contract, es esperado y el CLI solo lo avisa (sin fallar) — verificar su alineación de migraciones en la misma operación.
10. Registrar la **ventana de mantenimiento real** (inicio/fin, entorno, responsable) en el informe vivo y el canal de notificación de mantenimiento acordado, y confirmar que no hay conexiones long-lived (pooler/PgBouncer) reteniendo locks DDL sobre las tablas afectadas (concern F-3).

| Ventana 2 — checklist | dev | staging | prod |
| --- | --- | --- | --- |
| 022/109 aplicadas; sin anuncio DIFERIDA | [x] 2026-08-06 | [ ] | [ ] |
| Paridad OK post-contract | [x] 10×106 | [ ] | [ ] |
| `platform_users.email_hash` ausente | [x] | [ ] | [ ] |
| 0 `*_hash` búsqueda PII en ACTIVE | [x] | [ ] | [ ] |
| Env `IWANA_APPLY_PII_CONTRACT` retirado | [x] | [ ] | [ ] |
| Informe vivo actualizado (entorno) | [x] | [ ] | [ ] |
| Ventana de mantenimiento registrada | [x] (dev) | [ ] | [ ] |

---

## 5. Qué NO hacer

1. Reutilizar `PII_HASH_KEY` entre staging y prod.
2. Commitear la clave o pegarla en tickets/chat.
3. Arrancar API/portal/worker con flota mixta tras fallo parcial.
4. Aplicar ventana 2 sin backup del día.
5. Dejar el diferimiento “sine die” sin fecha hard (F-2).
6. Oleadas por tenant sin ADR.
7. Rotar `PII_HASH_KEY` en la misma ventana que el contract (procedimiento distinto: §6bis).
8. Dejar `IWANA_APPLY_PII_CONTRACT=true` residual en el entorno tras la ventana 2 (concern F-3): se retira al terminar §4.2 paso 7. El CLI avisa si la variable sigue activa sin contracts pendientes — pero solo en corridas posteriores: al final de la propia corrida de la ventana 2 el aviso es esperado.
9. Dar un schema `MARKED_FOR_DELETION` por migrado o verificado solo por estar en la base: no recibe el expand/contract y conserva digests SHA-256 hasta su eliminación (concern F-1).
10. Marcar casillas de staging/prod por evidencia de **dev** (colapsar entornos).

---

## 6. Rollback

| Momento | Acción |
| --- | --- |
| Tras ventana 1, **antes** de ventana 2 | Revertir binario si hace falta; digests SHA-256 siguen (salvo altas post-expand). `down` de 021/108 con flag destructivo solo si hay huérfanos — ver cabeceras de migración. |
| Tras ventana 2 | **Solo restore de backup**. No hay reconstrucción de SHA-256 originales. |

---

## 7. Matriz RACI (resumen)

| Actividad | CTO | PLAT-OPS | EM-ARCH | SR-QA | SEC-ENG | DATA-ENG |
| --- | --- | --- | --- | --- | --- | --- |
| Go secretos / fecha hard B1 | A | R | C | I | C | I |
| Inyectar `PII_HASH_KEY` | I | R | C | I | C | — |
| Ventana 1 / 2 migraciones | A (prod) | R | C | C | C | C (re-medir) |
| Smoke + criterio 6 | I | C | C | R | C | — |
| Cierre residual S-1 en informe | I | C | R | C | A (G-SEC) | — |
| Actualizar casillas de este runbook | I | R | C | C | C | — |

R = responsable · A = aprueba · C = consultado · I = informado
