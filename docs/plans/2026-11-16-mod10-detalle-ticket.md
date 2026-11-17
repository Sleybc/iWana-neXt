# MOD10 Mesa de ayuda · Detalle del ticket compacto · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** que la conversación del ticket quede a la vista al abrirlo, con estado y responsable editables sin salir de ella, sin perder ninguna propiedad, acción ni guarda.
**Spec:** [2026-11-16-mod10-detalle-ticket-ux](../specs/2026-11-16-mod10-detalle-ticket-ux.md) v1.0 (G0 2026-11-16)
**Launcher:** [PROMPT-MOD10-DETALLE-TICKET-LAUNCH-v1.0](../prompts/PROMPT-MOD10-DETALLE-TICKET-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §3, último párrafo.

## 1. Reglas

- `main` sin ramas; sin commit hasta que el usuario lo pida; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- El árbol tiene cambios sin commitear de otras sesiones, entre ellos `AssuranceClient.spec.tsx` y la migración tenant 214: no revertirlos ni reformatearlos, y revisar el índice antes de cualquier commit.
- Jest sin caché con conteo real; integración con `NODE_ENV=test DB_NAME=test E2E_TENANT_SLUG=test`; suite completa de la API si cambia un `@Module`.
- Las E2E usan el puerto 3002, que hoy ocupa el `pnpm dev` del usuario: acordar con él la ventana antes de correrlas.
- Sin Prettier sobre `docs/`.
- El paso 2 no lleva migración: si un bloque necesita cambiar el esquema, se detiene y avisa.
- Boundaries: Assurance lee nombres, visita y orden por los puertos de CRM, programación y tareas; nunca por sus tablas.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** No regresión | CA-1 | Línea base con conteo real de `apps/portal/src/components/{assurance,crm/subscribers,shared}`. Prueba de inventario de propiedades y acciones sobre el código actual, en los dos consumidores. Lista de las E2E que abren el panel o buscan sus textos (parten de `e2e/tests/portal-assurance.spec.ts`, `portal-assurance-adjuntos.spec.ts`, `portal-mod05-pestana-soporte.spec.ts`) | `sr-qa` |
| **DS** Densidad v1.1 | §5 | Congela nombres y clases de las dos props de `PortalFieldList` y `PortalFieldRow`, y el ancho del panel con riel (D5), como §8.6 de la [spec de la ficha](../specs/2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md); registra el cambio en `core-components` | `ds-owner` |
| **FE-DS** | §5 | Implementa v1.1 en `apps/portal/src/components/shared/portal-ui.tsx` con pruebas de componente; los consumidores actuales no cambian | `fe-platform` |
| **P1** Panel, paso 1 | §3 A–I, §4 | `AssuranceTicketDrawer.tsx`, `assurance-labels.ts`, `assurance-ui.tsx` (retira `AssuranceKeyValueItem`), sus specs; rótulos heredados en `AssuranceTicketsTable.tsx` y `AssuranceCreateTicketForm.tsx`. Orden interno: contenedor → propiedades → cabecera → visita y orden → hilo y redactor → mensajes → vocabulario | `fe-platform` |
| **QA1** | CA-1 a CA-9 | Inventario en verde tras P1; una prueba por guarda; medición en navegador a 1440×900 y 375 px con captura; axe en claro y oscuro; E2E de W0 actualizadas | `sr-qa` |
| **API** Datos, paso 2 | §5 datos, D4 | Pasada regla → campo con cruce de DTO y origen; contrato en `packages/shared`; proyección en el detalle del ticket (`apps/api/src/modules/assurance`): nombres, visita, orden y destinos de estado (`VALID_TRANSITIONS`); búsqueda de orden por número; OpenAPI | `sr-backend` (consulta `sec-eng`) |
| **P2a** Dirección propia | §3 K | Extrae el contenido del panel a un componente compartido; `?ticketId=` en `AssuranceClient.tsx`; ruta `apps/portal/src/app/dashboard/assurance/tickets/[id]/page.tsx`; «Abrir en página» | `fe-platform` |
| **P2b** Riel y enlaces | §3 J, L | Dos columnas con riel sobre el componente de P2a; nombres, estados y enlaces contra el contrato de API; buscador de orden | `fe-platform` |
| **QA2** | CA-10 a CA-12 | Medición del hilo; recarga y Atrás; nombre ausente con titular bloqueado; enlaces con y sin permiso; regresión de QA1 | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · DS | — |
| 2 | FE-DS → P1 (mismo agente, en secuencia) | DS congelado; W0 |
| 3 | QA1 · revisores · **punto de control con el usuario** | 2 |
| 4 | API · P2a | 3 (P2a no depende de API) |
| 5 | P2b | API congelado; P2a; D5 |
| 6 | QA2 · revisores · informe de cierre | 4–5 |

**Ruta crítica:** DS → FE-DS → P1 → QA1 → API → P2b → QA2. El paso 1 (olas 1–3) es entregable por sí solo.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA1, QA2 | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence`, `wcag-audit-patterns` | `verification-before-completion`; subagente `e2e-triage` si una E2E falla; `anthropic-skills:built-in-browser` para las mediciones (solo Claude Code) | `iwana-matriz-motivos` (no cruza MOD11↔MOD12) |
| DS | `ds-owner` | `core-components`, `iwana-identity-ui-review` | `tailwind-patterns` | `wcag-audit-patterns` (sin colores nuevos; el contraste de §8.4 sigue vigente) |
| FE-DS, P1, P2a, P2b | `fe-platform` | `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `system-vocabulary-review`, `iwana-identity-ui-review` | `testing-patterns`; `frontend-security-coder` en P2b (nombres y enlaces) | `i18n-localization` (sin catálogos ni formatos nuevos) |
| API | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `typescript-expert`, `testing-patterns` | `postgresql` (solo si la lectura pide índice) | `iwana-tenant-migration` (sin esquema nuevo), `bullmq-specialist` (sin colas), `auth-implementation-patterns` (no toca acceso) |
| Revisión | `test-change-reviewer` (P1, P2), `boundary-reviewer` y `contract-drift-reviewer` (API, P2b), `sec-eng` (API), `gate-verifier`, `docs-governance` (cierre) | `requesting-code-review` | — | — |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de P1, P2a y P2b.

## 5. Gates

- **Antes de FE-DS:** contrato de densidad v1.1 localizable por ruta y versión.
- **G6 del paso 1 (ola 3):** conteo ≥ línea base de W0; CA-1 a CA-9; primer comentario visible al abrir, con captura (CA-2 enmendada 2026-11-16); `audit-ui.mjs` sin hallazgos; `test-change-reviewer` sin ajustes sin motivo.
- **Punto de control:** el usuario ve el paso 1 en su portal antes de la ola 4.
- **Antes de P2b:** contrato de datos congelado tras la pasada regla → campo, y D4 resuelta.
- **G6 del paso 2 (ola 6):** CA-10 a CA-12; prueba de que el nombre no sale con titular bloqueado o suprimido; `sec-eng` y `boundary-reviewer` GO.
- **G6.5:** solo tras push autorizado y CI de `main` en verde; al emitir este plan estaba en rojo en `e22ce7e0`.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | `ds-owner` no admite dos columnas y el paso 1 no gana altura | Alternativa: barra de propiedades en línea, como otra disposición de la misma lista; CA-2 decide con medición |
| R2 | Regresión en la pestaña Soporte, segundo consumidor | CA-1 y CA-5 en ambos consumidores; su E2E entra en W0 (su caso de la línea 388 ya falla solo en `next dev`) |
| R3 | Los renombres rompen pruebas que buscan texto | W0 lista los archivos; cada expectativa cambiada pasa por `test-change-reviewer` |
| R4 | El nombre del titular se filtra pese al bloqueo | Nulo desde el servidor, prueba de gate y `sec-eng` |
| R5 | Cambios ajenos en el árbol | Regla de §1; nunca `git add -A` |
| R6 | «Todo» duplica comentarios con su evento del historial | Se omite el evento «comentario agregado» (spec §3 F), con prueba |

## 7. Cierre

Informe `docs/informes/INFORME-MOD10-DETALLE-TICKET-v1.0.md` con conteos, mediciones antes y después, y deudas. Frentes siguientes ya identificados, cada uno con su spec: bandeja con colas de trabajo y consola de la orden de ejecución.

## Lanzamiento

Espejo de [PROMPT-MOD10-DETALLE-TICKET-LAUNCH-v1.0](../prompts/PROMPT-MOD10-DETALLE-TICKET-LAUNCH-v1.0.md); el archivo prevalece si divergen.
