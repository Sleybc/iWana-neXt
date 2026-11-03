# INFORME — `privacy` · DT-3 «R-ER»: cierre

**Versión:** 1.0
**Fecha:** 2026-11-02
**Autor:** AI-EM-ARCH
**Estado de la fase:** **cerrada en G6 y G6.5.** G7 queda diferido con el resto de privacidad hasta la beta mínima ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)).
**Spec:** [2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md](../specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md) v1.2, **Aprobada** (G0 del CTO el 2026-11-02)
**Plan:** [2026-11-01-privacy-dt3-rer-orquestacion.md](../plans/2026-11-01-privacy-dt3-rer-orquestacion.md) · **Prompt:** [PROMPT-PRIVACY-DT3-RER-v1.0](../prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md), lanzadores v1.0 a v1.9
**Evidencia de ejecución:** [INFORME-PRIVACY-DT3-B1R-v1.0](INFORME-PRIVACY-DT3-B1R-v1.0.md) y sus anexos de [contratos](INFORME-PRIVACY-DT3-B1R-CONTRATOS-v1.0.md) y [expedientes](INFORME-PRIVACY-DT3-B1R-EXPEDIENTES-v1.0.md); [INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0](INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md), §C4a-R, §C4d, §C4e y §H1 a §H5
**HLD actualizado:** [HLD-PRIVACY-HABEAS-DATA-v1.2](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.2.md)

---

## 1. Qué se cerró

El defecto R-ER, que `sec-eng` encontró en §K4c del clúster MOD05: las guardas de titular bloqueado dejaban pasar mutaciones sobre titulares **ya anonimizados**. Un cliente con datos anteriores podía, por ejemplo, restaurar el alias y las notas de instalación de un contrato que la supresión acababa de redactar. El defecto existía en `HEAD` desde `079daf80` (Fase 1b) y se trató como deuda DT-3 de privacidad, con spec propia.

| Decisión | Qué quedó en `main` |
| --- | --- |
| D-RER-1 · solo lectura | Las guardas de suscriptores, contratos y expedientes, y las tres escrituras tributarias que no tenían guarda, responden 409 `PRIVACY_TITULAR_ANONYMIZED` con cualquier permiso |
| D-RER-2 · excepción de archivo | `TERMINATED → ARCHIVED` con `UPDATE` de 4 columnas. Por HTTP pasa con `allowAnonymized`, solo en `POST crm/contracts/:id/archive` |
| D-RER-3 · decisión bajo bloqueo | Cada escritor de CRM bloquea en el orden `expediente_records → subscribers → contracts`, relee `anonymized_at` y ya no guarda entidades leídas antes del bloqueo. Incluye `ResponsibilitiesService`, que se añadió en la spec v1.1. El orden de errores también se aplica a la creación |
| D-RER-4 · requests ya autorizadas | Se resuelven por el orden de bloqueo. El deber de conservación se relee dentro de la transacción de supresión (`standing(partyId, { manager })`) |
| D-RER-5 · versión | La supresión avanza `updated_at` con `GREATEST(… + 1 ms)`, también en las filas que solo marca. Un reintento limpio no avanza la versión |
| D-RER-6 · base de datos | Migración tenant **169**: triggers en `subscribers`, `expediente_records` y `contracts`, con paso por `iwana.titular_erasure` y error `55000`/`HINT` traducido a 409 |
| Spec §7 | `--verify-only` en el CLI de emergencia |

## 2. Commits y G6.5

| Commit | Contenido DT-3 |
| --- | --- |
| `78d3e4fb` | Migración 169 y su integración |
| `4cfeed5f` | API: guardas, escritores, supresión, puerto `standing`, CLI, filtro de errores y pruebas. Commit mezclado con MOD05 por la consolidación conjunta (opción A del usuario) |
| `ee7f89f3` | Documentos DT-3: spec, plan, prompt, lanzadores e informes B1-R |
| `0dbc9cef`, `a491605d`, `3200cf9a` | H4 del clúster: fixtures herméticos (entre ellos, `anonymized_at` en el DDL de `audit.service.transaction` y `Subscriber` en `subscriber-tax-confirm`), runners de CI fijados y registro |

**G6.5:** sobre `3200cf9a`, verificado por AI-EM-ARCH el 2026-11-02 con `gh run view`. `CI` [41449913367](https://github.com/Sleybc/iWana-neXt/actions/runs/41449913367) y `E2E Web Admin Smoke` [41449913339](https://github.com/Sleybc/iWana-neXt/actions/runs/41449913339), los dos `completed` / `success`, con `headSha` `3200cf9a5e9f…`.

## 3. Criterios de aceptación

| CA | Resultado | Dónde |
| --- | --- | --- |
| 01, 03 a 10 | PASS, contra PostgreSQL real con dos conexiones; las carreras con orden forzado, sin temporizadores | `titular-anonymized-concurrency`, `titular-erasure-sql` y migración 169 |
| 02 | PASS: matriz HTTP y reflexión, `subscriber-tax` incluido | `crm-blocked-mutations.http/arch` |
| 11 | PASS: `sec-eng` (B4), sin P0 ni P1. Solo el adaptador (`crm-personal-data-erasure.adapter.ts:113`) y el CLI (`anonymize-titular.ts:962`) fijan `iwana.titular_erasure`, ambos dentro de transacciones. `allowAnonymized` solo aparece en la ruta de archivo | §7 de este informe (B4 no tenía registro escrito) |
| 12 | PASS en CI. El bloqueo de Fase 1b no cambió expectativas. La E2E de supresión (`portal-privacy-fase-1b-live`) pasó 4/4 en B3 y en el job R4.1 de CI ([41439195912](https://github.com/Sleybc/iWana-neXt/actions/runs/41439195912) y la corrida final de G6.5). La corrida local de H5 dio 1/4 por login y HTTP 500 del entorno E2E, sin atribución a producto (dictamen de H5, confirmado por el CTO) | Informe B1-R §B3; informe del clúster §H5 |

**G1 conjunto (C4d): GO.** 13 suites PG completas, 116 PASS, 0 omitidas. Cobertura de ramas sobre la línea base del G1: contratos 82,87 % (82,82 %), suscriptores 86,64 % (86,20 %) y perfil tributario 89,47 % (82,89 %).

## 4. Cambios visibles aprobados en el G0

1. Crear un contrato con un suscriptor o un expediente inexistente responde **404** antes que el 422 de ciclo.
2. Si un `PATCH` de contrato coincide con un `changePlan` que confirma antes, el `PATCH` responde **200** sobre el plan nuevo; antes respondía 409. El plan anterior nunca se restaura (20/20 por orden). `changePlan` mantiene su 409 por `expectedUpdatedAt`.

## 5. Lo que aprendimos

| Hecho | Consecuencia para próximas fases |
| --- | --- |
| La guarda HTTP se evalúa fuera de la transacción, y `save` sobre entidades leídas antes del bloqueo reescribía datos | Toda regla de privacidad sobre escrituras se contrata **bajo bloqueo y con relectura**, y con un trigger de respaldo |
| B1 y B1-R reportaron «suite completa en verde» con 4 suites omitidas por guardas opt-in. Esas suites eran las integraciones PG del clúster, y 11 estaban rotas | Cada ola que toque escritores corre la lista explícita de integraciones PG con `IWANA_DB_INTEGRATION_AVAILABLE=true`; una omitida cuenta como fallo |
| La Ola 1 se lanzó antes del commit del clúster y la separación E7 tuvo que deshacerse | Dos iniciativas que comparten archivos se consolidan juntas desde el principio, o se secuencian con commit entre ellas |
| CA-RER-05 contradecía a D-RER-2 en la propia spec | La pasada regla → CA cruza cada excepción con cada criterio de carrera |

## 6. Pendiente

| Tema | Dueño | Prioridad |
| --- | --- | --- |
| **O-1:** el inicio de la retención (`lastTerminatedAt`) se toma de `contracts.updated_at`. **Actualización del 2026-11-02:** además, los contratos `ARCHIVED` se ignoran, y eso permite suprimir dentro de la retención. Se propone subir a **P1**; `status_changed_at` no sirve como ancla porque se sobrescribe al archivar | [Spec O-1](../specs/2026-11-02-privacy-o1-reloj-retencion-spec.md), [plan](../plans/2026-11-02-privacy-o1-retencion-orquestacion.md) y [prompt](../prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md), G0 aprobado el 2026-11-02 | **P1** |
| Correr `--verify-only` por tenant | En desarrollo: bloque B4 de O-1. En producción: G7 | Desarrollo con O-1; producción en G7 |
| ~~Verificar en fuente oficial la Ley 2573 de 2026 (texto y vigencia)~~ | ✅ Hecho el 2026-11-02 ([verificación](INFORME-PRIVACY-LEY-2573-VERIFICACION-v1.0.md)): el código cumple; el anclaje de los 20 días de la denuncia pasa a dictamen | — |
| P3-5: DDL hecho a mano en las pruebas de ciclo de vida, con columnas añadidas una a una en B3-H y B3-H2 | Clúster MOD05, ola de salud de pruebas | P3 |
| ~~Esquema efímero `tenant_plan_change_f0f328f25d1d4ae6a251d29566d0c800` en la base de desarrollo~~ | ✅ Comprobado el 2026-11-02 en solo lectura (`pg_namespace` de `dbiw`): ya no existe, y no hay fila en `public.tenants`. No hubo que borrar nada | — |
| Margen de cobertura de ramas de `contracts.service.ts`: 0,05 puntos | Próximo cambio de ese archivo | Vigilar |

## 7. Registro de B4 (verificación, 2026-11-01)

La revisión B4 se entregó en la sesión y no tenía informe propio; se registra aquí. Fue de solo lectura y no ejecutó pruebas funcionales.

| Revisor | Resultado |
| --- | --- |
| `sec-eng` | 0 P0 y 0 P1. Ningún escritor de §5 restaura campos anonimizados y ninguno guarda con `save` una entidad leída antes del bloqueo. **P2:** las creaciones validaban el ciclo antes de bloquear al suscriptor (422 antes que 409); se corrigió en B1-G, con hash `33E5CF71…1F06653` |
| `boundary-reviewer` | Sin hallazgos. `privacy` consulta CRM por su puerto tipado y conserva el `manager` de la transacción del tenant |
| `docs-governance` | 13 documentos revisados: nombres y carpetas conformes, lanzadores dentro de 40 líneas, auditorías sin bloqueantes. Tres P3 (referencia a la spec v1.0, estado del plan y enlace a la plantilla) que corrigió AI-EM-ARCH |
| `gate-verifier` | No corrió en B4: lo sustituyó C4d |
