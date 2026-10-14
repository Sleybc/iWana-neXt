# INFORME MOD05 — Revisión de seguridad T7

**Versión:** 1.0 · **Fecha:** 2026-10-12 · **Bloque:** T7 — AI-SEC-ENG  
**Alcance:** diff sin commitear T1–T10, frente a C-TAX-1, C-DDL-2 y C-API-3 v1.2.  
**Modo:** solo lectura; no se modificaron código, tests ni contratos.  
**Veredicto global:** **NO-GO** por el hallazgo crítico de auditoría con PII del punto 6. D-PDF, Billing y Habeas Data quedan fuera de esta revisión.

## Resumen de veredictos

| # | Punto | Veredicto | Evidencia principal |
| --- | --- | --- | --- |
| 1 | F-1/F-2: entradas y permiso de carga | **GO** | `contracts.controller.ts:64-68,102-106,120-124,175-194,209-212`; `contract.schema.ts:6-33,56-117` |
| 2 | R1: uso frente a pertenencia del asset | **GO con deuda P2** | `contracts.service.ts:803-815`; `media.service.ts:207-217` |
| 3 | R2: respuesta 503 | **GO** | `contracts.service.ts:788-800`; `contracts.controller.ts:291-294` |
| 4 | R3: tipos que acepta el portal | **GO con observación P3** | `CreateContractDialog.tsx:727-736,816-819` |
| 5 | R4: URL temporal y audit trail | **GO** | `contracts.service.ts:583-603`; `media.service.ts:224-243` |
| 6 | `/service-point`: auditoría sin PII | **NO-GO — Crítica** | `contracts.controller.ts:200-205`; `audit.interceptor.ts:167-169`; `audit-sanitize.policy.ts:95-118`; `contract.entity.ts:103-104` |
| 7 | IVA canónico y boundary Taxation | **GO** | `internet-vat-resolver.ts:17-25,47-99`; `contracts.service.ts:718-770`; `taxation.module.ts:49-58` |
| 8 | Tenancy de endpoints nuevos | **GO** | `contracts.controller.ts:55-57,209-270`; `contracts.service.ts:466-502,583-603`; `tenant.middleware.ts:68-87,116-132` |

## Hallazgos por severidad

### Crítica — S-T7-01 · `/service-point` puede duplicar PII en auditoría

**Veredicto del punto 6: NO-GO.** El servicio escribe un evento directo acotado a tratamiento y nombres de campos, sin PII (`contracts.service.ts:442-457`). Sin embargo, el `AuditInterceptor` global también captura las respuestas de todas las operaciones CUD y guarda `response.data` tras aplicar el sanitizador (`apps/api/src/app.module.ts:251-253`, `apps/api/src/modules/audit/audit.interceptor.ts:167-169,258-268`). El handler `/service-point` devuelve el `Contract` completo (`apps/api/src/modules/crm/contracts/contracts.controller.ts:200-205`), que incluye `fiscalDocument` (`apps/api/src/modules/crm/contracts/entities/contract.entity.ts:103-104`). La política de PII no elimina `fiscal_document`: su patrón cubre `document_number`, `nit`, `address`, etc., pero no `fiscal_document` (`apps/api/src/modules/audit/audit-sanitize.policy.ts:95-118`). Por tanto, el CUD puede persistir el documento fiscal del titular en la segunda entrada de auditoría, aunque el evento directo sea seguro.

La identificación fiscal puede ser PII cuando corresponde a persona natural. Esta ruta de persistencia incumple la regla de cero PII en auditoría. El dato quedaría sujeto a los lectores y retención del audit trail; no afirmo que exista una exposición externa observada.

**Bloque nuevo para sr-backend (T3):** impedir que la auditoría automática de esta respuesta almacene el `Contract` completo o hacer que su payload sea una proyección segura; verificar también la cobertura del sanitizador para `fiscalDocument`. No corregido en esta auditoría.

### Media — S-T7-02 · El verificador no demuestra pertenencia al contrato

**Veredicto del punto 2: GO con deuda P2 condicionada a datos heredados.** `MediaService.findOne` valida tenant y exclusión de assets eliminados, y el caller comprueba únicamente `asset.usage === MediaUsage.GENERAL` (`apps/api/src/modules/media/media.service.ts:207-217`; `apps/api/src/modules/crm/contracts/contracts.service.ts:803-815`). No hay una relación de propiedad del asset al contrato en esa verificación. Así, un id heredado de la ruta v1.1 que apunte a otro asset `GENERAL` del mismo tenant puede contar como evidencia al recalcular el snapshot (`contracts.service.ts:738-753`), permitir la URL desde ese contrato (`583-603`) y, al retirarlo o reemplazarlo, borrar lógicamente el asset (`544-580`). El impacto posible es un beneficio fiscal sin soporte correspondiente y acceso a un documento ajeno dentro del tenant.

El riesgo de asociación nueva queda reducido: en los endpoints actuales el servidor sube un asset nuevo y asigna su id, y los DTOs de entrada no lo admiten. No encontré una fuente actual de escritura controlada por el cliente aparte de la vía antigua; tampoco se verificó una base de datos real de despliegue para determinar si conserva asociaciones v1.1. El informe T9 prueba el caso heredado inexistente, no la asociación a otro asset `GENERAL`.

**Bloque nuevo para sr-backend (T9):** inventariar/limpiar ids existentes antes del despliegue y hacer que el uso como evidencia dependa de una asociación que identifique el contrato, no solo del uso genérico. El plan v1.3 registra esta deuda y propone un uso dedicado como seguimiento; este informe no decide D-PDF.

### Baja — S-T7-03 · Allowlist del portal incluye tipos innecesarios para este soporte

**Veredicto del punto 4: GO con observación P3.** El portal permite PNG, WebP, JPEG, GIF e iconos (`CreateContractDialog.tsx:727-736,816-819`), que coincide con la allowlist actual de `MediaUsage.GENERAL` y el máximo de 10 MiB; el servicio Media valida MIME/bytes y tamaño. La selección incluye GIF e iconos sin valor evidente para el recibo o certificado. No vi SVG, HTML ni PDF habilitados por el portal. La diferencia observada es de copy: el mensaje de error enumera PNG/JPG/WebP/GIF, pero no los dos tipos de icono que el código acepta.

Esto aumenta innecesariamente el conjunto de formatos del soporte, sin identificar en este diff un vector de ejecución activa. Queda como hardening de baja prioridad y no bloquea el punto. **No se decide aquí** si añadir PDF ni crear un uso de Media dedicado.

## Evidencia por punto

### 1. F-1/F-2 — GO

Los esquemas Zod estrictos de create, create-from-expediente, update y service-point contienen solo campos declarados y no incluyen `stratumEvidenceMediaId` (`packages/shared/src/schemas/contract.schema.ts:6-33,56-117`). Los DTOs HTTP tampoco lo declaran. Además, un guard devuelve 400 si el campo aparece en los cuerpos JSON de esas acciones (`contracts.controller.ts:64-68,102-106,120-124,175-180,189-194`; `guards/reject-client-stratum-evidence.guard.ts:8-21`).

La subida dedicada permite ADMIN, SALES, SUPPORT y SYSTEM_ADMIN bajo `CRM_EXPEDIENTES_MANAGE` (`contracts.controller.ts:209-212`); `POST /media/upload` permanece fuera del diff de esta fase. Esto cierra el bloqueo funcional F-1 para SALES. La integración reportada por T9 cubre el 400 del campo cliente.

### 2. R1 — ver hallazgo S-T7-02

El contrato v1.2 requiere asset del mismo contrato. La implementación actual valida tenant, no borrado y `GENERAL`, sin probar propiedad. El riesgo se limita a datos heredados de v1.1 según el plan; debe confirmarse el estado de datos por entorno antes de activar la funcionalidad.

### 3. R2 — GO

El preflight responde 503 con código y mensaje genéricos para almacenamiento local, bucket público o URL pública configurada (`contracts.service.ts:788-800`). No incluye valores de `STORAGE_DRIVER`, `S3_BUCKET_PUBLIC` ni `S3_PUBLIC_BASE_URL`; la documentación HTTP también usa descripción genérica (`contracts.controller.ts:291-294`). La rama falla cerrada antes de cargar o firmar el soporte.

### 4. R3 — ver hallazgo S-T7-03

La lista del frontend está sincronizada con la allowlist ratificada de `MediaUsage.GENERAL`; los tipos ejecutables como SVG/HTML no están admitidos. La carga conserva validación del lado servidor a través de Media; el `accept` del navegador no se toma como frontera de seguridad.

### 5. R4 — GO

El endpoint comprueba el asset antes de firmar, solicita `getSignedUrl(..., 300)` y registra `STRATUM_EVIDENCE_ACCESS` con actor, contrato y un nombre de recurso, sin incluir URL (`contracts.service.ts:583-603`). `MediaService` limita y calcula vencimiento, sin persistir la URL firmada (`media.service.ts:224-243`). El interceptor global no audita GET (`audit.interceptor.ts:221-230`); no observé persistencia ni log de la URL en la ruta nueva.

### 6. `/service-point` — ver hallazgo crítico S-T7-01

El evento manual evita PII; la respuesta completa de `Contract` activa una segunda ruta de auditoría global y `fiscalDocument` no se filtra. Por eso el control no está cerrado.

### 7. IVA canónico / Taxation — GO

El resolvedor es una función pura con resultados y fundamentos fijos; no recibe configuración tenant (`apps/api/src/modules/taxation/services/internet-vat-resolver.ts:17-25,47-99`). `TaxationModule` provee y exporta `IInternetVatResolverPort` (`taxation.module.ts:49-58`), que consume `ContractsService` junto con el puerto de lectura del catálogo (`contracts.service.ts:31-34,718-770`). No hay lectura de tasas o reglas configurables por tenant en el camino del IVA canónico. CRM conserva otros puertos tipados de Taxation en el perfil tributario del suscriptor para sus asignaciones fiscales preexistentes; no se usan para resolver este IVA por contrato.

### 8. Tenancy — GO

Los endpoints nuevos están bajo guards JWT, roles y permisos a nivel del controlador (`contracts.controller.ts:55-57`), declaran permiso de gestión/lectura y no reciben tenant/schema como parámetro (`209-270`). La resolución de tenant para tokens tenant proviene de claims verificados y compara `tenantId` con `schemaName` (`tenant.middleware.ts:68-87`); las operaciones de CRM pasan `TenantContext` a `runInTenantSchema`, y Media recibe el schema derivado del contexto (`contracts.service.ts:466-502,583-603`). La lectura de asset del servicio Media filtra por `tenantSchema`.

SYSTEM_ADMIN se admite como rol de plataforma en los decoradores. El middleware permite a ese token seleccionar un tenant mediante `X-Tenant-Slug` (`tenant.middleware.ts:99-132`); es una capacidad privilegiada explícita, distinta del camino de usuarios tenant, que ignoran esa cabecera cuando el JWT ya contiene tenant. No observé un selector de tenant externo disponible para SALES/SUPPORT ni una consulta de contrato/media fuera del schema resuelto.

La API tiene rate limiting global configurado y los endpoints protegidos usan JWT RS256, expiración, issuer, audiencia y validación de tipo (`apps/api/src/app.module.ts:153-163,247-253`; `apps/api/src/modules/auth/strategies/jwt.strategy.ts:40-89`). El despliegue Nginx declara TLS 1.3 (`nginx/nginx.prod.conf:53-65`). Estos son controles comunes al módulo, no cambios introducidos por T7.

## Límites de verificación

No se ejecutaron pruebas, peticiones HTTP ni consultas a bases de datos. La auditoría es estática sobre el árbol actual y los informes de T9/T10; no se comprobó la existencia de referencias v1.1 en bases tenant persistentes. La verificación de pipeline TLS depende de que el tráfico productivo ingrese por el Nginx configurado.

## Deuda por severidad

| Severidad | Hallazgos | Estado |
| --- | --- | --- |
| Crítica | 1 — PII `fiscalDocument` puede persistirse en auditoría por respuesta CUD | Abierto; bloquea GO de T7/G6 hasta asignación/corrección por el dueño |
| Alta | 0 | — |
| Media | 1 — asociación de evidencia heredada no prueba pertenencia | Condicional a existencia de datos v1.1; reconciliar antes del despliegue |
| Baja | 1 — formatos GIF/icono ampliados respecto al propósito del soporte; copy no enumera iconos | Backlog de hardening |

**Cierre T7:** **NO-GO**. El hallazgo S-T7-01 requiere bloque nuevo de backend y nueva revisión de este control. Los puntos 1, 3, 5, 7 y 8 quedan en GO; los puntos 2 y 4 en GO con la deuda indicada.
