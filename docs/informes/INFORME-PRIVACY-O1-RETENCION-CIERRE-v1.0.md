# INFORME — `privacy` · O-1: reloj de retención · cierre

**Versión:** 1.0
**Fecha:** 2026-11-03
**Autor:** AI-EM-ARCH
**Estado de la fase:** **G6 en GO.** G6.5 se cumple cuando el usuario ordene el commit y el push y la CI de ese SHA termine en verde (§6). G7 sigue diferido hasta la beta mínima ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)).
**Spec:** [2026-11-02-privacy-o1-reloj-retencion-spec.md](../specs/2026-11-02-privacy-o1-reloj-retencion-spec.md) v1.0, **Aprobada** (G0 del 2026-11-02, P1)
**Plan:** [2026-11-02-privacy-o1-retencion-orquestacion.md](../plans/2026-11-02-privacy-o1-retencion-orquestacion.md) · **Prompt:** [PROMPT-PRIVACY-O1-RETENCION-v1.0](../prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md), lanzadores v1.0 a v1.5
**HLD:** [HLD-PRIVACY-HABEAS-DATA-v1.3](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.3.md)
**Verificación regulatoria asociada:** [INFORME-PRIVACY-LEY-2573-VERIFICACION-v1.0](INFORME-PRIVACY-LEY-2573-VERIFICACION-v1.0.md)

---

## 1. Qué se cerró

El inicio del plazo de 5 años de retención del suscriptor (ADR-094 D7 y H9; Decreto 1704 de 2012 art. 4) tenía tres defectos en el adaptador `standing`:

| # | Defecto | Corrección en el árbol |
| --- | --- | --- |
| 1 | El reloj salía de `contracts.updated_at`, así que cualquier edición lo movía | Columna `contracts.terminated_at`: la primera entrada en `TERMINATED` o `ARCHIVED`, inmutable (migración 170) |
| 2 | **Los contratos `ARCHIVED` se ignoraban**: un titular cuyo único contrato estaba archivado salía «sin retención» y se podía suprimir dentro de los 5 años. Por eso pasó a **P1** | `standing` calcula `max(terminated_at)` sobre `TERMINATED` y `ARCHIVED`. `SUSPENDED → ARCHIVED` también fija la fecha |
| 3 | Los borradores borrados lógicamente contaban como contratos abiertos | `deleted_at IS NULL` en las dos lecturas |

| Pieza | Detalle |
| --- | --- |
| Migración **170** (`…1700000000170`) | Columna, trigger `BEFORE UPDATE` (fecha inmutable y obligatoria al pasar a estado terminal) y backfill en cuatro candidatos que, ante la duda, alarga la retención. Los contratos de titulares anonimizados quedan en `NULL`. Imprime `[170] O1 backfill candidate=N count=M` |
| Migración **171** (`…1710000000171`) | Trigger `BEFORE INSERT`: un contrato que se inserta ya terminal sin `terminated_at` se rechaza con `23514`. Es aditiva: la 170 no se editó porque ya estaba aplicada en desarrollo |
| Escritores | `_transition` y el ciclo de vida fijan la fecha con `COALESCE`. El ciclo de vida pasa un `$6::boolean` calculado en JS (B1-F) |
| Invariante de migraciones | `runner.suffixes.spec.ts`: sufijos únicos de 13 dígitos, con 10 excepciones de migraciones ya aplicadas. Nació de un choque real: la primera versión de la 170 repetía el sufijo de la 000 |
| Fixtures | El de ciclo de vida usa ahora la cadena migrada, con lo que **se cierra la deuda P3-5 del clúster MOD05**. Dos fixtures que insertaban contratos terminales sin fecha la ponen ahora (categoría b) |

## 2. Criterios de aceptación

| CA | Resultado | Evidencia |
| --- | --- | --- |
| 01 a 04, 06 y 08 | PASS | `retention-clock.postgres.integration.spec.ts` (7 pruebas, con servicios reales) y la integración de ciclo de vida |
| 05 y 07 | PASS, `up → down → up` incluido | integraciones de la 170 y la 171 |
| 09 | PASS: 11 suites PG de DT-3 y del clúster, 135/135, sin ajustes de expectativa | B3 |
| 10 | PASS | §4 |

## 3. Gate (B5 repetido, 2026-11-03)

| Gate | Resultado |
| --- | --- |
| Typecheck y lint de API y DB | PASS (7 y 5 advertencias preexistentes) |
| Unitarias de DB | 78 suites y 426 tests, 0 omitidas |
| Integraciones PG | API: 52 suites, 339 tests y 4 omisiones declaradas; DB: 48 suites y 145 tests, 0 omitidas. Base aislada `iwana_it_o1_b5_20261103` |
| Cobertura de ramas | `contracts.service.ts` 85,29 % (base 82,87 %); `subscriber-lifecycle.service.ts` 85,36 % (base 81,81 %) |
| Dependencias | Sin críticas |
| `sec-eng` | Un P2, el `INSERT` terminal: corregido con la 171. La dependencia del `search_path` de la 169 se acepta por la regla `runInTenantSchema` (`data-source.ts:197-213`) |
| `test-change-reviewer` y `boundary-reviewer` | Sin hallazgos |

**Fuera del diff de O-1, no bloquean** (la misma línea base aceptada en el G1 del clúster):
- `tenant-migrations-second-schema.spec.ts`, opt-in: 4 pasan y 3 fallan porque su fixture no crea las filas canónicas que exige la migración 092 (`092_…:93`). El fallo está antes de la 170 y existía de antes.
- Tres suites EV1 omitidas que apuntan a `tenant_iwana`.

## 4. Datos de desarrollo (B4, solo lectura)

- Los 7 tenants `ACTIVE` están en la 171. Los que no están `ACTIVE` no se migraron, a propósito.
- `--verify-only`: 24 titulares anonimizados verificados, 0 residuales.
- **Ningún titular cambia su resultado de retención con O-1.**
- Contratos terminales sin fecha y no anonimizados: 0 en los 7 tenants, antes y después de la 171.
- Backfill de `tenant_e2e_privacy_1b_a114bf06`, reconstruido de forma aproximada: 7 por el candidato 1 y 9 por el 4.

## 5. Lo que aprendimos

| Hecho | Consecuencia |
| --- | --- |
| Un `$n` usado como enum y como texto en el mismo SQL rompió el ciclo de vida, y las unitarias con mocks no lo vieron | Todo SQL nuevo se prueba contra PG; ya está en la memoria del proyecto |
| El sufijo de la 170 chocaba con el de la 000 | Prueba invariante de sufijos |
| El trigger solo para `UPDATE` dejaba abierta la entrada por `INSERT` | Toda invariante de «al entrar en un estado» cubre `INSERT` y `UPDATE` |
| Un fixture de DDL hecho a mano se rompió tres veces por columnas nuevas | Los fixtures PG usan la cadena migrada |

## 6. Pendiente

| Tema | Dueño | Prioridad |
| --- | --- | --- |
| Commit y push del diff de O-1, y G6.5 sobre su SHA | Usuario y AI-EM-ARCH | Ahora |
| Correr `--verify-only` y el conteo de retención en producción | `plat-ops` | G7 |
| `tenant-migrations-second-schema`: fixture sin filas canónicas para la 092 | Transversal, salud de pruebas | P3 |
| Tres suites PG clonan `contracts` de `tenant_iwana` (hermeticidad) | Transversal, salud de pruebas | P2 |
| `tenant_e2e_mod13_f1_41398e` (MARKED_FOR_DELETION, a medio aprovisionar) | El usuario decide | — |
| Anclaje de los 20 días de la denuncia (Ley 2573) y exequibilidades condicionadas | Dictámenes de ADR-094 §7.3 | Antes de G7 |
