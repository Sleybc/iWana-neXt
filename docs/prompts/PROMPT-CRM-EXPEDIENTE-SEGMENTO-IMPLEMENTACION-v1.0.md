# PROMPT — CRM Expediente: Campo "Tipo de cliente" (segmento) — Implementación

**Módulo:** MOD05 CRM — expedientes y oportunidades
**Fase:** Implementación (etapa 5 del protocolo multiagente v1.5)
**Versión:** 1.0
**Fecha:** 2026-08-20
**Generado por:** AI-EM-ARCH (modo Orchestrator + EM)
**Nombre de archivo destino:** `docs/prompts/PROMPT-CRM-EXPEDIENTE-SEGMENTO-IMPLEMENTACION-v1.0.md` (regla `AGENTS.md` → Documentation Rules)
**Plan de fase fuente:** `docs/plans/2026-08-20-crm-expediente-tipo-cliente-segmento.md`

## 1. Objetivo exacto de la fase

- **Resultado esperado:** capturar el tipo de cliente (segmento) en el alta de oportunidad CRM, editable en la sección "Interés comercial" del detalle, persistido en `expediente_records.customer_segment` y propagado al suscriptor en la conversión cuando el expediente lo porta.
- **Lo que sí entra:** migración tenant 116 (registro en `runner.ts` + spec hermano), entidad, DTO de creación (segmento **requerido**), sección `COMMERCIAL_INTEREST`, propagación `resolveCustomerSegment`, api-client, formulario de alta (segundo campo, sin default), sección de detalle, tests backend/frontend según aplica, actualización de PRD MOD05 §7.1 CA-01, informe de fase.
- **Lo que no entra:** submódulo `opportunities` (legacy según PRD MOD05), backfill de expedientes históricos (quedan NULL por diseño), índice nuevo sobre la columna, cambios en `completeness-calculator.service.ts`, UI detallada nueva (usa Select nativo de `@iwana/ui` existente).

## 2. Artefactos de entrada obligatorios

- PRD: `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md` (CA-01, línea 367: alta mínima con fullName y source — se amplía con el segmento)
- ADRs aplicables: ADR-025 (Aprobado — segmento como dimensión de negocio); ADR-027 (Aprobado — conversión expediente→suscriptor two-stage); ADR-028 (Aprobado — segmento por ítem comercial)
- Plan de fase: `docs/plans/2026-08-20-crm-expediente-tipo-cliente-segmento.md`
- Enum canónico: `packages/shared/src/enums/customer-segment.enum.ts`
- Plantilla de prompt: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` **(en revisión — citada como propuesta; la regla de destino la respalda `AGENTS.md` → Documentation Rules)**

## 3. Contratos congelados (protocolo §3bis)

1. **Contrato de API tipado — CONGELADO:** enum `CustomerSegment` en `@iwana/shared` (`packages/shared/src/enums/customer-segment.enum.ts`, 6 valores). **No se agrega ningún tipo nuevo a `@iwana/shared`.** Los DTOs backend y los tipos del api-client se derivan de este enum. El frontend trabaja contra el enum compartido, no contra tipos paralelos.
2. **Sin contrato de componente nuevo:** el `Select` nativo de `@iwana/ui` ya existe en el patrón del formulario (bloque "Origen"). Cualquier ajuste de token/estado que no altere alcance ni contrato de datos queda en el carril rápido de UI delegado en AI-DS-OWNER — no escala a este prompt.

## 4. Instrucciones para AI-SR-FULL (Track Backend)

1. Registrar la migración `116_add_customer_segment_to_expediente_records.ts` (ya existe en disco) en `TENANT_MIGRATIONS` de `packages/database/src/migrations/tenant/runner.ts`, en orden tras la 115, y crear el spec hermano `116_....spec.ts` siguiendo la convención de las migraciones recientes.
2. Entidad: agregar `customerSegment` mapeado a `customer_segment` (varchar(20), nullable) en `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts`, replicando la declaración de `subscriber.entity.ts`.
3. DTO de creación: `customerSegment: z.nativeEnum(CustomerSegment)` **requerido** en `CreateExpedienteSchema` + campo en `CreateExpedienteDto` (`apps/api/src/modules/crm/expedientes/dto/create-expediente.dto.ts`).
4. Servicio `create()`: verificar que persiste el nuevo campo; si mapea campos explícitos del DTO, agregarlo.
5. Sección `COMMERCIAL_INTEREST` (`expediente.service.ts` ~línea 1737): aceptar `customerSegment`, validar contra `CustomerSegment` con error de campo, mapear a la entidad. Label `customerSegment: 'Tipo de cliente'` en `SECTION_FIELD_LABELS`.
6. Propagación: `resolveCustomerSegment` en `apps/api/src/modules/crm/subscribers/subscriber-creation.service.ts` (líneas 326-331): expediente con segmento → ese valor; sin segmento → fallback actual (`JURIDICA → PYME`, si no `RESIDENTIAL`).
7. Tests: `CreateExpedienteSchema` (6 valores aceptados; ausencia y valor fuera del enum rechazados), update de sección `commercial_interest` persiste y rechaza inválido, propagación (GOVERNMENT → suscriptor GOVERNMENT; sin segmento → fallback).
8. **No tocar** `completeness-calculator.service.ts` ni `opportunities/`.

## 5. Instrucciones para AI-FE-PLATFORM (Track Frontend)

1. `apps/portal/src/lib/api-client.ts`: `customerSegment: CustomerSegment` (requerido) en `CreateExpedienteDto` (~5397); `customerSegment: CustomerSegment | null` en `ExpedienteRecord` (~5051-5133). Importar `CustomerSegment` desde `@iwana/shared`.
2. `apps/portal/src/components/crm/expedientes/expediente-ui.ts`: exportar `CUSTOMER_SEGMENT_OPTIONS: { value, label }[]` con labels canónicos Residencial / SOHO / PyME / Gobierno / Corporativo / Mayorista (consistente con `subscriber-ui.ts` y ADR-025).
3. `ExpedientesLandingClient.tsx`: estado `createValues.customerSegment: ''`; validación `'Selecciona el tipo de cliente.'`; `Select` nativo de `@iwana/ui` con `<label>` manual replicando el bloque "Origen", **segundo campo tras "Nombre completo"**, placeholder "Selecciona una opción", sin default; incluir en payload de `handleCreateNew`; incluir en reset.
4. `apps/portal/src/components/crm/expedientes/sections/constants.ts`: campo `customerSegment` en configuración de `commercial_interest` (tipo select, label "Tipo de cliente", opciones `CUSTOMER_SEGMENT_OPTIONS`). Verificar render en `CommercialInterestSection.tsx` / `SectionFieldRenderer.tsx`; ajustar solo si el renderer lo exige.
5. Tests: si existe spec del landing de expedientes, agregar caso de validación (segmento requerido); **no crear archivo de spec nuevo** solo para esto.

## 6. Restricciones no negociables

- TypeScript estricto, sin `any` explícito, sin promesas flotantes, sin imports circulares (boundary del Modulith).
- Tenant/schema nunca hardcodeado; multi-tenancy por contexto aprobado.
- Cero PII real, credenciales o payloads sensibles en código, tests, logs y docs.
- Labels visibles en español, sentence case, sin enums crudos en UI (`system-vocabulary-review`).
- No se introduce `tailwind.config.js` (Tailwind v4 CSS-first).
- Migración reversible sin `throw` incondicional.

## 7. Entregables técnicos obligatorios

- Migración registrada + spec hermano.
- Código backend y frontend del alcance.
- Tests unitarios en verde (backend specs; frontend solo si ya existe spec).
- `pnpm --filter @iwana/db build`, `pnpm --filter @iwana/api test`, `pnpm --filter @iwana/portal typecheck`, `pnpm lint` en verde (evidencia ejecutada, no supuesta).

## 8. Entregables documentales obligatorios

- Informe de fase consolidado por AI-EM-ARCH en `docs/informes/INFORME-CRM-EXPEDIENTE-SEGMENTO-FASE-IMPLEMENTACION-v1.0.md` (con evidencia de gates).
- Actualización de `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md` §7.1 CA-01 (datos mínimos del alta incluyen el segmento) — ejecutada por AI-EM-ARCH en la consolidación.

## 9. Criterios de aceptación

- CA-1: El alta de oportunidad exige segmento (sin default) y persiste `customer_segment`.
- CA-2: El detalle muestra y permite editar el segmento en "Interés comercial" con los 6 valores canónicos.
- CA-3: Al convertir expediente con segmento, el suscriptor nace con ese segmento; sin segmento, fallback actual.
- CA-4: La migración 116 aplica limpia en schema tenant, es reversible y está registrada con spec.
- CA-5: Lint y typecheck en verde; tests de expedientes/subscribers en verde.

## 10. Criterio de stop/go

- **Detenerse inmediatamente si:** aparece un cambio de boundary, de contrato de API, de token de marca o de alcance del plan → devolver a AI-EM-ARCH con `[BLOQUEO]` antes de cerrar la sesión.
- Documentar causa en: informe de fase.
- Escalar a: AI-EM-ARCH (modo Orquestador).
- Recomendación esperada: continuar con el contrato vigente o re-sync versionado (§3bis regla 1).