# PROMPT MOD00 Acceso — Remediación UI

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
**Versión:** 1.0
**Estado:** Aprobado para ejecución
**Fecha:** 2026-08-15
**Módulo:** MOD00 Configuración Control Plane
**Fase:** Correctiva — remediación UI/UX de Acceso
**Generado por:** AI-EM-ARCH
**Nombre de archivo destino:** `PROMPT-MOD00-ACCESO-REMEDIACION-UI-v1.0.md`

**PRD:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**HLD:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**ADR:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
**Spec:** `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md`
**Plan:** `docs/plans/2026-08-15-mod00-acceso-ui-remediation.md`
**Informe vivo:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**Hermana visual:** `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md`

Ejecutar exclusivamente la remediación UI/UX de `/dashboard/settings/access`.
No crear endpoints, migraciones, tokens, paquetes ni cambios globales del design system.
Aplicar TDD, cobertura >=80 % en las cuatro métricas del cliente, E2E autenticado y axe A/AA.

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** corregir hallazgos P1–P3 de `/dashboard/settings/access` (copy, IA, errores, diálogo de eliminar, primitivas Firma, 44 px, peek) y dejar evidencia G6 de esta corrección.
- **Lo que sí entra:** copy congelado, CTA en panel, MFA al final, errores sanitizados, `operations` → Operaciones, `PortalSidePeek`, `CheckboxCard`, `PortalDataTableHead`, tabs navy, diálogo eliminar, tests, E2E, axe, capturas.
- **Lo que no entra:** API, OpenAPI, PostgreSQL, migraciones, tenancy, permisos, `/dashboard/users`, navegación global, tokens, `Switch`, cambios globales a `@iwana/ui`, Organización (salvo no romperla).

## 2. Artefactos de entrada obligatorios

- PRD, HLD, ADR-040.
- Spec correctiva: `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md`
- Spec copy antecedente: `docs/specs/2026-05-27-mod00-access-copy-design.md`
- Plan: `docs/plans/2026-08-15-mod00-acceso-ui-remediation.md`
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Artefactos faltantes: ninguno para el alcance cerrado.

## 3. Instrucciones por rol

1. **AI-SR-QA:** RED primero (colocación CTA, copy, `operations`, errores, diálogo eliminar); luego cobertura, E2E, axe y evidencia visual.
2. **AI-FE-PLATFORM:** implementar contra la spec congelada con primitivas existentes; no crear tokens ni primitivas globales.
3. **AI-DS-OWNER:** revisar contrato visual §10 y el diff; emitir veredicto; no escribir componentes.
4. **AI-SR-FULL:** no cambia backend. Confirmar por escrito si un fallback de copy exigiera seed; no aplica en este alcance.
5. **AI-EM-ARCH:** integrar checkpoints, actualizar el informe vivo y registrar la evidencia.

No implementar backend, migraciones ni OpenAPI.

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No usar credenciales ni PII real.
- Copy en español, sentence case, spec §6.
- CTA y reintentos ≥44 px; foco visible; claro y oscuro AA.
- Errores internos de API nunca se muestran.
- TDD: no GREEN hasta publicar nombres RED y fallo esperado.
- No tocar `OrganizationSettingsClient.tsx`.

## 5. Entregables técnicos obligatorios

- Código portal del mapa de archivos del plan.
- Tests unitarios de `AccessControlSettingsClient`.
- E2E governance retargeteado + `portal-settings-access-ui.spec.ts`.
- Sin migraciones, sin OpenAPI, sin backend.

## 6. Entregables documentales obligatorios

- Spec, plan y este prompt.
- Actualización del informe vivo (no crear un informe nuevo).

## 7. Criterios de aceptación

- CA-ACC-UX-01…12 de la spec.
- Cobertura ≥80 % en statements, branches, functions y lines de `AccessControlSettingsClient.tsx`.
- Unit, E2E, lint, typecheck verdes.
- AI-PROD-UX y AI-DS-OWNER emiten GO.

## 8. Criterio de stop/go

- Detenerse si el contrato exige backend, token nuevo, primitive global, o una prueba crítica permanece roja.
- Documentar en el informe vivo.
- Escalar a AI-EM-ARCH.

## 9. Criterio de salida de la fase

- Frontend validado contra spec §4–§11.
- Tests en verde: Jest focalizado, Playwright Access, axe A/AA.
- Informe vivo actualizado con evidencia.
