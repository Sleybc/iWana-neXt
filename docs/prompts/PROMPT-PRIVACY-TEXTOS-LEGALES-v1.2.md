# PROMPT — Privacy · Textos legales consumibles por el sistema

## Módulo

- **Nombre:** `privacy` (habeas data), con consumidores en MOD05 CRM
- **Fase:** Textos legales (Fase 1a+, sobre la base cerrada en G6 de la Fase 1a)
- **Versión:** 1.2: bloque correctivo B6 y re-verificación de B4 tras el P1 de seguridad del 2026-10-29. Sucede a la v1.1, que queda superada. Los encargos B1–B3 se conservan como registro; están cerrados
- **Fecha:** 2026-10-29
- **Generado por:** AI-EM-ARCH
- **Plantilla:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 (en revisión)

## 1. Objetivo exacto de la fase

- **Resultado esperado:**
  - el sistema consume la Política, el Aviso y la Autorización vigentes de cada ISP con formato fiel;
  - quien captura una autorización la lee sin necesitar permisos de privacidad;
  - la captura solo ofrece las finalidades que declara la política de la empresa.
- **Lo que sí entra:** contratos C1–C6 de la spec.
- **Lo que no entra:** la spec §7, y la publicación real en el tenant de Iwana (B5, humano).

## 2. Artefactos de entrada obligatorios

- **Contrato congelado:** `docs/specs/2026-10-29-privacy-textos-legales.md` **v1.2** (decisiones D-B1-1 y D-B4-1 en §8). Manda sobre este prompt si divergen.
- **Anexo de textos (para fixtures de prueba):** `docs/specs/2026-10-29-privacy-textos-legales-anexo-iwana-v1.md` v1.0.
- **Plan:** `docs/plans/2026-10-29-privacy-textos-legales.md` v1.2 (matriz §4, olas §5 y decisiones §6).
- **Estado al emitir la v1.2:** B1, B2 y B3 cerrados (informes B1/B2 v1.1 y B3-QA v1.0). B4 bloqueado por P1 (`INFORME-PRIVACY-TEXTOS-LEGALES-B4-SEC-v1.0.md`). **Solo se despachan §B6 y, después, §B4 en modo re-verificación.**
- **Estado heredado:** los informes `INFORME-PRIVACY-TEXTOS-LEGALES-{B1,B2}-v1.0.md` y el diff sin commitear en `apps/api/src/modules/privacy/`, `packages/shared/src/schemas/privacy/`, `packages/database/src/migrations/tenant/166_*` y `apps/portal/src/components/privacy/`. **Se continúa sobre ese árbol, no se rehace.** La migración 166 ya pasó su integración real (11 pruebas, incluido `up → down → up`).
- **ADR:** `docs/adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md` (Aprobado), D2, D6 y D8.
- **HLD:** `docs/hlds/HLD-PRIVACY-HABEAS-DATA-v1.1.md`.
- **Spec UX:** `docs/specs/2026-10-14-privacy-fase-1-ux-spec.md` §9.
- **Artefactos faltantes detectados:** ninguno. E1 cerrada el 2026-10-29: `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 aprobadas (plan §6, spec C4).

## 3. Encargos por bloque

### §B1 — `sr-backend`

**Reanudación (v1.1).** Primero cierra estos pendientes del informe B1 v1.0 y después completa los pasos 1–7 que falten:

- **R1.** `PUT /privacy/purposes` lleva `@Roles(UserRole.ADMIN, UserRole.AUDITOR)` junto a `@Permissions(PRIVACY_MANAGE)` (spec C3 v1.1, D-B1-1). Sin excepción en el invariante; `access-permission-catalog.invariant.spec.ts` debe quedar verde sin tocarlo. **No** añadas `RolesGuard` al controlador: cambiaría la autorización efectiva, y eso lo evalúa B4.
- **R2.** Agrega la migración 166 al inventario de reversiones destructivas, porque su `down` elimina la columna y la tabla. Sigue la convención del test que falla; no lo debilites.
- **R3.** Los fixtures de expediente rojos: lee el diff antes de ajustarlos. Si solo les falta proveer `IPrivacyPurposeReadPort`, añádelo. Si exigen cambiar comportamiento, `[BLOQUEO]`.
- **R4.** El fixture WFM que no compila (`findRouterSummariesByIds`) viene de los cambios sin commitear de MOD13 en `organization`. **No es tuyo: no lo toques.** Reporta el typecheck de API indicando ese error como ajeno y conserva cero errores propios.
- **R5.** Pendientes de evidencia: CA-LT-03 y CA-LT-04 por HTTP real; CA-LT-05 y CA-LT-06 en integración con Postgres.

1. Migración tenant nueva, con el próximo número libre: verifica `ls packages/database/src/migrations/tenant` y el plan MOD13 de retiro de la columna LAN, que puede reservar un número.
   - C1: `legal_texts.format`.
   - C3: `privacy_purpose_settings`, sembrada en `true`.
   - `up` y `down` reversibles. Integración Postgres que pruebe:
     - CA-LT-01: el trigger de solo anexar sigue activo y las filas viejas quedan `PLAIN`;
     - el CHECK de `format` y el de `purpose`.
2. En `packages/shared/src/schemas/privacy/`:
   - `legal-texts.ts` con `format` (spec C1);
   - nuevo `purposes.ts` (C3);
   - exportarlos en el índice;
   - pruebas en `privacy-schemas.spec.ts`.
3. La entidad `legal-text.entity.ts` deja de duplicar `LegalTextType` y añade `format`. El servicio persiste `format`, y el hash no cambia (CA-LT-02).
4. `legal-texts.controller.ts`: retirar `@Roles` y `@Permissions` solo de `current` (C2). Actualizar OpenAPI (`privacy-openapi.schemas.ts`), incluido `format`.
5. Implementar `GET` y `PUT /privacy/purposes`:
   - controlador y servicio en `apps/api/src/modules/privacy/purposes/`;
   - auditoría manual con el antes y el después (CA-LT-06);
   - 422 `PRIVACY_PURPOSE_REQUIRED` (CA-LT-04);
   - todo dentro de `withPrivacyTenant`.
6. Implementar `IPrivacyPurposeReadPort` en `ports/` y exportarlo desde `privacy.module.ts`. `authorizations.service.ts` rechaza `granted=true` sobre una finalidad deshabilitada con 422 `PRIVACY_PURPOSE_DISABLED`. Las revocaciones y `LEGACY_IMPORT` pasan (CA-LT-05). Revisa los flujos CRM que crean autorizaciones (`expediente.service.ts`, `potentials.service.ts` y `subscribers.service.ts`): si validan finalidades, que lo hagan por el puerto.
7. Pruebas e2e de API de CA-LT-03: un usuario sin rol de privacidad recibe 200 en `current` y 403 en `list` y en `POST`.

### §B2 — `fe-platform`

**Reanudación (v1.1).** El bloqueo de B1 no afectaba al portal. Continúa sobre tu diff:

- Repite `audit-ui.mjs` sobre el diff final (CA-LT-13).
- Resuelve las dos advertencias de dependencias de hooks.
- Valida la configuración de Jest ampliada (transformación ESM) corriendo **la suite completa del portal**, no solo specs aislados.
- Cierra el manejo de error y reintento (404 frente a otros errores).
- El `PUT` de finalidades responde 403 a quien no tiene `privacy.manage`: la sección «Finalidades» solo aparece con ese permiso.

1. `apps/portal/src/components/privacy/LegalTextContent.tsx` (C4).
   - **Rama `PLAIN`:** ya.
   - **Rama `MARKDOWN`:** con `react-markdown` + `remark-gfm` (`pnpm add --filter @iwana/portal react-markdown@10.1.0 remark-gfm@4.0.1`) y las condiciones de uso de la spec C4.
   - Tablas con desplazamiento horizontal dentro de su contenedor. Solo tokens reales de `packages/ui/src/styles/globals.css`.
2. `PrivacyWorkspace.tsx` → `LegalTextsSurface` (C5):
   - campo Formato y vista previa;
   - confirmación antes de publicar;
   - side peek en lugar del modal, con «Copiar huella»;
   - modo de solo lectura con `privacy.read` (corrige la pantalla en blanco de `:944`);
   - sección «Finalidades que declara tu política».
3. `apps/portal/src/lib/api-client.ts`: añadir `listPurposes` y `updatePurposes` y propagar `format`. **El archivo tiene cambios ajenos sin commitear (MOD13): añade, no reescribas.**
4. Consumidores (C6): `CompliancePanel.tsx`, `SubscriberForm.tsx` y `ConsentsPanel.tsx`.
   - Finalidades = las de la superficie ∩ las habilitadas.
   - El texto se muestra con `LegalTextContent`.
   - Enlaces «Política de tratamiento» y «Aviso de privacidad», que abren un peek de solo lectura y se ocultan si el tipo no está publicado.
   - Solo el 404 se muestra como «no hay texto vigente».
5. Actualiza los specs unitarios existentes que mockean `getCurrentLegalText` para incluir `format`. **Lee el diff antes de ajustar un fixture rojo:** podría ocultar una regresión.
6. Vocabulario visible sin `MARKDOWN`, `PLAIN`, `SHA-256` ni nombres de enum (`system-vocabulary-review`).

### §B3 — `sr-qa`

1. Unitarias del portal:
   - CA-LT-07: `<script>`, `<img onerror>` y `javascript:`;
   - CA-LT-08: tabla de la §10 del bloque A del anexo;
   - CA-LT-10: finalidad deshabilitada ausente en las tres superficies;
   - CA-LT-12: solo lectura.
2. E2E Playwright:
   - `view=legal`: publicar `MARKDOWN` → confirmar → peek → copiar huella (CA-LT-11);
   - captura en el expediente con un usuario de rol comercial (CA-LT-09);
   - finalidad deshabilitada rechazada por la API.
   - Los textos de prueba son sintéticos o el anexo; nunca PII real.
3. Trazabilidad CA → test en el informe, con conteo real por suite.
4. **Gate de cobertura ≥ 80 %** (AGENTS.md, Gates Before Merge) sobre los archivos que tocaron B1 y B2 en `api` (`modules/privacy`), `shared` (`schemas/privacy`) y `portal` (`components/privacy` y los tres consumidores), medido con `iwana-test-evidence`. B1 y B2 no lo midieron. Si algún archivo queda por debajo, súbelo con pruebas, sin tocar código productivo; si exige cambiar código, emite `[BLOQUEO]`. *(Precisión del 2026-10-29 al lanzar la Ola 3, sin bump: el gate ya era obligatorio y solo faltaba asignarlo.)*

### §B6 — `sr-backend` (correctivo, v1.2)

Decisión D-B4-1 de la spec v1.2 §8. Alcance: **solo** el cableado de guards del módulo `privacy`.

1. En los 9 controladores de `apps/api/src/modules/privacy/` (`authorizations`, `evidence`, `incidents`, `inventory`, `legal-texts`, `marks`, `purposes`, `requests`, `retention`), monta `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)` en ese orden, con el mismo patrón que `ExecutionOrdersController`. Importa `RolesGuard` de `../../auth/guards/roles.guard` y verifica que `privacy.module.ts` lo resuelva. `AuthModule` lo exporta.
2. **No toques** `PermissionsGuard`, `RolesGuard`, `TenantMiddleware` ni otros módulos. **No cambies** ningún `@Roles` ni `@Permissions` existente. `GET /privacy/legal-texts/current` y `GET /privacy/purposes` siguen sin `@Roles` (residual aceptado en D-B4-1).
3. Pruebas HTTP con Supertest. El token de plataforma se firma con el mismo mecanismo que usan los specs HTTP existentes; nunca con secretos reales.
   - **Token de plataforma + `X-Tenant-Slug`:** 403 en `POST /privacy/legal-texts` y `PUT /privacy/purposes`, y además en al menos una ruta mutante de `requests`, `incidents`, `authorizations` y `retention`.
   - **Tenant AUDITOR con `privacy.manage` (perfil DPO):** pasa.
   - **Tenant ADMIN con `privacy.manage`:** pasa.
   - **Tenant SUPPORT sin permisos de privacidad:** 403.
   - **Token de plataforma con slug:** `GET current` responde 200 (residual documentado).
4. Regresión: suite completa `modules/privacy` + `access-permission-catalog.invariant.spec.ts` + E2E de B3 (`CA-LT-(09|11|12)`), con conteo real sin caché. Si un spec o E2E existente usa un token de plataforma contra rutas de `privacy`, **lee el diff antes de ajustarlo**: el comportamiento nuevo es el correcto, pero hay que confirmar que el fixture no ocultaba un uso legítimo. Si lo ocultaba, emite `[BLOQUEO]`.
5. Informe: `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B6-v1.0.md` (verifica que la ruta esté libre).

### §B4 — `sec-eng`

**Re-verificación (v1.2), después de cerrar B6:** confirma que el P1 quedó cerrado en los 9 controladores, que el residual de D-B4-1 es el documentado y que el perfil DPO conserva su acceso. Actualiza `INFORME-PRIVACY-TEXTOS-LEGALES-B4-SEC-v1.0.md` a v1.1, sin crear uno nuevo. Lo de abajo es el encargo original v1.1, ya ejecutado.


Revisar:
- la apertura de `current` (C2): aislamiento por tenant y ausencia de enumeración entre tenants;
- el render Markdown (C4): XSS, esquemas de enlace, `target`/`rel`;
- `PUT /privacy/purposes`: autorización, auditoría sin PII y aislamiento por schema;
- que deshabilitar una finalidad no altere las autorizaciones vigentes;
- el hallazgo derivado de D-B1-1 (spec §8): en `privacy`, `@Roles` es declarativo, porque no hay `RolesGuard` y `PermissionsGuard` no evalúa roles. Dictamina si es un riesgo y, si lo es, recomienda la opción y su efecto sobre el perfil «Oficial de protección de datos».

Los hallazgos que exijan código abren un bloque para su dueño. No los corrijas tú.

## 4. Restricciones no negociables

- Modulith: CRM lee finalidades y textos **solo** por `IPrivacyPurposeReadPort` e `IPrivacyLegalTextReadPort`. Nada de SQL cruzado.
- Multi-tenant por schema; tenant desde el JWT. Nada de `tenant_id` nuevo.
- `legal_texts` sigue siendo de solo anexar: ninguna migración hace `UPDATE` sobre sus filas.
- El hash no incluye `format`.
- Sin credenciales ni PII real; los datos del responsable del anexo son públicos.
- Solo `pnpm`. Sin Prettier sobre `docs/`.
- No commitear y no tocar los cambios ajenos de MOD13 ni de organización.
- Ninguna dependencia nueva aparte de las dos aprobadas en E1, y solo en `apps/portal`.

## 5. Entregables técnicos

Código, migración reversible con su integración, contratos `@iwana/shared`, OpenAPI actualizado y pruebas unitarias, de integración y E2E según el bloque.

## 6. Entregables documentales

B1 y B2 **actualizan su informe v1.0 existente**, sin crear uno nuevo, a v1.1 con estado de cierre. B3 y B4 crean `INFORME-PRIVACY-TEXTOS-LEGALES-{B3-QA|B4-SEC}-v1.0.md`. Cada informe lleva:
- archivos tocados;
- evidencia con comando y conteo real (`Cached: 0`);
- CA cubiertos;
- deuda nueva por severidad;
- `[BLOQUEO]` emitidos.

Antes de escribir, verifica que la ruta esté libre.

## 7. Criterios de aceptación

CA-LT-01 a CA-LT-13 de la spec §4.

## 8. Criterio de stop/go

- **Detenerse si:**
  - el contrato de la spec no alcanza para implementar;
  - un fixture rojo exige cambiar comportamiento;
  - la migración choca con el número de otra fase;
- **Documentar la causa en:** el informe del bloque, con `[BLOQUEO]`.
- **Escalar a:** AI-EM-ARCH.
- **Recomendación esperada:** una posición decidible, no una pregunta abierta.

## 9. Criterio de salida de la fase

- **Backend validado:** B1 con CA-LT-01 a CA-LT-06 en verde.
- **Frontend validado:** B2 con `audit-ui.mjs` sin P0/P1 (CA-LT-13).
- **Base de datos validada:** integración de la migración con `up` → `down` → `up`.
- **Tests en verde:** B3 con conteo real y sin omitidas.
- **Seguridad:** B4 sin P0/P1 abiertos.
- **Documentación archivada:** los cuatro informes. G6 lo consolida AI-EM-ARCH y G6.5 exige CI de `main` verde por SHA.
