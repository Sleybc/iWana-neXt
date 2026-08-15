# PROMPT MOD00 Organización — Remediación UI

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
**Versión:** 1.0
**Estado:** Aprobado para ejecución
**Fecha:** 2026-08-15
**Módulo:** MOD00 Configuración Control Plane
**Fase:** Correctiva — remediación UI/UX de Organización
**Generado por:** AI-EM-ARCH
**Nombre de archivo destino:** `PROMPT-MOD00-ORGANIZACION-REMEDIACION-UI-v1.0.md`

**PRD:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**HLD:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**ADR:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
**ADR relacionado:** `docs/adrs/ADR-043-Edicion-Atomica-Sede-Capacidades.md`
**Spec:** `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md`
**Plan:** `docs/plans/2026-08-15-mod00-organizacion-ui-remediation.md`
**Informe vivo:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

Ejecutar exclusivamente la remediación UI/UX de `/dashboard/settings/organization`.
No crear endpoints, migraciones, tokens, paquetes ni cambios globales del design system.
Aplicar TDD, cobertura >=80 % en las cuatro métricas, E2E autenticado y axe A/AA.

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** corregir hallazgos P1–P3 de `/dashboard/settings/organization` y dejar el gate G6 en GO con UX iWana, WCAG AA, cobertura suficiente y evidencia visual autenticada.
- **Lo que sí entra:** estados de carga/vacío/error/permisos, formulario unificado de sede con `country`, validación entre tabs, error de submit dentro del diálogo, tabla responsive, badges, contraste, foco, objetivos táctiles, diálogo iWana de baja, copy visible, pruebas unitarias, E2E, axe y evidencia visual.
- **Lo que no entra:** API, OpenAPI, PostgreSQL, migraciones, tenancy, permisos, reactivación de sedes, navegación global, `PageHeader`, otras subsecciones de Configuración, cambios globales a `PortalDataTableShell` o primitivas de `@iwana/ui`, rediseño de horarios/asignaciones/responsables o consumidores WFM/NMS.

## 2. Artefactos de entrada obligatorios

- PRD: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- ADRs: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`, `docs/adrs/ADR-043-Edicion-Atomica-Sede-Capacidades.md`
- Spec correctiva: `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md`
- Specs antecedentes: `docs/specs/2026-05-23-mod00-organization-site-modal-unificado-design.md`, `docs/specs/2026-05-23-mod00-sedes-nodos-nms-design.md`
- Plan: `docs/plans/2026-08-15-mod00-organizacion-ui-remediation.md`
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Sprint plan aplicable: no aplica; esta fase es correctiva sobre el informe vivo.
- Prompt arquitectónico origen: este documento.
- Artefactos faltantes detectados: ninguno para el alcance cerrado.

## 3. Instrucciones por rol

1. **AI-SR-QA:** escribir primero las pruebas RED de estados, permisos, errores, país, tabs, tabla y baja; luego cobertura, E2E autenticado, axe A/AA y evidencia visual.
2. **AI-FE-PLATFORM:** implementar contra la spec congelada usando primitivas existentes de `@iwana/ui` y el shell del portal; no crear tokens ni primitivas globales.
3. **AI-DS-OWNER:** revisar el contrato visual y el diff; emitir veredicto; no escribir componentes.
4. **AI-SR-FULL:** confirmar por escrito que `country` ya existe en `OrganizationSiteDetail`, `CreateOrganizationSiteDto` y `UpdateOrganizationSiteDto`; no cambiar backend.
5. **AI-EM-ARCH:** integrar checkpoints, actualizar el informe vivo y registrar G6.

No implementar backend, migraciones ni cambios de base de datos. No actualizar OpenAPI.

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro módulo.
- No usar credenciales ni datos reales / PII.
- No omitir pruebas ni documentación.
- No crear endpoints, migraciones, tokens, paquetes ni cambios globales del design system.
- Copy visible en español, sentence case y vocabulario de la spec.
- CTA y reintentos ≥44 px; foco visible; claro y oscuro AA.
- Errores internos de API nunca se muestran al usuario.
- TDD: no avanzar de RED a implementación hasta publicar nombres de casos y fallo esperado.

## 5. Entregables técnicos obligatorios

- Código frontend del portal en el mapa de archivos del plan.
- Tests unitarios de `OrganizationSettingsClient`, `CompanyProfileForm` y `OperationalSettingsForm`.
- Tests E2E de acceso, hub federado y matriz visual/accesible de Organización.
- Sin migraciones, sin OpenAPI, sin código backend.

## 6. Entregables documentales obligatorios

- Spec congelada en `docs/specs/2026-08-15-mod00-organizacion-ui-remediation.md`.
- Este prompt en `docs/prompts/`.
- Actualización del informe vivo `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` (no crear un informe nuevo).
- Evidencia de calidad: cobertura, E2E, axe y capturas autenticadas vigentes.

## 7. Criterios de aceptación

- CA-ORG-UX-01: no aparece un empty state antes de terminar la carga inicial.
- CA-ORG-UX-02: los errores internos nunca se muestran al usuario.
- CA-ORG-UX-03: los errores de submit permanecen dentro del diálogo y conservan datos.
- CA-ORG-UX-04: guardar desde Servicios lleva al primer error de Información y lo enfoca.
- CA-ORG-UX-05: país se hidrata y se envía en creación/edición.
- CA-ORG-UX-06: solo lectura no renderiza la columna Acciones ni `Crear sede`.
- CA-ORG-UX-07: sedes inactivas no ofrecen Dar de baja.
- CA-ORG-UX-08: tabla móvil usa scroll interno sin overflow de página.
- CA-ORG-UX-09: todos los controles interactivos alcanzan al menos 44 px.
- CA-ORG-UX-10: claro y oscuro cumplen WCAG AA.
- Cobertura ≥80 % en statements, branches, functions y lines de los tres componentes críticos.
- Unit, E2E, lint, typecheck y auditorías documentales verdes.
- AI-PROD-UX y AI-DS-OWNER emiten GO. AI-EM-ARCH registra G6=GO.

## 8. Criterio de stop/go

- Detenerse inmediatamente si: el contrato exige backend, token nuevo, primitive global, o una prueba crítica permanece roja tras reintento justificado.
- Documentar causa en: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`.
- Escalar a: AI-EM-ARCH / responsable del proyecto.
- Recomendación esperada: G6 permanece NO-GO si falta E2E verde, cobertura ≥80 %, axe sin violaciones, contraste conforme o evidencia visual autenticada.

## 9. Criterio de salida de la fase

- Backend validado: no aplica (sin cambios).
- Frontend validado: spec §5–§11 implementada en portal.
- Base de datos validada: no aplica.
- Tests en verde: Jest focalizado, Playwright de Organización, axe A/AA.
- Documentación archivada: informe vivo actualizado con evidencia y G6=GO.
