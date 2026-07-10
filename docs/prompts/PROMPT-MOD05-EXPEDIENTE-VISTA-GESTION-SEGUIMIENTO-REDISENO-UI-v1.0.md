# PROMPT - MOD05 Expediente rediseño UI (Vista general, Gestión, Seguimiento)

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-06-03  
**Modulo:** MOD05 CRM  
**Fase:** Rediseño UI operativo del expediente  
**Modo activo:** Mixto  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

---

## 1. Objetivo exacto de la fase

Refinar la experiencia de expediente CRM en `/dashboard/crm/expedientes/[id]` para mejorar jerarquía operativa, escaneabilidad y consistencia visual entre **Vista general**, **Gestión** y **Seguimiento**, sin alterar contratos backend ni reglas del pipeline.

### Lo que si entra

- Reorden de bloques en Vista general con foco en estado, readiness y acción inmediata.
- Estandarización visual de secciones en Gestión (header, progreso y prioridad visual).
- Mejora del timeline y acciones rápidas en Seguimiento.
- Ajustes de densidad, ritmo visual y responsive en breakpoints críticos.
- Refactor incremental de componentes para reducir complejidad visual y facilitar mantenimiento.
- Actualización de tests focalizados de portal para las superficies intervenidas.

### Lo que no entra

- Cambios de endpoints, DTOs, migraciones o permisos.
- Cambio de estados o reglas de negocio del pipeline comercial.
- Rediseño del shell global del portal.
- Introducción de librerías fuera del stack aprobado.

## 2. Artefactos de entrada obligatorios

- Perfil visual rector: `docs/roles/_historico/Perfil_IA_Senior_UI_Systems_Designer_v1.md`
- Plantilla de prompt: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- Spec de rediseño: `docs/specs/2026-06-03-mod05-expediente-vista-gestion-seguimiento-redesign-design.md`
- Plan técnico de implementación: `docs/plans/2026-06-03-mod05-expediente-vista-gestion-seguimiento-redesign.md`
- Checklist de revisión UI transversal: `docs/quality/CHECKLIST-TRANSVERSAL-PORTAL-UI-REVIEW-v1.0.md`
- Informe vivo transversal: `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`
- Referencia de identidad visual: `docs/identity/Manual_Implementacion_Identidad_Iwana.md`

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer primero el spec y el plan completos; no iniciar cambios de código sin ese baseline.
2. Implementar Sprint 1 del plan como bloque mínimo de entrega (quick wins de alto impacto).
3. Mantener Vista general como tablero de decisión: estado, readiness, acción recomendada, progreso, contexto y acciones de pipeline.
4. Estandarizar en Gestión los headers de sección (icono, descripción, porcentaje y prioridad visual).
5. Mejorar Seguimiento con tipología visual estable por tipo de evento y jerarquía clara de acciones rápidas.
6. Reutilizar primitives y utilities existentes antes de crear variantes locales.
7. No introducir estilos hardcodeados si existe token iWana equivalente.
8. Mantener accesibilidad AA: foco visible, contraste y color no exclusivo para estado.
9. Probar breakpoints 375, 768, 1024 y 1440 para prevenir solapamientos o pérdida de CTA primaria.
10. Ejecutar typecheck y tests focalizados antes de cierre.
11. Si aparece necesidad backend o de permisos, detener ejecución y registrar bloqueo.

## 4. Restricciones no negociables

- No romper boundaries ni ownership funcional entre secciones de expediente.
- No cambiar contratos API ni introducir lógica de negocio nueva.
- No degradar accesibilidad ni responsive de la pantalla.
- No duplicar patrones de UI ya resueltos en primitives compartidas.
- No exponer PII sensible adicional en nuevas superficies visuales o mensajes.

## 5. Entregables técnicos obligatorios

- Jerarquía nueva de Vista general aplicada en `page.tsx` del expediente.
- Gestión con patrón visual uniforme por sección.
- Seguimiento con timeline más escaneable y acciones mejor priorizadas.
- Ajustes de soporte en `ExpedienteHeader`, `ExpedienteSections`, `SeguimientoTab`, `expediente-ui`.
- Tests focalizados actualizados para superficies intervenidas.

## 6. Entregables documentales obligatorios

- Registrar en `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md` el sprint ejecutado y evidencia.
- Verificar cumplimiento con `docs/quality/CHECKLIST-TRANSVERSAL-PORTAL-UI-REVIEW-v1.0.md`.
- Si surge bloqueo, documentar stop/go en informe vivo con causa y recomendación.

## 7. Criterios de aceptación

- CA-EXP-UI-01: el primer viewport comunica estado actual, próximos pasos y acción principal.
- CA-EXP-UI-02: Gestión presenta headers de sección consistentes y prioridad visual clara.
- CA-EXP-UI-03: Seguimiento distingue eventos por tipo sin perder legibilidad temporal.
- CA-EXP-UI-04: no hay pérdida de operabilidad en mobile/tablet/desktop.
- CA-EXP-UI-05: la implementación mantiene tokens y patrones visuales iWana.
- CA-EXP-UI-06: typecheck y tests focalizados del slice quedan en verde.

## 8. Criterio de stop/go

Detenerse inmediatamente si:

- se requiere cambio de endpoint, DTO o migración;
- una mejora visual exige modificar reglas de negocio del pipeline;
- la solución propuesta rompe accesibilidad AA o navegación por teclado;
- el refactor genera deuda técnica crítica no acotada al sprint.

Documentar causa y recomendación en:

- `docs/informes/INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`

Escalar a:

- EM-ARCH (y CTO si impacta decisiones transversales de sistema visual).

## 9. Criterio de salida de la fase

- `pnpm --filter @iwana/portal exec tsc -p tsconfig.json --noEmit` en verde.
- Tests focalizados del expediente en verde.
- Evidencia visual before/after lista para revisión de PR.
- Informe vivo actualizado con alcance ejecutado y riesgos pendientes.
