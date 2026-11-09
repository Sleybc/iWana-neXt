---
name: iwana-cierre-fase
description: "Cierra una fase de un módulo con INFORME en docs/informes/, plan de orquestación con matriz agente×skill en docs/plans/ y launcher de máximo 40 líneas en docs/prompts/, mostrado completo en la respuesta. Usar cuando el usuario pide cerrar, consolidar o despachar la siguiente fase. No usar para un plan suelto (→ writing-plans)."
disable-model-invocation: true
metadata:
  category: workflow
  triggers: cierre de fase, cerrar fase, informe de fase, plan de orquestacion, matriz de dispatch, launcher, siguiente ola
---

# Cierre de fase

**Argumentos:** modulo (ej. `MOD11-MOD12`), fase (ej. `INVENTARIO-I5`), version (ej. `1.0`).

Antes de escribir, lee `AGENTS.md` → «Documentation Rules» y «Skills Dispatch», y el plan y el
prompt de ejecucion vigentes de la fase.

## Entregables

1. **INFORME** → `docs/informes/INFORME-{MODULO}-{FASE}-v{VERSION}.md`
   - Alcance ejecutado y lo que quedo fuera, con motivo.
   - Evidencia: comandos y conteos reales (skill `iwana-test-evidence`); nada de «pasa» sin cifras.
   - Estado de cada gate de «Gates Before Merge».
   - Pendientes con responsable y decisiones abiertas para el CTO.
   - Lineas de la fase por superficie, y que se elimino: `git diff --shortstat <base> -- apps packages e2e`
     y `git diff --shortstat <base> -- docs` («Escritura mínima» de `AGENTS.md`).
   - Libro de atajos: `git grep -nE '(//|#|/\*|\*) ?atajo:'`, una fila por marcador; el que no dice
     cuando subir se marca `sin-disparador`.
   - Cierre de una o dos lineas: que se omitio, que no se verifico y que riesgo queda.

2. **Plan de orquestacion** → `docs/plans/YYYY-MM-DD-<nombre>.md`
   - Olas y dependencias entre bloques.
   - **Matriz de dispatch**: una fila por bloque con subagente de `.claude/agents/` y tres listas
     de skills — obligatorias, de apoyo (con su condicion) y descartadas (con su motivo).
   - Verifica cada skill contra disco antes de citarla: `ls .agents/skills/<nombre>/SKILL.md`.
   - Procedimiento: `docs/prompts/PROMPT-OPERATIVO-ANALISIS-DISPATCH-v1.0.md`.

3. **Launcher** → `docs/prompts/PROMPT-{MODULO}-{FASE}-LAUNCH-v{VERSION}.md`
   - Maximo 40 lineas; remite al plan y al prompt de ejecucion en lugar de repetirlos.
   - Ningun prompt fuera de `docs/prompts/` (el hook `guard-paths` lo bloquea en Claude Code).

## Presentacion

Muestra en la respuesta el **bloque completo del launcher**, listo para copiar y pegar, ademas de
las rutas de los tres archivos. La ruta sola no basta.

## Verificacion

```bash
pnpm audit:doc-locations
pnpm audit:adr-citations
```

Bajo el perfil AI-EM-ARCH este skill es el entregable natural de la fase: no escribe codigo productivo.
