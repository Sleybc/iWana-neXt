# PROMPT - MOD05 CRM Auto-Pipeline de Expedientes

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-13  
**Modo activo:** Architect  
**Generado por:** Lead Software Architect Senior  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**Nombre de archivo:** PROMPT-MOD05-CRM-AUTO-PIPELINE-v1.0.md

---

## 1. Objetivo exacto de la fase

- Resultado esperado: implementar el recálculo automático del estado del pipeline de expedientes y reflejarlo automáticamente en portal mediante polling inteligente, sin introducir un canal realtime nuevo.
- Lo que si entra: backend autoritativo para matriz de estados, retroceso mixto temprano, auditoría del cambio automático, refresco de detalle y lectura de listado/resumen en portal, pruebas y actualización documental.
- Lo que no entra: SSE, WebSocket, cambio del pipeline de 12 estados, reasignación automática de responsables, nuevas integraciones externas.

## 2. Artefactos de entrada obligatorios

- PRD del módulo: docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md
- PRD específico de la fase: docs/prds/PRD-MOD05-CRM-AUTO-PIPELINE-v1.0.md
- HLD del módulo: docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md
- ADRs aplicables: docs/adrs/ADR-016-Cierre-MOD01-Produccion.md, docs/adrs/ADR-018-Ciclo-Vida-Tenant.md, docs/adrs/ADR-019-JWT-RS256-Refresh-Rotation.md, docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md, docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md
- Sprint plan aplicable: docs/sprints/PLAN-MOD05-CRM-SPRINT-02-v1.0.md
- Prompt arquitectónico origen: docs/prompts/PROMPT-MOD05-CRM-FASE-02-v1.0.md
- Artefactos faltantes detectados: no hay HLD específico de auto-pipeline; ejecutar como ajuste interno compatible con HLD vigente y sin ADR nuevo.

## 3. Instrucciones para Sr. Dev Fullstack

1. Implementar en backend un servicio único de dominio para resolver el estado objetivo del expediente según la matriz definida en el PRD específico.
2. Invocar ese servicio después de cada mutación relevante del módulo expedientes: creación, guardado de secciones y cualquier cambio técnico/comercial que afecte la matriz.
3. Respetar la política de retroceso mixto: permitir retrocesos automáticos solo entre `NUEVO_POTENCIAL`, `PENDIENTE_DATOS`, `PRECALIFICADO`, `VALIDANDO_COBERTURA` y `VIABLE_COMERCIALMENTE`.
4. Preservar `DESCARTADO` y `reactivate` como flujos manuales; no automatizarlos.
5. Registrar `StatusChange` y `AuditLog` cuando el estado cambie por automatización.
6. En portal, implementar polling inteligente en detalle de expediente y lectura de listado/resumen para reflejar cambios realizados por el mismo usuario, otros usuarios del tenant o procesos backend.
7. Evitar recarga completa de página; mantener el tab activo y minimizar saltos visuales.
8. Agregar pruebas unitarias backend de la matriz, pruebas de integración/HTTP de recálculo y al menos una prueba visible en portal o E2E.
9. Actualizar el informe vivo relacionado en `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md` con evidencia de ejecución, pruebas y decisiones finales.

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro módulo directamente.
- No hardcodear tenant, schema o slugs.
- No introducir SSE o WebSocket en esta fase.
- No usar credenciales ni datos reales.
- No omitir `StatusChange`, `AuditLog` ni pruebas.
- No degradar el comportamiento de descarte/reactivación manual.
- No relajar validaciones de seguridad o tenancy por conveniencia.

## 5. Entregables técnicos obligatorios

- Código backend en `apps/api/src/modules/crm/expedientes/` para resolver y aplicar el auto-pipeline.
- Código frontend en `apps/portal/src/app/dashboard/crm/expedientes/` y componentes relacionados para polling inteligente.
- Ajustes de contratos compartidos solo si son estrictamente necesarios.
- Tests unitarios, integración/HTTP y portal/E2E según aplique.
- Validación de que no se requieren endpoints nuevos; si se proponen, justificarlo antes de implementarlos.

## 6. Entregables documentales obligatorios

- Actualización del informe vivo en `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`
- Evidencia de calidad en `docs/quality/` si la fase genera artefactos formales de prueba
- Actualización de PRD/HLD solo si la implementación descubre una diferencia aprobada respecto al diseño
- Decisión stop/go documentada si aparece bloqueo técnico

## 7. Criterios de aceptación

- CA-AP-01: expediente recién creado permanece en `NUEVO_POTENCIAL`.
- CA-AP-02: expediente con captura parcial insuficiente queda en `PENDIENTE_DATOS`.
- CA-AP-03: expediente con base comercial mínima completa pasa a `PRECALIFICADO` sin acción manual.
- CA-AP-04: `feasibility = VALIDATION_REQUIRED` produce `VALIDANDO_COBERTURA`.
- CA-AP-05: `feasibility = VIABLE` produce `VIABLE_COMERCIALMENTE`.
- CA-AP-06: `interestedPlanId` válido permite `EN_COTIZACION`.
- CA-AP-07: no hay retroceso automático desde `EN_COTIZACION` o superior hacia estados tempranos.
- CA-AP-08: el portal refleja el cambio de estado sin recarga manual explícita.

## 8. Criterio de stop/go

- Detenerse inmediatamente si: la implementación requiere cambiar boundaries, introducir stack nuevo, romper el modelo multi-tenant o degradar auditoría.
- Documentar causa en: `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`
- Escalar a: CTO si aparece excepción de seguridad, boundary o cambio estructural; en otros casos al Lead Architect del módulo.
- Recomendación esperada: alternativa mínima compatible con HLD y ADRs vigentes.

## 9. Criterio de salida de la fase

- Backend validado: matriz automática implementada y cubierta por pruebas.
- Frontend validado: detalle y lectura de listado/resumen reflejan cambios por polling.
- Base de datos validada: sin migraciones no justificadas ni cambios de tenancy.
- Tests en verde: unitarios e integración; portal o E2E según alcance real.
- Documentación archivada: informe vivo actualizado con evidencia final.