# Spec — `privacy` · K2: recifrado PII con titulares anonimizados

**Versión:** 1.1
**Cambio v1.0 → v1.1 (2026-11-04, revisión contra el código, §11):** el dry-run no delata una marca ya cifrada con la clave activa. `--verify-only` pasa a ser obligatorio antes de K2 (D-K2A-5) y se añade CA-K2A-13. La salida recomendada y los seis puntos de §9 no cambian.
**Estado:** Aprobada. G0 del CTO el 2026-11-04 sobre §9: los seis puntos como se recomiendan. Sin implementar: la secuencia del plan §1 sigue abierta.
**Fecha:** 2026-11-03
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Prioridad:** alta para G7, sin fecha legal propia. G7 sigue diferido hasta la beta ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)).
**Origen:** inventario PII de ADR-058 del 2026-11-03. Halló que `--apply` aborta con `55000` y dejó una prueba de caracterización con la fila sembrada a mano.
**Artefactos base:** [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) §3 · [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) D7 · [spec DT-3 v1.2](2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md) D-RER-6 y CA-RER-11 · [spec O-1](2026-11-02-privacy-o1-reloj-retencion-spec.md) · [spec de hermeticidad v1.1](2026-11-03-transversal-hermeticidad-pruebas-pg-spec.md) · [runbook de rotación](../runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md) §6ter
**Plan:** [2026-11-03-privacy-k2-recifrado-anonimizados-orquestacion.md](../plans/2026-11-03-privacy-k2-recifrado-anonimizados-orquestacion.md) · **Lanzador:** [PROMPT-PRIVACY-K2-ANONIMIZADOS-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-K2-ANONIMIZADOS-LAUNCH-v1.0.md)

> Define comportamiento. No contiene código de producción. Las rutas se leyeron en `main` (`45046b56`) con el diff del inventario y MOD14 sin commitear; se revalidan al implementar.

## 1. Problema

El borrado deja una marca cifrada en `subscribers.document_number_encrypted` (`crm-titular-erasure.participant.ts:95`, `kind: 'encrypted-marker'`). El trigger de la 169 rechaza después todo `UPDATE` de esa fila. K2 necesita reescribir el cifrado con la clave nueva y no puede.

En un tenant con un titular anonimizado no se cierra ni la separación MFA→PII ni una rotación de `PII_ENCRYPTION_KEY`. Eso bloquea G7. El dry-run no lo avisa, y la integración K2 está omitida en CI, así que nadie lo vio.

## 2. Causa confirmada con el borrado real

**Corrida.** El 2026-11-03, en Postgres 18.6 desechable, base propia `iwana_it_g7_k2spec`, con `apply-least-privilege.sh`, las migraciones públicas y la cadena tenant completa (2,4 s). No se tocó `tenant_iwana`.

- **Borrado:** `PrivacyRequestsService` (`create` → `complete` → `erasurePreview` → `resolve`) con el adaptador CRM real y sus siete participantes, igual que `privacy-erasure-api.postgres.integration.spec.ts`. Sin HTTP. `AuditService`, `IContractStandingReadPort` y los demás puertos externos son dobles.
- **K2:** `runMfaToPii` con `TypeOrmReencryptDbAdapter` y rol `iwana_migrator`, el mismo del CLI.
- **Datos:** sintéticos. Dos suscriptores vivos, con un id menor y otro mayor; un titular natural con expediente, party, contacto, contrato y nota de ciclo de vida; un titular jurídico.

Runner, configuración y salidas: [`docs/informes/evidence/privacy-k2-anonimizados-2026-11-03/`](../informes/evidence/privacy-k2-anonimizados-2026-11-03/) (sufijo `.txt` para que no lo lea ningún linter; §10).

| # | Resultado | Evidencia |
| --- | --- | --- |
| R1 | **Causa confirmada.** `--apply` falla con `55000`, `HINT` `PRIVACY_TITULAR_ANONYMIZED`, en `titular_prevent_anonymized_mutation()`, al hacer `UPDATE "subscribers" SET "document_number_encrypted"` | `k2-apply-abort` |
| R2 | El dry-run cuenta 15 candidatos y dice `blocking=no` | `k2-dry-run` |
| R3 | **Es peor de lo descrito.** El aborto no pierde una celda: tras él, 1 de 15 quedó recifrado y **14 pendientes**, incluido un suscriptor vivo con id mayor y todos los objetivos siguientes. `blocking=yes` | `k2-verify-after-abort` |
| R4 | Igual en MFA→PII: `mfa_only_remaining=14` | `corrida-mfa-a-pii.ndjson` |
| R5 | **También afecta a titulares jurídicos.** La regla no distingue `person_type`: el jurídico tenía `NULL` y el borrado le escribió la marca, aunque `chk_subscriber_person_fields` no la exige ahí. El alcance «titular natural» se queda corto | `subscribers-after-erasure` |
| R6 | La marca descifra al literal `ANONIMIZADO`. **No contiene dato personal** | `marker-plaintext` |
| R7 | Es la única celda cifrada en tablas protegidas por la 169. Expediente y contrato quedan en `NULL` | `targets-after-erasure` |
| R8 | `party.document_number` también guarda una marca dependiente de la clave (`ANONIMIZADO:<id>`, columna `NOT NULL`), pero `party` no tiene el trigger de la 169: K2 la reescribe. Igual `data_subject_requests.requester_*`, que se conservan como prueba | `targets-not-nullable`, `triggers-on-targets` |

## 3. Salidas evaluadas

### 3.1. Quién puede fijar un GUC

Un GUC propio no es un control de acceso. PostgreSQL no restringe las variables con prefijo propio, y cualquier rol las fija con `set_config`. Medido con `iwana_app`:

| Prueba, con `iwana_app` | Resultado |
| --- | --- |
| `UPDATE first_name` de un titular anonimizado, sin GUC | `55000` |
| Lo mismo con `iwana.titular_erasure` | **1 fila** |
| Reescribir la marca con `iwana.titular_erasure` | **1 fila** |

Las dos transacciones se revirtieron. El GUC de hoy frena errores y escritores olvidados, no a un atacante con SQL en el rol de la API. Por eso cualquier GUC nuevo necesita un segundo control en el trigger. Sí existe uno viable: `iwana_migrator` es dueño de las tablas y de la función, y el CLI corre con ese rol (`reencrypt-aes.ts:18`), mientras la API corre con `iwana_app`.

### 3.2. Comparación

| Criterio | A · GUC `iwana.pii_reencrypt` | **B · Sin marca cifrada (`NULL`)** | C · K2 salta filas anonimizadas |
| --- | --- | --- | --- |
| Trigger de la 169 | Se abre, con una rama nueva | **Intacto** | Intacto |
| Choca con lo aprobado | Sí: D-RER-6 («rechaza todo `UPDATE`») y CA-RER-11 | **No** | No |
| Escrituras sobre filas de prueba | En cada rotación, para siempre | **Ninguna** | Ninguna |
| Cifrado que queda en la fila | Sí | **Ninguno** | Sí, y con la clave retirada queda ilegible |
| `--verify-pii-only` | Universal | **Universal** | Deja de serlo: «cero, salvo anonimizados» |
| Auditoría nueva | Sí (§3.3) | **No** | No |
| Migración | Reemplaza la función; `down` restaura la de la 169 | Cambia el `CHECK`; `down` probado (CA-K2A-08) | Ninguna |
| Código | Función y adaptador | Regla, orden, lectura | K2 y verificación |
| Filas ya anonimizadas | Se recifran solas | Hay que remediarlas (D-K2A-5) | Quedan como están |
| Prueba en la corrida | Prototipo completo, K2 hasta `verify` en 0 | `CHECK`, `NULL`, K2 hasta `verify` en 0 | Sin prueba |

**Descartadas de entrada:**

- **Reusar `iwana.titular_erasure` desde K2.** Abre el bypass completo (§3.1) y mezcla dos significados.
- **Centinela en texto claro (`'ANONIMIZADO'`).** No exige cambiar el `CHECK`, pero K2 lo cuenta como `non_ciphertext=1` y da `blocking=yes` (evidencia `opcion-b-centinela-dry`). Además deja texto claro en una columna cifrada.

### 3.3. Riesgo de abrir el trigger (salida A)

El prototipo, solo en el esquema desechable, exigió cinco condiciones: GUC activo, `session_user` miembro del dueño de la tabla, fila anonimizada, valor con forma de cifrado y ninguna otra columna cambiada.

| Prueba | Resultado |
| --- | --- |
| `iwana_migrator` con GUC recifra la marca | Pasa |
| Con GUC, texto claro en la columna | `55000` |
| Con GUC, otra columna | `55000` |
| Con GUC, `DELETE` | `55000` |
| Sin GUC | `55000` |
| `iwana_app` con GUC | `55000` |
| K2 completo | `verify` en 0, `updated_at` intacto |

Funciona, y no da a `iwana_migrator` nada que no tenga: el dueño ya puede desactivar triggers. Los riesgos que quedan son estos:

- **Sin rastro.** `updated_at` no cambia y K2 hoy no escribe auditoría, solo conteos en consola. Una fila que es prueba de la supresión cambiaría sin huella. Haría falta un registro por corrida, con esquema, conteo, actor y versión.
- **Sin validación del contenido.** La base no tiene la clave: con el GUC se puede escribir un cifrado de cualquier texto, incluido un documento real.
- **Superficie permanente.** Cada columna que el borrado deje cifrada en el futuro obliga a ampliar la lista del trigger.
- **Se abre para nada.** Se pagaría todo eso por conservar una celda sin dato personal (R6).

### 3.4. Recomendación: salida B

**Un titular anonimizado no conserva ningún cifrado en las tablas protegidas por la 169.** Quita la causa en lugar de abrir una excepción: la marca no aporta nada, el `CHECK` que la forzó es el único motivo para conservarla, y ni el HLD ni el ADR-094 ni DT-3 la piden. Es además el mejor momento: G7 sigue diferido, así que aún no hay filas de producción que remediar.

**Cambio frente a la nota de entrega del inventario**, que recomendaba la salida A. Esa nota partió de sembrar la fila a mano y no había medido R6 ni §3.1. La salida A sigue siendo un plan B válido: si el CTO la prefiere, exige las cinco condiciones de §3.3, el registro por corrida y enmendar D-RER-6 y CA-RER-11. D-K2A-6 a D-K2A-8 valen para ambas.

**Riesgos de B:**

- **Relajar el `CHECK`.** Solo se admite `NULL` con `anonymized_at` fijado. Una fila no anonimizada sigue fallando con `23514` (medido). `anonymized_at` y `anonymized_request_id` ya van juntos por el `CHECK` de la 150.
- **Orden.** Si el borrado anula antes de marcar, falla con `23514` (medido): falla cerrado, revierte toda la transacción y lo cubre CA-K2A-01.
- **Filas previas.** Conservan la marca hasta remediarlas. El dry-run delata solo las que tendría que recifrar (D-K2A-6). Las que ya están en la clave activa las ve `--verify-only` (D-K2A-5).

**Auditoría de B.** No hay camino recurrente que auditar: K2 deja de tocar esas filas. La regla del borrado sigue registrándose como hoy.

## 4. Decisiones

### D-K2A-1. El borrado deja `NULL`

`crm-titular-erasure.participant.ts:95` pasa a `{ column: 'document_number_encrypted', kind: 'null' }`. Vale para titulares naturales y jurídicos. Las reglas `notNullFallback: 'encrypted-marker'` no cambian: esas columnas admiten `NULL` en el esquema real, así que nunca se activan.

`party.document_number` sigue como está (R8): es `NOT NULL`, tiene una regla propia y K2 la reescribe. Queda fuera de alcance.

### D-K2A-2. Migración tenant: `CHECK` condicionado

Siguiente número libre en `runner.ts`, hoy **176** (MOD14 ocupa hasta la 175, sin commitear), con sufijo único de 13 dígitos, registrada y con `*.integration.spec.ts`.

- `up`: sustituye `chk_subscriber_person_fields`. En la rama `NATURAL`, `document_number_encrypted IS NOT NULL` pasa a `(document_number_encrypted IS NOT NULL OR anonymized_at IS NOT NULL)`. El resto queda igual.
- `down`: restaura el `CHECK` original con `NOT VALID`. No toca datos, porque SQL no puede recrear un cifrado sin la clave. Probado con una fila `NULL` presente: el `down` pasa, `VALIDATE` falla con `23514`, un `NATURAL` no anonimizado sigue rechazado y el `up` vuelve a aplicar.
- No fija `iwana.titular_erasure` ni modifica filas.

### D-K2A-3. Marcar antes de anular

En `CrmTitularErasureParticipant.run`, para `subscribers` en modo `apply`, `markAnonymizedRows` corre **antes** de `anonymizeConfiguredTable`. La transacción es la misma, así que ningún lector ve el estado intermedio. `updatedAtAdvanced` conserva un solo avance de versión. `expediente_records` no cambia. Orden medido con el `CHECK` nuevo: pasa.

### D-K2A-4. El contrato de lectura no cambia

Hoy la API devuelve `documentNumber: 'ANONIMIZADO'`, porque descifra la marca. Si pasara a venir vacío, `subscriber-ui.ts:229` mostraría «{tipo} pendiente» en un titular suprimido, y eso sería falso.

`decryptSubscriberFields` (`subscribers.service.ts:2035`) devuelve la constante `ANONYMIZED` cuando `anonymizedAt` está fijado, sin descifrar. No cambian portal, OpenAPI ni `@iwana/shared`. Además se elimina el aviso de log que dejaría una marca con clave retirada.

### D-K2A-5. Filas ya anonimizadas

No hay filas de producción, porque G7 sigue diferido. Las de desarrollo y ensayo se remedian **sin migración de datos**, por dos razones: D-RER-6 reserva `iwana.titular_erasure` al adaptador y al CLI, con una prueba de arquitectura que falla si otro archivo de `apps/` o `packages/` lo fija (`crm-blocked-mutations.arch.spec.ts:127`), y O-1 ya respetó esa regla.

Se usan dos herramientas que ya existen:

1. El verificador del CLI `anonymize-titular` (`--verify-only`) compara con la regla nueva, así que una marca antigua aparece como residual, con cualquier clave. **Es paso obligatorio por tenant antes de K2:** es lo único que ve una marca ya cifrada con la clave activa. Admite cualquier tenant registrado, como K2 (decisión del CTO, 2026-11-06); `--apply` sigue exigiendo `ACTIVE`.
2. Reejecutar `anonymize-titular` por solicitud la deja en `NULL`. Ya fija el GUC autorizado y el flujo es idempotente.

**Sin verificar:** nadie ha reejecutado ese CLI sobre una marca antigua; lo prueba CA-K2A-06. Si falla, `[BLOQUEO]` y vuelve a AI-EM-ARCH. La alternativa sería exceptuar la migración en D-RER-6 (§9, punto 2).

### D-K2A-6. El dry-run prueba la escritura

Copiar la regla del trigger en K2 repetiría este defecto a la próxima restricción. El dry-run **ensaya la escritura real y la revierte**.

- `PiiReencryptDbPort extends ReencryptDbPort` añade `probeEncryptedWrite(schemaName, target, id, newCiphertext): Promise<string | null>`, que devuelve el SQLSTATE si falla. Es un `UPDATE` igual al de `apply`, dentro de una transacción que siempre se revierte. Solo convierte `QueryFailedError`; cualquier otro error se propaga. `MemoryReencryptDb` del orquestador MFA no cambia.
- `runMfaToPii` lo llama en `dry-run` por cada celda que recifraría.
- Métrica nueva `writeBlocked` por objetivo y en totales. Suma a `pending` y activa `hasBlockingIssues`, con lo que el CLI sale con código 1 (`reencrypt-aes.ts:310`).
- Reporte: `write_blocked=N` en totales y por objetivo, sin valores, ids ni SQLSTATE por fila. El SQLSTATE se agrega por objetivo, por ejemplo `write_blocked_55000=2`.
- `verify-pii-only` y `apply` no llaman a la sonda.

Medido sobre el esquema con marcas: `subscribers.document_number_encrypted:55000 = 2`, y una huella `md5` de la tabla idéntica antes y después.

**Límite.** La sonda solo cubre celdas que K2 reescribiría. `processTarget` cuenta una celda que abre con la clave activa como `skipped_pii` y sigue, sin llegar a la sonda. Una marca escrita después de desplegar la clave activa pasa este K2 con `write_blocked=0` y `verify` en 0, y bloquea la **siguiente** rotación. No se amplía la sonda a esas celdas: sería escribir en filas que K2 no necesita tocar. La cubre `--verify-only` (D-K2A-5, CA-K2A-13).

**Coste.** Una transacción por celda y bloqueos de fila de milisegundos: «dry-run sin escritura» pasa a ser «dry-run sin cambios persistentes». Es aceptable porque K2 corre en ventana. Se ajusta el runbook.

### D-K2A-7. Inversión de la prueba de caracterización

La prueba `K2 aborta con 55000 al recifrar la marca cifrada de un titular anonimizado`, al final de `reencrypt-aes.pii.postgres.integration.spec.ts`, se **sustituye** por dos. Es categoría (b): la exige este cambio, se cita en el diff y la revisa `test-change-reviewer`.

**Prueba 1 · `K2 recifra un tenant con un titular suprimido por el borrado real`:**

- Sin `INSERT` a mano de la fila anonimizada: el fixture ejecuta el borrado real con `PrivacyRequestsService`, el adaptador y todos sus participantes (ocho desde MOD14, con Billing), como en el runner versionado.
- Antes de K2, cada objetivo de `PII_ENCRYPTED_TARGETS` en `subscribers`, `expediente_records` y `contracts` está en `NULL` para las filas anonimizadas. El bucle recorre el inventario, no una lista copiada.
- `dry-run`: `hasBlockingIssues` falso y `writeBlocked` 0.
- `apply`: resuelve, sin `rejects`.
- `verify-pii-only`: sin pendientes.
- La protección sigue viva: un `UPDATE` directo de la fila, sin GUC, da `55000`.

**Prueba 2 · `el dry-run delata una marca cifrada anterior y apply aborta`:** conserva el valor de la caracterización, ahora como caso legado.

- Siembra a mano una fila anonimizada con marca, igual que la prueba actual.
- `dry-run`: `writeBlocked` 1, `hasBlockingIssues` verdadero, y la fila no cambia.
- `apply`: `rejects` con `55000`. `apply` sigue abortando (D-K2A-9).
- Sin limpieza: la fila no se puede retirar, así que la prueba va última y el esquema cae en `afterAll`.

Las dos van al final, después de las pruebas con conteos exactos, y en ese orden. El comentario «Caracteriza un bloqueo abierto» pasa a describir el caso legado. Si una aserción de las pruebas anteriores tiene que cambiar, `[BLOQUEO]`.

### D-K2A-8. La integración K2 corre en CI

**Situación.** `reencrypt-aes.integration-safety.ts` solo acepta `iwana_it_g7_*` en loopback, con opt-in; CI usa `DB_NAME=test` y sin opt-in. La spec está en `integration-expected-skips.json`.

| Opción | Efecto |
| --- | --- |
| **(a) Recomendada.** Aceptar `test` solo dentro de GitHub Actions y dar el opt-in en el paso existente | Corre en el paso de integración de API. La entrada del manifiesto desaparece; el gate lo exige (`La omisión declarada ya ejecuta tests`). Coste medido de la cadena: 2,4 s |
| (b) Base `iwana_it_g7_ci` y paso propio | No toca la guarda, pero añade base, migraciones públicas, privilegios y un gate propio. La omisión del paso principal sigue en el manifiesto: seguiría «omitida» sobre el papel |

Con (a):

- La guarda recibe `ciRunner: process.env['GITHUB_ACTIONS'] === 'true'` y acepta `test` solo con esa bandera, loopback y opt-in. Sin la bandera, `test` se sigue rechazando: **ninguna aserción existente cambia** (`reencrypt-aes.spec.ts:248`). Se añaden casos: CI y `test` pasa; CI y host externo falla; CI y otra base falla.
- `.github/workflows/ci.yml`: `IWANA_K2_REENCRYPT_INTEGRATION=true` en el paso `Integration tests — API`.
- `integration-expected-skips.json` pierde la entrada de K2: 3 omisiones. Cumple CA-H-05 de hermeticidad.
- El gate exige conteo exacto de K2, como con B5: `status` `passed`, N/N, 0 omitidos. N lo fija `sr-qa` en B3; `plat-ops` lo escribe en B4. Una suite verde que no corrió no cuenta.

La spec es hermética (esquema y tenant propios, cadena migrada, limpieza en `afterAll`), como las demás que aceptan `test`.

### D-K2A-9. `apply` no cambia

Sigue abortando al primer bloqueo. Es seguro porque el proceso es idempotente, y `dry-run` es el paso previo obligatorio del runbook. Seguir de largo daría un `apply` parcial que parece exitoso.

## 5. Traza regla → campo

| Regla | Campo o artefacto | Escribe | Lee o verifica |
| --- | --- | --- | --- |
| Sin cifrado en filas anonimizadas | `subscribers.document_number_encrypted` | Participante CRM | Prueba 1, D-K2A-7 |
| `CHECK` condicionado | `chk_subscriber_person_fields` | Migración 176 | Spec de la migración |
| Orden marcar → anular | `anonymized_at`, `anonymized_request_id` | `markAnonymizedRows` | CA-K2A-01 |
| Lectura constante | `documentNumber` en la respuesta | `decryptSubscriberFields` | CA-K2A-07 |
| Aviso del dry-run | `writeBlocked`, `write_blocked=` | `runMfaToPii`, `formatMfaToPiiReport` | Prueba 2, unitarias |
| Sonda | `PiiReencryptDbPort.probeEncryptedWrite` | `TypeOrmReencryptDbAdapter` | Prueba 2 |
| Destino de CI | `ciRunner` | `reencrypt-aes.integration-safety.ts` | `reencrypt-aes.spec.ts` |
| Omisión retirada | `integration-expected-skips.json`, `ci.yml` | `plat-ops` | Gate de omisiones de CI |

## 6. Criterios de aceptación

| # | Criterio |
| --- | --- |
| CA-K2A-01 | Borrado real de un titular natural y uno jurídico: `document_number_encrypted` en `NULL`, `anonymized_at` fijado y `residual` 0. Con el orden invertido, falla con `23514` y no aplica nada |
| CA-K2A-02 | Ningún objetivo de K2 en tablas con el trigger de la 169 conserva valor en filas anonimizadas, recorriendo `PII_ENCRYPTED_TARGETS` |
| CA-K2A-03 | K2 sobre ese tenant: dry-run sin bloqueo, `apply` sin error y `--verify-pii-only` en 0, en rotación PII y en MFA→PII |
| CA-K2A-04 | El trigger de la 169 no cambia: `UPDATE` y `DELETE` sin GUC siguen en `55000`, ningún archivo nuevo fija `iwana.titular_erasure` y no existe GUC nuevo. Pasan `crm-blocked-mutations.arch.spec.ts` y la spec de la 169, sin tocarlas |
| CA-K2A-05 | Una fila con marca antigua, cifrada con una clave distinta de la activa: dry-run con `write_blocked=1`, `blocking=yes` y salida 1; valor y `updated_at` intactos; `apply` aborta con `55000` |
| CA-K2A-06 | El verificador de `anonymize-titular` reporta la marca antigua; reejecutar el CLI la deja en `NULL`, y K2 verifica en 0 |
| CA-K2A-07 | La lectura de un titular anonimizado devuelve `documentNumber: 'ANONIMIZADO'`, sin descifrar ni escribir avisos. Sin cambios en portal, OpenAPI ni `@iwana/shared` |
| CA-K2A-08 | Migración `up → down → up` con una fila `NULL` presente. Un `NATURAL` no anonimizado con `NULL` falla con `23514` en ambos estados |
| CA-K2A-09 | La sonda solo convierte `QueryFailedError`, siempre revierte y no aporta valores ni ids a logs o reporte |
| CA-K2A-10 | La integración K2 corre en el paso de API de CI con conteo exacto; el manifiesto queda con 3 omisiones; la guarda rechaza `test` fuera de GitHub Actions |
| CA-K2A-11 | Ninguna aserción existente cambia salvo la prueba sustituida en D-K2A-7. `test-change-reviewer` lo confirma. **Excepción autorizada por el CTO el 2026-11-06:** `verificationBeforeApply.totals.piiPreviousRemaining` pasa de 1 a 2 en la integración K2, porque `de0bcfa7` añadió la segunda celda con clave previa (`buyerDocument`) y no ajustó la aserción |
| CA-K2A-12 | Suite completa de `@iwana/api` y `@iwana/db` sin caché, lint y typecheck sin errores, y CI de `main` en verde sobre el SHA publicado (G6.5). Hay migración nueva: las suites focales no bastan |
| CA-K2A-13 | Una fila con marca antigua cifrada con la clave activa: dry-run con `write_blocked=0` y `--verify-pii-only` en 0, y `--verify-only` de `anonymize-titular` la reporta como residual |

## 7. Documentación al cerrar

- Runbook de rotación §6ter: `--verify-only` por tenant antes de K2, `write_blocked` como parada y D-K2A-5 como remediación; «dry-run sin cambios persistentes». También el Paso 6 del [runbook MOD05](../runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md).
- HLD Privacy, siguiente versión libre: migración 176 y regla «sin cifrado en filas anonimizadas».
- Informe de cierre. La memoria `k2-recifrado-bloqueado-anonimizados` se actualiza tras G6.

## 8. Fuera de alcance y hallazgos

**Fuera de alcance:** la marca de `party.document_number`; el modo PII previa→activa del runbook, ya desactualizado (§6ter.B paso 4); `REENCRYPT_INVENTORY_GAPS`; todo MOD14.

**Hallazgos de esta corrida, sin corregir:**

| # | Hallazgo | Destino |
| --- | --- | --- |
| H-1 | `iwana_app` puede fijar `iwana.titular_erasure` y reescribir cualquier columna de un titular anonimizado (§3.1). El `DELETE` solo lo frenó una llave foránea (`23503`). La API necesita ese paso, así que no se arregla con roles | `sec-eng` dictamina si basta o se endurece. §9, punto 5 |
| H-2 | **`crm_lifecycle_changes.note_encrypted` sobrevive al borrado.** La nota libre sigue cifrada y legible (`subscriber-lifecycle.service.ts:455`), y ningún participante cubre esa tabla (`targets-after-erasure`: 1 fila). Puede contener datos personales | Tarea propia: es un posible residuo de la supresión, ajeno a K2 |

## 9. Puntos para el G0 del CTO

1. **Salida:** B (`NULL` y `CHECK` condicionado), o A si prefiere no tocar el `CHECK`, con las condiciones de §3.4.
2. **Filas previas:** remediación por CLI (D-K2A-5), o exceptuar una migración de datos en D-RER-6.
3. **Dry-run con sonda revertida** (D-K2A-6), que cambia el sentido de «sin escritura».
4. **CI:** opción (a), con la guarda ampliada solo para GitHub Actions.
5. **H-1:** si se encarga el dictamen a `sec-eng` dentro de B5, sin implementar.
6. **Secuencia con MOD14** (plan §1): esta fase toca archivos que MOD14 B2 también toca, y no se paraleliza.

**Decisión del CTO (2026-11-04):**

| # | Punto | Decisión |
| --- | --- | --- |
| 1 | Salida | B. La salida A queda descartada |
| 2 | Filas previas | Remediación por CLI (D-K2A-5), sin migración de datos y sin excepción a D-RER-6 |
| 3 | Dry-run | Con sonda revertida (D-K2A-6) |
| 4 | CI | Opción (a) de D-K2A-8 |
| 5 | H-1 | Dictamen de `sec-eng` dentro de B5, sin implementar |
| 6 | Secuencia | H-2 primero. K2 después de publicar el inventario y las 173–175 |

## 10. Límites de esta evidencia

- Sin capa HTTP y con auditoría y puertos externos simulados. Eso no altera la escritura sobre `subscribers`, pero no prueba la ruta completa de la API.
- El árbol incluía MOD14 y el inventario sin commitear.
- Los prototipos de A y B se aplicaron con SQL en el esquema desechable. El código de borrado no se modificó: el orden de D-K2A-3 se probó con dos `UPDATE`.
- No se contaron las filas anonimizadas de `tenant_iwana`: el encargo excluye esa base. Cada tenant lo reportará con su dry-run.
- Para repetir la corrida: quitar `.txt`, copiar a una carpeta fuera del repo, levantar un Postgres desechable y definir las variables de `env.ejemplo.sh.txt` y `K2_EVIDENCE`. `K2_ERASURE_KEY=mfa` y `-t "A\. borrado"` dan la variante MFA.

SHA-256 de la evidencia:

```text
09b0150ac442e64aab52159c81e32d59df505d7b382fa8232d602bc22743df41  erasure-k2.k2e2e.spec.ts.txt
aaf9b4430f0b2bcd34887e57de613a06f6b5597fc831bd6bf3682a709f7da2f9  jest.k2.config.js.txt
176e5dc26dd22907e0a33ac0c99cba740ade2c66faf7cedc7137e135c80c7006  env.ejemplo.sh.txt
95c871c7e065e19c0446ec3a928dc261d58efd712a37ced37c7d14ad5a45022e  corrida-rotacion-pii.ndjson
a99341b9562373e2a2d9bf5ca94fc7670e0adcc67d07a4f58bef3cf6e1250eb6  corrida-mfa-a-pii.ndjson
```

## 11. Revisión contra el código (v1.1)

Hecha el 2026-11-04 **por lectura de código**, sin base: Docker no estaba disponible. Nada de esta sección se midió.

| Pregunta | Resultado | Evidencia |
| --- | --- | --- |
| ¿El dry-run delata toda marca previa? | **No.** Corregido en v1.1 | `reencrypt-aes.pii.ts`, rama `skippedAlreadyPii` |
| ¿D-K2A-3 rompe alguna condición del marcado? | No. `markAnonymizedRows` no depende de que el borrado haya terminado, y el GUC se fija antes de los participantes | `titular-erasure-sql.ts:318`, `crm-personal-data-erasure.adapter.ts:113` |
| ¿La remediación choca con el `CHECK` por las reglas `null` de `PERSONAL_RULES`? | No. `--apply` pasa por `adapter.applyScope`, con las reglas del participante | `anonymize-titular.ts`, `anonymizeTitularInTransaction` |
| ¿Un documento `NULL` cambia el 409 de las transiciones? | No. La guarda de `anonymizedAt` va antes de validar campos | `subscriber-status-transition.service.ts:138` y `:157` |
| ¿MOD14 repite el bloqueo? | No hoy. La 173 no tiene triggers y el HLD deja `buyer_document_encrypted` en `NULL` al suprimir, igual que la salida B. Si `billing_documents` gana un trigger, la sonda lo delata | `173_billing_core.ts`, HLD MOD14 v1.1 §8.1 (b) |
| ¿La 176 sigue libre? | Sí, y las specs H-2 y barrido no piden número | `runner.ts`, specs del 2026-11-03 |

**Sigue sin verificar:** CA-K2A-06. Que `--apply` use las reglas del participante quita una objeción, pero nadie lo ha ejecutado sobre una marca antigua.
