# INFORME — MOD12 UoM · F5a · Diagnóstico previo de unidades (Paso 1)

- **Fase:** F5a — D1 y D4 de ADR-085 (pasos 1 y 3 del lado AI-DATA-ENG)
- **Ejecutado por:** AI-DATA-ENG
- **Fecha:** 2026-09-03
- **Prompt normativo:** `docs/prompts/PROMPT-MOD12-UOM-FASE-F5A-CATALOGO-Y-MIGRACION-v1.0.md` (v1.0)
- **ADR normativo:** `docs/adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md` (Aprobado)
- **Estado:** ⚠️ **DONE_WITH_CONCERNS** — diagnóstico ejecutado y migración 122 construida y probada; **la aplicación de la migración en cualquier entorno con datos queda BLOQUEADA** hasta contar con diagnóstico sobre datos representativos (ver §Bloqueos)
- **Alcance de este informe:** Paso 1 (diagnóstico) + Paso 3 (migración 122) del lado AI-DATA-ENG. El catálogo en `packages/shared` (Paso 2), la adaptación de entidad/DTO/superficies (Paso 4) y el informe de ejecución F5A corresponden a AI-SR-FULL.

---

## 1. Entorno medido y su naturaleza (declaración sin ambigüedad)

| Atributo | Valor |
| --- | --- |
| Naturaleza del entorno | **Desarrollo local** (Docker Compose del workspace, config `.env.development`) |
| Motor | PostgreSQL 18.3 |
| Base de datos | `dbiw` (única base con datos de aplicación; además existe `postgres` vacía por defecto) |
| Schemas en la instancia | Solo `public` y `tenant_iwana` — descarta que los datos vivan en otra base o schema |
| Tenancy | 1 tenant activo: slug `iwana` → schema `tenant_iwana` (estado `ACTIVE`, creado 2026-08-11) |
| Contenido medido | `tenant_iwana.inventory_items` = **0 filas**. `stock_movements` = 0. `stock_balances` = 0. `inventory_categories` = 2. `users` = 3 |
| Otros entornos | Ningún entorno e2e/staging/producción accesible desde esta sesión |
| Semillas en el repo | No existen seeders de `inventory_items` (búsqueda en `packages/database/src` sin resultados) |

**Declaración explícita (CA-F5A-01):** este es un entorno **local de desarrollo sin un solo producto cargado** — la misma línea base que registró la Fase F3 (0 productos en el tenant `iwana`, verificada de forma independiente en este paso). No contiene datos de producción ni de staging. Un diagnóstico sobre este entorno **no es evidencia** sobre los valores reales de unidad en ningún entorno con operación, y **no se presenta como tal**. La población a normalizar aquí es 0: no se encontró ningún valor sin equivalencia exacta **porque no se encontró ningún valor**.

---

## 2. Trazabilidad de la verificación (todo en modo solo lectura)

Método: scripts auxiliares fuera del repo (`C:\Users\SLEYB\AppData\Local\Temp\opencode\`, no versionados), rol de lectura `iwana_app`, credenciales tomadas del `.env` del workspace (**no reproducidas aquí ni en ningún artefacto**). Cada consulta de tenant corrió en `BEGIN TRANSACTION READ ONLY` + `SET LOCAL search_path` + `ROLLBACK` (compatible pgBouncer). Consultas efectivamente ejecutadas y su resultado:

1. **Enumeración de tenants** (`SELECT schema_name, status FROM public.tenants`) → 1 fila: `tenant_iwana`, `ACTIVE`.
2. **Conteo total de productos por tenant** → `0`.
3. **Valores distintos de `unit_of_measure` con conteo por valor** → 0 filas (nada que clasificar).
4. **Valores distintos de `purchase_unit_of_measure` con conteo por valor** → 0 filas.
5. **Artículos con `purchase_to_base_uom_factor` poblado + distribución de factores** → 0.
6. **Conteos de `stock_movements` y `stock_balances`** → 0 y 0 (línea base para CA-F5A-04).
7. **Inventario de bases y schemas de la instancia** → bases `dbiw`, `postgres`; schemas `public`, `tenant_iwana`.
8. **Caracterización del vacío** → el schema no es recién provisionado e intocado (2 categorías, 3 usuarios); el catálogo de productos simplemente **nunca fue poblado** en esta base, y el repo no contiene semillas de `inventory_items`.

Conclusión de la verificación: la ausencia de datos es un hecho del entorno, no un fallo de conectividad ni de permisos.

---

## 3. Resultados de la medición

**Población medida: 0 productos.** La tabla se reproduce por completitud y trazabilidad; todos los valores son cero y **ninguno es representativo** de ningún entorno real.

| Punto de medida (prompt §Paso 1) | Tenant `iwana` (`tenant_iwana`) | Total |
| --- | ---: | ---: |
| Total de artículos en `inventory_items` | 0 | 0 |
| Valores distintos de `unit_of_measure` | — (sin filas) | — |
| Conteos por valor de `unit_of_measure` | — (sin filas) | — |
| Valores distintos de `purchase_unit_of_measure` | — (sin filas) | — |
| Conteos por valor de `purchase_unit_of_measure` | — (sin filas) | — |
| Con `purchase_to_base_uom_factor` poblado | 0 | 0 |
| Distribución de factores distintos | — (sin filas) | — |
| `stock_movements` / `stock_balances` | 0 / 0 | 0 / 0 |

**Valores distintos encontrados:** ninguno (entorno vacío).

---

## 4. Veredicto explícito (CA-F5A-01)

- **En el entorno medido (`dbiw` local):** la migración 122 se aplicó limpiamente y resultó no-op (0 filas; saldos y movimientos idénticos antes/después: 0/0). No apareció ningún valor sin equivalencia exacta.
- **Para cualquier entorno con datos (staging, producción, cualquier tenant poblado): la migración NO puede declararse completable.** El criterio de stop del prompt es explícito: sin entorno con datos representativos, normalizar a ciegas es peor que no normalizar. **La aplicación de la 122 fuera del vacío local queda detenida** hasta que se ejecute este mismo diagnóstico por tenant sobre datos representativos y cada valor encontrado tenga equivalencia exacta en el mapa (§5), o haya decisión humana documentada para el que no la tenga.
- **El código de la migración con comportamiento de parada queda construido y probado** (§6); lo que se detiene es su aplicación, no su construcción — conforme al encargo.

---

## 5. Mapa exacto aplicado (prompt §3.3 + ADR-085 D4 — no inventado)

```
'unidad', 'UND', 'und', 'UNIDAD' → UNIT
'metro', 'm', 'M', 'METRO'       → METER
'caja', 'CAJA'                   → BOX
```

- Fuente: prompt F5a Paso 3 + ADR-085 D4 (el ADR lista el subconjunto `'unidad'`, `'UND'`, `'und'` → `UNIT`; `'metro'`, `'m'` → `METER`; `'caja'` → `BOX`; el prompt fija el mapa completo vigente, que lo contiene).
- Los códigos ya canónicos (`UNIT`, `METER`, `BOX`) se aceptan por identidad para idempotencia; la identidad es igualdad exacta, no normalización difusa.
- El resto de la cobertura del catálogo del ADR (rollo, paquete, kilómetro, kilogramo, gramo, litro, hora) **no tiene equivalencia legacy exacta** y por tanto no participa en la migración: un `litro` en datos existentes **detiene** la migración (probado, §6 fase A), no se infiere. Añadir equivalencias es decisión humana vía ADR, nunca heurística de ejecución.

### Semántica de parada por tenant (CA-F5A-08)

La 122 valida y normaliza **dentro de la transacción del schema que el runner le entrega**. Un `RAISE` por valor no mapeable hace rollback solo de ese tenant (verificado: el fixture de parada conservó `litro`/`caja` intactos tras el error). El runner (`runTenantMigrations`) captura el fallo por tenant, continúa con los demás y resume al final — **una parada no bloquea a los demás tenants**, y es un resultado legítimo, no un fallo.

---

## 6. Migración 122 — construcción y pruebas (Paso 3)

**Archivos (alcance AI-DATA-ENG, sin tocar `packages/shared`, entidad, DTO ni superficies):**

- `packages/database/src/migrations/tenant/122_normalize_uom_to_canonical_catalog.ts` (nueva)
- `packages/database/src/migrations/tenant/122_normalize_uom_to_canonical_catalog.spec.ts` (nueva)
- `packages/database/src/migrations/tenant/runner.ts` (quirúrgico: +2 líneas de la 122; se preservaron intactas las líneas ajenas sin commitear de la 120/121)

**Propiedades verificadas:**

| Propiedad | Evidencia |
| --- | --- |
| Equivalencia exacta, sin difusa | Spec: el SQL contiene los 10 literales y `THEN 'UNIT'/'METER'/'BOX'`; prohíbe `LOWER(`, `TRIM(`, `ILIKE`, `SIMILAR TO`, similitud |
| Parada con caso deliberado no mapeable (CA-F5A-03) | Spec (mock) + **prueba real en BD**: fixture `litro` → `up` lanza `RAISE` reportando valor, conteo y schema; rollback deja la fila intacta |
| `down()` sin pérdida (CA-F5A-05) | Spec + **prueba real**: `UND`/`caja` → `UNIT`/`BOX` → `down` restaura `UND`/`caja` exactos vía tabla `uom_normalization_122_provenance` (eliminada al final) |
| Saldos intactos (CA-F5A-04) | Spec (el SQL no menciona `stock_movements`, `stock_balances` ni escribe el factor) + **conteos reales idénticos antes/después** (0/0 en entorno vacío; la prueba con fixture confirmó que el factor `24` quedó intacto) |
| Factor sin aplicar (F5b fuera) | `purchase_to_base_uom_factor` no aparece en el SQL; `goods-receipt.service.ts` sin cambios (`git diff` vacío en ese archivo) |
| Por tenant, reversible, idempotente | Valida `current_schema()` + tenant canónico + `search_path`; canónicos aceptados por identidad; `ON CONFLICT DO NOTHING` en provenance |
| Orden del runner | `migration-order.spec.ts` en verde (6/6); la 122 queda última, tras la 121 |

**Salidas de comandos:**

- Spec 122: **8/8 en verde** (`NormalizeUomToCanonicalCatalog122`).
- `pnpm --filter @iwana/db typecheck`: **en verde**.
- `migration:tenant:run` (real, `tenant_iwana`): aplica la 122, paridad OK (117 migraciones = código).
- `migration:tenant:revert -- --schema=tenant_iwana --yes` (real): revierte la 122 (`down()` en BD real).
- Re-aplicación posterior: paridad OK; la 122 queda aplicada y registrada; conteos finales `items=0, movimientos=0, saldos=0`.
- Fixtures de prueba (`PRB122-STOP`, `PRB122-MAP`) **eliminados**; la BD local queda sin residuos (verificado por conteo final).

---

## 7. Bloqueos

```text
[BLOQUEO] De: AI-DATA-ENG | Fase/módulo: MOD12 F5a (UoM) — aplicación de la migración 122
Qué intenté: diagnóstico previo por tenant sobre el único entorno accesible (dbiw local:
único tenant ACTIVE tenant_iwana con 0 productos, 0 movimientos, 0 saldos; sin semillas
en el repo; sin acceso a staging/producción).
Qué falta para desbloquear: ejecutar este mismo diagnóstico por tenant sobre un entorno
con datos representativos (staging o réplica productiva anonimizada) y, por cada valor
distinto encontrado, o bien confirmar equivalencia exacta en el mapa del §5, o bien
registrar decisión humana documentada para el valor no mapeable antes de aplicar la 122
en ese tenant. La 122 ya detiene y reporta por sí misma ante lo no mapeable; este bloqueo
cubre la decisión de *dónde y cuándo* correrla, no su construcción (completa y probada).
Impacto si no se resuelve: aplicar la 122 en un tenant poblado sin diagnóstico previo
viola el criterio de stop del prompt F5a; ante el primer valor no mapeable la migración
se detendrá a mitad del programa (correcto pero no planificado) en vez de aplicarse con
veredicto previo favorable.
```

Sin `git stash` ni `git commit` (cambios en working tree para revisión del orquestador).

---

## 8. Notas de higiene

- Sin PII ni credenciales en este informe ni en los artefactos: solo conteos y literales de unidad del mapa normativo.
- `goods-receipt.service.ts` sin cambios (F5b intacto).
- No se tocaron `packages/shared`, entidad, DTO ni formularios (alcance de AI-SR-FULL en paralelo).
