---
applyTo: "docs/**,*.md"
---

# Documentation Instructions

Referencia maestra: `AGENTS.md`.

- Cada documento mayor: titulo, version, estado, fecha.
- Estados: Borrador → En revisión → Aprobado → Deprecado.
- PRDs finales en modo Architect, max 10 secciones estandar.
- ADR obligatorio si cambia stack, boundary, patron de integracion o seguridad.
- Markdown + Mermaid para diagramas.
- Referencias con paths relativos.
- Sin PII, credenciales ni tokens en documentacion.
- Todo prompt se guarda en `docs/prompts/`, sin excepcion — ejecucion por fase (`PROMPT-{MODULO}-{FASE}-v{VERSION}.md`) y operativo reutilizable (`PROMPT-OPERATIVO-{NOMBRE}-v{VERSION}.md`). La regla maestra vive en `AGENTS.md` → Documentation Rules; aqui solo se refuerza, porque el `applyTo` de este archivo no alcanza a quien escribe fuera de `docs/`.
- Todo prompt de ejecucion por fase debe basarse en `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`.
- Todo prompt generado debe vincular plantilla base y artefactos de entrada obligatorios.
- Los informes de ejecucion y correccion se mantienen como documento vivo: se actualizan, no se duplican.
- Convencion de nombre documental: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`.
