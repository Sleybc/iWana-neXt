# [SEC-REVIEW] MOD05 E-3 · cierre AppSec v1.1

| Campo       | Valor                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                                                                       |
| Responsable | AI-SEC-ENG                                                                                                                       |
| Veredicto   | **NO-GO de seguridad** — queda un log con identificador enlazable a PII en el cambio F1.                                         |
| Alcance     | Revisión estática del CLI de anonimización y del registro/reintento de fallos de conversión. No se editaron producción ni tests. |

## Hallazgos

### [SEC-REVIEW] Identificador de expediente en logs de aplicación

| Campo     | Valor                                                                       |
| --------- | --------------------------------------------------------------------------- |
| Archivo   | `apps/api/src/modules/crm/expedientes/expediente.service.ts:3018,3023,3038` |
| Severidad | Media · bloquea el gate local «No PII in logs»                              |
| OWASP     | ASVS L2, protección de datos y logging; CWE-532.                            |

Los tres mensajes interpolan `expedienteId`. Ese UUID identifica un registro CRM que contiene datos personales y es enlazable con ellos desde la base; por tanto, es un identificador pseudónimo que puede exponer PII correlacionable al collector y a quienes consulten los logs. El mensaje de éxito de la limpieza también lo incluye. Esto contradice el cero PII en logs de `AGENTS.md` y el gate de seguridad del perfil AppSec.

**Corrección requerida:** retirar el UUID de los mensajes y usar un identificador de correlación operativo que no permita resolver al titular; mantener únicamente el nombre de evento y códigos estáticos ya validados. Revisar los tres mensajes.

### [SEC-REVIEW] El código de dominio no valida forma segura

| Campo     | Valor                                                                  |
| --------- | ---------------------------------------------------------------------- |
| Archivo   | `apps/api/src/modules/crm/expedientes/expediente.service.ts:3057-3068` |
| Severidad | Baja · hardening; no determina el NO-GO anterior                       |
| OWASP     | ASVS L2, validación de salida y logging.                               |

`pipelineErrorCode` acepta cualquier `response.code` string de hasta 80 caracteres. Ese valor se persiste en `crm_conversion_failures.error_code` y se incluye en el warning de la línea 3023. La revisión de los listeners locales y del caso B5 encontró códigos de dominio constantes y el fallback `CONVERSION_FAILED`; no se observó que el flujo actual construya el código desde PII. Aun así, el límite de longitud no garantiza que futuras excepciones mantengan ese contrato, ni evita caracteres de control.

**Recomendación:** aceptar solo códigos del catálogo o un patrón estricto de código (`A-Z`, dígitos y `_`), y usar `CONVERSION_FAILED` para cualquier valor no válido.

## Controles revisados

| Área                                | Resultado estático                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1: `potential_leads`              | Si la tabla tenant no existe, continúa sin ella. Si existe, la bloquea en modo `SHARE`, cuenta sus filas y aborta con solo el conteo cuando no está vacía; esto sucede antes de escribir.                                                                                                                                                                                  |
| A-2: solicitud, Party y expedientes | `--request` y `--expediente` validan UUID; se requiere una solicitud existente y los expedientes son una lista explícita. Compara `requester_document_hmac` con el HMAC del expediente; discordancia o ausencia exige `--confirm-unmatched`, e informa que el motivo debe quedar en el ticket. La anotación del ticket es un control operativo y no puede probarla el CLI. |
| A-3: cuentas enlazadas              | Resuelve `subscribers.user_id`, bloquea las filas de usuarios y aborta si falta `deleted_at` o la cuenta sigue activa. El flujo de usuario genera correo único sintético y HMAC con clave de configuración.                                                                                                                                                                |
| Tenant y transacción                | Resuelve el tenant por UUID/slug en `public.tenants`, exige estado `ACTIVE` y schema válido. `runInTenantSchema` usa una transacción, `SET LOCAL search_path`, rollback y release. Los valores externos van parametrizados; la interpolación de identificadores se limita a nombres codificados y validados.                                                               |
| Sustitución, HMAC y Media           | Las reglas del inventario limpian campos personales con `NULL` o marcador cifrado/anonimizado cuando el DDL lo exige. Los HMAC de titular se limpian según las reglas; `users.email_hmac`, requerido único y no nulo, se recalcula para el correo sintético. Media se marca con `deleted_at` y se preservan evidencias compartidas o vinculadas a la solicitud.            |
| Idempotencia y verificación         | El modo predeterminado es `dry-run`; `--apply` activa los cambios dentro de la transacción. Compara valores esperados, verifica residuos y revierte si la verificación posterior falla. El informe F3 registra integración PostgreSQL de 5 tests con dry-run, apply, repetición y abortos. No repetí esa integración en esta revisión.                                     |
| Salida y secretos del CLI           | La clave HMAC y las claves de cifrado se cargan desde `ConfigService`. La salida normal contiene conteos/estado; los errores inesperados se sustituyen por un mensaje genérico. No encontré impresión de identificadores, PII, HMAC, ciphertext o secreto desde el CLI.                                                                                                    |
| `contactPending` y 422              | `contactPending` sale como booleano calculado por `hasRealContact` en la lista blanca del controlador/proyección. Los dos 422 usan códigos y mensajes fijos, sin PII del expediente o suscriptor.                                                                                                                                                                          |
| Placeholders / centinela vacío      | No encontré un writer productivo del correo/teléfono placeholder ni una asignación productiva de `party_contact.value = ''`. El backfill existente detecta placeholders y cambia `value = ''` a `NULL`; no escribe el centinela.                                                                                                                                           |
| Persistencia/reintento F1           | Los tres listeners propagan el rechazo. F1 guarda código de dominio o `CONVERSION_FAILED`, conserva la transición ya guardada y resuelve el fallo solo al verificar el efecto de creación/activación. La prueba B5 documentada verifica el rechazo por falta de autorización, reintento pendiente y resolución al capturar consentimiento.                                 |

## Evidencia y límites

- Leídos: `AGENTS.md`; `PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md` §§2 C-E3-CLI y 6.1/6.3; informes F1 y F3 v1.1; `security-auditor` y `backend-security-coder`.
- Para el resultado E2E leí el reporte F2 solicitado, `docs/informes/INFORME-MOD05-E3-E4-QA-v1.1.md`, que reporta CA-E3-01 a 04 en PASS y deja NO-GO el criterio adicional del banner de fallo.
- Revisé el HLD de privacidad y el contexto CRM. La auditoría de este informe es estática; no ejecuté el CLI, pruebas ni el pipeline de gates.
- La ruta de este informe estaba libre antes de crearlo. Solo se creó este informe; no hubo commit.

**Resultado:** **NO-GO** hasta retirar el identificador CRM de los logs F1. El hallazgo de validación de `response.code` queda como hardening de baja severidad y no cambia por sí solo el veredicto.
