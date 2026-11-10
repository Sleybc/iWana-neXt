# INFORME — Cierre de DT-4 (tenant marcado fuera del aprovisionamiento) y P3-5 (integraciones con la cadena tenant real)

**Versión:** 1.0
**Fecha:** 2026-11-09
**Estado:** Cerrado. G6.5 ✅ sobre `965bf5e5`.
**Autor:** AI-EM-ARCH
**Spec:** `docs/specs/2026-11-09-plat-ops-dt4-aprovisionamiento-tenant-marcado.md` v1.1 (G0 del CTO; §9 G6; §10 G6.5)
**Origen:** deudas DT-4 y P3-5 heredadas del cierre del clúster MOD05 (`docs/informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`, §«Cierre AI-EM-ARCH»).

## 1. Alcance entregado

| Encargo | Commit | Qué cambia |
| --- | --- | --- |
| P3-5 | `c5be2ab2` | 30 `*.postgres.integration.spec.ts` construyen su esquema con `applyTenantMigrationsInOrder` en vez de DDL a mano. Tres aserciones de `anonymize-titular` pasan a `toBeNull`, respaldadas por las migraciones tenant 087 y 148. |
| DT-4 | `965bf5e5` | El worker solo aprovisiona tenants en `PROVISIONING`. Las transiciones de estado siguen la tabla de `tenant-status-transitions.ts` y se aplican con `UPDATE` condicionado al estado de partida. `retry-provisioning` acepta `PROVISIONING` y `PROVISIONING_FAILED` (enmienda aprobada por el CTO) y responde 409 `TENANT_PROVISIONING_IN_PROGRESS` / `TENANT_NOT_RETRYABLE`. R1: un borrado repetido ya no reinicia `deleted_at`. R2: `PATCH /tenants/:id` limita los valores de `status`. |

Tamaño (`git show --stat`):

- P3-5: 30 archivos, +1 804 / −1 655. Se retira el DDL manual de las suites a cambio de la cadena real.
- DT-4: 12 archivos, +2 038 / −97. La mayor parte son pruebas nuevas (`tenant-provisioning.marked.integration.spec.ts`, specs de transiciones y del procesador).

## 2. Gates

| Gate | Resultado | Evidencia |
| --- | --- | --- |
| G0 | ✅ CTO, 2026-11-09 | Spec v1.1, incluidos R1/R2 y la enmienda de `retry-provisioning`. |
| G6 | ✅ | Spec §9: bloque literal del CI sobre base `iwana_it_g7_*`, gate de omisiones y aprovisionador E2E local con `E2E_SETUP=OK` / `E2E_CLEANUP=OK`. La corrida fiel del aprovisionador se delegó al G6.5 por decisión del usuario. |
| G6.5 | ✅ | Push único `75528631..965bf5e5` (con el tren de roles). CI 42678231774 y smoke 42678231542 en `success`; E2E operativo R4.1 339/0/1 con limpieza OK. Detalle por job en la spec §10. |
| G7 | Diferido hasta la beta | Para habilitar la purga, quedan P2-1, P2-2 y D-2 (abajo). |

## 3. Lecciones de proceso

1. Volvió a proponerse un G6 por suites enumeradas («ninguna integración usa tenants»). Se exigió el comando literal del CI y el aprovisionador; la regla de [G6 incluye E2E del aprovisionador] sigue vigente.
2. El aprovisionador local necesita libres los puertos 3000 y 3002. Una sesión no puede parar procesos del usuario: se le dan los PID y él decide.
3. El push de las sesiones arrastraba commits ajenos (tren de roles). Se retuvo hasta tener la orden explícita del CTO para incluirlos.

## 4. Riesgo introducido

P3-5 elevó el paso «Integration tests — API» de 3 min 56 s (`5d6a366b`, 2026-11-07) a **8 min 10 s** con un límite de 10 min (82 %). Causa: cada una de las 30 suites recorre la cadena tenant completa, en serie (`maxWorkers: 1`). Se abre encargo de optimización (§5).

## 5. Seguimientos

| ID | Prioridad | Estado al 2026-11-10 |
| --- | --- | --- |
| R7 — purga con rol de mínimo privilegio | P1 | G6.5 verde. Antes de G7 quedan los dos P2 de `sec-eng` (membresías transitivas y dependencias entre esquemas). D-2 exige constancia por tenant de devolución o exportación de los datos al ISP, o su instrucción escrita de supresión, antes de la primera purga real. [Spec R7 §7, §15 y §17](../specs/2026-11-09-plat-ops-r7-purga-tenants-rol-de-produccion-spec.md) |
| Tiempo del paso de integración API | P2 | Reserva F activa en CI. La primera de cinco corridas válidas de `main` dio un cociente API/089 de 4,27 frente a la mediana base de 4,24. La reversión se decide al completar la muestra si la mejora normalizada queda por debajo del 5 %. [Spec de CI §10.5–10.6](../specs/2026-11-09-plat-ops-ci-integracion-api-tiempo.md#106-pendiente) |
| R8 — mensajes para los dos 409 de «Reintentar» en la consola de plataforma | P3 | Implementado por `fe-platform` el 2026-11-10. `TENANT_PROVISIONING_IN_PROGRESS` indica que la configuración sigue en curso y `TENANT_NOT_RETRYABLE` pide revisar el estado en el directorio. Los demás errores muestran el aviso genérico. [Spec DT-4 §8.2](../specs/2026-11-09-plat-ops-dt4-aprovisionamiento-tenant-marcado.md) |
| R3 (auditoría de transiciones del worker), R4 (locks 42/43), R5 (esquemas borrados fuera de la purga en desarrollo), R6 (`RELAY_FAILURE` con `failed=0`) | P3 | Sin dueño. |
| CA-NET-11 (mock sin `assertWritableReferences`), Playwright en ubuntu 26.04 | P3 | Sin dueño, heredados. |

### Línea base y verificación de R8

| Paquete | Medición del 2026-11-10 | Suites | Pruebas | Omitidas |
| --- | --- | ---: | ---: | ---: |
| `@iwana/web` | Base `c7eb5636`, `pnpm exec turbo run test --filter=@iwana/web --force` | 38 | 233 | 0 |
| `@iwana/web` | `pnpm --filter @iwana/web exec jest --coverage --coverageReporters=text-summary --coverageReporters=json-summary --silent` | 38 | 237 | 0 |

La base tenía el [CI documental 42725900488](https://github.com/Sleybc/iWana-neXt/actions/runs/42725900488) en verde. En R8, lint y typecheck pasaron. La página alcanzó 84,81 % de líneas cubiertas. La revisión de pruebas confirmó cuatro casos nuevos y la conservación de las expectativas previas.

**GO local de R8 (2026-11-10).** Playwright en Chrome, 3 de 3 casos aprobados en `/tenants`. El clic en «Reintentar configuración» mostró el aviso específico para cada uno de los dos 409 del contrato y el genérico para un tercer 409. Las respuestas HTTP se simularon con el contrato del API. CI de R8 pendiente de publicación.

## 6. Dictamen

**GO.** DT-4 y P3-5 quedan cerradas con G6.5 cumplido. Los seguimientos de §5 son encargos propios y no reabren este expediente.
