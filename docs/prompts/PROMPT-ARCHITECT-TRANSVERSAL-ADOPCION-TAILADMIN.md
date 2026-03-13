# PROMPT PARA ARCHITECT SOFTWARE — Adopcion Transversal de TailAdmin

**Version:** 1.0
**Estado:** Generado
**Fecha:** 2026-03-13
**Modo activo:** Architect
**Generado por:** AI-EM-ARCH

---

## Objetivo

Definir la arquitectura de alto nivel para adaptar el shell de dashboard de iWana neXt a la referencia de TailAdmin, preservando el stack vigente y la identidad de marca iWana.

---

## Artefactos de entrada

- `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md`
- `docs/prds/Stack_Tecnologico.md`
- `docs/plans/2026-03-12-frontend-prototype-design.md`
- `docs/prototipo/tailadmin/src/partials/header.html`
- `docs/prototipo/tailadmin/src/partials/sidebar.html`
- `docs/prototipo/tailadmin/src/partials/top-card-group.html`

---

## Salidas requeridas

1. ADR que formalice el tipo de adopcion de TailAdmin.
2. HLD transversal para shell compartido de dashboard.
3. Plan por fases de ejecucion.
4. Criterio explicito sobre si la adopcion requiere o no cambio de stack.

---

## Restricciones

- No cambiar el stack sin justificacion y aprobacion formal.
- No copiar codigo HTML + Alpine.js del prototipo como implementacion productiva.
- Mantener trazabilidad con PRD, Stack y reglas de gobernanza.
- Preservar la identidad iWana.