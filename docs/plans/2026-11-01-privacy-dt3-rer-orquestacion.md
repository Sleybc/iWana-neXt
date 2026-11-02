# Plan de orquestación — `privacy` · DT-3 «R-ER»

**Versión:** 1.0, con estados por ola añadidos en §1
**Estado:** En ejecución. B4 cerrado con un P2 que corrige B1-G; después vienen C4d, el G0 del CTO y C4e
**Fecha:** 2026-11-01
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md](../specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md) **v1.2**
**Prompt de ejecución:** [PROMPT-PRIVACY-DT3-RER-v1.0](../prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md) · **Launcher vigente:** [PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.7](../prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.7.md)
**Origen:** [INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md) §K4c y dictamen tras G1 repetido.
**Fecha límite de referencia:** 19-nov-2026 (Ley 2573 de 2026).

## 1. Precondiciones y bloqueos de arranque

| # | Precondición | Estado al 2026-11-01 | Bloquea |
| --- | --- | --- | --- |
| P1 | G0 del CTO sobre spec §9 (D-RER-1 a D-RER-6, O-1) | Pendiente | Toda la fase |
| P2 | Clúster MOD05 commiteado (C1). B1 edita `contracts.service.ts`, el decorador de guardas y `subscriber-lifecycle.service.ts`, que el clúster tiene modificados sin commitear | Pendiente (Q3 en espera de CA-CF-12) | Ola 1 |
| P3 | Número de migración libre (167 y 168 son del clúster; MOD14 puede reservar otros) | Se verifica en `runner.ts` al lanzar | B2 |

### Estado tras la Ola 1 (2026-11-01)

- **P2 no se cumplió.** La Ola 1 se lanzó con C1 sin commitear (`HEAD` = `6dbdda8a`). Los cambios de DT-3 conviven ahora, sin commitear, con los del clúster en los mismos archivos (`contracts.service.ts`, guardas, `subscriber-lifecycle.service.ts` y sus specs). **Consecuencia:** C1 ya no puede commitearse en verde mientras B1 siga rojo, porque las 84 pruebas fallidas están en suites del clúster. No revertir nada a mano: separar hunks de un mismo archivo sin pruebas es más riesgoso que terminar.
- **B2:** verde. Migración 169. No se re-despacha.
- **B1:** rojo. Pasa a B1-R (prompt §B1-R), con `crm/responsibilities` sumado por la spec v1.1.
- **Commit:** se decide cuando B1-R esté en verde. Opción recomendada: dos commits consecutivos, primero el clúster (C1) y luego DT-3, separando hunks con `git apply --cached` de parches por bloque. Si los hunks no se pueden separar limpiamente, un solo commit que declare los dos alcances. Lo decide el usuario.

### Estado tras la Ola 1-R (2026-11-01)

- **B1-R: GO** ([informe](../informes/INFORME-PRIVACY-DT3-B1R-v1.0.md)). Los 102 rojos de partida (84 reportados por B1 y 18 de cambio de plan que B1 no había corrido) quedaron clasificados en 87 (a) y 15 (b), y las filas (b) citan D-RER. Aparecieron y se corrigieron 2 (c) en `ResponsibilitiesService`. `test-change-reviewer`: 0 hallazgos C. Suite completa con `--force`: API 443 suites y 5.953 tests; DB 77 suites y 423 tests; 0 fallos. Las omisiones (4 suites, 15 tests, por banderas opt-in) son las mismas de la línea base del G1.
- **Condición que pasa a B4:** la cobertura se entregó agregada (80,14 % de branches en 8 servicios). El gate es por servicio y sin bajar la línea base del G1: `contracts.service.ts` 82,82 %, `subscribers.service.ts` 86,20 % y `subscriber-tax-profile.service.ts` 82,89 % de branches. `gate-verifier` la mide servicio por servicio en B4. Si alguno queda por debajo, vuelve a `sr-backend`.
- **Commit:** sigue pendiente de la decisión del usuario. C1 y DT-3 continúan sin commitear.
- **Siguiente:** Ola 2, B3 (`sr-qa`). Launcher v1.2.

### Estado tras la Ola 2 (2026-11-01, 08:41)

**Dictamen: NO-GO, por pérdida de cambios en el árbol, no por defecto de B1 o B2.** B3 entregó 28 tests: 23 PASS y 5 FAIL, con 0 omitidas. Sus dos `[REGRESIÓN]` (CA-RER-02 y CA-RER-08) se deben a esto:

- A las **08:22:06** se reescribieron a la vez cinco archivos, que volvieron al contenido del clúster sin los hunks de DT-3. `HEAD` no cambió (`6dbdda8a`), no hay stash y el historial de archivos de esta sesión no guarda copia:

  | Archivo | Qué se perdió |
  | --- | --- |
  | `packages/database/src/migrations/tenant/runner.ts` | Registro de la 169 (el archivo de la migración sigue en disco) |
  | `crm/subscribers/subscriber-tax.controller.ts` | Guardas de PUT/PATCH de asignaciones y POST `suggest-vat` |
  | `crm/subscribers/subscriber-tax-profile.service.ts` | Comprobación bajo bloqueo |
  | `crm/subscribers/subscriber-lifecycle.service.ts` | Comprobación bajo bloqueo |
  | `crm/privacy-adapters/crm-contract-impersonation.adapter.ts` | Comprobación bajo bloqueo |

- Se desconoce quién lo hizo. Se consultó a la sesión del clúster. **No relanzar mientras no se confirme que nadie está separando hunks sobre estos archivos.**
- Los otros CA de B3 (01, 03 a 07, 09 y 10) pasaron sobre las partes intactas. B3 no detectó la pérdida en ciclo de vida, perfil tributario e impersonation: B3-R suma un caso por escritor.
- **CA-RER-12, E2E de Fase 1b (2/4):** dos escenarios activan contratos sin ciclo y reciben 422 `BILLING_CYCLE_REQUIRED`. Es un efecto del clúster (ciclo obligatorio al activar, spec de ciclo v1.1), no de DT-3. El fixture se ajusta como categoría (b), citando esa regla, y lo revisa `test-change-reviewer`.
- **Siguiente:** Ola 2-R (LAUNCH v1.3). `sr-backend` §B1-RR rehace los hunks perdidos; `sr-qa` §B3-R corrige el fixture E2E y amplía la suite; después se repite B3 completo.

**Aclaración (2026-11-01, misma mañana):** la reescritura de las 08:22:06 fue intencional. La hizo `plat-ops` en C1a, autorizado por el usuario, para separar el clúster de DT-3 en 7 archivos de producción y 2 specs ([informe del clúster](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md) §C1a, E7 y dictamen). Hay copias de los originales con sus hashes fuera del repo y dos patches B1 de restauración que pasan `git apply --check`. Eso cambia el plan:

- **§B1-RR queda anulado.** No se rehacen hunks a mano: la restauración son los patches de `plat-ops`.
- **Orden:** C1b commitea el clúster → se aplican los patches B1 → se verifica que los 9 archivos coincidan con los hashes del manifest y que la suite completa de api y db quede en verde (eso cierra la restauración) → se reanuda la Ola 2-R solo con §B3-R y la repetición de B3.
- **Nada toca el árbol** hasta que la sesión del clúster avise que B1 está restaurado.
- Dato pendiente: la ruta de los patches, que no figura en el informe. La pidió la sesión del clúster a `plat-ops`.

### Orden vigente: consolidación conjunta (opción A del usuario, 2026-11-01)

Sustituye al orden de la aclaración anterior. El clúster MOD05 y DT-3 se verifican y commitean **juntos, por archivo completo**. C1b y la separación E7 quedan anuladas. Fuente: [PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0](../prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md) §Ola 4, con su lanzador v1.5. Si este plan y ese prompt difieren en el orden, prevalece el prompt del clúster.

| Paso | Quién | Qué | Toca el árbol |
| --- | --- | --- | --- |
| 1 | `plat-ops` (C4a) | Restaura B1 desde los originales de `mixed/`. En `subscribers.service.ts` conserva también el cambio de boundary de C1b (`CrmQuoteReadPort`) | Sí. **DT-3 no edita nada mientras corre** |
| 2 | Ola 2-R de DT-3, en paralelo con C4b y C4c | §B3-R → repetición de §B3 → §B4 (LAUNCH v1.3, filas 2 a 4) | Solo las rutas de §B3-R |
| 3 | `gate-verifier` (C4d) | G1 conjunto sobre el árbol entero, incluidas las integraciones DT-3 y CA-RER-12. **Sustituye al `gate-verifier` de §B4**; los otros tres verificadores de §B4 se mantienen | No |
| 4 | CTO | G0 sobre esta spec (§9). **Sigue pendiente** | No |
| 5 | `plat-ops` (C4e) | Cinco commits. DT-3 va en el **commit 2** (`feat(api)`, mezclado con el clúster) y en el **commit 5** (`docs(privacy)`: spec, plan, prompts, lanzadores e informes DT-3). DT-3 no hace commits propios | Commit |

- **Arranque de la Ola 2-R:** cuando la sesión del clúster avise que C4a cerró. B3-R comprueba primero que la 169 esté registrada en `runner.ts` y que estén las guardas tributarias. Si falta alguna de las dos, `[BLOQUEO]`: C4a no restauró B1 completo.
- **La decisión de commit pendiente queda resuelta** por la opción A.
- **La cobertura por servicio** (condición de B4) la mide `gate-verifier` en C4d.
- **C4a-R en verde (2026-11-01):** se restauraron 9 archivos, verificados por hash, y la suite completa no tiene fallos. Comprobado en disco: la 169 está registrada (`runner.ts:335`) y `subscriber-tax.controller.ts` tiene sus 5 guardas. La Ola 2-R se lanza con LAUNCH v1.4. Esos 9 archivos quedan congelados para DT-3.
- **B3 repetido (2026-11-01): NO-GO por dos causas.**
  - CA-RER-03: la guarda HTTP de la ruta de archivo bloquea la excepción de D-RER-2. Es un defecto de producto; lo corrige B1-F.
  - CA-RER-05: error de redacción de la spec; corregido en v1.2.
  - Además, `portal-privacy-live.spec.ts:245` tiene un fixture sin ciclo, efecto del clúster.
  - Una suite rechazó `DB_NAME=dbiw` y no ejecutó su cuerpo.
  
  B1-F tiene que tocar `contracts.service.ts` (congelado): se avisó con `[BLOQUEO]` a la sesión del clúster. Se lanza la Ola 2-F con LAUNCH v1.5.
- **Ola 2-F: GO.**
  - B1-F: `allowAnonymized` solo en la ruta de archivo y `PATCH` sigue en 409. Hashes comprobados en disco: el nuevo de `contracts.service.ts` es `21D44C54…1BD1205`.
  - B3-R2: `test-change-reviewer` sin hallazgos C.
  - B3 repetido: CA-RER-01 a 10 y 12 en PASS, con 0 omitidas. Playwright 7/7.
  - La suite que exigía otra base corre en `iwana_it_privacy_dt3_b3r2`; el comando de creación y de ejecución está en el informe DT-3.
  
  Sigue la Ola 3 (B4) con LAUNCH v1.6: `sec-eng`, `boundary-reviewer` y `docs-governance`, sin `gate-verifier`, que pasa a C4d.
- **B4: GO condicionado.** Sin P0 ni P1. Boundaries sin hallazgos. `allowAnonymized` e `iwana.titular_erasure`, solo donde corresponde.
  - **P2:** las dos creaciones de contrato validan el ciclo (`assertActiveBillingCycle`, `contracts.service.ts:155` y `:255`) antes de bloquear al suscriptor. En una carrera con la supresión responden 422 en vez del 409 que exige D-RER-3, punto 4. No restaura datos. Lo corrige B1-G (LAUNCH v1.7).
  - **Tres P3 documentales**, corregidos por AI-EM-ARCH: referencias a la spec v1.2, estado en la cabecera del plan y enlace a la plantilla en el prompt.
  
  Con B1-G en verde, se avisa a la sesión del clúster para lanzar C4d.
- **B1-G: verde en su alcance.**
  - Hash `33E5CF71…1F06653`. Precedencia 422/422/409 probada. API unitaria: 443 suites y 5.964 tests.
  - Al correr las integraciones PG que pidió el clúster aparecieron 12 en rojo. Once las causaron B1 y B1-R: esas suites están detrás de guardas opt-in y nadie las corrió desde el G1. Una la causó B1-G: el orden 404→409→422.
  - Clasificación en §B3-H: 10 de tipo (a) por DDL de fixture sin `anonymized_at`, y 2 de tipo (b).
  - Se pide el visto bueno de la sesión del clúster y se lanza B3-H con LAUNCH v1.8.
  - **Lección:** «suite completa en verde» no cubre las integraciones con guarda opt-in. Desde ahora, cada ola de DT-3 corre la lista de G1 punto 3.
- **B3-H: los 3 ajustes aprobados quedaron aplicados, con `[BLOQUEO]` sobre otros tres.** 66 PASS, 2 FAIL y 0 omitidas; `contract-plan-change` no terminó. Las tres repiten el patrón de B3-H y están clasificadas en §B3-H2:
  - la conversión da 404 antes del 422;
  - al DDL de contratos del fixture de ciclo de vida le falta `customer_segment`;
  - la carrera de `PATCH` contra `changePlan` se coordinaba con una lectura que DT-3 eliminó.
  
  La tercera cambia un resultado visible: un `PATCH` concurrente pasa de 409 a 200, sin restaurar el plan anterior. Se pidió el visto bueno de la sesión del clúster; LAUNCH v1.9 queda en espera. Queda además un esquema efímero de prueba, que borra el usuario.
- **B3-H2 y su corrección: GO para C4d (2026-11-01, 17:40).** 13 suites PG completas: 116 PASS, 0 FAIL y 0 omitidas. Las carreras de C: 20/20 por orden. `test-change-reviewer`: 0 hallazgos C. Hash de `contracts.service.ts` sin cambios (`33E5CF71…1F06653`). Por autorización directa del usuario se corrigieron dos bloqueos que el visto bueno del clúster no cubría:
  - `subscribers.customer_segment` en el fixture de ciclo de vida, de tipo (a);
  - `contract-plan-change…:126`, de tipo (b). Era otra prueba de `CONTRACT_CHANGED` que usaba la lectura eliminada. Ahora prueba el 409 con una versión obsoleta del cliente en `changePlan`, la operación que sí la recibe.
  
  Se avisa a la sesión del clúster, que había pedido que se la consultara sobre esa segunda prueba.
- **C4d: GO (2026-11-02).** El primer intento dio NO-GO solo por cobertura de ramas: `subscribers` y perfil tributario quedaron 1,32 puntos bajo su línea base. Con 9 pruebas nuevas, sin tocar producción, la repetición quedó en contratos 82,87 %, suscriptores 86,64 % y perfil tributario 89,47 %, todos sobre su línea base. 315 tests sin omisiones; 0 hallazgos C. §9 de la spec quedó actualizado para el G0, con los dos cambios visibles.
- **G0 del CTO: aprobado el 2026-11-02**, sobre la spec v1.2 §9 completa, incluidos los dos cambios visibles y O-1. Queda libre C4e.
- **Lo que falta:** ~~C4d (G1 conjunto, cobertura por servicio incluida)~~ ~~→ G0 del CTO~~ → G0 del CTO sobre la spec v1.2 → C4e (commits 2 y 5) → cierre de DT-3 por AI-EM-ARCH: informe de cierre y HLD Privacy v1.2 (§6.7 y §10, con O-1). El esquema efímero `tenant_plan_change_…` sigue pendiente de decisión del usuario.

## 2. Bloques, dependencias y ruta crítica

| Bloque | Agente | Depende de | Rutas (disjuntas) |
| --- | --- | --- | --- |
| B1 · Escritores CRM | `sr-backend` | P1, P2 | `crm/contracts`, `crm/subscribers`, `crm/expedientes`, impersonation adapter, arch spec |
| B2 · Supresión, puerto y BD | `sr-backend` (2.ª instancia) | P1, P2, P3 | `titular-erasure/**`, adaptador de supresión, standing adapter y puerto, `resolve`, CLI, filtro de errores, migración |
| B3 · Concurrencia PG | `sr-qa` (autor de pruebas) | B1 y B2 | suite nueva `titular-anonymized-concurrency.postgres.integration.spec.ts` |
| B4 · Verificación | `sec-eng`, `test-change-reviewer`, `boundary-reviewer`, `gate-verifier` | B3 | solo lectura |
| Cierre | AI-EM-ARCH | B4 | informe de cierre, HLD Privacy v1.2 |

**Ruta crítica:** P1 → P2 → B1 (el inventario de escritores es el bloque más largo) → B3 → B4 (`sec-eng`) → cierre.

**Punto de sincronización:** B3 no arranca hasta que B1 y B2 entreguen conteo real. La firma del puerto (`standing(partyId, ctx)`) y el código de error son contrato congelado en la spec; ninguno de los dos bloques los redefine.

## 3. Olas

| Ola | Bloques | Paralelo | Gate de salida |
| --- | --- | --- | --- |
| 1 | B1, B2 | Sí: rutas disjuntas | Pruebas propias en verde con conteo real; inventario de escritores entregado |
| 2 | B3 | — | CA-RER-01 a 10 y 12 en PASS, 0 omitidas |
| 3 | B4 | Los cuatro verificadores en paralelo | `sec-eng` GO (CA-RER-11); gates de AGENTS.md en PASS |
| Cierre | Informe | — | G6; G6.5 tras push con CI de `main` verde; G7 diferido hasta beta (ADR-095) con `--verify-only` por tenant |

## 4. Matriz de dispatch agente × skill

| Bloque | Obligatorias (leer antes de codificar) | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `testing-patterns`, `iwana-test-evidence` | `typescript-expert` (tipado del constructor de error y de guardas); `systematic-debugging` (si una suite previa queda roja) | `database-migration` e `iwana-tenant-migration` (la migración es de B2); `openapi-spec-generation` (solo se agrega una respuesta 409; se documenta con el decorador existente); toda skill de UI (no hay cambio de portal) |
| B2 | `database-migration`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `iwana-test-evidence` | `nestjs-expert` (filtro de errores y firma del puerto) | `bullmq-specialist` (no hay colas); skills de UI |
| B3 | `testing-patterns`, `iwana-test-evidence`, `postgresql` | `systematic-debugging` (fallos intermitentes de concurrencia) | `e2e-testing-patterns` y `playwright-skill` (CA-RER-12 reutiliza la E2E existente sin escribir una nueva) |
| B4 `sec-eng` | `security-auditor`, `backend-security-coder` | `postgresql` (lectura de triggers y bloqueos) | — |
| B4 auxiliares | según su perfil en `.claude/agents/` | — | — |

## 5. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Deadlock nuevo por orden de bloqueo distinto | D-RER-3 punto 2 y CA-RER-10 |
| Prueba de concurrencia intermitente | Orden forzado con bloqueos explícitos, no temporizadores (prompt §B3) |
| Escritor no inventariado | Trigger D-RER-6 como respaldo; revisión `sec-eng` CA-RER-11 |
| Datos ya restaurados en desarrollo | `--verify-only` (spec §7) |
| Calendario contra el 19-nov | Ola 1 en paralelo; arrancar apenas se commitee C1 |

## Lanzamiento

Fuente: [`PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.0.md`](../prompts/PROMPT-PRIVACY-DT3-RER-LAUNCH-v1.0.md). **El archivo prevalece si divergen.**

```text
===== B1 · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B1.
Contrato: docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de nestjs-expert, backend-security-coder, postgresql, testing-patterns, iwana-test-evidence.
Solo rutas de §B1. Sin commit. Entrega: inventario de escritores con archivo:línea, diff y conteo real de pruebas.

===== B2 · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B2.
Contrato: docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de database-migration, iwana-tenant-migration, postgresql, backend-security-coder, iwana-test-evidence.
Solo rutas de §B2. Sin commit. Entrega: número de migración, diff y conteo PG real (DB_NAME=dbiw, 0 omitidas).
```
