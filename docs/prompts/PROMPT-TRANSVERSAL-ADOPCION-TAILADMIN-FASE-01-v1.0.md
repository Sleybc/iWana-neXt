# PROMPT — Ejecucion de Fase: Adopcion TailAdmin Fase 01

**Version:** 1.0
**Estado:** Generado — Listo para ejecucion
**Fecha:** 2026-03-13
**Generado por:** Engineering Manager (AI-EM-ARCH)

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- Archivo destino: `docs/prompts/PROMPT-TRANSVERSAL-ADOPCION-TAILADMIN-FASE-01-v1.0.md`
- Convencion documental: `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`
- PRD base: `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md`
- Stack de referencia: `docs/prds/Stack_Tecnologico.md`
- ADRs aplicables: `docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md`, `docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md`
- HLD base: `docs/hlds/HLD-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md`
- Plan aplicable: `docs/sprints/PLAN-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md`
- Prompt arquitectonico origen: `docs/prompts/PROMPT-ARCHITECT-TRANSVERSAL-ADOPCION-TAILADMIN.md`
- Referencia prototipo local: `docs/prototipo/tailadmin/src/partials/header.html`, `docs/prototipo/tailadmin/src/partials/sidebar.html`

---

## Modulo

- Nombre: Adopcion transversal de TailAdmin para dashboard shell
- Codigo: TRANSVERSAL
- Fase: ADOPCION-TAILADMIN-FASE-01
- Version: 1.0
- Fecha: 2026-03-13
- Generado por: Engineering Manager (AI-EM-ARCH)
- Nombre de archivo destino: `docs/prompts/PROMPT-TRANSVERSAL-ADOPCION-TAILADMIN-FASE-01-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** dejar operativo el shell base compartido de dashboard para `apps/web` y `apps/portal`, alineado a la referencia TailAdmin pero implementado de forma nativa en React y coherente con la identidad iWana.
- **Lo que si entra:** sidebar con colapso desktop y drawer mobile, top header sticky, buscador claro, dark mode funcional, dropdown de usuario accesible, normalizacion de tokens o estilos necesarios para el shell, limpieza de clases fantasma o inconsistentes.
- **Lo que no entra:** charts productivos, busqueda global real, tablas avanzadas de dominio, integracion backend nueva, rediseño de widgets complejos del dashboard.

## 2. Artefactos de entrada obligatorios

- PRD del sistema: `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md`
- HLD de la adopcion: `docs/hlds/HLD-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md`
- ADRs aplicables: `docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md`, `docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md`
- Plan aplicable: `docs/sprints/PLAN-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md`
- Prompt arquitectonico origen: `docs/prompts/PROMPT-ARCHITECT-TRANSVERSAL-ADOPCION-TAILADMIN.md`
- Artefactos de referencia visual: `docs/prototipo/tailadmin/src/partials/header.html`, `docs/prototipo/tailadmin/src/partials/sidebar.html`, `docs/plans/2026-03-12-frontend-prototype-design.md`
- Artefactos faltantes detectados: ninguno bloqueante para Fase 01

## 3. Instrucciones para Sr. Dev Fullstack

1. Refactorizar el shell base de `apps/web` y `apps/portal` para que ambos compartan el mismo patron de sidebar, header y menu de usuario.
2. Separar estado de colapso desktop y estado de drawer mobile; no usar una sola bandera booleana para ambos comportamientos.
3. Implementar persistencia local del estado desktop del sidebar.
4. Implementar dark mode funcional dentro del stack vigente. Si se requiere dependencia auxiliar de theming compatible con Next.js, documentarla en el informe de fase.
5. Normalizar estilos necesarios para soportar el shell, evitando copiar nombres de clase del prototipo HTML cuando no existan en el tema real.
6. Mantener la marca iWana y no portar la paleta default de TailAdmin.
7. Asegurar accesibilidad minima: `aria-expanded`, `aria-controls`, cierre por `Escape`, cierre por click externo, foco visible.
8. Mantener comentarios en espanol cuando la logica no sea trivial.
9. Actualizar el informe vivo de esta fase en `docs/informes/INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md`.

## 4. Restricciones no negociables

- No cambiar el stack base aprobado.
- No copiar codigo HTML + Alpine.js como implementacion productiva.
- No romper App Router ni la separacion entre `apps/web` y `apps/portal`.
- No introducir PII, secretos ni datos reales.
- No abrir la fase de widgets de dashboard antes de cerrar el shell base.

## 5. Entregables tecnicos obligatorios

- Shell base actualizado en `apps/web`
- Shell base actualizado en `apps/portal`
- Normalizacion de estilos o provider de tema necesarios
- Typecheck en verde para ambas apps
- Validacion manual desktop/mobile del shell

## 6. Entregables documentales obligatorios

- Actualizacion del informe vivo en `docs/informes/INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md`
- Evidencia de calidad en `docs/quality/` solo si se detecta bloqueo o excepcion
- Si aparece necesidad de cambio de stack o patron no cubierto por ADR-023, documentar bloqueo y escalar

## 7. Criterios de aceptacion

- CA-TA-001: `apps/web` y `apps/portal` comparten el mismo patron de shell para sidebar, header y menu de usuario.
- CA-TA-002: el sidebar colapsa en desktop y se comporta como drawer overlay en mobile.
- CA-TA-003: el dark mode cambia realmente el tema.
- CA-TA-004: el buscador tiene jerarquia visual clara y consistente con la referencia.
- CA-TA-005: el menu de usuario abre, cierra y responde a `Escape` y click externo.
- CA-TA-006: typecheck pasa para ambas apps sin introducir errores nuevos ligados a la fase.

## 8. Criterio de stop/go

- Detenerse inmediatamente si la fase exige cambio de stack, boundary o patron estructural no cubierto por ADR-023.
- Documentar causa en el informe vivo y, si corresponde, en un artefacto de bloqueo tecnico.
- Escalar a: CTO
- Recomendacion esperada: confirmar si la excepcion se aprueba o si debe mantenerse el alcance dentro del stack vigente.

## 9. Criterio de salida de la fase

- Backend validado: no aplica
- Frontend validado: shell base funcional en ambas apps
- Base de datos validada: no aplica
- Tests en verde: typecheck y validacion manual minima completados
- Documentacion archivada: informe vivo actualizado

---

_Prompt generado por: AI-EM-ARCH (Engineering Manager + Architect) — iWana neXt Platform_