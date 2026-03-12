---
applyTo: "docs/**,*.md"
---

# Documentation Instructions

- Cada documento mayor: titulo, version, estado, fecha.
- Estados: Borrador → En revisión → Aprobado → Deprecado.
- PRDs finales en modo Architect, max 10 secciones estandar.
- ADR obligatorio si cambia stack, boundary, patron de integracion o seguridad.
- Markdown + Mermaid para diagramas.
- Referencias con paths relativos.
- Sin PII, credenciales ni tokens en documentacion.
- Todo prompt de ejecucion por fase debe basarse en `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`.
- Todo prompt generado debe vincular plantilla base y artefactos de entrada obligatorios.
- Los informes de ejecucion y correccion se mantienen como documento vivo: se actualizan, no se duplican.
- Convencion de nombre documental: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`.
