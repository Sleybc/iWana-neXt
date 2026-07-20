# PROMPT — WEB-UIUX — Fase 05: auditoría de verificación + afinamiento — v1.0

## Módulo

- Nombre: Consola de plataforma (apps/web) — remediación UI/UX
- Código: WEB-UIUX
- Fase: 05
- Versión: 1.0
- Fecha: 2026-07-20
- Generado por: AI-EM-ARCH (Engineering Manager / Orchestrator)
- Agentes destinatarios:
  - AI-DS-OWNER — re-review de contrato e identidad (modo review)
  - AI-PROD-UX — re-review de flujo/UX sobre superficies remediadas
  - AI-SR-QA — ya emitió GO parcial sobre CA 01–03 (consultar, no rehacer greps salvo discrepancia)
  - AI-FE-PLATFORM — solo si EM-ARCH emite delta de afinamiento con archivos concretos (no anticipar)

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** veredicto de verificación post-remediación (P0–P3 residuales), deuda aceptada explícita, y informe vivo consolidado `docs/informes/INFORME-WEB-UIUX-REMEDIACION-v1.0.md`. Afinamiento de diseño solo para quick wins P2 justificados que no expandan alcance a skeletons/empty/URL (esos quedan backlog post-05 salvo bloqueante nuevo).
- **Lo que sí entra:** re-review identidad + UX de superficies tocadas en 01–03; clasificación de deuda `audit-ui` `[revisar]`; confirmación de cierre P0/P1 del review origen; consolidación documental.
- **Lo que no entra:** fase 04 (export/filtro server-side); cambio de tokens globales; variante lima de `Button` (escalado CTO); rediseño de formularios internos de modales; lógica de auth.

## 2. Artefactos de entrada obligatorios

- Plan: `docs/plans/PLAN-WEB-UIUX-REMEDIACION-v1.0.md`
- Prompts ejecutados: `PROMPT-WEB-UIUX-FASE-0{1,2,3}-v1.0.md`
- Skill: `.agents/skills/iwana-identity-ui-review/SKILL.md` (modo review) + `references/*` según dimensión
- Script: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/web/src`
- Spec Firma + ADR-056
- Evidencia G5/G6 parcial: 14/14 CA PASS (AI-SR-QA, 2026-07-20)
- Review origen: hallazgos P0:1 P1:6 (cerrados en 01–03)

## 3. Instrucciones por rol

### 3.1 AI-DS-OWNER

1. Correr `audit-ui.mjs` sobre `apps/web/src` (+ `Badge`/`Card` en `@iwana/ui` si aplica).
2. Confirmar o descartar hallazgos `[revisar]` (esp. `lime-text-aa` en `PlatformAuthExperience` aside oscuro; `lime-50-surface` en `AuditSummary`).
3. Verificar tokens en `Badge`/`Card` y semántica del lima (campana sin lima de alerta).
4. Entregar: veredicto contrato/identidad (GO / GO con deuda / NO-GO) + lista P0–P3 residuales con causa raíz.

### 3.2 AI-PROD-UX

1. Revisar flujos remediados: confirmaciones destructivas (`ConfirmDialog`), toast tenants, búsqueda global mobile, aviso de alcance auditoría, auth secundario en shell canónico.
2. Evaluar fricción/a11y de tarea (no rediseñar). Flaggear si `role="dialog"` en `NotificationBell` / overlay búsqueda rompe flujo o es deuda aceptable.
3. Entregar: veredicto UX (GO / GO con deuda / NO-GO) + hallazgos priorizados; proponer máximo 3 quick wins de afinamiento (archivo + cambio ≤1h c/u) o "ninguno".

### 3.3 AI-FE-PLATFORM (solo bajo delta EM-ARCH)

- Si PROD-UX/DS-OWNER proponen quick wins aprobados por EM-ARCH, implementar solo esos archivos. Stop/go: no tocar fase 04 ni inventar tokens.

### 3.4 AI-EM-ARCH (este prompt)

- Consolidar veredictos → decisión única.
- Redactar/actualizar `docs/informes/INFORME-WEB-UIUX-REMEDIACION-v1.0.md`.
- Actualizar estado del plan (fase 05 cerrada o deuda explícita).
- Decidir si se emite prompt de fase 04 o queda diferida.

## 4. Restricciones no negociables

- Sin cambios de API/OpenAPI (fase 04).
- Sin PII, sin `tailwind.config.js`, solo tokens existentes.
- El aprobador del gate no es el productor del artefacto.
- Copy en español, sentence case.

## 5. Entregables

| Rol | Entregable |
| --- | --- |
| DS-OWNER | Informe corto de re-review identidad (en respuesta) |
| PROD-UX | Informe corto de re-review UX + quick wins propuestos |
| EM-ARCH | `INFORME-WEB-UIUX-REMEDIACION-v1.0.md` + decisión GO/NO-GO módulo remediación 01–03 |
| FE-PLATFORM | Código solo si hay delta aprobado |

## 6. Criterios de aceptación

- CA-501: P0/P1 del review origen constan como cerrados o reabiertos con evidencia.
- CA-502: deuda `[revisar]` clasificada (aceptada / corregir ahora / backlog).
- CA-503: informe vivo publicado con trazabilidad a plan, prompts 01–03 y veredictos.
- CA-504: plan actualizado (estado fase 05).

## 7. Criterio de stop/go

- **Detenerse si:** aparece P0 nuevo de identidad/a11y en superficie remediada → NO-GO y delta FE-PLATFORM obligatorio antes de cerrar 05.
- **Escalar a CTO:** solo cambio de lenguaje visual global o excepción AA.

## 8. Criterio de salida

- Veredictos DS-OWNER + PROD-UX consolidados, informe vivo emitido, plan actualizado.
