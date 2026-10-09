---
name: iwana-cierre-fase
description: Cierra una fase de un modulo de iWana neXt con sus tres entregables canonicos — INFORME en docs/informes/, plan de orquestacion con matriz agente×skill en docs/plans/ y launcher de maximo 40 lineas en docs/prompts/ — y muestra el launcher completo en la respuesta. Usar cuando el usuario pide cerrar, consolidar o despachar la siguiente fase de un modulo.
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
