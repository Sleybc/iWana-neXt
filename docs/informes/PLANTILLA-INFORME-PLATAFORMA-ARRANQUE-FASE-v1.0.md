# PLANTILLA — Informe de fase · Frente de experiencia de arranque

**Versión de la plantilla:** 1.0
**Fecha:** 2026-08-09
**Autor de la plantilla:** AI-EM-ARCH
**Destino de los informes derivados:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F{n}-v1.0.md`

> **Cómo se usa.** Cada agente ejecutor copia esta estructura al cerrar su fase. **No se rellena al final de una sentada**: las secciones 3 (evidencia), 5 (deuda) y 6 (bloqueos) se van completando durante la fase, en paralelo al checklist.
>
> El informe de fase es la **fuente de dato de los KPIs del programa**. Un campo sin dato se reporta **"sin instrumentar"**; nunca se estima.

---

## Cabecera obligatoria

```
# INFORME — Plataforma · Experiencia de arranque · F{n} {nombre}

**Versión:** 1.0
**Estado:** En curso | Cerrado | Cerrado con deuda | Bloqueado
**Fecha:** YYYY-MM-DD
**Modo activo:** {modo del agente}
**Autor:** AI-XXX
**Agentes ejecutores:** AI-XXX (ejecuta) · AI-YYY (verifica)
**Prompt ejecutado:** docs/prompts/PROMPT-PLATAFORMA-ARRANQUE-F{n}-v1.0.md
**Checklist:** docs/quality/CHECKLIST-PLATAFORMA-ARRANQUE-F{n}-v1.0.md
**HLD:** docs/hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md
**ADRs de referencia:** ADR-079 (Aprobado 2026-08-09, Decisión 4 de ejecución diferida) · ADR-078 (propuesto) · {los que apliquen, con marcador de estado si no están aprobados}
**Contratos consumidos:** C{n} v{x} — ruta
**Contratos producidos:** C{n} v{x} — ruta
```

---

## 1. Entregables

Tabla de lo entregado, con ruta. **Nada de prosa sobre intenciones**: lo que existe en el repositorio.

| Artefacto | Ruta | Tipo | Estado |
| --- | --- | --- | --- |
| | | código / prueba / doc / configuración | |

Si un entregable declarado en el prompt **no** se entregó, va aquí con la causa. Omitirlo es el defecto que el checklist existe para prevenir.

## 2. Alcance real frente al alcance prometido

- **Entregado según el prompt:**
- **Entregado de más** (con justificación — un alcance ampliado sin justificar es una desviación):
- **No entregado** (con causa y destino):

## 3. Evidencia de gates

**Toda línea de suite adjunta el resumen del orquestador de tareas con `Cached: 0`.** Una suite en verde sin esa línea **no es evidencia**: pudo no haber ejecutado nada.

| Gate técnico | Comando | Resultado | `Cached: 0` | Fecha |
| --- | --- | --- | --- | --- |
| Lint | `pnpm lint` | | | |
| Typecheck | `pnpm typecheck` | | | |
| Pruebas unitarias | | | | |
| Pruebas de integración | | | | |
| Pruebas de extremo a extremo | | | | |
| Tooling | `pnpm test:tooling` | | | |
| Ubicación de documentos | `pnpm audit:doc-locations` | | n/a | |
| Citas de ADR | `pnpm audit:adr-citations` | | n/a | |
| Contexto de contenedores | `pnpm audit:docker-context` | | n/a | |

**Controles negativos ejecutados** (una guardia que nunca se probó fallando no es una guardia):

| Control | Qué se rompió a propósito | Falló como se esperaba | Revertido |
| --- | --- | --- | --- |

## 4. Criterios de aceptación

| Id | Criterio | Estado | Evidencia |
| --- | --- | --- | --- |
| CA-F{n}-01 | | Cumplido / No cumplido / **No cubierto** | |

**No cubierto** ≠ cumplido. Un criterio sin prueba se reporta como no cubierto, jamás se estima.

## 5. Deuda por severidad

| Id | Descripción | Severidad | Estado | Dueño | Plan de pago |
| --- | --- | --- | --- | --- | --- |
| | | Crítica / Alta / Media / Baja | Abierta / Pagada / Aceptada | AI-XXX | |

**Regla:** deuda **crítica** abierta al cierre de fase escala al CTO. Deuda **alta** acumulada sin plan de pago durante dos fases consecutivas también.

## 6. Bloqueos, consultas y desempates emitidos

| Marcador | De → A | Asunto | Bloqueante | Emitido | Resuelto | Resolución |
| --- | --- | --- | --- | --- | --- | --- |
| `[BLOQUEO]` / `[CONSULTA]` / `[DESEMPATE]` / `[ESCALACION AL CTO]` | | | Sí/No | | | |

Marcadores exactos, sin variantes. **`[ESCALACION AL CTO]` se escribe sin tilde** — es decisión de grep, no de ortografía.

## 7. Decisiones que requieren CTO

Formato de escalación: `Prioridad · Contexto · Opciones (máx. 3) · Recomendación · Decisión requerida antes de:`

Si no hay ninguna, escribir **"Ninguna"** explícitamente. Una sección vacía se lee como olvido.

## 8. Artefactos que esta fase deja superados

Si la fase invalida una spec, un contrato o una razón técnica documentada, **se marca superada en el mismo acto**. Dejar dos artefactos contradictorios vigentes es defecto bloqueante.

| Artefacto | Qué queda superado | Dónde se marcó |
| --- | --- | --- |

## 9. Campos contables de KPI

Datos, no valoraciones. Alimentan los KPIs del programa.

| Campo | Valor |
| --- | --- |
| Reescrituras mayores de PRD/HLD provocadas por esta fase | |
| Conflictos entre agentes emitidos | |
| Desempates requeridos | |
| Deuda crítica al cierre | |
| Deuda alta al cierre | |
| Hallazgos posteriores al merge atribuibles a esta fase | |
| Latencia del gate de esta fase (sesiones desde solicitud a resolución) | |
| Violaciones de boundary detectadas | |

## 10. Recomendación de gate

- **Gate solicitado:** G{n}
- **Recomendación:** GO / NO-GO / GO con deuda declarada
- **Aprueba:** AI-EM-ARCH — o **CTO** si es G1 o G7
- **Justificación:**

## 11. Actualizaciones realizadas en documentos vivos

- [ ] Checklist de la fase completo, con evidencia en cada `[x]`
- [ ] Fila de la fase actualizada en el [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)
- [ ] Sección correspondiente del [informe consolidado](INFORME-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) actualizada por AI-EM-ARCH
- [ ] `AGENTS.md` actualizado **solo si** se añadieron comandos nuevos
