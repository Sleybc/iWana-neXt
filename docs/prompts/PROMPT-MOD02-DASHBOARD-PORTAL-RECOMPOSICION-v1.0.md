# PROMPT-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0

## Prompt de ejecución — recomposición del `/dashboard` del portal empresarial

**Versión:** 1.0
**Estado:** Emitido — **G4 cumplido**
**Fecha:** 2026-08-04
**Emite:** AI-EM-ARCH (modo Orchestrator)
**Etapa del workflow:** 4 → habilita etapa 5 ([protocolo v1.5](../roles/Protocolo_Colaboracion_Multiagente_v1.md) §3)
**Destinatarios:** AI-SR-FULL (track backend) · AI-FE-PLATFORM (track frontend) · AI-SR-QA (track calidad)

> Sin prompt de ejecución no hay implementación (protocolo §3, G4). Este documento es esa autorización, y **su alcance es cerrado**: lo que no está aquí no entra en la fase.

---

## 1. Declaración de contratos congelados (protocolo §3bis)

Los cuatro artefactos siguientes están **congelados**. Un track solo se detiene si **su** contrato cambia, y un cambio de contrato se coordina vía AI-EM-ARCH con adenda a este prompt — nunca se parchea en silencio.

| Contrato | Ruta | Versión / estado | Dueño |
| --- | --- | --- | --- |
| **HLD del módulo** | [`docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) | **v2.0.1 — G1 firmado** por AI-SR-FULL y AI-PROD-UX | AI-EM-ARCH |
| **Contrato de componente** | [`docs/specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) | **v1.0 — Congelado** | AI-DS-OWNER |
| **UX spec** | [`docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md) | **v1.0 — Congelada** | AI-PROD-UX |
| **Auditoría de origen** | [`docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md) | v1.0 — Vigente | AI-EM-ARCH |

**Contrato de API tipado:** no se congela uno nuevo. Los seis contratos de resumen que consume esta fase ya existen y están inventariados en HLD §4.2, **verificados guard por guard** por AI-SR-FULL (6 de 6 exactas). Lo que sí cambia es la **forma** del resumen del tenant — track A, paso A-3 — y ese cambio se publica antes de que el track C lo consuma.

**Dependencia resuelta (adenda del 2026-08-04):** [`ADR-075`](../adrs/ADR-075-Contrato-Capas-Z-Portal.md) fue **aprobado por el CTO** con el séptimo escalón incorporado. Por tanto **§7 del contrato de componente (capas z) pasa a ser ejecutable** y entra en el alcance de esta fase. El contrato de componente queda íntegramente vigente, sin apartados en espera.

---

## 2. Alcance exacto

### Entra

1. Corrección de la forma del resumen del tenant (los tres defectos de contrato de HLD §4.3).
2. Recomposición del inicio `/dashboard` de `apps/portal` conforme a la UX spec: bandas de prioridad, indicadores núcleo, composición por rol, franja de acciones, matriz de estados por bloque, política de refresco.
3. Sustitución de las cinco primitives reimplementadas y adopción del contrato `PortalDashboardMetric`.
4. Los cinco bloqueantes del gate G6 de la auditoría (B-1 a B-5).
5. Fase-1 de firma del shell del portal: barra lima del ítem activo, norma de sombras, foco normado, lienzo `iwana-neutral-50`.
6. Piezas del shell marcadas bloqueantes: tabulación del menú lateral cerrado en móvil y entrada al buscador global bajo 1024 px.
7. **Filtros en URL de los cuatro destinos** que hoy no los leen — sin esto CA-V2-05 no es verificable (ajuste A-3 de AI-PROD-UX).
8. Cobertura de pruebas de lo tocado, con la trazabilidad criterio↔test de HLD §10.
9. **Capas z (adenda del 2026-08-04, ADR-075 aprobado):** declarar los siete tokens `--z-*` en los estilos globales, migrar **por bloque** los doce valores en uso en las dos apps —revisando uno a uno los de cuatro y cinco cifras antes de asignarles capa— y activar la regla estructural que cubre **las dos formas de emisión**: utilidad de Tailwind y objeto de estilo en JavaScript.

### No entra — boundary cerrado (HLD §2.2)

Endpoints nuevos · fachada agregadora · series temporales y gráficas · facturación · dashboard componible · paleta de acciones ejecutable · sesión con cookie httpOnly y renderizado de datos en servidor · las 24 páginas restantes bajo `/dashboard` salvo el punto 7 · migración del lienzo en `apps/web` · ampliación de cualquier permiso de backend.

**Regla de cierre:** si aparece la necesidad de un dato que no está en HLD §4.2, **no se inventa ni se deriva**: se emite `[CONSULTA]` a AI-EM-ARCH y el bloque afectado se entrega con su estado de dato no disponible.

---

## 3. Tracks concurrentes

Corren en paralelo contra los contratos congelados. Solo hay **un** punto de sincronización.

### Track A — Backend (AI-SR-FULL)

Ejecuta el dictamen que ya emitiste, en tu propio orden recomendado, en un solo PR:

| # | Paso | Criterio de hecho |
| --- | --- | --- |
| A-1 | Asignar `fiberInstallationThresholdMeters` en el mapeador del resumen, con el mismo valor por defecto que el mapeador de configuración | El mismo campo del mismo tenant deja de valer cosas distintas en dos endpoints. Test que lo fija |
| A-2 | Calcular `mfaCoverage` con el conteo real, en la transacción de esquema ya abierta | `null` pasa a significar «no se pudo contar», igual que las otras métricas. Dos tests: con usuarios y sin usuarios |
| A-3 | **C-1 — estrechar el tipo**: tipo propio para `tenant` dentro del resumen con los 13 campos realmente servidos. `TenantSelfResponseDto` queda intacto para su endpoint | El contrato deja de mentir. La marca **sale** del resumen: ya la sirven dos contratos, y el layout del portal ya carga uno de ellos |
| A-4 | Añadir `@ApiProperty` y `type:` a las respuestas del resumen, en el mismo PR | Precedente en el repo: el DTO de resumen comercial. El contrato y el código se mueven juntos |

**Decisión de AI-EM-ARCH sobre tu `[CONSULTA]` C-a (ubicación del contrato en `packages/shared`):** **fuera de esta fase.** Tienes razón en la causa raíz — el contrato está escrito a mano en tres archivos sin nada que los ate, y el precedente correcto ya existe en el repo. Pero mover un contrato de módulo con la fase abierta cambia el boundary bajo los pies de dos tracks que ya corren contra él. Se registra como **deuda alta con dueño y fase propia**, y entra en el informe de fase como decisión tomada, no como olvido.

**Prohibido en este track:** ampliar cualquier `@Roles`. Ninguna casilla de la matriz de HLD §5.2 lo requiere ya — esa era la causa del `[BLOQUEO]` B-1, resuelto en la v2.0.1 partiendo el bloque en identidad y ficha operativa.

### Track B — Design system (AI-DS-OWNER)

Contrato ya congelado; en la fase solo actúas si un track pide una excepción. Dos encargos acotados:

| # | Encargo |
| --- | --- |
| B-1 | **Corrección de la medición de contraste (`[CONSULTA]` C-DS-02, aceptada).** Mediste `iwana-secondary-700` sobre blanco en **4,76:1**, no 6,2:1, y sobre `iwana-primary-50` en **4,49:1** — que **falla AA como texto** aunque cumple como icono. La cifra errónea está propagada en siete sitios, incluidos los tokens y cuatro archivos de la disciplina que audita. Corrígelos **como bloque**, no uno a uno: es el patrón P6 de ADR-056 §Segunda pasada, y parchear una línea suelta genera duplicados |
| B-2 | Regresión visual sobre tres módulos antes de que la norma de sombras toque los 53 consumidores del panel, con commit separable |

| B-3 | **Capas z — desbloqueado.** ADR-075 fue aprobado con tu séptimo escalón incorporado. §7 de tu contrato pasa a ejecutable: los valores que fijaste son los definitivos, y AI-FE-PLATFORM los declara y migra según el punto 9 del alcance. Tu `[CONSULTA]` C-DS-03 quedó incorporada al ADR §4 — la regla estructural cubre las dos formas de emisión |

**Sobre `--z-popover`:** aceptado, incorporado a ADR-075 por enmienda **previa** a la aprobación, y aprobado con ella. Tu propuesta es el primer caso de la regla §2 del ADR funcionando: un componente que no encajaba no inventó un número.

### Track C — Frontend (AI-FE-PLATFORM)

Arranca **ya**, contra los contratos congelados y mocks tipados derivados de ellos. No esperes al track A: solo el paso C-6 depende de él.

| # | Paso | Cierra |
| --- | --- | --- |
| C-1 | **Bloqueantes de accesibilidad primero.** Contraste del sustituto de valor de indicador en claro y oscuro; menú lateral cerrado fuera del orden de tabulación en móvil; regiones vivas y gestión de foco en carga y error | B-1, B-2, H-03, H-04, H-08 |
| C-2 | Sustituir las cinco primitives a mano por las reales del portal, según §3 del contrato de componente. **Esto cierra el P0 de tema oscuro por construcción**, no por parche: no uses `dark:bg-none` | H-01, H-05, H-08 |
| C-3 | Implementar `PortalDashboardMetric` y la matriz de estados del contrato §1–§2 | H-12, H-13, CA-V2-11 |
| C-4 | Recomponer el inicio según la UX spec: bandas, indicadores núcleo con destino y filtro, franja de acciones, composición por rol, estados por bloque, política de refresco | CA-V2-01…06 |
| C-5 | Firma del shell: barra lima del activo, norma de sombras, foco normado, lienzo. Buscador global bajo 1024 px | H-10, H-12, WCAG 1.4.1 |
| C-6 | **Punto de sincronización.** Sustituir mocks por el contrato real y ajustar el espejo del portal cuando el track A publique A-3 | H-16 |
| C-7 | Deduplicar las dos peticiones repetidas del envoltorio y los filtros en URL de los cuatro destinos del punto 7 | H-17, CA-V2-05 |

**Prohibido en este track:** inventar tokens o patrones (`[CONSULTA]` a AI-DS-OWNER); tocar backend; introducir dependencias npm nuevas — incluidas librerías de datos o de gráficas. Si crees que una hace falta, es `[CONSULTA]` bloqueante a AI-EM-ARCH, y probablemente un ADR.

### Track D — Calidad (AI-SR-QA)

Escribe contra criterios y contratos desde el inicio; corre al integrar.

| # | Paso |
| --- | --- |
| D-1 | **La prueba que impide la reincidencia:** auditoría automatizada de accesibilidad en tema claro **y oscuro**, sobre los cuatro estados de CA-V2-07. La lección de la auditoría es literal: la pantalla no tenía una sola aserción en modo oscuro, y ahí vivía su peor defecto |
| D-2 | Unidad del indicador con valor nulo — es la mitigación del riesgo Crítico HLD-DE-04, que existía en código y nunca tuvo test |
| D-3 | Unidad de la composición por rol, cubriendo los 12 valores del enum (CA-V2-01, CA-V2-02) |
| D-4 | Recorrido de teclado a 375 px con el menú cerrado (CA-V2-08) |
| D-5 | Recorrido funcional por rol representativo: administradora, operador de red, comercial y un rol de vista base |
| D-6 | **Sustituir los selectores frágiles** de la suite E2E actual que seleccionan por texto exacto: se rompen al multiplicar indicadores numéricos (riesgo HLD-DE-08). Usa roles accesibles |
| D-7 | Verificar que el trinquete de cobertura no retrocede. El umbral ya existe y es capaz de fallar — AI-PLAT-OPS lo dejó verificado |

---

## 4. Restricciones transversales

- **Multi-tenancy:** tenant desde JWT verificado, nunca desde entrada. `SET LOCAL search_path` por transacción. Sin acceso directo a tablas de otro módulo.
- **Sin PII** real ni credenciales en código, tests, fixtures, logs ni documentos.
- **Español**, sentence case, sin valores de enumeración crudos a la vista (H-09 se cierra en el track C con derivación a la disciplina de vocabulario).
- **Migraciones:** esta fase no debería necesitar ninguna. Si aparece una, es reversible y su `down()` se ejercita.
- **Citas normativas:** ADR-075 está **Aprobado** desde el 2026-08-04 y se cita sin marcador; el HLD v1.0 se cita con `(superado)`. `pnpm audit:adr-citations` es bloqueante en CI.
- **Evidencia de pruebas:** un `pnpm test` en verde no prueba que corrieron. El reporte adjunta la línea de Turborepo con `Cached: 0` o la corrida forzada.

---

## 5. Entregables por track

| Track | Entregable | Destino |
| --- | --- | --- |
| A | PR de backend + reporte de fase | Código + `docs/informes/` |
| B | Corrección en bloque de la cifra de contraste + dictamen de regresión visual | Tokens, disciplina, chat |
| C | PR de frontend + reporte de fase | Código + `docs/informes/` |
| D | Suite nueva + reporte de calidad con trazabilidad criterio↔test | Código + `docs/informes/` |
| — | Informe de fase consolidado | AI-EM-ARCH → `docs/informes/` |

---

## 6. Criterio stop / go

### Stop — detén el track y emite `[BLOQUEO]` a AI-EM-ARCH antes de cerrar la sesión

- Necesitas un dato que no está en HLD §4.2.
- Necesitas ampliar un permiso de backend.
- Necesitas un token o patrón que el contrato de componente no cubre.
- Necesitas una dependencia npm nueva.
- Un contrato congelado resulta contradictorio con otro.
- Descubres que un criterio de aceptación no es verificable tal como está escrito.

**Nunca asumas para «seguir avanzando».** El bloqueo silencioso es el anti-patrón que el protocolo persigue en todo el sistema.

### Go — condición de cierre de la fase (gate G6)

1. Los cinco bloqueantes B-1 a B-5 de la auditoría, cerrados con evidencia.
2. Los criterios CA-V2-01 a CA-V2-12 verificados, cada uno con su prueba.
3. Lint y typecheck en verde; boundaries del Modulith sin violaciones.
4. Trinquete de cobertura sin retroceso, con prueba de corrida real.
5. Revisión de identidad de AI-DS-OWNER y revisión de experiencia de AI-PROD-UX: sin bloqueantes abiertos.
6. `pnpm audit:adr-citations` en `BLOQUEANTE: 0` y `pnpm audit:doc-locations` sin bloqueantes.
7. Informe de fase con deuda por severidad, decisiones pendientes y consultas abiertas.

**G6.5 y G7 no se anticipan.** G6.5 exige una corrida Linux de CI identificada por SHA; G7 exige recomendación de AI-EM-ARCH y aprobación del CTO. Se registran por separado y ninguno se obtiene por cumplir el anterior (ADR-069).

---

## 7. Decisiones ya tomadas — no reabrir

| Asunto | Decisión | Quién |
| --- | --- | --- |
| Alcance | Recomposición con datos existentes | CTO, 2026-08-04 |
| Lienzo del portal | `iwana-neutral-50`, token existente | CTO, 2026-08-04 |
| Capas z | ADR-075 **Aprobado** el 2026-08-04, con séptimo escalón | CTO |
| Umbral de cobertura | Trinquete en el suelo medido, ya aplicado | CTO → AI-PLAT-OPS |
| Consolidar indicador y panel en el portal | Autorizada — `[DESEMPATE]` D-1 | AI-EM-ARCH |
| Fan-out en cliente, sin fachada agregadora | Confirmada por AI-SR-FULL con tres razones técnicas | AI-EM-ARCH |
| Contrato de tenant en `packages/shared` | Fuera de esta fase, deuda alta con fase propia | AI-EM-ARCH |
| Marca fuera del resumen del dashboard | Se resuelve por los contratos que ya la sirven | AI-EM-ARCH sobre dictamen de AI-SR-FULL |

## 8. Fuera de esta fase, ya escalado

- **El límite de tasa global del API no está cableado** — `APP_GUARD` no aparece en todo el API, y tres documentos afirman un control que no existe. Escalado al CTO en HLD §11, destinatarios AI-SEC-ENG y AI-PLAT-OPS. **No lo toques desde este prompt.**
- **CI no ejecuta cobertura de ninguna app** — el trinquete es exigible localmente y bajo demanda, no en CI. Decisión de topología de pipeline pendiente de AI-EM-ARCH con AI-PLAT-OPS.
- Sesión con cookie httpOnly; ampliación de auditoría al rol auditor; unificación de los cuatro vocabularios de acento del sistema de diseño.

---

**Emitido por AI-EM-ARCH el 2026-08-04.** Cualquier cambio a un contrato congelado durante la fase llega por adenda a este prompt, citando ruta y versión nueva y nombrando los tracks afectados. Un track no afectado no se detiene.

---

## Adenda operativa — 2026-08-10 (AI-EM-ARCH)

**Propósito:** enlazar el plan canónico de ejecución sin alterar el alcance v1.0 de este prompt (G4 permanece cumplido; no se reabre boundary).

| Artefacto | Ruta | Rol |
| --- | --- | --- |
| Plantilla base (en revisión) | [`docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) | Formato de referencia; la obligatoriedad de destino la respalda `AGENTS.md` |
| Plan canónico (checklist vivo) | [`docs/plans/2026-08-10-mod02-dashboard-portal-recomposicion.md`](../plans/2026-08-10-mod02-dashboard-portal-recomposicion.md) | Única fuente de avance por ID; estados `Pendiente` / `En curso` / `Bloqueado` / `Hecho` / `No aplica` |
| Informe vivo de recomposición | [`docs/informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md) | Resultados, evidencia, deuda y gates; no replica todas las casillas del plan |

**Reglas del checklist (plan §3):** cada agente edita solo las casillas de su track; AI-EM-ARCH custodia dependencias, bitácora append-only y gates; `Hecho` exige prueba ejecutada + ruta de evidencia + SHA o PR; tests heredados del baseline v1 no cierran track.

**Responsables:** AI-SR-FULL (A) · AI-DS-OWNER (contrato B) / AI-FE-PLATFORM (código B+C+shell) · AI-SR-QA (D) · AI-EM-ARCH (documentación y consolidación G6).

**Evidencia P1 — desbordamiento en accesos rápidos:** el hallazgo de grilla/contador como quinta celda y celdas deshabilitadas en `QuickActionsPanel` (auditoría H-05/H-07 y revalidación 2026-08-10) se corrige estructuralmente en el plan Task 4 (C-11): lista de una columna con `PortalNavListRow`, sin `truncate` como parche, sin badge/contador ni celdas deshabilitadas.

**Sincronización A-3 → C-5/C-6:** el track C arranca con mocks tipados; solo sustituye el tipo real de `tenant` tras SHA publicado de A-3 (custodia AI-EM-ARCH).
