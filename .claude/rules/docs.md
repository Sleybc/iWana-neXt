---
paths: ["docs/**", "*.md"]
---

# Documentation Rules

## Gobernanza Documental

- Cada documento mayor debe tener: titulo, version, estado, fecha.
- Estados validos: Borrador → En revisión → Aprobado → Deprecado.
- Solo CTO aprueba ADRs y cambios de boundary.
- PRDs finales se emiten en modo Architect.

## Estructura de Carpetas

```
docs/
  adrs/          — Architecture Decision Records
  prds/          — Product Requirement Documents
  hlds/          — High Level Designs
  informes/      — Sprint reports, phase reports
  quality/       — Quality evidence, test reports
  security/      — Security assessments
  roles/         — Role profiles
  sprints/       — Sprint plans
  prompts/       — Execution prompts per phase
  database/      — DB schemas, migration docs
  identity/      — Identity & auth docs
```

## Formato

- Markdown como formato primario.
- Diagramas en Mermaid cuando aporten claridad.
- Referencias cruzadas con paths relativos al repo.
- No incluir PII, credenciales ni tokens en documentacion.
- Todo prompt de ejecucion por fase se genera desde `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`.
- El prompt final debe dejar trazabilidad a plantilla base, PRD, HLD, ADRs, sprint plan y prompt arquitectonico origen.
- Los informes de ejecucion y de correccion son documentos vivos: se actualizan sobre el archivo vigente y no se duplican.
- Convencion de nombre documental: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`.
