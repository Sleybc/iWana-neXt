# CHECKLIST — Plataforma · Experiencia de arranque · F0 congelar contratos

**Fecha de apertura:** 2026-08-09
**Estado:** Abierto
**Prompt:** [PROMPT-PLATAFORMA-ARRANQUE-F0-v1.0.md](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F0-v1.0.md)
**Informe:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F0-v1.0.md`
**Responsables:** AI-SR-FULL (C1) · AI-DS-OWNER (C3) · AI-PROD-UX (C4) · AI-SEC-ENG (dictamen)
**Tablero:** [CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)

---

## Protocolo de actualización en vivo

Aplica a todos los checklists de este frente. No es orientativo.

1. **Marca `[x]` en el mismo commit que entrega el ítem.** Nunca al final de la fase de una sola vez.
2. **Todo `[x]` lleva evidencia citable** en la misma línea o en la tabla de evidencia: ruta de archivo, nombre de prueba, o comando con su salida. **Un `[x]` sin evidencia es defecto bloqueante**, no cuestión de estilo.
3. **Un ítem que no se puede cerrar no se borra ni se reescribe.** Se deja `[ ]` y se abre `[BLOQUEO]` en §Pendientes, con destinatario AI-EM-ARCH. Un marcador emitido y no atendido **no caduca: escala**.
4. **No marques ítems de otra fase ni de otro agente**, aunque los veas cumplidos. Repórtalo como `[CONSULTA]` en §Pendientes.
5. **Al cerrar tu fase, actualiza tu fila del tablero** y no toques el resto.
6. **Toda evidencia de suite adjunta la línea de resumen de Turbo con `Cached: 0`.** Un `pnpm test` verde no prueba que los tests corrieron.

---

## 1. Contrato C1 — API de estado de arranque · AI-SR-FULL

- [ ] `packages/shared/src/contracts/system/boot-status.contract.ts` creado con la forma del HLD §5
- [ ] Exportado desde `packages/shared/src/index.ts`
- [ ] `calculateBootPercent` es función pura, sin dependencias, con tabla de pesos exportada
- [ ] Los pesos suman exactamente 100 — con prueba que lo asserta *(CA-F0-03)*
- [ ] Prueba de forma: el conjunto de claves serializadas es exactamente el del DTO *(CA-F0-02)*
- [ ] Prueba de forma verificada con **control negativo**: añadir una clave la hace fallar *(CA-F0-02)*
- [ ] Prueba de monotonía: avanzar el estado de un componente nunca reduce el porcentaje *(CA-F0-04)*
- [ ] Prueba del caso `phase === 'ready'` → lista de componentes vacía *(CA-F0-05)*
- [ ] Ningún identificador de componente nombra un producto o motor concreto *(CA-F0-06)*
- [ ] `pnpm --filter @iwana/shared build` y `typecheck` en verde
- [ ] **No se implementó el endpoint** — eso es F2

## 2. Contrato C3 — design system del medidor no-React · AI-DS-OWNER

- [ ] `docs/specs/2026-08-09-arranque-sistema-ds-contrato.md` publicado, estado **Congelado**, versión 1.0
- [ ] Lista **cerrada** de variables CSS autorizadas
- [ ] Cada variable verificada una a una contra `packages/ui/src/styles/globals.css` *(CA-F0-07)*
- [ ] Geometría del medidor especificada por equivalencia con `ProgressMeter.tsx`
- [ ] Comportamiento en tema claro y oscuro especificado
- [ ] **Equivalencia visual con `ProgressMeter.tsx` declarada y firmada** *(CA-F0-08)*
- [ ] Criterio de la prueba anti-deriva definido para que F3 lo implemente
- [ ] Cabecera de spec completa: entradas leídas con su marcador de estado, y deslinde de dominio
- [ ] **No se escribió código**

## 3. Contrato C4 — UX y copy · AI-PROD-UX

- [ ] `docs/specs/2026-08-09-arranque-sistema-ux-spec.md` publicado, estado **Congelado**, versión 1.0
- [ ] Diez identificadores de paso fijados con copy en español *(CA-F0-09)*
- [ ] Pesos de los pasos suman 100 *(CA-F0-09)*
- [ ] Copy de los siete componentes, con **vocabulario genérico sin nombre de producto** *(CA-F0-06)*
- [ ] Copy de las tres pistas para cada estado no listo: orientan sin diagnosticar
- [ ] Copy de cierre de terminal — indica **dónde** está la credencial, nunca su valor
- [ ] Estado final de la pantalla antes de redirigir, especificado
- [ ] Skill `system-vocabulary-review` aplicada
- [ ] Comportamiento accesible especificado: nombre accesible, región activa, foco
- [ ] Ningún enum crudo en texto visible

## 4. Dictamen de seguridad sobre C1 · AI-SEC-ENG

- [ ] Ningún componente nombra un producto o motor concreto
- [ ] No existe estado `failed` ni campo de texto libre
- [ ] La respuesta en régimen estable no reporta componentes
- [ ] El componente de identidad no revela si existe cuenta de administrador
- [ ] Sin versiones, hostnames, puertos, nombres de schema, conteos de migración ni de tenant, marcas de tiempo de arranque, uptime ni identificador de build
- [ ] La forma admite caché y no obliga a exponer nada por unicidad de respuesta
- [ ] **Dictamen emitido** (viable / viable con ajustes / inviable) y registrado en el informe *(CA-F0-10)*

## 5. Gobernanza documental

- [ ] `pnpm audit:doc-locations` en verde *(CA-F0-11)*
- [ ] `pnpm audit:adr-citations` en `BLOQUEANTE: 0` *(CA-F0-11)*
- [ ] Toda cita de ADR no aprobado lleva su marcador `(propuesto)` / `(en revisión)` / `(superado)`
- [ ] `git status` sin cambios en `apps/`, `scripts/`, `nginx/` ni `docker-compose*.yml`
- [ ] Informe de fase archivado desde la plantilla
- [ ] Fila F0 del tablero actualizada

---

## Evidencia automatizada

| Suite / comando | Resultado | `Cached: 0` | Fecha |
| --- | --- | --- | --- |
| `pnpm --filter @iwana/shared test` | pendiente | — | — |
| `pnpm --filter @iwana/shared build` | pendiente | — | — |
| `pnpm typecheck` | pendiente | — | — |
| `pnpm audit:doc-locations` | pendiente | n/a | — |
| `pnpm audit:adr-citations` | pendiente | n/a | — |

---

## Pendientes, bloqueos y consultas

*(Formato: `[BLOQUEO]` / `[CONSULTA]` / `[DESEMPATE]` · De: AI-XXX → A: AI-EM-ARCH · Contexto · Pregunta o causa · Bloqueante: Sí/No · Supuesto mientras tanto)*

- Ninguno al momento de la apertura.

## Salida de fase

- [ ] Los tres contratos congelados con artefacto localizable y versión declarada
- [ ] AI-EM-ARCH declara C1, C3 y C4 congelados **citando ruta y versión** en los prompts de F1, F2 y F3
