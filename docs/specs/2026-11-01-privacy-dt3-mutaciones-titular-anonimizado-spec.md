# Spec — `privacy` · DT-3 «R-ER»: mutaciones sobre titulares anonimizados y concurrencia con la supresión

**Versión:** 1.3
**Cambio v1.2 → v1.3 (2026-11-08):** D-RER-6 enmendada por la [spec H-1](2026-11-07-privacy-h1-guc-supresion-spec.md) (D-H1-4, G0 del CTO el 2026-11-07). Con el GUC, el trigger ya no deja pasar cualquier cambio sobre una fila suprimida: solo los que la llevan al estado suprimido. Lo implementa la migración 178, que añade una bitácora append-only.
**Cambio v1.1 → v1.2 (2026-11-01, tras repetir B3):** (1) CA-RER-05 contradecía a D-RER-2: pedía 409 para `archive`, que es la excepción permitida. Ahora el `archive` de la carrera responde 200 sin que reaparezca ningún valor anterior; el `PATCH` sigue en 409. (2) D-RER-2 fija cómo deja pasar la guarda HTTP al archivo: la ruta `POST crm/contracts/:id/archive` tenía `GuardBlockedTitular('params.id')` y rechazaba el titular anonimizado antes del servicio (CA-RER-03 en FAIL).
**Estado:** Aprobado. G0 del CTO el 2026-11-02 sobre §9 (ocho puntos, con los dos cambios visibles).
**Cambio v1.0 → v1.1 (2026-11-01, tras la Ola 1):** §5 suma el escritor `crm/responsibilities` (asignación de responsable del expediente), que el inventario de B1 encontró fuera de las rutas autorizadas. Es una ampliación del inventario, no de la regla.
**Fecha:** 2026-11-01
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Prioridad:** alta. La Ley 2573 de 2026 rige desde el 19-nov-2026 (ADR-094 H6).
**Origen:** [INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md), §K4c y «Dictamen AI-EM-ARCH tras G1 repetido».
**Artefactos base:** [HLD Privacy v1.1](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.1.md) §2, §5, §6.6 y §6.7; [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) D7; [ADR-083](../adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md) (permisos y roles de los endpoints).
**Plan:** [2026-11-01-privacy-dt3-rer-orquestacion.md](../plans/2026-11-01-privacy-dt3-rer-orquestacion.md) · **Prompt:** [PROMPT-PRIVACY-DT3-RER-v1.0](../prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md)

> Define comportamiento. No contiene código. Las rutas `archivo:línea` se leyeron en el árbol de trabajo del 2026-11-01, con el clúster MOD05 sin commitear; se revalidan al implementar.

---

## 1. Problema

La supresión (HLD §6.6) anonimiza los datos del titular y **conserva** los registros: `subscribers` y `expediente_records` quedan con `anonymized_at` y los contratos se conservan con sus campos redactados (D-1B-5). Al resolver, además, se cierra la marca `DATOS_BLOQUEADOS`.

Las guardas de mutación solo miran esa marca y **dejan pasar al titular anonimizado**:

| Guarda | Bypass | Existe en `HEAD` |
| --- | --- | --- |
| `ContractsService.assertSubscriberNotBlocked` | `if (anonymizedAt != null \|\| !partyId) return;` (`crm/contracts/contracts.service.ts:765`) | Sí, desde `079daf80` |
| `SubscribersBlockedTitularGuard` | `return true` con `anonymizedAt != null` (`crm/subscribers/guards/subscribers-blocked-titular.guard.ts:43`) | Sí |
| `ExpedientesBlockedTitularGuard` | `return true` con `anonymizedAt != null` (`crm/expedientes/guards/expedientes-blocked-titular.guard.ts:41`) | Sí. No lo cita K4c; se agrega aquí |

Consecuencias verificadas en código:

1. **Restauración directa.** `PATCH /crm/contracts/:id` acepta `alias` e `installationNotes` (`contracts.service.ts:860,869`), dos campos que la supresión acaba de redactar (`CONTRACT_COMMERCIAL_RULES`, `CONTRACT_LOCATION_RULES` en `crm-titular-erasure.participant.ts:130-144`). Un cliente con la pantalla abierta antes de la supresión puede reescribirlos.
2. **Restauración por carrera, aun con la guarda corregida.** La guarda corre **fuera** de la transacción del escritor. Además, `_transition` (archivar, terminar, etc.) carga la entidad con `findOne` antes de abrir la transacción, solo compara `status` bajo `FOR UPDATE` y guarda con `qr.manager.save(Contract, entity)` (`contracts.service.ts`, `_transition`). Si la supresión confirma entre la carga y el `save`, el `save` reescribe los valores previos a la supresión.
3. **Versión de la supresión.** `anonymizeConfiguredTable` asigna `updated_at = CURRENT_TIMESTAMP` (`titular-erasure-sql.ts:279`). `CURRENT_TIMESTAMP` es la hora de **inicio** de la transacción: puede ser anterior al `updated_at` que dejó un escritor que confirmó durante la supresión, y la versión retrocede. Los escritores de contratos usan `GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', updated_at) + interval '1 millisecond')` (`subscriber-lifecycle.service.ts:289,612`; `crm-contract-impersonation.adapter.ts:106`). `markAnonymizedRows` (`titular-erasure-sql.ts:308-334`) no avanza `updated_at`: una ficha sin campos «sucios» queda marcada con la misma versión.
4. **Deber de conservación leído fuera de la transacción.** `resolve` evalúa `hasConservationDuty` con `IContractStandingReadPort.standing(partyId)` (`requests.service.ts:1010,1110`), que abre su propio `runInTenantSchema` sin el `manager` de la supresión y sin bloqueo (`crm-contract-standing-read.adapter.ts:11-37`). Un contrato creado o reactivado entre esa lectura y los bloqueos de la supresión no detiene la supresión.

## 2. Fundamento regulatorio

Fuente oficial: Normograma del Ministerio TIC (texto compilado y notas de vigencia), consultado el 2026-11-01.

| Norma | Contenido aplicable | Fuente |
| --- | --- | --- |
| Ley 1581 de 2012, art. 4 lit. d) | Principio de veracidad o calidad: la información tratada debe ser veraz, completa, exacta y actualizada | [normograma.mintic.gov.co · Ley 1581](https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_1581_2012.htm) |
| Ley 1581 de 2012, art. 4 lit. g) | Principio de seguridad: medidas para evitar adulteración, pérdida, consulta, uso o acceso no autorizado | Ídem |
| Ley 1581 de 2012, art. 8 lit. e) | Derecho del titular a revocar la autorización y/o solicitar la supresión del dato (condicionalmente exequible) | Ídem |
| Ley 1581 de 2012, art. 15 | Reclamo del titular para corrección, actualización o supresión | Ídem |
| Ley 1581 de 2012, art. 17 lit. d) | Deber del Responsable: conservar la información con la seguridad necesaria para impedir su adulteración | Ídem |
| Ley 1581 de 2012, art. 18 lit. b) | El mismo deber para el Encargado (iWana, HLD §1) | Ídem |
| Decreto 1377 de 2013, art. 9 (DUR 1074 de 2015, art. 2.2.2.25.2.6) | Revocatoria y supresión: el titular puede solicitarla en todo momento, salvo deber legal o contractual de permanencia | [normograma.mintic.gov.co · Decreto 1377](https://normograma.mintic.gov.co/mintic/compilacion/docs/decreto_1377_2013.htm) |
| Decreto 1377 de 2013, art. 11 (DUR 1074, art. 2.2.2.25.2.8) | Limitación temporal: tratar solo durante el tiempo razonable y necesario; después, suprimir | Ídem |

**Lectura aplicada.** Una supresión que un cliente desactualizado puede deshacer no es una supresión efectiva (art. 8 lit. e; Decreto 1377 art. 9). Reescribir un campo redactado vuelve a tratar un dato cuyo tratamiento cesó, y adultera el resultado de la supresión (art. 4 lit. g; arts. 17 lit. d y 18 lit. b). Ninguna de estas normas exige permitir ediciones posteriores; la conservación del registro anonimizado se funda en ADR-094 D7 y D-1B-5, no en un derecho a modificarlo.

**Ley 2573 de 2026.** Fija la prioridad, no la regla: rige desde el 19-nov-2026 y el flujo de suplantación (HLD §6.3) desemboca en supresiones. ADR-094 H6 registra que su texto oficial no estaba accesible al verificar. El 2026-11-01 tampoco se pudo abrir en la Secretaría del Senado (conexión rechazada). Esta spec no deriva ninguna regla de esa ley. ⚠ Verificar la vigencia en fuente oficial antes de G7.

## 3. Definiciones

| Término | Significado |
| --- | --- |
| **Titular anonimizado** | Suscriptor con `subscribers.anonymized_at IS NOT NULL`, o expediente con `expediente_records.anonymized_at IS NOT NULL` |
| **Registro anonimizado** | La fila de `subscribers` o `expediente_records` marcada, y todo contrato cuyo `subscriber_id` apunte a un suscriptor marcado. `contracts` no tiene marca propia (migración 150) y no se le agrega |
| **Campo redactado** | Toda columna que reescribe el participante CRM: `CRM_RULES`, `CONTRACT_LOCATION_RULES`, `CONTRACT_FISCAL_RULES`, `CONTRACT_COMMERCIAL_RULES` y las columnas de snapshot (`vat_snapshot`, `plan_snapshot_json`) de `crm-titular-erasure.participant.ts`. Esa lista es la fuente; la spec no la copia |
| **Escritor** | Todo código que ejecuta `INSERT`, `UPDATE` o `DELETE` sobre esas tablas: rutas HTTP, servicios internos, adaptadores de puertos, jobs del worker, CLI, migraciones y backfills |

## 4. Decisiones

### D-RER-1. Un registro anonimizado es de solo lectura

Toda mutación sobre un registro anonimizado responde **409** con:

```json
{ "code": "PRIVACY_TITULAR_ANONYMIZED", "message": "Este titular fue anonimizado; sus registros ya no se pueden modificar." }
```

- Aplica con **cualquier** permiso y rol, incluidos `ADMIN`, `privacy.manage` y `crm.blocked_data.read`. ADR-083 no cambia: no se crea permiso ni se toca `@Roles`/`@Permissions`. La regla es de dominio, no de autorización.
- Cubre **todas** las rutas `POST`, `PATCH`, `PUT` y `DELETE` de los controllers de suscriptores, contratos, expedientes y de `subscriber-tax.controller.ts`, incluidas las tres escrituras tributarias que hoy no llevan decorador (PUT/PATCH de asignaciones y POST de sugerencia, `subscriber-tax.controller.ts:74-132`).
- Cubre la **creación** de registros ligados a un titular anonimizado: contrato con `body.subscriberId` anonimizado y servicios por suscriptor (`contracts.controller.ts:150-368`). La excepción de HLD §6.7 «creación de registros nuevos» sigue valiendo para titulares **bloqueados**, no para anonimizados. Si la persona vuelve como cliente, se registra como titular nuevo, con autorización nueva.
- Cubre la baja lógica de la ficha (`DELETE` de suscriptor) y del contrato: la fila anonimizada es prueba de la supresión (HLD §6.6, R6) y no se borra.
- La lectura no cambia (ficha, contratos, 360°, búsqueda). La respuesta ya muestra la insignia «Anonimizado».

### D-RER-2. Única excepción: archivar un contrato terminado

| Operación | Decisión | Motivo |
| --- | --- | --- |
| **Archivar** (`TERMINATED → ARCHIVED`) | **Permitida** | Higiene operativa sin datos personales. Escribe solo `status`, `status_reason_code`, `status_changed_at` y `updated_at` |
| Terminar | Prohibida (409) | Inalcanzable por invariante: la supresión exige que no haya contratos abiertos (`openContractIds` vacío; todo contrato está `TERMINATED` o `ARCHIVED`). Si apareciera un contrato abierto de un titular anonimizado, es una violación de invariante: se rechaza y se registra (sin PII) para análisis |
| Suspender, reactivar, activar, cambio de plan, punto de servicio, soporte de estrato, ciclo | Prohibidas | Reabren o editan un servicio de un titular que ya no existe para el ISP |
| Cualquier otra | Prohibida | Regla general D-RER-1 |

**Forma obligatoria del archivo permitido:** `UPDATE` con lista explícita de las cuatro columnas, dentro de la transacción y después del bloqueo de D-RER-3. **Nunca** `save` de una entidad cargada antes del bloqueo: ese patrón es el que reescribe campos redactados (§1, punto 2).

### D-RER-3. La decisión se toma dentro de la transacción del escritor, con bloqueo

La guarda HTTP (decorador + guard de Nest) **se conserva** como rechazo temprano, pero **no es la garantía**. La garantía es:

1. **Comprobación bajo bloqueo.** Todo escritor, dentro de su transacción y **antes** de leer o bloquear la fila destino, bloquea la fila del titular y relee `anonymized_at`:
   - escritor de contratos: `SELECT anonymized_at FROM subscribers WHERE id = $1 AND tenant_id = $2 FOR SHARE`, y después el `FOR UPDATE` del contrato;
   - escritor de la ficha: `FOR UPDATE` de `subscribers` y lectura de `anonymized_at` en la misma sentencia;
   - escritor de expedientes: `FOR UPDATE` de `expediente_records` y lectura de su `anonymized_at`; si además toca el suscriptor, lo bloquea **después** del expediente.

   Si `anonymized_at` no es nulo: 409 `PRIVACY_TITULAR_ANONYMIZED` y `ROLLBACK`, sin escribir.
2. **Orden de bloqueo único:** `expediente_records → subscribers → contracts`. Es el orden de la supresión (`crm-titular-erasure.participant.ts:356` recorre expedientes y suscriptores; los contratos se bloquean después, `:497`). Un escritor que bloquee en otro orden puede causar deadlock (`40P01`) con la supresión.
3. **Releer después de bloquear.** Ningún escritor persiste valores de una entidad leída antes de sus bloqueos. Las dos formas aceptadas son: releer la fila bajo bloqueo y aplicar el DTO sobre esa lectura, o `UPDATE` con columnas explícitas. Esto alcanza a `_transition` y a todo `qr.manager.save(...)` sobre una entidad de `findOne` previo.
4. **Orden de evaluación de errores:** 401/403 (autenticación, rol y permiso) → 404 → **409 `PRIVACY_TITULAR_ANONYMIZED`** → 409 `PRIVACY_DATA_BLOCKED` → 409 de versión (`CONTRACT_CHANGED` y equivalentes) → validaciones de dominio.

### D-RER-4. Requests autorizadas antes de la transacción de supresión

Una request que pasó autenticación, permisos y guarda **antes** de que confirme la supresión no tiene derecho adquirido a escribir. Hay dos desenlaces, ambos correctos:

| Caso | Qué ocurre | Resultado |
| --- | --- | --- |
| **El escritor bloquea primero** | La supresión espera en su `FOR UPDATE` de `subscribers` (o del expediente) hasta que el escritor confirme. Luego lee la fila **ya escrita** y redacta lo que encuentre, incluidos los contratos que el escritor haya creado (`idsForContracts` corre después del bloqueo de suscriptores) | El dato escrito se suprime. Residuales 0 |
| **La supresión bloquea primero** | El escritor espera en su `FOR SHARE`/`FOR UPDATE`. Al obtenerlo, relee `anonymized_at` no nulo | 409 `PRIVACY_TITULAR_ANONYMIZED`; nada se escribe |

**Deber de conservación bajo bloqueo.** `resolve` vuelve a evaluar el deber de conservación **dentro** de la transacción de la supresión, con su `manager` y **después** de bloquear las filas de `subscribers` del titular. `IContractStandingReadPort.standing` recibe `ctx: { manager }`, igual que `IPersonalDataErasurePort`. Si en ese punto hay un contrato abierto o la retención está vigente: se aborta con el error de conservación vigente y no se anonimiza nada. La comprobación previa de la vista previa se mantiene como informativa.

No se agregan `lock_timeout` ni reintentos automáticos. Si el escritor o la supresión esperan más que el `statement_timeout` vigente, fallan como hoy y el usuario reintenta.

### D-RER-5. Garantía de versión de la escritura de supresión

1. Toda fila que la supresión modifica, **sea por campos redactados o solo por la marca**, avanza `updated_at` con la misma expresión de los escritores de contratos:
   `GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', updated_at) + interval '1 millisecond')`.
   Se reemplaza `CURRENT_TIMESTAMP` en `anonymizeConfiguredTable` y se agrega el avance en `markAnonymizedRows` para las tablas que tengan `updated_at`.
2. Garantías resultantes: la nueva versión es **estrictamente mayor** que la anterior, con resolución de milisegundo (la que compara `assertContractVersionForSave`); nunca retrocede aunque otro escritor haya dejado un `updated_at` futuro; y toda versión capturada antes de la supresión deja de coincidir.
3. Una fila que la supresión vuelve a recorrer sin cambiar nada (reintento idempotente, CLI sobre un titular ya limpio) **no** avanza su versión.

### D-RER-6. Defensa en base de datos

Migración tenant nueva, con el siguiente número libre al implementar (no 167 ni 168, que son del clúster MOD05), reversible:

- Función `titular_prevent_anonymized_mutation()` y triggers `BEFORE UPDATE OR DELETE` en `subscribers`, `expediente_records` y `contracts`.
- `subscribers` y `expediente_records`: si `OLD.anonymized_at IS NOT NULL`, rechaza todo `UPDATE` y `DELETE`.
- `contracts`: si el suscriptor de `OLD.subscriber_id` está anonimizado, rechaza todo `DELETE` y todo `UPDATE`, **salvo** el archivo de D-RER-2: `OLD.status = 'TERMINATED'`, `NEW.status = 'ARCHIVED'` y ninguna columna distinta de `status`, `status_reason_code`, `status_changed_at` y `updated_at` cambia.
- **Paso de la supresión (v1.3):** cuando `current_setting('iwana.titular_erasure', true) = 'on'`, los triggers dejan pasar la primera supresión de una fila aún no marcada. Sobre una fila ya suprimida rechazan todo cambio que no la lleve al estado suprimido (columna personal a `NULL` o a su marcador, `jsonb` contenido en el anterior) y todo `DELETE`, y registran lo permitido en la bitácora `privacy_erasure_mutation_log` (migración 178, spec H-1 D-H1-1 y D-H1-2). El GUC no es un control de acceso: cualquier rol puede fijarlo, y por eso la regla monótona no depende de quién lo fije. Solo lo fijan, con `set_config('iwana.titular_erasure', 'on', true)` (alcance de transacción), el adaptador de supresión y el CLI de emergencia. Un test de arquitectura falla si otro archivo de `apps/` o `packages/` lo fija.
- Error: `RAISE EXCEPTION ... USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED'`, igual que la 150. La API traduce ese `HINT` a 409 `PRIVACY_TITULAR_ANONYMIZED`; no debe llegar como 500.
- Coexiste con `titular_prevent_anonymization_rewrite()` de la 150, que no cambia.
- El `down` elimina triggers y función, sin tocar datos.

El trigger es el respaldo para escritores sin guarda HTTP (jobs, CLI, migraciones y backfills futuros). La comprobación de D-RER-3 sigue siendo obligatoria: da el 409 limpio y el orden de bloqueo.

## 5. Contrato de cambios (regla → campo)

| Regla | Dónde se implementa | Dueño |
| --- | --- | --- |
| D-RER-1 contratos | `assertSubscriberNotBlocked` deja de retornar con `anonymizedAt`; lanza `PRIVACY_TITULAR_ANONYMIZED`. La rama `!partyId` sigue sin marca de bloqueo, pero sí evalúa `anonymized_at` | `crm/contracts` |
| D-RER-1 ficha | `SubscribersBlockedTitularGuard` rechaza con `anonymizedAt`. Se agrega el decorador a las tres escrituras tributarias sin guarda | `crm/subscribers` |
| D-RER-1 expedientes | `ExpedientesBlockedTitularGuard` rechaza con `anonymizedAt` | `crm/expedientes` |
| D-RER-1 código de error | Constructor único `titularAnonymizedConflict()` en `crm` (junto a los errores de dominio existentes). No pasa a `@iwana/shared`: hoy tampoco está `PRIVACY_DATA_BLOCKED` | `crm` |
| D-RER-2 | `archive` con `UPDATE` explícito de 4 columnas cuando el titular está anonimizado; el resto de `_transition` rechaza | `crm/contracts` |
| D-RER-2 (v1.2), guarda HTTP | El decorador de contratos admite la opción `{ allowAnonymized: true }`, que **solo** lleva `POST crm/contracts/:id/archive`. Con ella, la guarda sigue rechazando `DATOS_BLOQUEADOS` (409 `PRIVACY_DATA_BLOCKED`), pero no rechaza al anonimizado. Esa decisión la toma `_transition` con la fila bloqueada, y solo admite `TERMINATED → ARCHIVED`. La ruta conserva su decorador, así que la cobertura por reflexión de HLD §6.7 no cambia. El test de arquitectura falla si otra ruta lleva `allowAnonymized` | `crm/contracts` (guarda, decorador, controller y servicio) |
| D-RER-3 | Comprobación bajo bloqueo en **cada** escritor de `ContractsService`, `SubscribersService`, `SubscriberTaxProfileService`, `SubscriberLifecycleService`, expedientes y los adaptadores CRM de puertos (`crm-contract-impersonation.adapter.ts`) | `crm` |
| D-RER-3 (v1.1) | `ResponsibilitiesService` (`crm/responsibilities/responsibilities.service.ts:87`): `UPDATE` de `expediente_records` sin bloqueo previo. Pasa a bloquear el expediente con `FOR UPDATE`, releer `anonymized_at` y rechazar con 409 antes de escribir, también en la rama de compatibilidad de schema. Hoy solo lo frena el trigger de la 169 | `crm` |
| D-RER-4 | `IContractStandingReadPort.standing(partyId, ctx: { manager })`; `resolve` lo invoca después de `port.plan` (que ya bloquea `subscribers` con `FOR SHARE`, `crm-titular-erasure.participant.ts:326`) | `privacy/requests` (puerto) y `crm/privacy-adapters` (implementación) |
| D-RER-5 | `titular-erasure-sql.ts`: `anonymizeConfiguredTable` y `markAnonymizedRows` | `crm/privacy-adapters` |
| D-RER-6 | Migración tenant nueva, registrada en `runner.ts`, con su `*.integration.spec.ts`; `set_config` en `CrmPersonalDataErasureAdapter.anonymize` y en `apps/api/src/cli/anonymize-titular.ts`; traducción del `HINT` en el filtro de errores de la API | `packages/database`, `crm/privacy-adapters`, `cli` |
| Reflexión | `crm/tests/crm-blocked-mutations.arch.spec.ts` amplía su universo a `subscriber-tax.controller.ts` y añade la aserción de D-RER-6 sobre `iwana.titular_erasure` | `crm` |

Boundaries: todo el cambio vive en CRM y en `packages/database`, salvo la firma del puerto `IContractStandingReadPort`, que declara `privacy/requests`. `privacy` no lee tablas de CRM (HLD §2).

Sin cambios de UI ni de OpenAPI más allá del nuevo código 409 en las respuestas documentadas de las rutas afectadas. Si el portal ya oculta acciones para un titular anonimizado, se mantiene; no es parte de la garantía.

## 6. Criterios de aceptación

Las pruebas marcadas **PG** corren contra PostgreSQL real, con el schema creado por la cadena de migraciones (patrón `subscriber-enum-parity`), sin dobles de puertos entre módulos y con 0 omitidas. La concurrencia se prueba con **dos conexiones reales**, no con mocks de `QueryRunner`.

| # | Criterio | Tipo |
| --- | --- | --- |
| CA-RER-01 | Con un titular suprimido por `resolve` real, `PATCH /crm/contracts/:id` con `alias` e `installationNotes`, como `ADMIN` con todos los permisos, responde 409 `PRIVACY_TITULAR_ANONYMIZED`. Las columnas redactadas del contrato quedan idénticas byte a byte y `updated_at` no cambia | PG + HTTP |
| CA-RER-02 | Matriz por reflexión: cada ruta de mutación de suscriptores, contratos, expedientes y `subscriber-tax` sobre un titular anonimizado responde 409 `PRIVACY_TITULAR_ANONYMIZED`, salvo archivar. La creación de contrato con `body.subscriberId` anonimizado, también. El test falla si aparece una ruta sin cubrir | HTTP + arquitectura |
| CA-RER-03 | Archivar un contrato `TERMINATED` de un titular anonimizado responde 200. Solo cambian `status`, `status_reason_code`, `status_changed_at` y `updated_at`; el resto de columnas, idéntico | PG |
| CA-RER-04 | **El escritor bloquea primero:** la conexión A abre el `PATCH` de alias y retiene su bloqueo; la conexión B inicia `resolve` y queda en espera; A confirma; B termina. El alias final es el marcador de supresión, `residual = 0` y `erased_at` está fijado | PG, dos conexiones |
| CA-RER-05 | **La supresión bloquea primero:** B retiene la supresión sin confirmar; A, que ya pasó la guarda HTTP y cargó la entidad antes, queda en espera; B confirma. Se prueba con dos escritores: el `PATCH` de alias responde 409 `PRIVACY_TITULAR_ANONYMIZED` y no escribe nada; el `archive` de un contrato `TERMINATED` responde 200 (excepción de D-RER-2) y solo cambia las 4 columnas permitidas. En ninguno de los dos reaparece un valor anterior a la supresión: se comparan todas las columnas redactadas con su valor posterior a la supresión | PG, dos conexiones |
| CA-RER-06 | Versión: un contrato con `updated_at` 5 s en el futuro queda, tras la supresión, en exactamente `+1 ms`. Un suscriptor sin campos sucios, solo marcado, también avanza su versión. Una versión capturada antes de la supresión ya no coincide | PG |
| CA-RER-07 | Reintento idempotente: el CLI de emergencia sobre un titular ya suprimido y limpio no cambia filas (`changed = 0`) ni avanza versiones | PG |
| CA-RER-08 | Trigger: un `UPDATE` SQL directo del alias de un contrato anonimizado, sin `iwana.titular_erasure`, falla con `55000` y `HINT` `PRIVACY_TITULAR_ANONYMIZED`; el `DELETE` de la fila anonimizada, también. Dentro de la transacción de supresión, pasa. La API traduce el error a 409, no a 500. Migración `up → down → up` sin pérdida de datos | PG + migración |
| CA-RER-09 | Deber de conservación bajo bloqueo: con la vista previa calculada, otra conexión crea un contrato `DRAFT` para el titular antes de `resolve`. `resolve` aborta con el error de conservación vigente; ninguna fila queda anonimizada y la solicitud no tiene `erased_at` | PG, dos conexiones |
| CA-RER-10 | Sin deadlocks: 20 iteraciones alternando el orden de llegada de escritor de contrato, escritor de ficha y supresión; 0 errores `40P01` y todas terminan dentro del `statement_timeout` | PG |
| CA-RER-11 | Arquitectura: solo el adaptador de supresión y el CLI fijan `iwana.titular_erasure`; ningún escritor de `crm` persiste con `save` una entidad cargada antes de su bloqueo en las rutas de §5 (revisión de `sec-eng`, con `archivo:línea`) | Arquitectura + revisión |
| CA-RER-12 | Regresión: las suites de bloqueo de Fase 1b (`DATOS_BLOQUEADOS` → 409 `PRIVACY_DATA_BLOCKED`) y la E2E de supresión siguen en verde sin ajustar sus expectativas | PG + E2E |

Gates de AGENTS.md: cobertura ≥80 % en los servicios tocados, sin bajar su línea base; migración reversible; sin PII en logs (el registro de invariante de D-RER-2 lleva solo ids); lint y typecheck; suite completa de `@iwana/api` y `@iwana/db` sin caché, porque cambia un `@Module` si se toca el cableado del puerto.

## 7. Detección en datos existentes

Antes de G7, `sr-backend` entrega un modo de solo lectura del CLI de emergencia (`--verify-only`) que, por tenant, lista los titulares anonimizados con campos redactados que ya no tienen su valor esperado (la misma verificación de residuales de la supresión). Si hay casos, se corrigen re-ejecutando el CLI con la ruta de supresión. En desarrollo se corre en las olas; en producción, en G7.

## 8. Fuera de alcance

| Tema | Destino |
| --- | --- |
| **O-1.** `lastTerminatedAt`, que fija el inicio de la retención de 5 años, sale de `contracts.updated_at` (`crm-contract-standing-read.adapter.ts:30`). Toda edición de un contrato terminado mueve el reloj de retención; la migración 168 del clúster y la propia supresión lo mueven. Debería salir de `status_changed_at` | Hallazgo nuevo. Spec propia de privacidad (retención), P2. No bloquea DT-3 |
| Crear un registro nuevo con el documento de un titular bloqueado (D-H15) | Fase 2 (HLD §10) |
| Mensajes y estados de UI para el nuevo 409 | Solo si `prod-ux` lo pide; el portal ya muestra la insignia |
| Copias de seguridad | ADR-094 D7, `plat-ops` |

## 9. Decisiones que pide esta spec al CTO (G0)

Estado al pedir el G0 (2026-11-02): implementado y verificado sobre el árbol de la consolidación conjunta. C4d está en GO ([informe del clúster](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md), §C4d); la evidencia de DT-3 está en [INFORME-PRIVACY-DT3-B1R-v1.0](../informes/INFORME-PRIVACY-DT3-B1R-v1.0.md). El G0 es condición de C4e.

1. D-RER-1: solo lectura con cualquier permiso, incluida la creación ligada al titular.
2. D-RER-2: archivar `TERMINATED → ARCHIVED` como única excepción. Por HTTP se admite con `allowAnonymized` solo en esa ruta (v1.2).
3. D-RER-3 punto 4: el orden 404 → 409 anonimizado → 409 bloqueado → 409 versión → 422 de dominio también aplica a la creación (B1-G). **Cambio visible:** crear con un suscriptor o un expediente inexistente y un ciclo inválido responde ahora 404 en lugar de 422.
4. D-RER-3 punto 3, relectura bajo bloqueo. **Cambio visible**, aceptado por la sesión del clúster: si un `PATCH` de contrato coincide con un `changePlan` que confirma antes, el `PATCH` responde ahora 200 sobre el plan nuevo; antes, la ventana interna del servidor lo hacía responder 409. El plan anterior nunca se restaura (dos pruebas deterministas, 20/20 por orden). `changePlan` mantiene su 409 por `expectedUpdatedAt`.
5. D-RER-4: sin reintentos ni `lock_timeout` nuevos.
6. D-RER-6: trigger de la migración 169, con paso por `iwana.titular_erasure` (solo el adaptador de supresión y el CLI lo fijan).
7. Secuencia: ~~implementar después de C1~~. Sustituida por la consolidación conjunta con MOD05 (opción A del usuario): DT-3 va en los commits 2 y 5 de C4e.
8. Registrar O-1 (reloj de retención anclado a `contracts.updated_at`) como deuda de privacidad separada, P2.
