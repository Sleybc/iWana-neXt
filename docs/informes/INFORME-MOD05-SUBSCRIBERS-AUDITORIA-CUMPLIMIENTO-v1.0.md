# INFORME — MOD05/MOD08 · Auditoría técnica, arquitectónica y de cumplimiento del Suscriptor

**Versión:** 1.0 (con correcciones del 2026-10-12, ver §11)
**Estado:** Emitido — pendiente de decisión del CTO en §7 (tres escalaciones)
**Fecha:** 2026-10-11
**Modo:** Architect + Product Architect (combinado: cruza arquitectura, regulación y alcance)
**Emisor:** AI-EM-ARCH
**Plan de remediación:** [2026-10-11-mod05-subscribers-remediacion-cumplimiento.md](../plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md)
**Prompt de ejecución:** [PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.0.md](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.0.md)
**Launcher Ola 1:** [PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.0.md](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-LAUNCH-v1.0.md)

## 0. Alcance, método y límites

**Alcance por ruta** (no por nombre de módulo — ver lección MOD04):

| Superficie | Ruta | Cubierta |
| --- | --- | --- |
| Suscriptor (backend) | `apps/api/src/modules/crm/subscribers/**` | Sí |
| Habeas Data | `apps/api/src/modules/crm/habeas-data/**` | Sí |
| Emisión de eventos de conversión | `apps/api/src/modules/crm/expedientes/expediente.service.ts` (transición, reactivación, emisión) | Parcial — solo lo que toca la conversión |
| Parties (MOD08) | `apps/api/src/modules/parties/**` | Sí |
| Contrato compartido | `packages/shared/src/schemas/subscriber.schema.ts`, enums fiscales | Sí |
| DDL | `packages/database/src/migrations/tenant/{012,014,015,016,024,108,109}` | Sí |
| Portal | `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx`, `lib/api-client.ts` (búsqueda) | Solo consumo de PII; **la UI no se audita en este turno** |
| Expedientes (resto) | `crm/expedientes/**` fuera de la conversión | **No** — hallazgos adyacentes se registran como deuda (§4.5) |

**Método:** lectura estática del código en `main@7d35e604` y de los ADR citados, abiertos uno por uno. **No se ejecutaron pruebas** (perfil AI-EM-ARCH: la evidencia por ejecución es de AI-SR-QA). Toda afirmación lleva `archivo:línea`.

**Correcciones a la base normativa del encargo** (checklist §10.9 del perfil):

1. **ADR-062 no trata de suscriptores.** Su título es *"Extensión `pg_trgm` para búsqueda de usuarios (MOD04)"*. La extensión está habilitada (`public/018_enable_pg_trgm.ts`), pero el único índice trigram es de `users` (`tenant/084`). `subscribers` no tiene ninguno → hallazgo SUB-M08.
2. **El Art. 468-3 del Estatuto Tributario no es el artículo del IVA en internet** según el conocimiento de este perfil: el tratamiento de conexión y acceso a internet residencial aparece en el régimen de bienes y servicios **excluidos** (Art. 476 ET, modificado por la Ley 1819 de 2016). **Requiere verificación con fuente oficial** — ver SUB-C03 y escalación E-1.
3. **"ARCO" no es la terminología de la Ley 1581.** La ley colombiana regula *consultas* (Art. 14) y *reclamos* (Art. 15) para conocer, actualizar, rectificar, suprimir y revocar la autorización. Los plazos que este perfil conoce —consultas 10 días hábiles prorrogables 5; reclamos 15 días hábiles prorrogables 8— **requieren verificación con fuente oficial** antes de codificarse.
4. ADR-082 está en estado **Propuesto**; se cita como `(propuesto)`.

## 1. Resumen ejecutivo

| Severidad | Cantidad | Bloquea |
| --- | --- | --- |
| **Crítico** | 3 | G6 del módulo y, por tanto, G6.5 y G7 |
| **Alto** | 8 | G7 (salida a producción) |
| **Medio** | 11 | No bloquea; requiere plan de pago con dueño |
| **Bajo** | 5 | No bloquea |

**Veredicto: NO-GO para producción.** La separación fiscal/comercial de ADR-025 está **bien implementada** (entidad, DDL, schema discriminado y motor IVA ortogonal al segmento), Taxation se consume **por puertos** y no hay lecturas de tablas ajenas. Los defectos están en tres ejes:

1. **Identidad (MOD08):** el `Party` **no deduplica** — su documento se guarda como ciphertext de IV aleatorio desde CRM y en **texto plano** desde la API de Parties. El modelo multi-rol de ADR-030 no funciona y hay cédulas en claro.
2. **Fiscal:** la regla IVA de ADR-025 (estratos 1-2 *exento*, 3 *excluido*) **no está verificada** contra el Estatuto Tributario, ignora la condición de *uso residencial* y ancla el estrato a la **persona** en lugar del **punto de servicio**.
3. **Habeas Data:** PII en query string (prohibido por ADR-067 §8), consultas/reclamos sin plazo ni auditoría, consentimiento sin integridad probatoria y sin vínculo con el alta del suscriptor.

**Impacto declarado (perfil §9):**

- **Multi-tenant:** sin fuga entre tenants. Todo acceso pasa por `runInTenantSchema`.
- **Seguridad:** dos fronteras rotas — PII en URL (SUB-C02) y PII en claro en `party` y `audit_logs` (SUB-C01, SUB-A08).
- **Escala:** el dedupe roto multiplica `party` linealmente con las conversiones; la búsqueda `ILIKE '%…%'` sin trigram hace barrido secuencial (SUB-M08).
- **Regulación:** Ley 1581 (SUB-A06, A07, A08) y Estatuto Tributario (SUB-C03, M03, M04) — todo marcado *requiere verificación con fuente oficial*.

## 2. Matriz de cumplimiento de ADR

| ADR | Estado ADR | Exigencia verificada | Evidencia | Veredicto |
| --- | --- | --- | --- | --- |
| **ADR-025** | Aprobado | `personType` y `customerSegment` como dimensiones separadas | `subscriber.entity.ts:56-61`; DDL `012` enums separados; `subscriber.schema.ts` unión discriminada por `personType` | ✅ Cumple |
| ADR-025 | | IVA depende solo de `personType + stratum` | `vat-treatment.service.ts:23-49` (`_segment` ignorado) | ✅ Cumple lo escrito |
| ADR-025 | | La regla escrita es fiscalmente correcta | Tabla del ADR §Decisión; ver SUB-C03 | ⚠️ **No verificable — escala E-1** |
| ADR-025 | | Validación cruzada NATURAL⇢estrato / JURIDICA⇢NIT | DDL `012` `chk_subscriber_person_fields`; `vat-treatment.service.ts:62-95` | ✅ Cumple (sin DV ni rep. legal: SUB-M04) |
| **ADR-026** | Aprobado | Conversión anclada a `LISTO_PARA_INSTALACION` / `CLIENTE_ACTIVO` / `DESCARTADO` | `expediente.service.ts:1101-1131` | ✅ Cumple |
| ADR-026 | | Reactivación coherente con el suscriptor | `expediente.service.ts:1140` no emite; `subscriber-status-transition.service.ts:25` CANCELLED terminal | ❌ SUB-A02 |
| **ADR-027** | Aprobado | Eventos intra-CRM vía `EventEmitter2`, sin BullMQ | `subscriber-creation.service.ts:63`; listeners `activation`/`cancellation` | ✅ Cumple |
| ADR-027 | | Idempotencia por `expedienteId` | `subscriber-creation.service.ts:79` (check-then-insert); `015` índice **no único** | ⚠️ Lógica sí, garantía de BD no — SUB-A03 |
| ADR-027 | | "El fallo se registra para reintento operativo" | `expediente.service.ts:2862-2877`: solo `logger.warn` | ❌ SUB-A01 |
| ADR-027 | | Trazabilidad `expediente_id`, `converted_at`, `activated_at`, `manual_override_reason` | Migración `015`; `subscribers.service.ts:725-757` | ✅ Cumple |
| **ADR-029** | Aprobado | Catálogo de impuestos consumido por puerto | `subscriber-tax-profile.service.ts:18-21` (`TaxCatalogReadPort`, `ITaxApplicationReadPort`) | ✅ Cumple |
| **ADR-031** | Aprobado | Reglas por segmento/persona/estrato sin contaminar el IVA canónico | `subscriber-tax-profile.service.ts` `_suggestResolvedApplications`: omite la definición IVA | ✅ Cumple, frágil: solo reconoce códigos `IVA_19`/`IVA` (SUB-M05) |
| **ADR-032** | Aprobado | Flag `TAXATION_USE_CATALOG` retirado | Sin ocurrencias en `apps/**/src` ni `packages/**/src` (solo en `dist/`, artefacto de build) | ✅ Cumple |
| **ADR-030** | Aprobado | `Party` deduplicado por documento | `party.entity.ts:22-25` índice único sobre `document_number`; CRM inserta ciphertext de IV aleatorio | ❌ **SUB-C01** |
| ADR-030 | | Consumidores aseguran identidad vía `IPartyWritePort` (ADR-030 l.97, ADR-052) | `subscriber-creation.service.ts` importa `PartyService` y `PartyRoleService` concretos | ❌ SUB-A04 |
| ADR-030 | | Todo Subscriber tiene Party | Solo en conversión; alta manual `subscribers.service.ts:245` deja `partyId = null` | ❌ SUB-A04 |
| ADR-030 | | `PartyContact` como fuente de contacto | CRM no escribe `party_contact`; el contacto vive solo en `subscribers` | ⚠️ Doble fuente — SUB-M01 |
| **ADR-058** | Aprobado | AES-256-GCM + doble clave activa/previa | `aes-gcm.util.ts:97-121` | ✅ Cumple |
| ADR-058 | | Fase 2: `PII_ENCRYPTION_KEY` separada de MFA | `aes-gcm.util.ts:101` lee solo `MFA_ENCRYPTION_KEY`; cero usos de `PII_ENCRYPTION_KEY` | ❌ SUB-M02 |
| ADR-058 | | Documento, correo y teléfono cifrados en reposo en CRM **y parties** | `subscribers` ✅; `party.document_number` en claro vía API; `party_contact.value` en claro; `whatsapp` en claro | ❌ SUB-C01, SUB-M01 |
| **ADR-062** | Aprobado | — | Alcance: usuarios MOD04. No aplica a suscriptores | N/A — SUB-M08 |
| **ADR-067** | Aprobado | §1 proyección autorizada | `subscribers.controller.ts:340-386` | ✅ |
| ADR-067 | | §2 "un campo sin finalidad declarada no se expone" | Listado expone `birthDate`, `legalRepresentativeId`, `manualOverrideReason`, `externalId`, `createdBy` sin finalidad | ❌ SUB-A05 |
| ADR-067 | | §5 registro de acceso masivo | `subscribers.controller.ts:144` — implementado, pero `void` (fire-and-forget) | ⚠️ SUB-M06 |
| ADR-067 | | §6 cota `limit ≤ 100` | `subscribers.service.ts:291` `clampLimit` | ✅ |
| ADR-067 | | §8 PII nunca en URL ni query string | `GET /crm/subscribers/search?documentNumber&email&phone` | ❌ **SUB-C02** |
| ADR-067 | | §9 mapa campo × rol antes de ampliar | Roles de lectura pasaron de 5 a 7 (`TECHNICIAN`, `AUDITOR`, commit `d5db6239`) sin mapa | ❌ SUB-A05 |

## 3. Auditoría tributaria y fiscal

### 3.1 Motor IVA implementado

`vat-treatment.service.ts:23-49` implementa literalmente ADR-025:

| personType | stratum | Resultado | Comentario en código |
| --- | --- | --- | --- |
| NATURAL | 1-2 | `EXEMPT` | "gravado tarifa 0%, se declara" |
| NATURAL | 3 | `EXCLUDED` | "fuera del régimen, no se declara" |
| NATURAL | 4-6 | `STANDARD` 19 % | |
| JURIDICA | cualquiera | `STANDARD` 19 % | incluye GOVERNMENT |

### 3.2 Divergencias frente al Estatuto Tributario (todas *requieren verificación con fuente oficial*)

| # | Divergencia | Por qué importa | Severidad |
| --- | --- | --- | --- |
| F-1 | **Exento vs excluido para estratos 1-2.** El entendimiento de este perfil es que el servicio de conexión y acceso a internet de usuarios residenciales de estratos 1, 2 y 3 es **excluido** (Art. 476 ET tras Ley 1819/2016), no exento. | *Exento* (tarifa 0 con derecho a devolución) y *excluido* (no causa IVA) se reportan distinto en factura electrónica y en la declaración de IVA. El valor persistido en `subscribers.vat_treatment` es el contrato hacia Billing. | Crítico (SUB-C03) |
| F-2 | **Condición "usuarios residenciales" ignorada.** La exclusión se predica del uso residencial. ADR-025 declara que `customerSegment` no afecta el IVA, así que `NATURAL + SOHO + estrato 2` sale exento/excluido aunque el servicio sea comercial. | Riesgo de no facturar IVA debido. | Crítico (SUB-C03) |
| F-3 | **El estrato es del inmueble, no de la persona.** `stratum` vive en `subscribers` (`subscriber.entity.ts:85`); `contracts` tiene dirección de instalación pero **no estrato** (`contract.entity.ts:45-58`). | Un suscriptor con dos servicios en predios de estratos distintos recibe un único tratamiento. | Crítico (SUB-C03) |
| F-4 | **`TaxRegime` SIMPLIFIED/COMMON es terminología derogada** (régimen simplificado suprimido por Ley 1943/2018 y Ley 2010/2019; hoy "responsable / no responsable de IVA" y Régimen Simple). Además se deriva solo de `personType` (`vat-treatment.service.ts:54-56`): una persona natural puede ser responsable de IVA. | El campo es engañoso para Billing y para el adquirente en factura electrónica. | Medio (SUB-M03) |
| F-5 | **Responsabilidades fiscales del RUT no modeladas** (gran contribuyente, autorretenedor, agente de retención, Régimen Simple). | La factura electrónica DIAN las exige del adquirente; ADR-029 ya las anticipa para terceros. | Medio (SUB-M03) |

### 3.3 Campos obligatorios por tipo de persona

| Campo | Exigido hoy | Dónde | Brecha |
| --- | --- | --- | --- |
| NATURAL: tipo y número de documento | Sí | schema Zod, DDL CHECK, `validateRequiredFields` | Sin validación de formato por tipo (CC numérica, etc.); sin normalización antes del HMAC (SUB-M09) |
| NATURAL: nombres, apellidos | Sí | ídem | — |
| NATURAL: estrato 1-6 | Sí | ídem + CHECK de rango | Anclado a la persona (F-3) |
| JURIDICA: NIT | Sí | ídem | Formato libre `min 5 max 20`; acepta letras |
| JURIDICA: **DV** | **No** | `subscriber.schema.ts` `nitVerificationDigit: optional` | Ni obligatorio ni validado con el algoritmo módulo 11 de la DIAN; la conversión **no lo propaga** (`subscriber-creation.service.ts:96-115` no pasa DV) — SUB-M04 |
| JURIDICA: razón social | Sí | ídem | — |
| JURIDICA: **representante legal** | **No** | `legalRepresentativeId: optional`; sin FK | SUB-M04 / SUB-B02 |

### 3.4 Doble fuente de verdad del IVA

`subscribers.vat_treatment` (recalculado en `update`) y `subscriber_tax_assignment` (sugerido una vez; si está `CONFIRMED`, `_suggestVatInSchema` no lo toca). Un cambio de estrato deja ambos divergentes sin alerta → SUB-M05.

## 4. Seguridad, PII y Habeas Data

### 4.1 Cifrado en reposo

| Dato | Tabla.columna | Estado | Hallazgo |
| --- | --- | --- | --- |
| Documento | `subscribers.document_number_encrypted` + `_hmac` | ✅ AES-256-GCM + HMAC | HMAC sin normalizar (SUB-M09) |
| Correo | `subscribers.email_encrypted` + `email_hmac` | ✅ | — |
| Teléfono | `subscribers.phone_encrypted` + `phone_hmac` | ✅ | Placeholder `0000000000` compartido (SUB-M07) |
| Teléfono alterno | `subscribers.alt_contact_phone_encrypted` | ✅ | Sin HMAC (no buscable; aceptable) |
| **WhatsApp** | `subscribers.whatsapp` `varchar(50)` | ❌ **en claro** | SUB-M01 |
| **Fecha de nacimiento** | `subscribers.birth_date` | ❌ en claro | SUB-M01 |
| Nombres | `first_name`, `last_name` | En claro por diseño (búsqueda) | Aceptable con ADR; declararlo |
| **Documento del Party** | `party.document_number` | ❌ **mixto**: ciphertext desde CRM, **texto plano** desde `POST /parties` (`party.service.ts:52-74`) | **SUB-C01** |
| **Contacto del Party** | `party_contact.value` | ❌ en claro (`party-contact.service.ts:34,47`); HLD-MOD08 l.109 pide cifrado | SUB-M01 |
| Clave | `MFA_ENCRYPTION_KEY` para MFA **y** PII | ❌ fase 2 de ADR-058 pendiente | SUB-M02 |

### 4.2 Proyección y trazabilidad (ADR-067)

- **Query string con PII** (`subscribers.controller.ts:188-214`; consumido en `apps/portal/src/lib/api-client.ts:6471`): documento, correo y teléfono viajan en la URL y quedan en logs de acceso de Nginx, historial del navegador y proxies. ADR-067 §8 lo prohíbe sin excepción → **SUB-C02**.
- `?search=` del listado lleva nombres y NIT en query string: mismo defecto, menor sensibilidad → se corrige en el mismo bloque.
- **La UI del listado solo consume `email || phone`** (`SubscribersListClient.tsx:516`). El backend sirve además documento, coordenadas, `birthDate`, `altContactPhone`, `whatsapp`, `legalRepresentativeId` y `manualOverrideReason` en **cada fila**. La premisa de ADR-067 (identificación por documento desde el listado) no está materializada en la pantalla; los campos sin finalidad de §2 sobran sin discusión → SUB-A05.
- **Roles:** ADR-067 §9 registró 5 roles con la proyección completa y dejó pendiente el mapa campo × rol. ADR-083 (Aprobado) añadió `TECHNICIAN` y `AUDITOR` con la finalidad *"ver datos de contacto y dirección para instalación"*; hoy esos roles leen **todos** los suscriptores del tenant con documento completo. La ampliación de ADR-083 es legítima; lo que falta es la proyección acotada → SUB-A05.
- **Registro de acceso:** el listado registra `LIST_ACCESS` pero con `void` (`controller:144`); `GET :id` y `GET :id/360` —que exponen la ficha completa— no registran acceso → SUB-M06.
- **audit_logs con PII:** el diff de `update` guarda `address`, `altContactName` y `nit` en claro (`subscribers.service.ts:491-500`), contradiciendo el propio comentario "sin PII". Un registro de auditoría inmutable con PII no puede atender una supresión → SUB-A08.

### 4.3 Consentimiento (autorización previa)

| Control esperado | Estado | Evidencia |
| --- | --- | --- |
| Alta del suscriptor condicionada a autorización vigente | ❌ | `createFromExpediente` y `POST /crm/subscribers` no consultan consentimiento ni `dataConsentRevoked` |
| Evidencia inmutable (append-only) | ❌ | `habeas_data_consents` tiene `updated_at` y `deleted_at` (soft-delete) |
| IP tomada del request, no del cliente | ❌ | `create-habeas-data-consent.dto.ts:20-24` acepta `ipAddress` del body |
| Versión del texto legal verificable | ❌ | `legalTextVersion` libre con default `'v1.0'`, sin hash del texto |
| Finalidades por consentimiento | ❌ | Sin campo de finalidades |
| Revocatoria | ❌ en `habeas_data_consents`; ✅ en `consent_records` del expediente (`revoked_at`, `revoked_by`) | Dos modelos — SUB-B03 |
| Traslado expediente → suscriptor | ❌ | La conversión no copia ni referencia `consent_records` |

### 4.4 Consultas y reclamos ("ARCO")

| Control esperado | Estado | Evidencia |
| --- | --- | --- |
| Fecha de radicación y **vencimiento en días hábiles** | ❌ | `arco_requests` sin `due_at`; sin calendario de festivos |
| Prórroga con motivo | ❌ | — |
| Máquina de estados validada | ❌ | `UpdateArcoRequestStatusDto.status` es `@IsString() @MaxLength(20)`: acepta cualquier cadena |
| Actor, respuesta y evidencia de respuesta | ❌ | Sin `resolved_by`, sin texto de respuesta |
| Auditoría | ❌ | `habeas-data.service.ts` no llama `AuditService` |
| Ejecución de la supresión | ❌ | Sin ruta de anonimización ni borrado criptográfico; `DELETE` del suscriptor es soft-delete |
| Tipos alineados a Ley 1581 | ⚠️ | Falta *revocatoria de autorización*; `PORTABILITY` no es un derecho de la Ley 1581 (verificar) |
| Permiso propio | ⚠️ | Usa `CRM_EXPEDIENTES_MANAGE/READ` |
| Alerta de vencimiento | ❌ | Sin job ni tablero |

### 4.5 Deuda adyacente registrada (fuera de turno — no se remedia aquí)

- `expediente_records.email_secondary` en claro (`subscriber-creation.service.ts:354` lo lee sin descifrar). Dueño: siguiente turno de expedientes.

## 5. Hallazgos clasificados

### 5.1 Críticos — bloquean G6 (y por arrastre G6.5/G7)

| ID | Hallazgo | Evidencia | Remediación | Dueño |
| --- | --- | --- | --- | --- |
| **SUB-C01** | `Party` no deduplica y guarda documento en claro por la API | `subscriber-creation.service.ts:192` guarda `documentNumberEncrypted` (IV aleatorio, `aes-gcm.util.ts:116`) o `NODATA-<id>`; `party.entity.ts:22-25` único sobre ese valor; `party.service.ts:52-74` guarda lo recibido; `party-read.adapter.ts:47` compara por igualdad | Columna `document_number_hmac` normalizada + documento cifrado; único sobre el HMAC; backfill que distinga los dos formatos y emita candidatos a fusión (`merged_into_party_id` ya existe) | data-eng (DDL+backfill) → sr-backend (servicios) |
| **SUB-C02** | PII en query string | `subscribers.controller.ts:188-214`; `api-client.ts:6471` | `POST /crm/subscribers/search` con cuerpo; `?search=` del listado pasa a `POST .../query` o se limita a filtros no personales; retirar el `GET` | sr-backend + fe-platform |
| **SUB-C03** | Regla IVA no verificada, sin condición residencial y estrato en el sujeto equivocado | §3.2 F-1..F-3 | Verificación tributaria → ADR sucesor de ADR-025 → estrato y uso por punto de servicio | CTO (E-1) → EM-ARCH (ADR) → sr-backend/data-eng |

### 5.2 Altos — bloquean G7

| ID | Hallazgo | Evidencia | Dueño |
| --- | --- | --- | --- |
| SUB-A01 | Fallo de conversión solo se loguea; ADR-027 exige registro para reintento | `expediente.service.ts:2862-2877` | sr-backend |
| SUB-A02 | Reactivar un expediente descartado deja su suscriptor `CANCELLED` (terminal); al llegar a `CLIENTE_ACTIVO`, `activateFromExpediente` devuelve `null` en silencio | `expediente.service.ts:1140`; `subscriber-status-transition.service.ts:25`; `subscribers.service.ts:725-740` | sr-backend |
| SUB-A03 | Idempotencia sin garantía de BD | `subscriber-creation.service.ts:79`; `015` índice no único | data-eng + sr-backend |
| SUB-A04 | CRM usa `PartyService`/`PartyRoleService` concretos (no `IPartyWritePort`); alta manual sin Party; Party creado fuera de la transacción del suscriptor | `subscriber-creation.service.ts:22-25,200`; `subscribers.service.ts:245`; ADR-030 l.97 | sr-backend |
| SUB-A05 | Proyección del listado excede ADR-067 §2 y se amplió a 7 roles sin el mapa de §9 | `subscribers.controller.ts:101-111,340-386`; `SubscribersListClient.tsx:516` | prod-ux (mapa) → sr-backend (proyección) |
| SUB-A06 | Consultas/reclamos sin plazo, sin estado validado, sin auditoría, sin supresión ejecutable; consentimiento sin integridad probatoria | §4.3-4.4 | CTO (E-2) → sr-backend + data-eng |
| SUB-A07 | Alta de suscriptor sin verificar autorización de tratamiento | `subscriber-creation.service.ts:70-160`; `subscribers.controller.ts:75-94` | CTO (E-2) → sr-backend |
| SUB-A08 | PII en claro en `audit_logs` | `subscribers.service.ts:491-500` | sr-backend |

### 5.3 Medios

| ID | Hallazgo | Evidencia |
| --- | --- | --- |
| SUB-M01 | `whatsapp`, `birth_date`, `party_contact.value` en claro; contacto duplicado entre `subscribers` y `party_contact` | `012`; `party-contact.service.ts:34,47` |
| SUB-M02 | ADR-058 fase 2 sin implementar | `aes-gcm.util.ts:101` |
| SUB-M03 | `TaxRegime` derogado y responsabilidades RUT ausentes | `tax-regime.enum`; `vat-treatment.service.ts:54-56` |
| SUB-M04 | DV del NIT opcional/no validado/no propagado; rep. legal opcional | `subscriber.schema.ts`; `subscriber-creation.service.ts:96-115` |
| SUB-M05 | Doble fuente IVA; exclusión del IVA canónico atada a dos códigos | `subscriber-tax-profile.service.ts` `_suggestVatInSchema` |
| SUB-M06 | `GET :id` y `/360` sin registro de acceso; `LIST_ACCESS` fire-and-forget | `subscribers.controller.ts:144,221-234,320-333` |
| SUB-M07 | Placeholders persistidos (`@placeholder.iwana.co`, `0000000000`) | `subscriber-creation.service.ts:360,389` |
| SUB-M08 | `ILIKE '%…%'` sin índice trigram; comodines sin escapar | `subscribers.service.ts:312` |
| SUB-M09 | HMAC de documento sin normalizar | `subscribers.service.ts:193`; `hash-document.util.ts:8` |
| SUB-M10 | `crm.subscriber.*` por `EventEmitter2` anunciados para Billing/Provisioning: un consumidor cross-module violaría la regla de comunicación inter-módulo | `subscriber-creation.service.ts:143` (comentario) — preventivo |
| SUB-M11 | Criterios de aceptación de ADR-067 abiertos (finalidad en el módulo, `.github/instructions`) | ADR-067 §Criterio |

### 5.4 Bajos

| ID | Hallazgo | Evidencia |
| --- | --- | --- |
| SUB-B01 | Índices sobre columnas cifradas (inútiles con IV aleatorio) | `012` `idx_subscribers_tenant_doc`, `_email` |
| SUB-B02 | Sin FK intra-CRM para `legal_representative_id` y `expediente_id` | `012`, `015` |
| SUB-B03 | Dos modelos de consentimiento (`consent_records` y `habeas_data_consents`) | entidades respectivas |
| SUB-B04 | Entidad declara `varchar` donde el DDL usa tipos `enum` (`person_type`, `customer_segment`, `status`…) | `subscriber.entity.ts:52-61` vs `012` |
| SUB-B05 | Placeholder de correo usa un dominio real de la organización | `subscriber-creation.service.ts:360` |

### 5.5 Acoplamientos con otros módulos

| Relación | Estado |
| --- | --- |
| Billing | **No existe módulo**; sin acoplamiento. El contrato que consumirá (`vat_treatment`, `tax_regime`) es justo el que SUB-C03/M03 cuestionan: definirlo **antes** de que Billing arranque |
| Provisioning / WFM | Sin lecturas directas; `get360View` usa referencias del expediente; Fase 04 congela puertos (C-1..C-8) |
| Taxation (MOD07) | ✅ por puertos |
| Parties (MOD08) | ❌ servicios concretos en lugar de `IPartyWritePort` (SUB-A04) |
| Lecturas de `subscribers` desde fuera de CRM | ✅ ninguna (`grep` en `apps/**`) |

## 6. Plan de acción y propuestas de corrección

> Las piezas de esta sección son **especificación** para los agentes ejecutores, no código productivo. El DDL concreto lo escribe `data-eng` como migración versionada y reversible; el TypeScript, `sr-backend`.

### 6.1 Identidad deduplicable en MOD08 (SUB-C01, SUB-M01, SUB-M09)

```sql
-- Migración tenant (data-eng). Contrato congelado: nombres y semántica de columnas.
ALTER TABLE party ADD COLUMN document_number_hmac varchar(64);
ALTER TABLE party_contact
  ADD COLUMN value_encrypted varchar(500),
  ADD COLUMN value_hmac varchar(64);

-- Backfill por tenant, idempotente, con dry-run:
--   1) si document_number ~ '^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$' → descifrar (activa/previa)
--   2) si empieza por 'NODATA-' → dejar NULL el HMAC y reportar
--   3) en otro caso → tratar como texto plano y CIFRAR
--   4) document_number_hmac = HMAC(PII_HASH_KEY, normalize(documento))
--   5) emitir reporte de grupos con el mismo (document_type, hmac) → candidatos a fusión
DROP INDEX IF EXISTS idx_party_document_active;
CREATE UNIQUE INDEX uq_party_document_hmac_active
  ON party (document_type, document_number_hmac)
  WHERE deleted_at IS NULL AND status <> 'MERGED' AND document_number_hmac IS NOT NULL;
```

```ts
// packages/shared — contrato de normalización (uno solo para CRM y Parties).
export function normalizeDocumentNumber(type: DocumentTypeParty, raw: string): string;
// CC/CE/NIT/TI: solo dígitos. PASAPORTE/PEP/PTP: alfanumérico en mayúsculas sin espacios.

// IPartyWritePort.ensurePartyWithRole(input, role, ctx: { manager, actorUserId }) — YA EXISTE
// (parties/ports/party-write.port.ts:72, ADR-052 §D2) y ya acepta el EntityManager transaccional.
// Cambio de contrato: EnsurePartyInput.documentNumber pasa a ser SIEMPRE texto plano;
// el adaptador normaliza, cifra y calcula el HMAC. Ningún consumidor envía ciphertext.
// CRM deja de importar PartyService/PartyRoleService y usa solo este puerto.
```

Nota: `party-write.adapter.ts:35,44` hoy también persiste `documentNumber` tal como llega (proveedores de MOD12): el cambio corrige ambos consumidores a la vez.

La fusión de duplicados existentes **no** es automática: el reporte del backfill va a revisión humana.

### 6.2 Búsqueda sin PII en la URL (SUB-C02, SUB-M08)

```ts
// Contrato C-API-1 (congelado en el prompt): sustituye a GET /crm/subscribers/search
POST /crm/subscribers/search
body: { documentNumber?: string; nit?: string; email?: string; phone?: string } // al menos uno
→ 200 { data: SubscriberListItem[] }   // proyección de listado, no ficha completa
// Registra LIST_ACCESS (awaited) con criterio "(aplicado)", nunca el valor.
```

```sql
-- data-eng: búsqueda por texto del listado (nombres y razón social, no PII cifrada)
CREATE INDEX idx_subscribers_search_trgm ON subscribers USING GIN (
  (coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
   coalesce(business_name,'') || ' ' || coalesce(commercial_name,'')) public.gin_trgm_ops
) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS idx_subscribers_tenant_doc;    -- SUB-B01
DROP INDEX IF EXISTS idx_subscribers_tenant_email;  -- SUB-B01
```

El `?search=` libre del listado se conserva solo si el CTO acepta nombres en query string; la recomendación es moverlo al mismo `POST` (ADR-067 §8 no distingue).

### 6.3 Proyección por finalidad y rol (SUB-A05, SUB-M06, SUB-M11)

```ts
// apps/api/src/modules/crm/subscribers/subscriber-projection.ts (sr-backend)
// Fuente única de la finalidad de ADR-067 §2: un campo sin entrada aquí no sale en el listado.
export const SUBSCRIBER_LIST_FIELD_PURPOSE = {
  documentNumber: 'Identificación en atención telefónica y conciliación de cartera',
  phone: 'Contacto directo', altContactPhone: 'Contacto directo', whatsapp: 'Contacto directo',
  email: 'Notificación y recuperación de acceso',
  address: 'Despacho técnico', neighborhood: 'Despacho técnico', city: 'Despacho técnico',
  latitude: 'Verificación de cobertura', longitude: 'Verificación de cobertura',
} as const;
// Mapa rol → campos: lo propone prod-ux (Ola 1) y lo ratifica AI-EM-ARCH.
// Hasta la ratificación, el mapa por defecto = proyección actual MENOS los campos sin finalidad.
export type SubscriberListFieldRoleMap = Record<UserRole, ReadonlyArray<keyof typeof SUBSCRIBER_LIST_FIELD_PURPOSE>>;
```

`GET :id` y `GET :id/360` registran `RECORD_ACCESS` (awaited, sin datos leídos). `LIST_ACCESS` deja de ser `void`.

### 6.4 Conversión confiable (SUB-A01, A02, A03, M07)

```sql
-- data-eng
CREATE UNIQUE INDEX uq_subscribers_expediente
  ON subscribers (expediente_id) WHERE expediente_id IS NOT NULL AND deleted_at IS NULL;
-- previo: consulta de duplicados existentes; si hay, el up() aborta con reporte (no fusiona)

CREATE TABLE crm_conversion_failures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  expediente_id   uuid NOT NULL REFERENCES expediente_records(id),
  event_name      varchar(80) NOT NULL,
  error_code      varchar(80) NOT NULL,      -- código, nunca mensaje con PII
  attempts        int NOT NULL DEFAULT 1,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz NULL,
  resolved_by     uuid NULL,
  CONSTRAINT uq_crm_conversion_failure UNIQUE (expediente_id, event_name)
);
```

- `emitPipelineEventSafely` registra (upsert) el fallo; reintento operativo por endpoint administrativo idempotente. **Se descarta** outbox + BullMQ en esta fase: ADR-027 eligió `EventEmitter2` y su texto se cumple con el registro; cambiarlo exige ADR sucesor sin beneficio inmediato.
- Reactivación: `reactivate` re-emite el evento del estado restaurado; un suscriptor `CANCELLED` **cuya causa fue el descarte** del mismo expediente vuelve a `PROSPECT` por una transición dedicada `CANCELLED → PROSPECT` con motivo `EXPEDIENTE_REACTIVATED`, auditada. `CANCELLED` sigue terminal para cualquier otra causa.
- Sin correo o teléfono, la conversión **no** inventa placeholders: crea el suscriptor con contacto pendiente (columnas a `NULL` y bandera `contactPending`) — requiere relajar `NOT NULL` de `email_encrypted`/`phone_encrypted` en la misma migración.

### 6.5 Party en todas las altas (SUB-A04)

- `POST /crm/subscribers` y la conversión aseguran Party vía `IPartyWritePort.ensurePartyWithRole(..., PartyRoleType.CUSTOMER, { manager })` en la **misma transacción** que el `INSERT` del suscriptor.
- Tras backfill, `subscribers.party_id SET NOT NULL` (migración de seguimiento, cuando el reporte dé cero nulos).

### 6.6 Auditoría sin PII (SUB-A08)

El diff de `update` registra **qué campo cambió** (`{ address: { changed: true } }`), nunca el valor, salvo campos no personales (`personType`, `customerSegment`, `stratum`, `status`). `nit` de persona jurídica puede registrarse en claro; `nit` con `documentType = NIT_PERSONA` no.

### 6.7 Habeas Data (SUB-A06, A07, B03) — **bloqueado por E-2**

Esquema objetivo, a confirmar tras la verificación legal:

```sql
CREATE TABLE data_subject_requests (            -- sustituye a arco_requests
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  party_id uuid NOT NULL,                      -- el titular es la persona, no el contrato
  subscriber_id uuid NULL,
  kind varchar(20) NOT NULL CHECK (kind IN ('CONSULTA','RECLAMO')),
  right varchar(20) NOT NULL CHECK (right IN ('CONOCER','ACTUALIZAR','RECTIFICAR','SUPRIMIR','REVOCAR','PRUEBA_AUTORIZACION')),
  status varchar(20) NOT NULL CHECK (status IN ('RADICADA','EN_TRAMITE','PRORROGADA','RESUELTA','RECHAZADA')),
  received_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,                 -- días hábiles con calendario de festivos CO
  extended_until timestamptz NULL,
  extension_reason varchar(500) NULL,
  resolved_at timestamptz NULL,
  resolved_by uuid NULL,
  response_ref varchar(255) NULL
);
-- consentimientos: append-only (sin UPDATE/DELETE por GRANT), IP del request,
-- hash SHA-256 del texto legal, finalidades[], revocatoria como fila nueva.
```

La supresión se ejecuta por **anonimización** (sobrescribir PII con valores nulos o seudónimos y borrar HMAC) respetando la retención legal de soportes contables y de facturación — plazo **a verificar con fuente oficial**.

### 6.8 Fiscal (SUB-C03, M03, M04, M05) — **bloqueado por E-1**

Dirección recomendada para el ADR sucesor de ADR-025 (no se redacta antes de la verificación para no codificar regulación supuesta):

- `stratum` y `usage` (`RESIDENTIAL | NON_RESIDENTIAL`) pasan al **punto de servicio** (contrato/instalación); el suscriptor conserva solo la dimensión de persona.
- `vatTreatment` se resuelve por punto de servicio: `f(personType, usage, stratum)`, con `EXEMPT | EXCLUDED | STANDARD` según el dictamen.
- `tax_regime` se reemplaza por `vat_responsibility` (`RESPONSABLE | NO_RESPONSABLE`) + `rut_responsibilities text[]`.
- DV obligatorio para NIT, validado con el algoritmo módulo 11, calculado si falta y propagado desde el expediente.

## 7. Escalaciones al CTO

**[ESCALACIÓN AL CTO] E-1 — Regla IVA de internet**
**Prioridad:** Crítica · **Contexto:** SUB-C03; ADR-025 (Aprobado) codifica una regla que este perfil no puede verificar y que diverge de su entendimiento del Art. 476 ET.
**Opciones:** (a) dictamen de asesor tributario o revisor fiscal sobre exento/excluido, condición residencial y estrato por predio → ADR sucesor de ADR-025; (b) mantener ADR-025 y documentar el riesgo aceptado; (c) mover el IVA canónico a reglas configurables por tenant (ADR-031).
**Recomendación:** (a). (c) traslada al ISP una decisión que el producto debe resolver una vez y bien.
**Decisión requerida antes de:** G6 del módulo y cualquier inicio de Billing.

**[ESCALACIÓN AL CTO] E-2 — Modelo legal de Habeas Data**
**Prioridad:** Alta · **Contexto:** SUB-A06, A07. Plazos de consultas/reclamos, catálogo de derechos y retención mínima de soportes requieren fuente oficial.
**Opciones:** (a) validar con asesor jurídico el esquema §6.7 y los plazos; (b) implementar con los plazos conocidos marcados "por verificar"; (c) diferir Habeas Data a un módulo transversal.
**Recomendación:** (a), en paralelo con la Ola 1 (no la bloquea).
**Decisión requerida antes de:** Ola 3 del plan.

**[ESCALACIÓN AL CTO] E-3 — Placeholders y `NOT NULL` de contacto**
**Prioridad:** Media · **Contexto:** SUB-M07. Retirar placeholders exige relajar `NOT NULL` de correo/teléfono para suscriptores con contacto pendiente.
**Opciones:** (a) relajar y bloquear la activación sin contacto; (b) mantener `NOT NULL` y bloquear la conversión sin contacto; (c) mantener placeholders.
**Recomendación:** (a): la conversión nunca se pierde y la activación sí exige contacto real.
**Decisión requerida antes de:** Ola 2.

## 8. Checklist de salida a producción del módulo

| # | Criterio | Verificable con | Estado |
| --- | --- | --- | --- |
| 1 | Cero críticos y cero altos abiertos | Este informe re-auditado contra `main` | ❌ |
| 2 | `party` deduplica por HMAC; cero documentos en claro en `party` | consulta de conteo por tenant + test integrado contra Postgres real | ❌ |
| 3 | Ninguna ruta acepta PII en query string | test HTTP + `grep` de `@Query` sobre campos personales | ❌ |
| 4 | Regla IVA respaldada por dictamen y ADR sucesor aprobado | ADR en estado Aprobado | ❌ |
| 5 | Conversión: unicidad en BD, registro de fallos, reactivación probada | tests de carrera y de reactivación | ❌ |
| 6 | Proyección del listado = mapa campo × rol ratificado | test por rol | ❌ |
| 7 | Acceso individual y masivo auditado (awaited), sin PII en `audit_logs` | test sobre `audit_logs` | ❌ |
| 8 | Consentimiento previo exigido al alta; evidencia append-only | test de rechazo + GRANT verificado | ❌ |
| 9 | Consultas/reclamos con vencimiento en días hábiles y alerta | test de cálculo con festivos | ❌ |
| 10 | ADR-058 fase 2 (`PII_ENCRYPTION_KEY`) desplegada y validada por Joi | arranque fail-fast en CI | ❌ |
| 11 | Cobertura ≥ 80 % en `crm/subscribers`, `crm/habeas-data`, `parties` con conteo real (`--force`, sin caché) | skill `iwana-test-evidence` | Sin medir |
| 12 | Migraciones reversibles probadas `up/down/up` en un tenant con datos | `data-eng` | ❌ |
| 13 | Revisión SEC-ENG GO sobre el diff completo | informe SEC-ENG | ❌ |
| 14 | G6.5: corrida Linux de CI por SHA con artefacto sanitizado | ADR-069 | ❌ |

## 9. Relación con trabajo en curso

- **Fase 04 de suscriptores** ([plan 2026-09-04](../plans/2026-09-04-mod05-subscribers-fase-04-orquestacion.md)) comparte superficie (`subscribers.service.ts`, `subscribers.controller.ts`). No hay informe de ejecución de esa fase en `docs/informes/`; su estado lo confirma el CTO. **Restricción de secuencia:** esta remediación y la Fase 04 no corren en paralelo sobre esos dos archivos; la Fase 04 se re-basa sobre el contrato C-API-1 de §6.2.
- No se re-despachan los cierres de MOD04 ni de MOD06.

## 10. Verificación del propio informe

- ADR citados abiertos y en estado verificado: 025, 026, 027, 029, 030, 031, 032, 058, 062, 067 (Aprobados); 082 `(propuesto)`; 083 (Aprobado).
- Toda cita regulatoria lleva "requiere verificación con fuente oficial".
- Sin PII real ni credenciales.
- Pendiente antes de commitear: `pnpm audit:adr-citations` en `BLOQUEANTE: 0` (lo ejecuta `docs-governance` o el CTO; este perfil no ejecuta).

## 11. Correcciones del 2026-10-12

Ambas correcciones salieron de la ejecución de la Ola 1. Se registran en lugar de reescribir el texto original para que quede trazado qué se afirmó y por qué cambió.

**C-1 — F-1 (exento frente a excluido) estaba sobreafirmado.** El documento `docs/ideas/regla-iva-internet-fijo-isp.md` (antes `docs/RegladeiVA.md`; sin autor declarado) cita el **Art. 481 lit. h) ET** como fundamento de la *exención* del internet fijo residencial en estratos 1 y 2, y el **Art. 476 num. 7** para la *exclusión* del estrato 3. Eso coincide con la tabla de ADR-025 y contradice el entendimiento de §0.2 y §3.2 F-1, que este perfil no pudo verificar. **F-1 deja de ser una divergencia**: queda solo como *requiere verificación con fuente oficial*, porque el documento no identifica autor ni texto normativo. **SUB-C03 se mantiene en Crítico** por F-2 y F-3, que el mismo documento refuerza (*"es obligatorio que el suscriptor sea un usuario residencial"*). Además aporta dos condiciones nuevas para E-1:
- **F-6:** el beneficio aplica solo a internet **fijo**.
- **F-7:** los conceptos adicionales (arriendo de router u ONT, IP fija, visitas cobradas, IPTV) se facturan al 19 % aunque el internet esté exento o excluido.

F-7 confirma que el tratamiento de IVA es atributo de la **línea de servicio**, no del suscriptor. Movido a `docs/ideas/` el 2026-10-12 (hallazgo de `docs-governance`).

**C-2 — SUB-A05 omitió una decisión vigente del CTO.** El informe atribuyó la ampliación de roles del listado a ADR-083 sin citar la **decisión D3** del PRD Fase 04 §9.4 (2026-09-04, posterior a ADR-083), que ya restringía el listado a cinco roles. El defecto real no es la falta de una decisión: es que **el código no implementa D3**, porque la Fase 04 no se ejecutó. La ratificación del mapa (spec B4 §6) lo resuelve, y el bloque B2 de la v1.1 lo implementa.

**C-3 — El contrato C-API-2 v1.0 que derivó de §6.3 omitía las etiquetas de nombre.** Bloqueó a B2 y B3. Se corrigió en el prompt v1.1 con la finalidad *"Etiqueta de la fila"*.

**C-4 — El listado sí mostraba el documento.** §4.2 y SUB-A05 afirmaron que la UI del listado solo consumía `email || phone` (`SubscribersListClient.tsx:516`). En `HEAD` el listado ya renderizaba `formatDocumentDisplay(subscriber)`; lo detectó B4. La premisa de ADR-067 (identificar por documento desde el listado) **sí estaba materializada**. No cambia ninguna decisión: el mapa ratificado entrega el documento a ADMIN, SUPPORT y ACCOUNTANT, y para el resto opera el texto alternativo existente.

**C-5 — E-1 verificada (2026-10-12).** Verificación contra el Estatuto Tributario y la doctrina DIAN vigente (Concepto 11602 de 2026, Concepto 15495 de 2025, Oficio 66561 de 2011): exento para estratos 1–2 y excluido para estrato 3, ambos solo con **uso residencial** e internet **fijo**; equipos vendidos, gravados; instalación, conexión y reconexión **heredan** el beneficio. La decisión se propone en [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) `(propuesto)`. E-1 pasa de "verificar la norma" a "aprobar ADR-093"; cuatro puntos menores quedan para dictamen del contador (ADR-093 §6).

**C-6 — E-1 resuelta (2026-10-12).** El CTO aprobó [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md); ADR-025 queda parcialmente superado. La implementación se orquesta en [2026-10-12-mod05-iva-punto-servicio.md](../plans/2026-10-12-mod05-iva-punto-servicio.md). SUB-C03 pasa de *bloqueado por decisión* a *en implementación*; sigue abierto hasta el G6 de esa fase.

**C-7 — SUB-C03 cerrado en G6 (2026-10-14).** Fases IVA (ADR-093) y D-PDF con G6 en GO: [cierre consolidado](INFORME-MOD05-IVA-PDF-CIERRE-G6-v1.0.md). Quedan G6.5 (CI por SHA) y G7 (MinIO privado, migraciones y backfill por tenant). El módulo sigue **NO-GO para producción** por E-2 (Habeas Data) y E-3 (placeholders).

**C-8 — E-2 verificada (2026-10-14).** El insumo del CTO sobre Habeas Data se contrastó contra la Ley 1581 (arts. 14 y 15), la Ley 2157 de 2021, la Ley 2573 de 2026, el Decreto 1704 de 2012, la Ley 962 de 2005 y la Ley 2300 de 2023.
- **Correcciones al insumo:** la conservación de soportes contables es de **10 años** (Ley 962 art. 28), no 5, y la caducidad del dato negativo corre desde la entrada en mora.
- **Lo que añade al modelo:** la Ley 2573 (vigente desde el 19-nov-2026) aplica a operadores de internet y exige suspender de inmediato el servicio adquirido con suplantación; además, el calendario de festivos, el reporte de incidentes y la Ley 2300.
- **Decisión:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md), **aprobado por el CTO el 2026-10-14**, con un módulo `privacy` cuyo titular es el Party. Hallazgo nuevo de ámbito transversal: `assurance/sla.service.ts:85-86` calcula plazos PQR sin festivos (deuda de `assurance`).

**C-9 — E-2 resuelta (2026-10-14).** ADR-094 aprobado. La implementación se orquesta en [2026-10-14-privacy-habeas-data-fase-1.md](../plans/2026-10-14-privacy-habeas-data-fase-1.md). SUB-A06, SUB-A07 y SUB-B03 pasan a *en implementación*. Hallazgo adicional: la vista 360° devuelve `habeasData` y `arcoRequests` vacíos fijos (`subscribers.service.ts:946-947`); lo cubre el bloque Q5.
