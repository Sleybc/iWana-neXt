# INFORME — Privacy Fase 1b · V3 boundaries y contratos

**Fecha:** 2026-10-16  
**Estado:** Revisión terminada  
**Alcance:** diff `aeedeffc..HEAD`; plan v1.2 y prompts Fase 1b v1.0–v1.2  
**Dictamen:** **NO-GO para G4** por un hallazgo alto de deriva de contrato. Sin hallazgos de boundary.

## Revisión de boundaries

No encontré escrituras a tablas ajenas ni ciclos nuevos entre módulos. `CrmPersonalDataErasureAdapter` coordina los participantes con el mismo `QueryRunner` transaccional (`apps/api/src/modules/crm/privacy-adapters/crm-personal-data-erasure.adapter.ts:30-45`, `:78-85`). Las escrituras quedan en las tablas asignadas a cada participante: CRM en `crm-titular-erasure.participant.ts:352-452`; Parties en `party-titular-erasure.participant.ts:68-102`; Users en `user-account-erasure.participant.ts:103-151`; Media en `media-titular-erasure.participant.ts:93-124`; WFM en `wfm-titular-erasure.participant.ts:248-292`; Tasks en `execution-order-titular-erasure.participant.ts:124-145` y `operational-task-titular-erasure.participant.ts:128-160`.

Los `*PrivacyModule` registran y exportan solo participantes (`parties-privacy.module.ts:4-8`, `users-privacy.module.ts:4-8`, `media-privacy.module.ts:4-8`, `wfm-privacy.module.ts:4-8`, `tasks-privacy.module.ts:4-9`). `CrmPrivacyAdaptersModule` importa esas superficies ligeras (`crm-privacy-adapters.module.ts:20-27`); no importa los módulos núcleo. El único `forwardRef` de esta integración está en `privacy.module.ts:58`, hacia CRM. La lectura de `subscribers.user_id` desde el participante Users resuelve los vínculos indicados por el contrato de §2.5 y no escribe la tabla CRM (`user-account-erasure.participant.ts:35-48`).

## Hallazgos de contrato

### Alto — el preview puede devolver más IDs de los que acepta `resolve`

`resolveRequestSchema` limita `erasure.expedienteIds` a 50 (`packages/shared/src/schemas/privacy/requests.ts:219-225`), pero `erasurePreviewSchema` no limita `candidateExpedienteIds` (`:246-254`). El productor obtiene los candidatos sin tope (`apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts:299-312`; invocación en `apps/api/src/modules/crm/privacy-adapters/crm-personal-data-erasure.adapter.ts:188-190`) y el Portal envía la lista íntegra al resolver (`apps/portal/src/components/privacy/PrivacyRequestDetail.tsx:211-216`). Para un titular con más de 50 expedientes, el preview es válido, pero el payload generado por la misma pantalla no satisface el esquema de `resolve`; el flujo no puede completarse desde la UI. El test de esquema confirma el límite de 50, sin probar compatibilidad entre preview y confirmación para listas mayores (`packages/shared/src/schemas/privacy/erasure.spec.ts`).

### Medio — una mutación de contrato pierde temporalmente la marca de anonimización

El esquema compartido exige `titularAnonymizedAt` nullable (`packages/shared/src/schemas/contract.schema.ts:168`). La propiedad no vive en `contracts` y la entidad la inicializa en `null` (`apps/api/src/modules/crm/contracts/entities/contract.entity.ts:22-24`). La lectura la completa desde el suscriptor (`apps/api/src/modules/crm/contracts/contracts.service.ts:425-462`), pero `update()` retorna el objeto guardado directamente (`:633-647`). Portal reemplaza `currentContract` con esa respuesta (`apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx:420-421`) y la insignia «Anonimizado» depende de esa propiedad (`:628-639`). Editar un contrato anonimizado, operación permitida por v1.1 §6, deja la marca como `null` en pantalla hasta la siguiente lectura completa.

### Bajo — OpenAPI declara opcional una propiedad requerida por shared

`ContractResponseSchema` exige la propiedad nullable `titularAnonymizedAt` (`packages/shared/src/schemas/contract.schema.ts:168`), pero el DTO usa `@ApiPropertyOptional` (`apps/api/src/modules/crm/contracts/dto/contract-response.dto.ts:36-37`). OpenAPI documenta una propiedad omitible donde el contrato shared requiere que esté presente, aunque acepte `null`. La respuesta ordinaria sí la proyecta; el hallazgo es de documentación contractual.

## Contratos sin deriva observada

En las rutas inspeccionadas, los campos de request summary/detail y preview se construyen en API y se validan en Portal; las proyecciones de suscriptores cubren las propiedades nuevas; y las categorías, motivos y permiso de facturación tienen productores/consumidores identificables. No observé otros hallazgos dentro del alcance de contratos indicado.

## Resultado

La revisión de boundaries no presenta violaciones. G4 queda **NO-GO** por el hallazgo alto de preview/resolve; corregido ese contrato, permanecen un hallazgo medio de proyección de respuesta tras mutación y uno bajo de OpenAPI. Revisión estática solamente; no se modificó código, contratos ni pruebas y no se hizo commit. No se incluyó PII, HMAC, ciphertext ni secretos.
