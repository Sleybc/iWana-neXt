# Spec — Privacy · H-EXP · Anonimización al vencer la retención

**Versión:** 1.1  
**Cambio v1.0 → v1.1 (2026-11-07):** decisión del CTO de procesar el job en la API (opción B, ADR-105); §6 reescrita sin ruta interna ni token de workload. H-EXP se divide en dos fases (§8): la Fase 1 cierra el bloqueo de G7; la Fase 2 (autorizaciones y borrado físico en Media) va antes del primer vencimiento posible de una autorización.  
**Fecha:** 2026-11-07  
**Estado:** Aprobada. G0 del CTO el 2026-11-07: §10, puntos 1 a 4, con ADR-105. Sin implementación ni G7  
**Modo:** Architect + EM  
**Responsable:** AI-EM-ARCH; ejecución backend AI-SR-FULL, infraestructura AI-PLAT-OPS y revisión independiente AI-SEC-ENG  
**Alcance autorizado:** creación de esta spec. La firma del abogado sobre la respuesta del 2026-11-07 fue confirmada por el responsable del proyecto en esta sesión; el original firmado se custodia fuera del repositorio.

**Orquestación:** [plan H-EXP Fase 1](../plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md) y su [lanzador](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-LAUNCH-v1.0.md), bloqueados hasta el G0. Antes: [plan G7 v1.0](../plans/2026-11-07-privacy-g7-correcciones-orquestacion.md), bloque G7-H.

## 1. Fuentes y resultado esperado

Fuentes abiertas: [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md), **Aprobado**, D2 y D7; [ADR-104](../adrs/ADR-104-Enmienda-ADR-094-D7-Retencion-PQR-y-Veracidad.md), **Aprobado**, E1 a E3 y §5; [HLD Privacy v1.5](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.5.md); [spec del barrido v1.2](2026-11-03-privacy-barrido-texto-libre-supresion-spec.md), D-BT-14 a 16; [gobernanza](../../AGENTS.md). Esta spec deriva requisitos de esos ADR; no incorpora interpretaciones legales nuevas ni sustituye los dictámenes pendientes de ADR-094 §7.3.

Al vencer todos los deberes de conservación, un titular con `DATOS_BLOQUEADOS` debe anonimizarse sin radicar otra solicitud ni reescribir la decisión histórica de no procedencia. Las solicitudes del titular deben reducirse a metadatos al vencer su propio plazo. La evidencia de autorización tiene un vencimiento separado y verificable. Cada resultado debe poder demostrarse por tenant, con conteos y sin valores personales.

**Recomendación única (v1.1):** motor transaccional en `privacy`, consumido por un job que procesa la propia API (ADR-105) y por un CLI del mismo motor para operación y recuperación. No habilitar anonimización parcial de PQR: la alternativa A1 de ADR-104 sigue descartada; se espera el mayor plazo aplicable al titular.

Crear esta spec cierra la acción «abrir spec H-EXP». El bloqueo funcional H-EXP de G7 solo se cierra con implementación, revisión independiente, automatización y evidencia de los criterios de §9. La firma confirmada no aprueba automáticamente esta arquitectura ni los cambios de seguridad de §10.

## 2. Base real y huecos que se deben resolver

| Fuente de código                                                                                            | Comportamiento actual / reutilización                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/privacy/requests/requests.service.ts`, `conservationDuty` y `resolveSuppression`      | Ya calcula contrato abierto, reloj contractual, fiscal y PQR; la resolución exige confirmación humana, identidad y solicitud activa. Extraer la evaluación compartida; el job no debe llamar `resolve` simulando al operador |
| `privacy/requests/ports/contract-standing-read.port.ts`                                                     | CRM devuelve alcance y `lastTerminatedAt` bajo la transacción                                                                                                                                                                |
| `privacy/requests/ports/billing-standing-read.port.ts`                                                      | Billing devuelve el último documento fiscal; no consultar sus tablas desde `privacy`                                                                                                                                         |
| `privacy/requests/ports/pqr-retention-read.port.ts` y `assurance/privacy/pqr-retention-read.adapter.ts`     | Alcance PQR ya compartido. El `max` por ticket puede ocultar un recurso pendiente; corregirlo antes de habilitar H-EXP                                                                                                       |
| `privacy/ports/personal-data-erasure.port.ts` y `crm/privacy-adapters/crm-personal-data-erasure.adapter.ts` | `plan` y `anonymize` reutilizan participantes y comprobación de residuales; no duplicar SQL del barrido                                                                                                                      |
| `privacy/marks/marks.service.ts`                                                                            | Las marcas son eventos OPEN/CLOSE; la vigente se obtiene por `occurred_at DESC, id DESC`, no buscando cualquier OPEN histórico                                                                                               |
| `privacy/retention/retention.service.ts`                                                                    | Catálogo ampliable, nunca reducible. La 177 siembra PQR y solicitudes; no aplica su vencimiento                                                                                                                              |
| `privacy/alerts/privacy-due-alerts.processor.ts` | Consumidor en la API con programación repetible en `onApplicationBootstrap`: es el patrón que adopta H-EXP (ADR-105) |
| `packages/shared/src/contracts/queue-payloads.ts` | Superficie real para el contrato del payload. `apps/worker` no interviene en H-EXP |

## 3. Elegibilidad y relojes

### D-EXP-1. Fecha y plazo efectivo

Calcular `today` en `America/Bogota` desde el reloj del servidor; no confiar en la fecha del payload. Usar años calendario mediante `addCalendarMonths(fechaCivil, years * 12)`, con la misma regla de fin de mes que ya usa `@iwana/shared`. El vencimiento es inclusivo: `expiresOn <= today`. Convertir cada instante a fecha civil de Bogotá antes de sumar; no recortar directamente el ISO UTC con `slice(0,10)`. La extracción debe corregir esta diferencia en la evaluación compartida de API y CLI y conservar las pruebas de regresión de zona horaria.

| Categoría / impedimento                  | Inicio                                                                                 | Plazo efectivo y condición                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contrato abierto                         | Situación actual releída                                                               | Nunca elegible mientras exista; incluye todos los contratos del alcance, sin usar `updated_at` como reloj                                                    |
| Identificación / contrato del suscriptor | `lastTerminatedAt`, primera entrada terminal de cada contrato, máximo del titular      | Categoría contractual vigente del catálogo, mínimo ya aprobado de 5 años. Un contrato terminal sin reloj válido bloquea y genera incidencia de conciliación  |
| `FACTURACION_SOPORTES_CONTABLES`         | Último documento fiscal, por puerto Billing                                            | Catálogo, mínimo aprobado de 10 años; cubre motivo tributario, estrato, municipio y soportes asociados                                                       |
| `PQR_SOPORTES`                           | Notificación de la última respuesta definitiva; a falta de notificación, respuesta     | Catálogo, mínimo aprobado de 3 años. Toda PQR o recurso definitivo pendiente impide empezar el reloj                                                         |
| Prospecto descartado sin contrato        | Descarte verificable del expediente                                                    | 24 meses, según aprobación de ADR-094. Incorporar al puerto CRM fecha de descarte y ausencia de contrato; una fecha no conciliada no se inventa              |
| `SOLICITUDES_TITULAR`                    | Cierre terminal verificable de cada solicitud                                          | Catálogo, mínimo aprobado de 5 años. Conservar completa la solicitud mientras tanto, aun si el titular ya se anonimizó                                       |
| `AUTORIZACIONES_EVIDENCIA`               | Fin verificable de conservación de los datos del titular distintos de la propia prueba | Catálogo, 5 años adicionales. No contar la propia autorización como razón para conservarse a sí misma; esta interpretación operativa se confirma en G0 (§10) |

**Mayor plazo:** H-EXP de titular solo procede si no hay contrato abierto, todos los relojes aplicables han vencido y no hay impedimentos. Un dato necesario ausente, categoría faltante, puerto no disponible, alcance sin conciliar o esquema incompatible produce fallo cerrado y una tarea operativa; nunca se interpreta como plazo cero. Una categoría sin datos de esa clase no crea un reloj ficticio.

**Ampliaciones y litigios:** leer las políticas vigentes dentro de la transacción y bloquear sus filas antes de decidir. La ampliación que obtiene ese bloqueo primero se respeta; la que llega después de una anonimización confirmada no puede recuperar datos. Mientras no exista hold por caso aprobado, usar la ampliación del catálogo prevista por ADR-104 §5; no inventar un `legal_hold` ni considerar un recurso abierto como plazo vencido. La operación debe aplicar esa ampliación antes del vencimiento. Una solicitud activa relacionada bloquea la reducción de su propio paquete y exige revisión antes de borrar pruebas utilizadas por ella.

### D-EXP-2. Alcance y estado histórico

Los candidatos principales son titulares cuya marca vigente sea `DATOS_BLOQUEADOS`, ligada a una solicitud `SUPRIMIR`, con identidad ya verificada y decisión `NO_PROCEDENTE / DEBER_LEGAL_CONSERVACION`. No extender la autorización a proveedores, empleados ni categorías sin participante aprobado. Mantener los bloqueantes de cuenta activa, proveedor, titular sin conciliar y límite de 500 expedientes; producen tarea, no `--confirm-unmatched` automático.

Revalidar candidatos y alcance dentro de cada transacción. Usar la solicitud histórica solo como referencia de trazabilidad; conservar estado, fundamento, respuesta, fecha y actor originales. La ejecución se registra en el nuevo ledger H-EXP y cierra la marca mediante evento CLOSE después de verificar la anonimización. No fijar `data_subject_requests.erased_at` en una solicitud `NO_PROCEDENTE`: la migración 149 lo prohíbe y el dato mentiría sobre la resolución histórica. No reabrir ni fabricar una segunda solicitud.

La expiración de prospectos y la minimización de solicitudes son fases explícitas del mismo barrido; no dependen de que exista una marca ni una solicitud de supresión. El descarte debe estar demostrado y no haber contratos o deberes sobrevenidos. No incluir prospectos activos por antigüedad.

## 4. Minimización del paquete de solicitudes y evidencia

### D-EXP-3. Solicitudes

Para `RESUELTA` y `NO_PROCEDENTE`, usar `resolved_at`. Para `TRASLADADA` y `DESISTIDA`, usar el evento de entrada terminal correspondiente, porque el modelo actual no garantiza `resolved_at` en esos caminos; agregar un `closed_at` explícito con backfill determinista. Si no hay evento terminal verificable, crear tarea de conciliación y conservar el paquete hasta resolverla. Una tarea incompleta que documente deber de actuación bloquea su propia evidencia y genera incidencia.

Tras cinco años efectivos, conservar identificador/radicado, `kind`, `right`, finalidad codificada, estado final, fundamento codificado, fechas y canal de notificación cerrado. Limpiar a `NULL` nombre/documento/contacto cifrados, tipo y HMAC del solicitante, evidencia de identidad, texto de respuesta y notas libres de tareas; limpiar también textos libres de eventos históricos y referencias libres incorporadas al fundamento. No ejecutar un regex de «enmascarado» sobre párrafos. Conservar únicamente códigos de evento de una lista cerrada. Retirar vínculos personales no necesarios (`party_id`, arrays de contratos), sin modificar las marcas inmutables de anonimización ni sus referencias técnicas.

`transferred_to`: introducir `transfer_destination_kind` (`INSTITUTION`, `PERSON`, `UNCLASSIFIED`) y `transfer_destination_code` del catálogo de entidades. Mantener después del vencimiento únicamente el código institucional y su nombre público normalizado; el texto libre se anula. El escritor nuevo exige clasificación y no permite clasificar como institución un nombre libre. Para legado `UNCLASSIFIED`, generar tarea de clasificación con acceso `privacy.manage`, vencimiento operativo de 5 días hábiles y escalación diaria al responsable si se vence. Los 5 días son un SLA del producto, no un plazo legal. Se minimiza el resto del paquete; solo el destino ambiguo queda retenido y restringido hasta la decisión auditada. Una tarea vencida impide declarar el tenant conciliado y G7; nunca se convierte en exclusión permanente ni en resultado exitoso silencioso.

Agregar `minimized_at` y `retention_closed_at` para distinguir la minimización del paquete del `erased_at` de una supresión. Los lectores deben admitir esos campos y no intentar descifrar `NULL`. La respuesta del job solo contiene conteos y códigos; la consola autorizada conserva la trazabilidad de la tarea, sin datos personales en logs.

### D-EXP-4. Prueba de autorización y Media

La prueba de autorización sigue vigente durante los otros plazos y cinco años adicionales desde su final. Persistir ese ancla como resultado verificable del inventario de categorías y recalcularla conservadoramente si aparece otro deber antes de expirar. Los datos de solicitudes que siguen legalmente retenidos cuentan para ese inventario; la propia autorización y su ledger de minimización no lo reinician.

Existe un conflicto que esta spec no puede aprobar: ADR-094 D2 prohíbe UPDATE/DELETE de `data_authorizations`, mientras D7 exige vencimiento. Para construir esta fase se requiere enmienda aprobada que permita **solo** minimizar `ip`, `user_agent`, `source_ref`, la referencia a evidencia y cualquier otro identificador personal tras verificar el vencimiento. Conservar eventos codificados, orden temporal, texto legal/versionado y evidencia del acto de minimización. La cuenta de aplicación no recibe UPDATE/DELETE general ni capacidad de desactivar triggers. La excepción debe ser una función de privilegio mínimo con `search_path` fijo y registro transaccional, revisada por SEC-ENG; jamás un GUC público que cualquier transacción pueda fijar para eludir la inmutabilidad.

Media es dueño del borrado físico. Añadir comando tipado de vencimiento por referencia y propietario, con verificación de referencias compartidas: no borrar un activo aún utilizado por otra prueba vigente. Registrar en la misma transacción un intento pendiente; tras commit, Media elimina el objeto de forma idempotente y confirma el resultado. Hasta su confirmación, el activo queda inaccesible para lectura normal y el ciclo sigue `MEDIA_PENDING`; no reportar purga física completada por un simple `deleted_at`. Backups siguen su runbook y aprobación de rotación: no afirmar que se han reescrito.

## 5. Motor, transacción e idempotencia

Nuevo `privacy/retention/retention-expiry.service.ts`, con `previewTenant`, `runTenantBatch` y `verifyTenant`. Extraer `ConservationDutyService` desde `requests.service.ts`; API humana, CLI y job usan esa misma evaluación con `manager` explícito. La implementación no relaja los bloqueantes existentes ni crea un bypass genérico del adaptador.

Por candidato: abrir `runInTenantSchema`, fijar contexto validado, adquirir bloqueo transaccional del titular y las filas de políticas, releer la solicitud/marca y las fuentes de conservación por puertos. Mantener el orden de bloqueo de CRM `expediente_records → subscribers → contracts`; los escritores de PQR y documentos fiscales deben participar en el mismo protocolo para que una respuesta/recurso/documento nuevo no se inserte entre evaluación y anonimización. La prueba con dos conexiones es obligatoria. Una transacción selecciona el plan actual y lo pasa al adaptador, ejecuta los participantes, verifica residuales, registra ledger, agrega CLOSE y auditoría mediante `logWithin`. Cualquier fallo revierte la transacción completa.

Ledger nuevo `privacy_retention_expiry_runs`: `id`, tipo (`TITULAR`, `REQUEST`, `AUTHORIZATION`), referencia técnica al objetivo, referencia a solicitud origen si aplica, fecha de elegibilidad, versión de reglas, `started_at`, `completed_at`, estado y conteos; sin texto libre personal. Unicidad por tipo, objetivo y versión de reglas. El efecto de una versión ya completada es no-op; cambiar versión obliga a verificar antes de remediar. Persistir pendientes de Media/tareas en tablas propias, no solo en Redis. No usar un único estado DONE para un lote parcialmente fallido.

Lotes de hasta 100 objetivos, orden estable por `(eligible_on, id)` y cursor persistido; transacción por objetivo, sin una transacción que recorra todos los tenants. Exclusión mutua por tenant evita doble barrido, y la unicidad del ledger protege ante pérdida del lock Redis. Reintentar un fallo no bloquea la progresión de otros objetivos, pero permanece en el resumen pendiente. Después del último cursor, hacer barrido de pendientes y nueva selección desde el inicio para recoger ampliaciones/altas tardías. Límite de 500 expedientes por objetivo: escalar por vía asistida existente.

Las migraciones se numeran al implementar, con número libre del runner. Deben registrar esquema ledger, `closed_at`/clasificación de traslado/marcas de minimización e índices parciales por estado/fecha. `down` elimina estructura solo si no hay actos de minimización confirmados; en otro caso falla explícitamente. Nunca intentar «restaurar» datos eliminados ni sustituir estratos por `1`.

## 6. Ejecución: job procesado en la API (v1.1, opción B)

Decisión del CTO del 2026-11-07, formalizada en ADR-105. **Sustituye** el contrato worker → API de v1.0: no hay ruta interna, token de workload ni claves nuevas.

| Elemento | Contrato |
| --- | --- |
| Cola | `privacy-retention-expiry`, declarada en `privacy/retention/retention-expiry.constants.ts`, como `privacy-due-alerts.constants.ts` |
| Productor | La API, en `onApplicationBootstrap`, con un job repetible diario a las 04:00 `America/Bogota`, igual que `privacy-due-alerts`. Ese job encola uno por tenant ACTIVE y no borrado de `public.tenants` |
| Consumidor | `@Processor` en `apps/api/src/modules/privacy/retention/`, concurrencia 1, que llama a `RetentionExpiryService.runTenantBatch` en el mismo proceso |
| Payload | `PrivacyRetentionExpiryTenantJob`: `{ version: 1, tenantId: UUID, runId: UUID }`, Zod estricto en `packages/shared/src/contracts/`. Sin schema, slug, titular, HMAC, fecha ni secretos |
| Identidad del job | `privacy-retention-expiry-<tenantId>-<fechaBogota>`; complementa al ledger, no lo sustituye |
| Reintentos | 5 intentos con backoff exponencial desde 30 s para errores transitorios; payload o tenant inválido son terminales (`UnrecoverableError`) con alerta. Motivos saneados con `@SanitizeFailedReason` |
| Lotes | Hasta 100 objetivos por lote con cursor persistido; el consumidor reencola el siguiente lote mientras el resultado sea `CONTINUE` |

`RetentionExpiryBatchResult` (`CONTINUE`, `COMPLETE` o `ATTENTION_REQUIRED`, `nextCursor`, `counts`, `reasonCounts`) se conserva como tipo interno del servicio y del ledger, con los mismos campos de v1.0. Los códigos de motivo son una lista cerrada.

El consumidor resuelve `schema_name` desde `public.tenants` por ID, exige estado ACTIVE y fija `SET LOCAL search_path` en cada transacción. El job no elige titular ni solicitud: el servicio selecciona candidatos y vuelve a evaluar todos los deberes dentro de la transacción de cada uno. Así, quien pudiera escribir en Redis solo podría adelantar una corrida, nunca forzar una anonimización. Logs sin parámetros de consultas sensibles.

## 7. Operación y verificación

CLI nuevo `apps/api/src/cli/expire-retention.ts`, registrado como `privacy:expire-retention`: `--tenant <uuid|slug>` obligatorio, dry-run por defecto, `--apply` y `--verify-only` excluyentes. Resuelve tenant desde registro y usa el mismo motor. No acepta esquema, fecha arbitraria ni flag para ignorar deberes. La ejecución desatendida es el job de §6, en la API; el CLI no sustituye su prueba de programación y recuperación.

Conservar `anonymize-titular --verify-only` para las reglas ya implementadas. H-EXP añade verificación específica de solicitudes, autorizaciones, Media, tareas vencidas y candidatos vencidos sin procesar: el cero del CLI antiguo no prueba H-EXP. La salida por tenant distingue `scanned=0` de «se verificaron candidatos»: un entorno sin candidatos no demuestra el caso positivo.

Contadores: candidatos vencidos pendientes, fallo por código, antigüedad del más antiguo, tareas de clasificación vencidas, Media pendiente y última corrida completa. Alerta si falta una corrida diaria o hay fallo/pendiente vencido. Una ampliación vigente cuenta como retenido, no como fallo. No imprimir identificadores de personas, notas, destinos ni ciphertext. Referencias técnicas solo en auditoría/ledger bajo acceso autorizado. Retención de logs técnicos se rige por la política operativa aprobada, sin inventar un plazo legal.

## 8. Bloques de construcción y ownership

| Bloque                            | Dueño y archivos principales                                                                                                   | Salida / dependencia                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Motor y relojes                   | AI-SR-FULL: `privacy/retention/**`, extracción de `requests.service.ts`, puertos CRM/Billing/Assurance y sus adaptadores       | Una evaluación compartida y pruebas de carreras; corregir el recurso PQR pendiente           |
| Solicitudes, autorización y Media | AI-SR-FULL: entidades/servicios Privacy, comando de Media, migraciones tenant y runner                                         | Minimización acotada, ledger y reconciliación. Autorizaciones requieren enmienda D2 aprobada |
| Contrato del job | AI-SR-FULL: cola en `packages/shared`, payload Zod, `@Processor` en `privacy/retention/` y CLI | Fase 1. Sin ruta interna ni token de workload (ADR-105) |
| Programación y operación | AI-SR-FULL con AI-PLAT-OPS: programación en `onApplicationBootstrap`, alerta por corrida faltante y runbook | Fase 1. Sin cambios en `apps/worker` |
| **Fases** | **Fase 1 (cierra el bloqueo de G7):** motor y relojes, solicitudes, prospectos, ledger, CLI y job; CA-EXP-01 a 09 y 12 a 16. **Fase 2 (antes del primer vencimiento posible de una autorización, como mínimo 5 años después de que terminen los otros plazos):** autorizaciones (enmienda de ADR-094 D2) y borrado físico confirmado en Media; CA-EXP-10 y 11 | En producción ninguna retención vence antes de 24 meses desde la beta |
| Verificación independiente        | AI-SEC-ENG, `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer` si cambia una expectativa y `gate-verifier` | Evidencia G6, sin autofirma del productor; EM consolida, CTO decide G7                       |

Skills obligatorias por bloque en el plan del orquestador: backend `nestjs-expert`, `postgresql`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence`; migraciones además `database-migration` e `iwana-tenant-migration`; worker `bullmq-specialist`; infraestructura `docker-expert`; cierre `verification-before-completion`. `docs-architect` se aplica a los documentos. Sin UI nueva, frontend y diseño visual no intervienen.

## 9. Criterios de aceptación

| CA        | Evidencia necesaria                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CA-EXP-01 | Titular bloqueado con todos los relojes vencidos se anonimiza y agrega CLOSE sin alterar la resolución NO_PROCEDENTE ni escribir `erased_at` incompatible                                                    |
| CA-EXP-02 | Contrato abierto, fiscal de 9 años, PQR de 2 años o recurso pendiente conservan datos y marca; un recurso sin respuesta no queda oculto por otro FINAL_RESOLUTION respondido                                 |
| CA-EXP-03 | Límite exacto del aniversario, bisiesto, fin de mes y horas 18:59/19:00/23:59 Bogotá usan fecha civil correcta; reloj congelado en pruebas, sin depender de TZ del host                                      |
| CA-EXP-04 | Ampliar catálogo antes de adquirir su bloqueo impide borrar; categoría ausente/puerto caído/fecha inválida fallan cerrado con código saneado                                                                 |
| CA-EXP-05 | Dos tenants con referencias iguales quedan aislados. Un job con payload inválido, tenant inexistente, inactivo o borrado, o con campos de más (schema, slug, titular), termina sin tocar tablas tenant. Un job manipulado en Redis no puede elegir titular ni saltarse deberes |
| CA-EXP-06 | Dos conexiones forzadas: escritura CRM/PQR/fiscal anterior se conserva o incorpora al plan; posterior no reintroduce PII; repetir 20 veces sin deadlock ni anonimización prematura                           |
| CA-EXP-07 | Duplicar/reintentar el job o perder respuesta después de commit no repite actos, auditoría ni CLOSE. Error de participante, residuales o auditoría revierte todo el candidato                                |
| CA-EXP-08 | Solicitud antes de cinco años queda íntegra; después se minimizan todos los campos y tareas/eventos, conservando metadatos; TRASLADADA/DESISTIDA usan cierre verificable                                     |
| CA-EXP-09 | Traslado institucional conserva solo catálogo público. Legado ambiguo crea tarea, permite minimizar lo demás y bloquea conciliación/G7 si vence su SLA; no se marca completado silenciosamente               |
| CA-EXP-10 | **Fase 2.** Prueba de autorización no vence mientras hay otro dato con retención. A los cinco años adicionales, excepción D2 autorizada minimiza solo campos permitidos; aplicación normal sigue sin poder mutar eventos |
| CA-EXP-11 | **Fase 2.** Media compartida por prueba vigente no se borra. Fallo de almacenamiento queda pendiente durable, inaccesible y recuperable; la confirmación física se verifica separadamente                                |
| CA-EXP-12 | Prospecto descartado de 23 meses se conserva; 24 meses elegible sin otro deber se anonimiza; prospecto activo o descarte no conciliado nunca se toma por vencido                                             |
| CA-EXP-13 | Lotes de más de 100, cursor manipulado, reanudación y cambio de política no saltan candidatos; fallo de uno no oculta pendientes ni bloquea todo el tenant                                                   |
| CA-EXP-14 | El job de la API ejecuta barrido diario y recuperación tras reinicio; CLI y job sobre fixture equivalente producen mismos efectos; dry-run/verify no escriben dominio                                                  |
| CA-EXP-15 | Canarios sintéticos Postgres prueban positivo y negativo; verificador H-EXP detecta una solicitud vencida no minimizada y Media pendiente aunque `anonymize-titular --verify-only` dé cero                   |
| CA-EXP-16 | Conteos de suites/tests no bajan ni skipped sube sin motivo frente a línea base de ola; cobertura core ≥80 %, lint/typecheck, pruebas de migraciones reales y revisiones independientes en verde             |

No ejecutar pruebas destructivas sobre el tenant de desarrollo habitual: usar bases/esquemas de integración sintéticos, con rollback o limpieza controlada. El informe debe separar simulación, prueba integrada y operación del tenant real de desarrollo.

## 10. Decisiones, gates e impacto

**G0 de esta spec (v1.1): puntos 1 a 4 aprobados por el CTO el 2026-11-07; el 5 queda para la Fase 2.**

1. Ejecución en la API (opción B), con ADR-105. **Aprobado el 2026-11-07, con ADR-105.**
2. Las dos fases de §8, y que G7 exija solo la Fase 1.
3. Expiración de prospectos a los 24 meses dentro de H-EXP, con el plazo ya aprobado en ADR-094.
4. Ancla finita de la prueba de autorización: no cuenta como motivo para conservarse a sí misma.
5. Para la Fase 2, más adelante: la enmienda restringida de ADR-094 D2 antes de tocar su trigger.

Ninguna de estas decisiones se atribuye a la firma del abogado.

**G6 de la Fase 1:** CA-EXP-01 a 09 y 12 a 16 demostrados, incluidos positivos reales y fallos, review de seguridad/boundaries/contratos y gates del repositorio. **G6.5:** commit/CI correspondiente, separado de esta definición. **G7 H-EXP:** job habilitado, primera corrida y recuperación demostradas, pendientes vencidos en cero por tenant, controles de exposición/secretos y verificación de borrado de Media. Las dependencias generales de beta, dictámenes y backfills de Privacy continúan según el HLD.

Impacto multi-tenant: registro aprobado como única fuente de schema y transacciones independientes. Seguridad: nuevo trust boundary worker→API, excepción de inmutabilidad restringida y evidencia irreversible; requieren revisión independiente. Escala: selección paginada indexada, concurrencia limitada y transacción por candidato. Regulación: aplica las decisiones de ADR-094/104; no aprueba obligaciones nuevas. Riesgo operativo: los datos anonimizados no se recuperan con rollback de migración; detener `apply` conserva la capacidad de verificar y reintentar.
