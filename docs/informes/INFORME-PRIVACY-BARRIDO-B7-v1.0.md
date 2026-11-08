# INFORME — Privacy · Barrido · B7

**Versión:** 1.0  
**Fecha:** 2026-11-07  
**Estado:** Implementado y verificado localmente; listo para B8  
**Rol:** sr-backend

Encargo: [plan v1.3, B7](../plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md), [spec v1.2 §14](../specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md) y [ADR-104](../adrs/ADR-104-Enmienda-ADR-094-D7-Retencion-PQR-y-Veracidad.md), que consta aprobado en disco.

## Precondiciones y línea base de pruebas

HEAD inicial: `c1b56c835c3de25fbbae858c8e561cdd34a57496`, rama `main`. CI `42398209146` completado con `success` sobre ese SHA; E2E Web Admin Smoke `42398209127` también con `success`. Rutas de código de B7 sin diff ajeno. Última migración tenant: 176; candidata libre al iniciar: 177, sin reserva encontrada en los planes.

| Paquete | Comando sin caché | Suites | Pruebas | Omitidas | Duración |
| --- | --- | ---: | ---: | ---: | --- |
| API | `pnpm --filter @iwana/api exec jest --no-cache --maxWorkers=2` | 481 | 6381 | 0 | 238,837 s |
| Database | `pnpm --filter @iwana/db exec jest --no-cache --maxWorkers=2` | 78 | 426 | 0 | 13,548 s |

Las listas Jest se comprobaron antes de las corridas. Se aplican `nestjs-expert`, `database-migration`, `postgresql`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` e `iwana-tenant-migration`.

## Autorización adicional

Se identificaron cuatro casos del test del puerto contractual que comparan la respuesta completa. Se consultó la restricción de expectativas de B7 y el usuario autorizó, con la opción 1, añadir `contractIds` y `expedienteIds` a esas expectativas. Fuera de esos cuatro casos y de los cambios de estrato de D-BT-15, cualquier ajuste de expectativa permanece bloqueado.

La composición de `PrivacyModule` necesita importar `AssurancePrivacyModule`: pasa de siete a ocho imports. La primera corrida unitaria completa expuso la expectativa exacta de `privacy.module.spec.ts:78`; el usuario autorizó explícitamente el único ajuste `7 → 8` mediante la opción 1. Se conserva el resto de esa prueba.

## Implementación

- Migración tenant **177**, registrada después de la 176. Añade `contracts.anonymized_at`, permite estrato desconocido solo en filas marcadas y siembra `PQR_SOPORTES` (3 años) y `SOLICITUDES_TITULAR` (5 años). `down` restaura ambos CHECK con `NOT VALID`, sin fabricar valores para filas ya anonimizadas.
- D-BT-15: `subscribers.stratum` e `installation_stratum` pasan a `NULL`; CRM marca el contrato antes de anular sus datos. Se conserva la actualización de versión una sola vez y la idempotencia. Se elimina `integer-marker`, que ya no tiene consumidores.
- D-BT-14: `privacy` define `IPqrRetentionReadPort`; `assurance/privacy/` lee sus tablas mediante el QueryRunner de la transacción tenant. Reutiliza los cuatro predicados textuales de D-BT-2. Agrupa por ticket PQR, toma la notificación de la respuesta definitiva o su resolución y bloquea una PQR sin respuesta.
- El puerto contractual de CRM aporta todos los contratos y expedientes del alcance. El HMAC documental permite encontrar el expediente de un prospecto sin suscriptor. La lectura de la referencia opcional usa `to_jsonb(s)` para tolerar los esquemas mínimos que ya ejercitan el puerto, sin modificar pruebas ni código de billing.
- `conservationDuty` suma el reloj PQR a los relojes contractual y fiscal existentes. La vista previa y la resolución comparten esa decisión; el rechazo por conservación mantiene el bloqueo de datos. El CLI aplica la misma política antes del barrido y la verificación detecta los estratos `1` heredados.
- D-BT-16: `SOLICITUDES_TITULAR` solo se siembra. No se implementa H-EXP ni se cambian las demás reglas del barrido.

Se aplican también `typescript-expert`, `architect-review`, `systematic-debugging`, `verification-before-completion` y `docs-architect`. No se modifican `audit-sanitize.policy.ts` ni archivos del módulo billing. Los cambios ajenos de documentación, portal y evidencias se conservan fuera del diff B7.

## TDD y trazabilidad

Antes de implementar se observaron estos rojos: regla de estrato CRM **1/7 fallida**, reloj PQR **5/5 fallidas** e integración PostgreSQL inicial **2/2 fallidas** por las categorías y la anulación de estrato que aún no existían. La integración nueva usa la cadena tenant real completa y fija `iwana.titular_erasure=on` dentro de la transacción, igual que el adaptador.

| Criterio | Evidencia |
| --- | --- |
| CA-BT-20 | Prospecto sin suscriptor: PQR notificada hace dos años, fallback a resolución, sin respuesta, vencida y respuesta inicial que no sustituye la definitiva |
| CA-BT-21 | Otro titular del mismo tenant excluido y comparación exacta tipo/referencia para las cuatro formas de D-BT-2 |
| CA-BT-22 | Prueba fiscal existente ampliada: el bloqueo conserva motivo tributario, estrato, ciudad y departamento; ninguna aserción previa cambia |
| CA-BT-23 | Suscriptor y contratos residencial/no residencial con estrato `NULL` y contratos marcados |
| CA-BT-24 | Los CHECK rechazan estrato `NULL` en suscriptor natural y contrato residencial vivos |
| CA-BT-25 | Cadena completa, up/down/up, mínimos de ambas políticas y down con filas anonimizadas que conserva los NULL |
| CA-BT-26 | CLI real: verify detecta `1`, apply lo corrige; además rechaza PQR pendiente sin modificar el estrato |

Las pruebas nuevas de lectura cubren transacción ausente/inactiva, alcance vacío, esquemas parciales y fallo cerrado si falta el puerto o la política. No se rebaja ninguna aserción existente para compensar un fallo.

## Entorno de integración

PostgreSQL 18.3 en contenedor desechable `iwana_b7_test`, loopback, puerto 15433, **DB_NAME=test** y claves sintéticas. Se compiló `@iwana/db`, se ejecutó `apply-least-privilege`, `migration:run`, se creó `tenant_test` con su fila en `public.tenants`, se reaplicaron privilegios y se ejecutó `migration:tenant:run`.

Conteo real: **28 migraciones public y 173 tenant** en la base preparada. Las pruebas B7 aplican **173/173** en su schema efímero, incluida la contract de PII. La suite general usa el entorno de CI sin `IWANA_APPLY_PII_CONTRACT`, porque la prueba del manifiesto exige que la 109 permanezca diferida en su propio schema; no se cambia esa aserción.

Primera integración completa: 77 suites totales, 70 aprobadas, 4 fallidas y 3 omitidas; 540 pruebas, 516 aprobadas, 5 fallidas y 19 omitidas, 463,798 s. Causas corregidas: siembra nueva sin el par de marcadores, siembra fiscal fuera de `runInTenantSchema`, referencia opcional de expediente en un schema mínimo y bandera de migración ajena al entorno de CI. La segunda corrida completa finaliza sin fallos, con los conteos siguientes.

## Verificación disponible

| Comprobación sin caché | Suites aprobadas | Pruebas aprobadas | Omitidas | Duración |
| --- | ---: | ---: | ---: | --- |
| API unitarias completas | 483 | 6393 | 0 | 245,697 s |
| Database unitarias completas | 78 | 426 | 0 | 24,515 s |
| API integración completa como en CI | 74 de 77 | 521 de 540 | 3 suites / 19 pruebas | 385,330 s |
| Database integración completa | 53 | 153 | 0 | 75,787 s |
| Cobertura focalizada: unitarias y PostgreSQL B7 | 4 | 33 | 0 | 27,086 s |

Cobertura medida sobre `pqr-retention-read.adapter.ts`, `ticket-scope.ts`, `pqr-retention.ts` y `crm-contract-standing-read.adapter.ts`: **98,48 % statements, 98,21 % lines, 94,11 % branches y 100 % functions**. Es el alcance medido, no una cifra de cobertura global de API.

Ratchet unitario: API **481 → 483 suites**, **6381 → 6393 pruebas**, omitidas **0 → 0**; database **78 → 78 suites**, **426 → 426 pruebas**, omitidas **0 → 0**. Las doce pruebas unitarias añadidas pertenecen al reloj PQR y sus guardas de lectura; no se elimina ninguna prueba.

La línea base de integración se tomó del log de CI verde `42398209146`, sobre el SHA inicial: API **73 aprobadas de 76 suites**, **503 aprobadas de 522 pruebas**, con **3 suites y 19 pruebas omitidas**; database **53 suites y 153 pruebas**, sin omisiones. Este dato de integración es sustituto de CI, no una ejecución local anterior al cambio.

Las tres suites omitidas por los selectores preexistentes de CI son `inventory-execution-request.ola3d` (13 pruebas) y `execution-orders.item-usage-projection` (1), que exigen su base sintética dedicada en lugar de `DB_NAME=test`, y `network-execution-event` (5), que exige la bandera de Redis. No se cambian esos selectores ni se afirma cobertura de esas 19 pruebas.

Ratchet de integración API frente al CI inicial: suites aprobadas **73 → 74**, pruebas aprobadas **503 → 521**, omitidas **19 → 19**. El incremento son las diecisiete pruebas PostgreSQL B7 y el caso nuevo de reparación CLI. Database conserva las **53 suites / 153 pruebas** de CI.

K2 en la integración completa final: **5/5 aprobadas**, con `IWANA_K2_REENCRYPT_INTEGRATION=true` y el reconocimiento de entorno de CI para la base desechable `test`. La migración sube y baja sobre la cadena completa; el caso adicional demuestra que `down` conserva los estratos `NULL` ya anonimizados.

`typecheck` de API y database: **exit 0**. ESLint y Prettier de los **36 archivos TypeScript** del alcance: **exit 0**. `git diff --check` del alcance no informa errores. Los comandos y resúmenes literales están en [verification.json](evidence/privacy-barrido-b7-2026-11-07/verification.json); la [cobertura](evidence/privacy-barrido-b7-2026-11-07/coverage-summary.json) conserva las cuatro mediciones por archivo.

## Diff y simplicidad

[Diff completo B7](evidence/privacy-barrido-b7-2026-11-07/B7.diff), incluido el código nuevo sin añadirlo al índice: **36 archivos de código, 1126 líneas agregadas y 81 quitadas**. El manifiesto de evidencia incluye el SHA-256 de cada archivo y del patch. El informe y los artefactos de evidencia se contabilizan aparte.

Se eliminan el tipo y la rama `integer-marker` y los predicados duplicados del alcance de tickets. El helper del reloj evita duplicar la política entre API y CLI; el helper de alcance garantiza que conservación y barrido sigan las mismas cuatro referencias. El resto de las adiciones son la migración, los puertos, el cableado y pruebas de comportamiento y montaje necesarias para la cadena completa.

Se mantiene `main`, sin ramas, stash ni commit. Solo se operó sobre la base desechable y fixtures sintéticas. No se modifica el módulo billing, la política de saneamiento ni documentación ajena. La revisión independiente B8 corresponde a la siguiente ola; este informe no sustituye su veredicto ni cierra los pendientes jurídicos de producción o H-EXP.
