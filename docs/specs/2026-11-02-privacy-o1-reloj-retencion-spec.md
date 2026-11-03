# Spec — `privacy` · O-1: reloj de retención del suscriptor

**Versión:** 1.0
**Estado:** Aprobado. G0 del CTO el 2026-11-02 sobre los cuatro puntos de §8, incluido el ascenso a P1
**Fecha:** 2026-11-02
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Prioridad:** **P1**, aprobada en el G0. Se registró como P2 en el cierre de DT-3. Al leer el código apareció que un contrato **archivado** no cuenta para la retención (§1, punto 2), y eso permite suprimir datos que hay que conservar.
**Origen:** [INFORME-PRIVACY-DT3-RER-CIERRE-v1.0](../informes/INFORME-PRIVACY-DT3-RER-CIERRE-v1.0.md) §6 · [HLD Privacy v1.2](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.2.md) §10
**Base:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) D7 y H9 · HLD Privacy v1.2 §6.6 · spec DT-3 v1.2 (migración 169 y su excepción de archivo)
**Plan:** [2026-11-02-privacy-o1-retencion-orquestacion.md](../plans/2026-11-02-privacy-o1-retencion-orquestacion.md) · **Prompt:** [PROMPT-PRIVACY-O1-RETENCION-v1.0](../prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md)

> Las rutas `archivo:línea` se leyeron en `main` (`317bbc72`) el 2026-11-02.

---

## 1. Problema

`resolve` de SUPRIMIR decide si hay deber de conservación con `IContractStandingReadPort.standing` (`crm/privacy-adapters/crm-contract-standing-read.adapter.ts:7-33`) y `requests.service.ts:1105-1123`. Hay retención vigente si «último contrato terminado + 5 años» es posterior a hoy (ADR-094 D7: identificación, dirección y contrato del suscriptor, 5 años desde la terminación del último contrato; H9: Decreto 1704 de 2012 art. 4, compilado en el DUR 1078 de 2015 art. 2.2.2.6.4).

El adaptador tiene tres defectos:

| # | Defecto | Efecto |
| --- | --- | --- |
| 1 | `lastTerminatedAt` es el `updated_at` del contrato `TERMINATED` más reciente (`:27`) | Cualquier edición posterior del contrato (alias, migración 168, la escritura de la propia supresión) **mueve el reloj hacia adelante**. Se retiene más de lo debido, contra la limitación temporal (Decreto 1377 art. 11, DUR 1074 art. 2.2.2.25.2.8) |
| 2 | Solo mira `status = 'TERMINATED'`. Los contratos `ARCHIVED` se ignoran | Al archivar el único contrato terminado, `lastTerminatedAt` queda `null` y `conservationDuty` responde «sin retención» (`requests.service.ts:1112-1113`). **Se puede suprimir dentro de los 5 años**, en contra de H9. `SUSPENDED → ARCHIVED` también es una transición válida (`contracts.service.ts:86-90`): esos contratos nunca pasan por `TERMINATED` |
| 3 | No filtra `deleted_at` | Un borrador borrado lógicamente cuenta como contrato abierto y bloquea la supresión para siempre. Es conservador, pero niega el derecho del titular sin fundamento |

`status_changed_at` (migración 158) no sirve como ancla: se sobrescribe al archivar (`contracts.service.ts:1638`, `:1706`).

## 2. Fundamento

| Norma | Uso | Fuente |
| --- | --- | --- |
| Decreto 1704 de 2012, art. 4 (DUR 1078 de 2015, art. 2.2.2.6.4) | Conservación mínima de 5 años de los datos del suscriptor (ADR-094 H9) | [normograma.mintic.gov.co · Decreto 1704](https://normograma.mintic.gov.co/mintic/compilacion/docs/decreto_1704_2012.htm) |
| Decreto 1377 de 2013, art. 11 (DUR 1074, art. 2.2.2.25.2.8) | Tratar solo el tiempo razonable y necesario; después, suprimir | [normograma.mintic.gov.co · Decreto 1377](https://normograma.mintic.gov.co/mintic/compilacion/docs/decreto_1377_2013.htm) |
| Ley 1581 de 2012, art. 17 lit. d) | Conservar con seguridad: suprimir datos que hay que conservar también es un incumplimiento | [normograma.mintic.gov.co · Ley 1581](https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_1581_2012.htm) |

**Desde cuándo corre el plazo.** ADR-094 D7 fija «terminación del último contrato». Que corra desde la terminación y no desde otro hecho, como el último pago, es una de las preguntas abiertas de los dictámenes de ADR-094 §7.3. Esta spec no la resuelve: implementa D7 tal como está aprobada.

## 3. Decisiones

### D-O1-1. Fecha de fin de la relación, propia e inmutable

- Columna nueva `contracts.terminated_at timestamptz NULL`. Es la **primera** entrada del contrato en `TERMINATED` o en `ARCHIVED`, la que ocurra antes.
- Se fija una sola vez, en la misma sentencia que cambia el estado. Las transiciones posteriores (`TERMINATED → ARCHIVED`) no la tocan.
- Escritores que la fijan: `SubscriberLifecycleService` (`TERMINATE`, `:615`), `ContractsService._transition` (destinos `TERMINATED` y `ARCHIVED`) y `CrmContractImpersonationAdapter`, si su destino es terminal. `B1` inventaría cualquier otro escritor de `contracts.status`.
- Un trigger `BEFORE UPDATE` de la misma migración impide cambiar `terminated_at` cuando ya tiene valor, y lo exige al entrar en `TERMINATED` o `ARCHIVED`. Así lo cumplen todos los escritores, también los futuros.

### D-O1-2. Lectura del puerto

`standing(partyId, { manager })`:
- `openContractIds`: contratos con `deleted_at IS NULL` y estado fuera de `TERMINATED` y `ARCHIVED`. **Corrige el defecto 3.**
- `lastTerminatedAt`: `max(terminated_at)` de los contratos del titular con `deleted_at IS NULL` en `TERMINATED` o `ARCHIVED`. **Corrige los defectos 1 y 2.**
- La firma no cambia; el contrato del puerto queda intacto.

### D-O1-3. Backfill

En la misma migración, por tenant, para cada contrato en `TERMINATED` o `ARCHIVED` con `terminated_at` nulo. Se toma el **primer** candidato disponible, en este orden:

1. el `changed_at` más antiguo de `crm_lifecycle_changes` con `entity_type = 'CONTRACT'`, `entity_id = contracts.id` y `to_status` en `TERMINATED` o `ARCHIVED`;
2. `status_changed_at`, si el contrato está en `TERMINATED` (en `ARCHIVED` puede ser la fecha de archivo, posterior a la terminación);
3. `status_changed_at`, si el contrato está en `ARCHIVED`;
4. `updated_at`.

Los candidatos 3 y 4 pueden ser **posteriores** a la terminación real. Eso alarga la retención, nunca la acorta, y es la dirección segura frente al defecto 2. La migración cuenta cuántas filas resolvió con cada candidato y lo deja en la salida del runner, sin PII.

**Contratos de titulares anonimizados:** no se rellenan, porque la supresión ya se hizo y el reloj no tiene uso. El trigger de la 169 rechazaría el `UPDATE`, y el backfill no fija `iwana.titular_erasure` (DT-3 D-RER-6 reserva esa variable al adaptador y al CLI). Su `terminated_at` queda `NULL` y la spec lo acepta.

### D-O1-4. Compatibilidad con DT-3

- La excepción de archivo de la 169 permite cambiar 4 columnas. `terminated_at` no está entre ellas y no hace falta: un contrato anonimizado ya está terminado o archivado, y su `terminated_at` (si lo tiene) no cambia.
- `TERMINATED → ARCHIVED` no modifica `terminated_at` (D-O1-1).

### D-O1-5. Verificación en datos: `--verify-only` y retención

En la ola de QA, `plat-ops` corre en los tenants de desarrollo, en solo lectura:
- `anonymize-titular --verify-only` (DT-3 spec §7), que cierra su pendiente en desarrollo;
- una consulta de conteo de titulares cuyo resultado de retención cambia con O-1: los que antes salían «sin retención» y ahora «con retención», y al revés. Solo conteos e ids, sin PII.

En producción ambas se corren en G7.

## 4. Contrato regla → campo

| Regla | Campo o pieza | Dueño |
| --- | --- | --- |
| D-O1-1 | `contracts.terminated_at` + trigger en una migración tenant nueva (el siguiente número libre en `runner.ts`), reversible | `packages/database` |
| D-O1-1 | Los escritores de §3 fijan `terminated_at` en la misma sentencia | `crm/contracts`, `crm/subscribers`, `crm/privacy-adapters` |
| D-O1-2 | `crm-contract-standing-read.adapter.ts` | `crm/privacy-adapters` |
| D-O1-3 | Backfill dentro de la migración, con conteo por candidato | `packages/database` |
| Entidad | `Contract.terminatedAt` (solo lectura para el DTO público; no se expone en la API en esta fase) | `crm/contracts` |

Boundaries: `privacy` sigue leyendo CRM solo por el puerto, sin cambios en `privacy/**` salvo pruebas.

## 5. Criterios de aceptación

Todos contra PostgreSQL real con el esquema creado por la cadena de migraciones, con `IWANA_DB_INTEGRATION_AVAILABLE=true`. Una suite omitida cuenta como fallo.

| # | Criterio | Tipo |
| --- | --- | --- |
| CA-O1-01 | Contrato terminado hace 2 años y archivado ayer: `resolve` de SUPRIMIR se rechaza por deber de conservación. Hoy se permite; **es la regresión que corrige O-1** | PG + servicio |
| CA-O1-02 | Contrato `SUSPENDED → ARCHIVED` hace 1 año: hay retención; `terminated_at` es la fecha de archivo | PG |
| CA-O1-03 | Contrato terminado hace 6 años y editado ayer (alias): no hay retención por O-1, y `lastTerminatedAt` es la terminación, no la edición | PG |
| CA-O1-04 | Borrador borrado lógicamente: no cuenta como abierto y no bloquea la supresión | PG |
| CA-O1-05 | Trigger: no se puede cambiar `terminated_at` ya fijado, ni entrar en `TERMINATED` o `ARCHIVED` sin fijarlo. Escritura SQL directa → error | PG + migración |
| CA-O1-06 | `TERMINATED → ARCHIVED` conserva `terminated_at`, también sobre un titular anonimizado (excepción de la 169) | PG |
| CA-O1-07 | Backfill: un fixture con un caso por candidato (1 a 4) y uno anonimizado. Cada fila queda con el valor esperado; la anonimizada, `NULL`; el conteo por candidato coincide. `up → down → up` sin pérdida | PG + migración |
| CA-O1-08 | Cada escritor de §3 fija `terminated_at` (servicio de ciclo de vida, `_transition` e impersonation, si aplica) | PG |
| CA-O1-09 | Regresión: las suites PG de DT-3 (`titular-anonymized-concurrency`, `titular-erasure-sql`, `anonymize-titular`, `privacy-erasure-api`, migración 169) y las del clúster (contratos, cambio de plan, ciclo de vida) siguen en verde **sin ajustes de expectativa**. Si alguna necesita cambiar, se para y la revisa `test-change-reviewer` | PG |
| CA-O1-10 | D-O1-5 en desarrollo: salida de `--verify-only` y del conteo de cambio de retención por tenant, sin PII | Operación |

Gates de AGENTS.md: cobertura ≥80 % sin bajar la línea base de los servicios tocados (`contracts.service.ts` tiene **0,05 puntos** de margen: cada rama nueva necesita su prueba); migración reversible; sin PII en logs; suite completa sin caché; G6.5 sobre el SHA publicado.

## 6. Fuera de alcance

- El dictamen sobre desde cuándo corre la retención (ADR-094 §7.3).
- La retención fiscal de 10 años (HLD §10, cuando exista facturación).
- Exponer `terminated_at` en la API o en el portal.

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El backfill alarga retenciones (candidatos 3 y 4) | Dirección segura. El conteo por candidato muestra el alcance |
| Escritor de `status` no inventariado | Trigger de D-O1-1 |
| Margen de cobertura de `contracts.service.ts` | Prueba por rama nueva; `gate-verifier` mide por servicio |

## 8. Decisiones que pide esta spec al CTO (G0)

1. Subir O-1 de P2 a **P1** por el defecto 2.
2. D-O1-1: columna `terminated_at` inmutable, con trigger.
3. D-O1-3: orden de candidatos del backfill y contratos anonimizados en `NULL`.
4. D-O1-5: correr `--verify-only` y el conteo de retención en desarrollo ahora, y en producción en G7.
