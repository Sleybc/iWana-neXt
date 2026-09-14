# TEMPLATE — Prompt corto de lanzamiento

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-09-14
**Emitido por:** AI-EM-ARCH

## Vinculos de trazabilidad

- **Archivo destino OBLIGATORIO:** `docs/prompts/PROMPT-{MODULO}-{FASE}-LAUNCH-v{VERSION}.md`. `AGENTS.md` → Documentation Rules: ningun prompt se deposita fuera de `docs/prompts/`, y hacerlo es defecto bloqueante.
- **Procedimiento que lo produce:** [`PROMPT-OPERATIVO-ANALISIS-DISPATCH-v1.0.md`](PROMPT-OPERATIVO-ANALISIS-DISPATCH-v1.0.md) Paso 4.
- **Procedimiento que lo consume:** [`PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md`](PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md).
- **Hermanos:** el prompt de ejecucion por fase (`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`) lleva el encargo; este solo lo lanza.

## Reglas del artefacto

1. **Techo de 40 lineas** en el archivo emitido. Si no cabe, el corte de la ola esta mal, o el launcher esta absorbiendo el encargo.
2. **Espejo en el plan:** el plan de orquestacion cierra con una seccion `## Lanzamiento` que reproduce el bloque copiar-pegar y declara que **este archivo es la fuente y prevalece si divergen**.
3. **Cero duplicacion de encargo.** Solo rutas, orden y skills. El *que hacer* vive en el prompt de ejecucion.
4. **Una ola por launcher.** La ola siguiente se lanza con su propio archivo cuando su gate cierra.

---

## Plantilla (copiar debajo de esta linea y rellenar)

```markdown
# LAUNCH — {MODULO} · {FASE}

**Plan:** `docs/plans/{YYYY-MM-DD}-{nombre}.md` v{N} · **Spec:** `docs/specs/{...}.md` v{N}
**Ola que lanza:** {Ola 1 — nombre} · **Gates verificados:** G1 {estado} · G2 {estado} · G3 {estado} · G4 {estado}
**Bloqueos abiertos:** {ninguno | [BLOQUEO] descripcion — no lanzar {bloque}}

| # | Subagente | Encargo (prompt · fase) | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `{subagente}` | `docs/prompts/{PROMPT}.md` §{fase} | `{skill}`, `{skill}` | `{ruta}` v{N} |
| 2 | `{subagente}` | `docs/prompts/{PROMPT}.md` §{fase} | `{skill}` | `{ruta}` v{N} |

**Paralelo:** {1 y 2 en paralelo, ninguno depende del otro}
**Cierre de ola:** {condicion verificable — p. ej. `pnpm test --filter api` con conteo real y `Cached: 0`}

---

### Bloque copiar-pegar

> Actua como `{subagente}`. Lee `AGENTS.md`, el plan `{ruta}` y tu encargo `{ruta}` §{fase}.
> Antes de escribir codigo lee los `SKILL.md` de: `{skill}`, `{skill}` (en `.agents/skills/<nombre>/SKILL.md`, como documentacion, no como tool).
> Consumes el contrato congelado `{ruta}` v{N}: no lo modifiques; si necesitas cambiarlo, emite `[BLOQUEO]` y para.
> Alcance: solo {fase}. Fuera de alcance: {lo excluido}.
> Cierras cuando: {condicion stop/go}. Reporta entregables con ruta, evidencia con conteo real de tests, y deuda nueva por severidad.
```

---

## Checklist antes de emitir

1. ¿Cada subagente citado existe en `.claude/agents/`?
2. ¿Cada skill citada existe en disco (`ls .agents/skills/<nombre>/SKILL.md`)?
3. ¿Cada prompt de ejecucion referenciado existe? Sin G4 no hay implementacion.
4. ¿Cada contrato congelado se cita **por ruta y version**? Un contrato sin artefacto localizable no esta congelado.
5. ¿El plan tiene ya su seccion `## Lanzamiento` espejo, con la nota de precedencia?
6. ¿El archivo cabe en 40 lineas?
