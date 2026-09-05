# INFORME — MOD12 Catálogo · F3 · Diagnóstico de los SKU ya emitidos

- **Fase:** F3 — diagnóstico de solo lectura (sin cambios de código, datos ni configuración)
- **Ejecutado por:** AI-DATA-ENG
- **Fecha:** 2026-09-02
- **Prompt normativo:** `docs/prompts/PROMPT-MOD12-CATALOGO-FASE-F3-DIAGNOSTICO-SKU-v1.0.md`
- **Estado:** ⛔ **BLOCKED** — no existe entorno con datos representativos que medir (ver §Bloqueos)
- **Implementación de referencia:** `packages/shared/src/inventory/inventory-item-sku.ts` (`buildCompositeSkuBase` L137-147, `appendCollisionSuffix` L149-153)

---

## 1. Entorno medido y su naturaleza (declaración sin ambigüedad)

| Atributo | Valor |
| --- | --- |
| Naturaleza del entorno | **Desarrollo local** (Docker Compose del workspace, archivo `.env` raíz) |
| Motor | PostgreSQL 18.3 (`iwana_postgres_dev`), con PgBouncer delante |
| Base de datos | Una única base con datos en la instancia (además de la base `postgres` vacía por defecto) |
| Tenancy | 1 tenant activo: slug `iwana` → schema `tenant_iwana` (estado `ACTIVE`, creado 2026-08-11) |
| Contenido del catálogo | `tenant_iwana.inventory_items` = **0 filas**. `inventory_categories` = 2. `users` = 3 (actividad entre 2026-08-11 y 2026-09-02) |
| Otros entornos | Ningún entorno e2e/staging/producción accesible desde esta sesión; el compose e2e no está levantado |

**Declaración explícita (CA-F3-01):** este es un entorno **local de desarrollo sin un solo producto cargado**. No contiene datos de producción ni de staging. Un diagnóstico sobre este entorno **no es evidencia** sobre la incidencia real del defecto y **no se presenta como tal**. Dado que la población a medir es 0, la medición se detiene aquí conforme al criterio de stop del prompt maestro (§7): presentar histogramas sobre cero filas sería peor que no medir.

---

## 2. Trazabilidad de la verificación (todo en modo solo lectura)

Cada conexión se ejecutó envuelta en `BEGIN TRANSACTION READ ONLY … ROLLBACK`, vía el cliente `psql` del contenedor de base de datos, con credenciales tomadas del `.env` del workspace (no reproducidas aquí ni en ningún artefacto). Consultas efectivamente ejecutadas y su resultado:

1. **Enumeración de tenants** (Q0 abajo) → 1 fila: tenant `iwana`, schema `tenant_iwana`, `ACTIVE`.
2. **Conteo total de productos** → `0`.
3. **Histograma estructural de SKU** → 0 filas (no hay nada que clasificar; el criterio de stop por SKU desconocidos no llega a activarse porque no existe ninguna fila).
4. **Inventario de bases y schemas de la instancia** → solo `public` y `tenant_iwana`; una sola base de aplicación. Descarta que los datos vivan en otra base del mismo motor.
5. **Caracterización del vacío** → el schema del tenant no es un schema recién provisionado e intocado: tiene categorías de inventario y usuarios con actividad hasta la fecha de hoy (2026-09-02). El catálogo de productos simplemente **nunca fue poblado** en esta base (tampoco existen semillas de `inventory_items` en el repo: la búsqueda de seeders de inventario solo encuentra specs de migración, no datos).

Conclusión de la verificación: la ausencia de datos es un hecho del entorno, no un fallo de conectividad ni de permisos de lectura.

---

## 3. Resultados de la medición

**No aplicable — población medida: 0 productos.** La tabla de conteos se reproduce por completitud y trazabilidad; todos los valores son cero y **ninguno es representativo** de ningún entorno real.

| Punto de medida (§3 del prompt) | Tenant `iwana` (`tenant_iwana`) | Total |
| --- | ---: | ---: |
| 3.1 Total de productos | 0 | 0 |
| 3.2 Con marca poblada / con modelo poblada / con ambas | 0 / 0 / 0 | 0 / 0 / 0 |
| 3.3 v1 heredado (`{PREFIJO}-{NNNNNN}`) | 0 | 0 |
| 3.3 Compuesto degradado (3 segmentos) | 0 | 0 |
| 3.3 Compuesto parcial (4 segmentos) | 0 | 0 |
| 3.3 Compuesto completo (5 segmentos) | 0 | 0 |
| 3.3–3.4 Con sufijo de colisión `-NNN` / sufijo máximo | 0 / n.a. | 0 / n.a. |
| **3.5 Degradados con marca o modelo poblados (cifra destacada)** | **0 — no medible** | **0 — no medible** |
| 3.6 Distribución por `created_at` | sin filas | sin filas |

**Cifra §3.5 (CA-F3-04):** no existe evidencia empírica del defecto en este entorno porque no hay productos. La cifra queda formalmente reportada como **no medible**, no como 0 % de incidencia.

### Lectura del dato en una línea

**No hay dato: el entorno local está vacío (0 productos), por lo que la pregunta «¿hay algo que remediar y en qué volumen?» queda sin respuesta empírica y debe re-mediirse esta fase sobre un entorno con datos reales.**

---

## 4. Consultas usadas (metodología reproducible y auditable)

Ejecutar por schema de tenant (sustituir `<SCHEMA>` por cada `schema_name` de Q0). Conexión de referencia (credenciales y host provienen de las variables `DB_*` del `.env` del workspace; **no se reproducen valores**):

```bash
docker exec -e PGPASSWORD="$DB_PASSWORD" <contenedor_postgres> \
  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "BEGIN TRANSACTION READ ONLY; <consulta>; ROLLBACK;"
```

### Q0 — Inventario de tenants (schema `public`)

```sql
SELECT slug, schema_name, status, created_at
FROM public.tenants
WHERE deleted_at IS NULL
ORDER BY created_at;
```

### Q1 — Conteo total de productos

```sql
SELECT count(*) AS total_productos
FROM <SCHEMA>.inventory_items;
```

### Q2 — Clasificación estructural del SKU (poblaciones + sufijo de colisión)

Clasifica por estructura de segmentos; el sufijo de colisión se detecta como **último segmento de exactamente 3 dígitos** y se contabiliza aparte, nunca como segmento (CA-F3-03). La población se determina sobre la base sin el sufijo candidato.

```sql
WITH items AS (
    SELECT sku,
           brand,
           model,
           created_at,
           string_to_array(sku, '-')                  AS seg,
           array_length(string_to_array(sku, '-'), 1) AS n_seg
    FROM <SCHEMA>.inventory_items
),
norm AS (
    SELECT i.*,
           (seg[n_seg] ~ '^[0-9]{3}$') AS termina_sufijo_candidato,
           CASE WHEN seg[n_seg] ~ '^[0-9]{3}$'
                THEN regexp_replace(sku, '-[0-9]{3}$', '')
                ELSE sku
           END AS base_sku
    FROM items i
),
base AS (
    SELECT n.*,
           string_to_array(base_sku, '-')                  AS bseg,
           array_length(string_to_array(base_sku, '-'), 1) AS b_n
    FROM norm n
),
cls AS (
    SELECT b.*,
           CASE
             WHEN b_n = 2 AND bseg[2] ~ '^[0-9]{6}$'
               THEN 'v1_heredado'
             WHEN b_n = 3 AND bseg[2] IN ('STK','CON','SER','SVC')
               THEN 'compuesto_degradado'
             WHEN b_n = 4 AND bseg[2] IN ('STK','CON','SER','SVC')
               THEN 'compuesto_parcial'
             WHEN b_n = 5 AND bseg[2] IN ('STK','CON','SER','SVC')
               THEN 'compuesto_completo'
             ELSE 'no_clasificado'
           END AS poblacion
    FROM base b
)
SELECT poblacion,
       count(*) AS productos,
       round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS pct,
       count(*) FILTER (WHERE termina_sufijo_candidato
                          AND poblacion <> 'no_clasificado') AS con_sufijo_colision,
       count(*) FILTER (WHERE brand IS NOT NULL)             AS con_marca,
       count(*) FILTER (WHERE model IS NOT NULL)             AS con_modelo,
       count(*) FILTER (WHERE brand IS NOT NULL
                          AND model IS NOT NULL)             AS con_marca_y_modelo
FROM cls
GROUP BY poblacion
ORDER BY poblacion;
```

Notas de clasificación:

- **v1 heredado:** 2 segmentos con segundo segmento numérico de 6 dígitos. Con sufijo de colisión queda en 3 segmentos (`{PREFIJO}-{NNNNNN}-{NNN}`) y sigue clasificando como v1 porque la población se evalúa sobre la base.
- **Compuesto:** el segmento 2 es el código de tipo (`STK`/`CON`/`SER`/`SVC`, `INVENTORY_ITEM_KIND_SKU_CODES`); 3 segmentos = degradado, 4 = parcial, 5 = completo.
- **`no_clasificado`:** recoge, entre otros, los SKU explícitos que el tenant pudo enviar desde v1 (trigger híbrido: SKU provisto se respeta). Cualquier fila en este bucket es un hallazgo a escalar antes de interpretar el resto.

### Q3 — Cifra §3.5: degradados con marca o modelo poblados (defecto en estado puro)

```sql
WITH items AS (
    SELECT sku, brand, model,
           string_to_array(sku, '-')                  AS seg,
           array_length(string_to_array(sku, '-'), 1) AS n_seg
    FROM <SCHEMA>.inventory_items
),
base AS (
    SELECT i.*,
           CASE WHEN seg[n_seg] ~ '^[0-9]{3}$'
                THEN regexp_replace(sku, '-[0-9]{3}$', '')
                ELSE sku END AS base_sku
    FROM items i
),
cls AS (
    SELECT b.*,
           string_to_array(base_sku, '-')                  AS bseg,
           array_length(string_to_array(base_sku, '-'), 1) AS b_n
    FROM base b
)
SELECT count(*) AS degradados_con_marca_o_modelo
FROM cls
WHERE b_n = 3
  AND bseg[2] IN ('STK','CON','SER','SVC')
  AND (brand IS NOT NULL OR model IS NOT NULL);
```

### Q4 — Presión de colisión: sufijo más alto alcanzado

```sql
SELECT max((regexp_match(sku, '-([0-9]{3})$'))[1]::int) AS sufijo_maximo,
       count(*) FILTER (WHERE sku ~ '-[0-9]{3}$')       AS filas_con_sufijo_candidato
FROM <SCHEMA>.inventory_items;
```

### Q5 — Antigüedad: distribución por mes de creación

```sql
SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS mes,
       count(*) AS productos
FROM <SCHEMA>.inventory_items
GROUP BY 1
ORDER BY 1;
```

### Q6 — Control de ambigüedad estructural (no confundir sufijo con segmento)

Un compuesto de 4 o 5 segmentos cuyo último segmento real (marca/modelo abreviado) fuera numérico de exactamente 3 dígitos —p. ej. un modelo «325»— se detectaría como sufijo de colisión por estructura. Esta consulta dimensiona ese subconjunto ambiguo para no inflar la cifra de colisiones:

```sql
WITH items AS (
    SELECT sku,
           string_to_array(sku, '-')                  AS seg,
           array_length(string_to_array(sku, '-'), 1) AS n_seg
    FROM <SCHEMA>.inventory_items
),
base AS (
    SELECT i.*,
           CASE WHEN seg[n_seg] ~ '^[0-9]{3}$'
                THEN regexp_replace(sku, '-[0-9]{3}$', '')
                ELSE sku END AS base_sku
    FROM items i
)
SELECT count(*) AS casos_ambiguos
FROM base
WHERE sku ~ '-[0-9]{3}$'
  AND array_length(string_to_array(base_sku, '-'), 1) IN (3, 4)
  AND string_to_array(base_sku, '-')[2] IN ('STK','CON','SER','SVC');
```

Si `casos_ambiguos > 0`, desglosar por tenant con señales secundarias (valores actuales de `brand`/`model`, repetición de `base_sku` en otra fila) y reportar el subconjunto por separado, nunca sumado a las colisiones confirmadas.

**Agregado multi-tenant:** el total es la suma de los resultados por tenant (Q0 → iterar Q1-Q6 por `schema_name`). No se cruzan datos entre tenants más allá del agregado aritmético.

---

## 5. §Bloqueos

**[BLOQUEO] F3-01 — No existe entorno con datos representativos para medir.**

- **Causa:** el único entorno accesible es desarrollo local (Docker) con `inventory_items` vacía (0 filas en el único schema de tenant, `tenant_iwana`). No hay staging ni producción alcanzables desde esta sesión, y el entorno e2e no está levantado (y sus fixtures no serían representativos tampoco).
- **Impacto:** la Fase F3 no puede producir la evidencia de volumen que necesita la decisión del CTO. Ninguna cifra de este informe es representativa.
- **Intentado y descartado:** enumeración de todas las bases y schemas de la instancia (solo `public` y `tenant_iwana`); verificación de que el schema del tenant sí está en uso (usuarios con actividad hasta hoy) pero sin un solo producto; búsqueda de seeders de inventario en el repo (no existen datos sembrados de `inventory_items`).
- **Qué se necesita para desbloquear:** un entorno con datos reales o representativos (staging con carga real, o un dump anonimizado de producción restaurado en un entorno controlado) accesible en solo lectura desde esta sesión. Con las consultas Q0-Q6 de §4 la medición es inmediata y no requiere ningún cambio de código.
- **Escalado a:** AI-EM-ARCH (agente padre / orquestador), conforme al criterio de stop §7 del prompt maestro.

**[CONCERNO] F3-02 — Línea base de `git diff` en `apps/` y `packages/` no está vacía al iniciar la fase.** Existen modificaciones preexistentes de otras sesiones (62 archivos, +5266/−1801) no atribuibles a esta fase. La verificación de cero escrituras de esta sesión se hace por comparación contra esa línea base capturada al inicio (ver §6).

---

## 6. Verificación de cero escrituras (CA-F3-06)

- Naturaleza de la fase: **solo lectura**. No se ejecutó ningún `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, migración ni job; cada conexión se abrió con `BEGIN TRANSACTION READ ONLY` y cerró con `ROLLBACK`.
- No se creó ningún script auxiliar dentro del repo; el trabajo se hizo con consultas ad-hoc y la huella de línea base se guardó fuera del workspace (`%TEMP%\opencode\`).
- Línea base capturada al inicio de la sesión:

```text
$ git diff --shortstat apps/ packages/
 62 files changed, 5266 insertions(+), 1801 deletions(-)
```

- Único archivo creado por esta sesión: este informe (`docs/informes/`), fuera de `apps/` y `packages/`. La comparación contra la línea base al cierre debe ser idéntica al output anterior (verificado en el reporte final de sesión).

---

## 7. Alcance respetado

- No se propone remediación alguna (regeneración de SKU, repoblado, cambios de UI ni de backend): eso corresponde a la sesión de decisión del CTO y, si prosiguiera, exigiría un ADR nuevo que contradiga la inmutabilidad del ADR-INV-SKU-COMPUESTO-v1.
- El informe no contiene PII, datos reales de productos ni credenciales: solo conteos (todos cero), identificadores estructurales del entorno (slug y schema del tenant, necesarios para auditar la tenancy) y SQL reproducible parametrizado.
