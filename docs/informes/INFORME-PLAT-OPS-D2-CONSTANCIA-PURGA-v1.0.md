# INFORME — D-2 · Constancia previa a la purga + P2-1/P2-2 de sec-eng

**Versión:** 1.0
**Fecha:** 2026-11-10
**Estado:** Código local completo y verde (commit `547986b2`); G6.5 pendiente del push por tren (Reserva F ya resuelta y F-flakies corregidos).
**Autor:** AI-EM-ARCH (ejecutor)
**Spec:** [2026-11-10-plat-ops-d2-constancia-purga-tenant.md](../specs/2026-11-10-plat-ops-d2-constancia-purga-tenant.md) v1.0
**Plan:** [2026-11-10-plat-ops-d2-constancia-purga-tenant.md](../plans/2026-11-10-plat-ops-d2-constancia-purga-tenant.md)
**Origen:** seguimientos del [cierre DT-4/P3-5](INFORME-PLAT-OPS-DT4-P35-CIERRE-v1.0.md) §5 (R7 → G7 requiere P2-1, P2-2 y D-2). La sesión anterior se interrumpió a mitad de la validación y esta sesión consolidó lo restante.

## 1. Alcance entregado (sin commitear, base `eda576fc`)

| Bloque | Qué cambia |
| --- | --- |
| D-2 (migración 031) | Tabla `public.tenant_purge_evidence` en `public`, RLS forzado, política de lectura solo para el dueño de las funciones de purga, trigger contra `TRUNCATE`, alta/revocación auditadas vía `iwana_record/revoke_tenant_purge_evidence` con el lock de R7 (advisory `43` + `FOR UPDATE NOWAIT`). `iwana_list_purge_candidates` filtra por constancia vigente e `iwana_purge_tenant_schema` la re-verifica tras bloquear la fila y antes de auditoría/DDL. `up`/`down` transaccionales. |
| P2-2 (migración 030) | Guarda de dependencias ampliada al catálogo restante (codificación/reglas, operadores, clases/familias de operadores, conversiones, configuración de búsqueda, estadística extendida) y descalificación de miembros de extensiones: purga fail-closed. |
| P2-1 (membresías transitivas) | Guardas en `docker/postgres/init/01-create-roles.sh` y `scripts/db/apply-least-privilege.{sql,sh,mjs}` con `pg_has_role(...,'MEMBER')` dentro de la transacción de grants, barrido completo de `pg_auth_members` saliente del purger y rollback si la guarda falla. |
| Worker | Dos códigos nuevos en la lista cerrada (`TENANT_PURGE_EVIDENCE_REQUIRED`, `TENANT_PURGE_EVIDENCE_ISOLATION`) y su clasificación sin filtrar esquema. |
| Auditoría inherente | REVOKE explícito de la tabla de constancias para `iwana_app` en `apply-least-privilege.sql` (y el test mjs cableado en `test:tooling`). |

## 2. Verificación con conteo real (2026-11-10, sin caché)

| Verificación | Resultado |
| --- | --- |
| `turbo run lint typecheck --filter=@iwana/db --filter=@iwana/worker --force` | ✅ 8/8 tareas (5 avisos preexistentes de `@iwana/db`) |
| Unitario `@iwana/db` | ✅ 79 suites / 429 pruebas |
| Unitario `@iwana/worker` (incluye processor spec: 12) | ✅ 21 suites / 199 pruebas |
| Integración `@iwana/db` desechable (`iwana-r7-d2-validation`, 029/030/031 aplicadas) | ✅ 57 suites / 213 pruebas, incl. 031 con 10 casos (dos kinds, ausencia, baja nueva, revocación serializada, `EVIDENCE_BUSY` 55P03, RLS/escritura denegada, TRUNCATE, reversión sin constancias) |
| Integración `@iwana/worker` (`R0_3_REAL_DB=1`) | ✅ 3 suites / 5 pruebas (fixture registra constancia sintética y limpia) |
| `test:tooling` con el test de roles GSEC-N1 R7 cableado | ✅ (cronometrar al cierre) — 26 pruebas del guard contra PPA reales |
| Pruebas eliminadas en el diff | 0 — los conteos de línea base no pueden bajar |

## 3. Revisiones (solo lectura, sin bloqueantes)

| Verificador | Veredicto |
| --- | --- |
| `boundary-reviewer` | Aprobado. 6 menores: (a) REVOKE ACL de la tabla de constancias — **aplicado**; (b) supuesto de dueño único/estable para la política — **documentado en la spec**; (c) cobertura de los 2 códigos del processor — **cobertura añadida** (12 pruebas); (d) trazabilidad de SQLSTATE 22023 → `TENANT_PURGE_FAILURE` — decisión registrada; (e) DRY de fixtures — se conserva (spec 029 inline, fixture worker con guarda de entorno distinta); 0 bloqueantes. |
| `sec-eng` | GO para los tres entregables (D-2, P2-1, P2-2 — el P2 original queda cerrado). Dos P3 y dos informativos, ver §4. |
| `test-change-reviewer` | Sin relajación de expectations preexistentes; constancia sintética sin huérfanos; cobertura §Aceptación 4/5 (el caso 5 de primera purga real es procedimiento operativo, no automatizable). Detectó test mjs sin cablear — **cableado** en `test:tooling` — y el hueco del passthrough del processor — **cubierta**. |

## 4. Preguntas abiertas que quedan

| Pregunta | Acción | Dueño sugerido |
| --- | --- | --- |
| s1 · El barrido de membresía continua solo cruza los roles de la lista. | Barrer `pg_auth_members` completo hacia app/migrator (+ rol descubridor), P3. | sr-backend / plat-ops |
| s2 · Políticas de lectura construidas con el dueño vigente en el momento de la migración. | Documentado en la spec D-2 (§Operación DBA). No bloquea. | runbook de despliegue |
| s3 ·shot1/revocación de constancia solo por superusuario (canal DBA autorizado). | Confirmado en el diseño aprobado; registrar el canal de producción. | AI-EM-ARCH / CTO |
| s4 · Huella SHA-256 sin sal. | Requisito de la spec; el custodio documenta que el hash no permite comparación externa. | custodio / responsable jurídico |

## 5. Estado G7

D-2 y los dos P2 de sec-eng quedan satisfechos tecnológicamente; G7 (primera purga real) se despliega con la especificación D-2 §Operación DBA: inventario de solo lectura, disciplina cada baja elegible con su constancia vigente, documento original custodiado fuera del repo, lote 1 (`TENANT_PURGE_BATCH_SIZE=1`). La constancia efectiva por diseño aún no se sabe si se garantiza: se requiere la devolución/instrucción real del ISP antes de la primera purga.

## 6. Reserva F (otra raíz del mismo día)

**Resuelta el 2026-11-10 (CTO): F descartada y revertida.** La muestra en CI `42722797012` quedó con 2 válidos (4,27 y 4,49) sobre el umbral de conservación 4,0275 y 2 rojos clasificados (carreras IPAM y teléfono-listo, ambos con causa documentada en la spec §10.5); el intento 5 se canceló. Los dos flakies ya tienen su corrección en commit local (`29a265e9`); la reversión de `7fa0f5ae` sale en su propio commit. Queda pendiente de abrir el encargo N=3 (spec §10.6).

**En el mismo bloque pendiente de publicación:** `eda576fc` (R8) y `c7eb5636` (estado de cuenta) siguen local; el push sale con el tren cuando el CTO ordene publicar.

---
Se omitió: no se ejecutó la suite completa de `apps/api`. Riesgo: el contenido exacto de los restantes commits del tren y los detalles del informe transversal pueden variar respecto a este documento después de la revisión documental del cierre de fase.
