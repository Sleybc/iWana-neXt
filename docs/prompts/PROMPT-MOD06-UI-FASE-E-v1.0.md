# PROMPT DE EJECUCIÓN — MOD06 Comercial, Fase E: cierre de identidad y accesibilidad

**Versión:** 1.0
**Fase:** E — remediación posterior a la auditoría de segunda capa
**Emitido por:** AI-EM-ARCH · 2026-07-22
**Agentes destinatarios:** AI-FE-PLATFORM (hallazgos 1–7, 9–12) · AI-PROD-UX (hallazgos 8 y 9, decisión previa) · AI-DS-OWNER (consulta, hallazgos 1 y 3) · AI-SR-FULL (hallazgo 8, si exige datos nuevos) · AI-SR-QA (verificación)

> **Orden de ejecución.** Los hallazgos 1–7 son de cumplimiento y pueden ejecutarse ya. Los hallazgos 8 y 9 exigen decisión de producto **antes** de tocar código: si se implementan por criterio de frontend, se reproduce el defecto con otra forma. Los hallazgos 10 y 12 se resuelven dentro de esa decisión, no por separado.
**Informe origen:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.1](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.1.md)
**Skill obligatoria:** `.agents/skills/iwana-identity-ui-review` (modo diseño)
**Prioridad:** los dos P1 bloquean el cierre de identidad del módulo

---

## Contexto

Las fases A–D dejaron el módulo comercial alineado al contrato `portal-ui`. Una auditoría de segunda capa —ejecutada por AI-EM-ARCH, no leída del informe del productor— encontró **7 hallazgos vivos** que la revisión anterior no cubrió, dos de ellos P1.

El puntaje real de la pantalla es **51/100** (banda: *requiere trabajo antes de cerrar*), no el ≈97 declarado en el informe v1.1.

La auditoría se ejecutó en tres pasadas y conviene decir por qué, porque afecta cómo debe leerse este prompt. La primera fue una revisión de cumplimiento de código —script de auditoría, tokens, reglas duras— y arrojó 86/100. La segunda abrió los managers que la primera no había leído y bajó a 69. La tercera definió la tarea del usuario y evaluó arquitectura de información, accionabilidad y semántica del color: 51.

**La caída no significa que el módulo empeore, sino que las dos primeras pasadas midieron cumplimiento y lo presentaron como diseño.** Los hallazgos 8–12 no son grep-ables: ningún script los detecta, y por eso sobrevivieron a las fases A–D.

| Severidad | Cantidad | Origen |
| --- | --- | --- |
| P0 | 0 | — |
| P1 | 3 | 2 de cumplimiento · 1 de UX |
| P2 | 5 | 3 de cumplimiento · 2 de identidad/IA |
| P3 | 4 | 2 de cumplimiento · 2 de consistencia visual |

## Hallazgo 1 — [P1][Accesibilidad] `PortalSidePeek` sin gestión de foco

**Evidencia:** `apps/portal/src/components/shared/portal-ui.tsx:260-324`.

El componente declara `role="dialog"` y `aria-modal="true"`, pero no implementa ninguna de las tres garantías que esos atributos prometen al lector de pantalla:

- No mueve el foco al panel cuando abre.
- No confina el Tab dentro del panel (se puede tabular hacia la tabla de fondo, que sigue siendo interactiva).
- No cierra con `Escape`.

**Por qué es P1 y no P2:** el primitive ya está consumido por **cuatro** flujos de creación (combos, promociones, compatibilidad, planes). Cada consumidor nuevo hereda el defecto. Un atributo ARIA que promete un comportamiento que el componente no cumple es peor que no declararlo: el lector de pantalla anuncia "diálogo modal" y el usuario de teclado descubre que no lo es.

**Recomendación (decisión de arquitectura, no preferencia):** envolver `@radix-ui/react-dialog` conservando el shell visual actual (`max-w-lg`, header/footer, `shadow-iwana-soft`, `portal-eyebrow`). Radix ya resuelve focus trap, Escape, scroll lock y restauración de foco al cerrar, y **ya es la base del `Dialog` de `@iwana/ui`** — el precedente existe en el repo, no se introduce dependencia nueva.

Si AI-FE-PLATFORM considera que la envoltura rompe el layout de side peek (Radix centra por defecto), el fallback aceptable es implementación manual con `useEffect` de foco inicial, `onKeyDown` para Escape y confinamiento de Tab. **En ese caso el fallback debe justificarse por escrito**, porque implica mantener código de accesibilidad propio.

**Consulta obligatoria a AI-DS-OWNER** antes de ejecutar: `PortalSidePeek` es contrato del design system, y cambiar su implementación base afecta a todo consumidor futuro.

**Esfuerzo:** M

## Hallazgo 2 — [P1][Usabilidad] Promociones sin columna Estado

**Evidencia:** `apps/portal/src/components/commercial/PromotionsManager.tsx:317-323` — la tabla expone Promoción, Código, Descuento, Alcance, Usos, Vigencia y Acciones. **No hay columna Estado**, y el componente no importa `getPortalActiveBadgeVariant` (verificado: 0 ocurrencias).

**Por qué importa:** el encabezado del panel muestra un badge *"N activas"*, pero la tabla lista **todas** las promociones —activas e inactivas— sin distinguirlas. El único indicio de estado es que el botón «Desactivar» aparece deshabilitado… y ese botón **solo se renderiza si `canEdit` es verdadero**. Para un usuario de solo lectura la señal de estado es **cero**: ve una promoción desactivada y no tiene forma de saberlo.

**Esto es una regresión de alcance, no un hallazgo nuevo.** El informe v1.1 declara cerrado el P1 *"Estado de plan oculto en solo lectura → columna Estado siempre visible"*. La corrección se aplicó a planes y no se propagó al resto. De las 7 tablas del módulo, 5 tienen Estado, 1 no lo necesita (`TaxCatalogManager` filtra `isActive: true` en servidor, `TaxCatalogManager.tsx:141`) y **promociones quedó fuera**.

**Recomendación:** añadir columna Estado con `<Badge variant={getPortalActiveBadgeVariant(promotion.isActive)}>` siguiendo exactamente el patrón de `BundlesManager.tsx:332-336`. Ubicarla antes de Acciones, fuera del condicional `canEdit`.

**Esfuerzo:** S

## Hallazgo 3 — [P2][Accesibilidad] `scope="col"` presente en una sola tabla

**Evidencia:** `apps/portal/src/components/commercial/catalog/PlanCatalogPanel.tsx:650-666` usa `<th scope="col">`. Las otras 6 tablas del módulo (`BundlesManager`, `PromotionsManager`, `CompatibilityRulesManager`, `TaxApplicationRulesManager`, `TaxCatalogManager`, `AdditionalProductsPanel`, `AdditionalServicesPanel`) omiten el atributo.

**Impacto:** en tablas simples el navegador infiere el ámbito, así que el daño real es bajo — pero la inconsistencia indica que la corrección se aplicó una vez y no se propagó, el mismo patrón del hallazgo 2. El token `portalDataTableHeadClassName` no puede imponer `scope` porque es una cadena de clases, no un componente.

**Recomendación:** añadir `scope="col"` en las 6 tablas restantes. **Evaluar** con AI-DS-OWNER si conviene promover un componente `PortalDataTableHead` que lo imponga por construcción — un token de clases no puede garantizar semántica HTML, y esa es exactamente la clase de regla que se pierde al copiar tablas.

**Esfuerzo:** S (propagación) / M (si se decide promover el componente)

## Hallazgo 4 — [P2][Ingeniería frontend] `DatePicker` reestilizado a mano

**Evidencia:** `apps/portal/src/components/commercial/CompatibilityRulesManager.tsx:536` —
`buttonClassName="h-11 rounded-2xl border-gray-200 bg-white px-4 text-sm text-gray-800 shadow-sm dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100"`.

Es la única ocurrencia del módulo: el resto de `DatePicker` usan el estilo por defecto del componente. Reproduce a mano lo que `portalFieldClassName` (`portal-ui.tsx:117`) ya define, y si el token cambia esta instancia queda huérfana.

**Recomendación:** sustituir por `buttonClassName={portalFieldClassName}`. Si el resultado visual difiere del resto de campos del formulario, ese es el defecto real a corregir y debe reportarse — no compensarse con clases locales.

**Esfuerzo:** S

## Hallazgo 5 — [P2][Ingeniería frontend] ID estático en `PortalSidePeek`

**Evidencia:** `portal-ui.tsx:285` (`aria-labelledby="portal-side-peek-title"`) y `:295` (`id="portal-side-peek-title"`).

Si dos instancias coexisten en el DOM, el ID duplica y `aria-labelledby` apunta al elemento equivocado. Hoy los tabs desmontan el panel inactivo, así que la probabilidad es baja — pero el contrato del primitive no lo garantiza, y el consumidor siguiente no tiene por qué saberlo.

**Recomendación:** `const titleId = useId();` y usarlo en ambos puntos. Resolver junto con el hallazgo 1 (mismo archivo, misma función).

**Esfuerzo:** S

## Hallazgo 6 — [P3][Seguridad/Ingeniería] `console.error` con el objeto de error completo

**Evidencia:** 6 ocurrencias —
`catalog/AdditionalProductsPanel.tsx:232,304,323` y `catalog/AdditionalServicesPanel.tsx:213,285,304`.

Los errores **ya** se comunican al usuario vía `setLoadError`/`setActionError` y `PortalAlert`. El `console.error` adicional vuelca el objeto completo del error de API a la consola del navegador. No hay PII, pero sí estructura interna de la API.

**Recomendación:** eliminar las 6 líneas. No sustituir por un logger salvo que exista instrumentación de observabilidad en el portal (verificar antes; si no existe, eliminar y ya).

**Esfuerzo:** S

## Hallazgo 7 — [P3][UX] Feedback de éxito inconsistente entre managers

**Evidencia:** `BundlesManager`, `PromotionsManager`, `AdditionalProductsPanel` y `AdditionalServicesPanel` mantienen estado `successMessage` y muestran `PortalAlert variant="success"` tras crear o desactivar. `CompatibilityRulesManager`, `TaxApplicationRulesManager` y `TaxCatalogManager` **no confirman nada**: la acción ocurre y la tabla se recarga en silencio.

**Impacto:** en una tabla larga, recargar sin confirmar deja al operador sin señal de que su acción surtió efecto. Es el mismo flujo (crear / desactivar) resuelto de dos maneras dentro del mismo módulo.

**Recomendación:** unificar hacia el patrón que ya existe (`BundlesManager.tsx:270-287`). Si al implementarlo el patrón resulta idéntico en los 7 managers, **repórtalo**: es candidato a promoción a `portal-ui` y esa decisión es de AI-DS-OWNER, no de esta fase.

**Esfuerzo:** M

---

# Hallazgos de UX e identidad (pasada 3)

Los cinco siguientes salieron de definir la tarea principal del operador y evaluar la pantalla contra ella. **Requieren decisión de producto antes que código**, y por eso su destinatario principal no es AI-FE-PLATFORM.

## Hallazgo 8 — [P1][UX] El resumen comercial no resuelve ninguna tarea

**Destinatario:** AI-PROD-UX (especificación) · AI-EM-ARCH (aprobación) · AI-SR-FULL (endpoints, si aplica)

**Evidencia:** `apps/portal/src/components/commercial/CommercialDashboard.tsx:19-107` — las 7 tarjetas del `KPI_ITEMS` son la misma métrica repetida: conteo de activos sobre total (`activePlansCount / plansCount`, `activeProductsCount / productsCount`, …).

**El problema:** es la vista por defecto del módulo (`commercial-tab-params.ts:35` — `tab: 'summary'`), y no contesta ninguna pregunta operativa real: qué promoción vence esta semana, qué plan quedó sin precio o sin regla tributaria, qué cambió desde la última sesión, dónde hay algo incompleto. Muestra **cuántas cosas hay**, no **qué hacer**.

Funciona como un índice de contenidos renderizado en formato KPI: reexpone la información que la propia barra de tabs ya comunica. El criterio de cierre de la skill es explícito — *"La primera vista muestra qué se puede hacer y dónde actuar"*.

**Por qué es P1:** el costo se paga en cada visita al módulo, por cada operador. No bloquea la tarea, pero la vista que debería orientar no orienta.

**Qué se pide, en este orden:**

1. **AI-PROD-UX** define las 3–5 preguntas que el resumen debe contestar, ancladas en el PRD de MOD06 y en la operación ISP real (vigencias, completitud de catálogo, cambios recientes). Entregable: especificación de UX, no mockup de alta fidelidad.
2. **AI-EM-ARCH** aprueba la especificación contra el PRD.
3. **AI-SR-FULL** evalúa qué exige el contrato de `getDashboardSummary()` — es previsible que las preguntas accionables necesiten datos que hoy no se calculan.
4. **AI-FE-PLATFORM** implementa contra la especificación aprobada.

**No ejecutar el paso 4 sin los pasos 1–2.** Rediseñar el resumen por criterio de frontend reproduce el defecto con otra forma.

**Esfuerzo:** L

## Hallazgo 9 — [P2][Usabilidad] La navegación y el dashboard enseñan modelos mentales distintos

**Destinatario:** AI-PROD-UX (decisión de IA) · AI-FE-PLATFORM (ejecución)

**Evidencia:** tres agrupaciones que no coinciden:

| Superficie | Agrupación |
| --- | --- |
| Barra de tabs (`CommercialTabLayout.tsx:58,75,98`) | Operación · Catálogo · **Reglas** |
| Paneles de combos y promociones (`BundlesManager.tsx:215`, `PromotionsManager.tsx:224`) | eyebrow **"Ofertas"** |
| Tarjetas del resumen (`CommercialDashboard.tsx:56,73,85`) | Catálogo · **Ofertas** · Reglas |

**El recorrido real del usuario:** hace clic en una tarjeta rotulada **Ofertas** → aterriza en un tab agrupado bajo **Reglas** → encuentra un panel que se identifica como **Ofertas**.

**Diagnóstico:** un combo no es una regla, es una oferta. El agrupamiento correcto ya existe y está en el dashboard; la barra de tabs es la que diverge, plegando *Combos y promociones* dentro de *Reglas*.

**Recomendación:** separar un grupo **"Ofertas"** en la barra de tabs con *Combos y promociones*, dejando en **"Reglas"** solo *Compatibilidad* y *Tributación*. Alinea las tres superficies con el modelo que el dashboard ya usa, y de paso resuelve el hallazgo 12.

**Verificar antes de ejecutar:** que el PRD de MOD06 no fije una taxonomía distinta. Si la fija, manda el PRD y lo que se corrige es el dashboard.

**Esfuerzo:** S

## Hallazgo 10 — [P2][Identidad] El acento de los KPIs no codifica nada

**Evidencia:** `CommercialDashboard.tsx:19-107` — `accent: 'primary'` en planes, combos y reglas tributarias; `accent: 'neutral'` en productos, servicios, promociones y compatibilidad.

No hay regla detrás de la asignación. *Reglas tributarias* es `primary` y *Reglas de compatibilidad* es `neutral`, siendo de la misma naturaleza. Lo mismo entre *Combos* (primary) y *Promociones* (neutral).

**Ancla normativa:** postura de marca de la spec Firma iWana — *el color comunica significado (estado, avance, foco, acción), nunca adorno*. Aquí el acento decora.

**Recomendación:** o el acento codifica una regla enunciable (por ejemplo: `warning` cuando hay ítems inactivos o vigencias por vencer, `neutral` en el resto) o todas las tarjetas van `neutral`. **Un acento constante y sin significado es preferible a uno variable y arbitrario.** Si el hallazgo 8 se ejecuta, esta decisión se toma dentro de esa especificación y no por separado.

**Esfuerzo:** S

## Hallazgo 11 — [P3][Diseño visual] Rótulo de grupo con token distinto a sus hermanos

**Evidencia:** `CommercialTabLayout.tsx:98` — el rótulo "Reglas" usa `portal-eyebrow-muted`; "Operación" (`:58`) y "Catálogo" (`:75`) usan `portal-eyebrow`. Tres etiquetas del mismo nivel jerárquico, una con menos peso visual sin motivo.

**Recomendación:** unificar a `portal-eyebrow`.

**Esfuerzo:** S

## Hallazgo 12 — [P3][Diseño visual] Grupo de navegación con un solo elemento

**Evidencia:** `CommercialTabLayout.tsx:57-70` — el grupo "Operación" tiene rótulo, pista (`portalModuleTabsTrackClassName`), separador y contenedor propios para un único tab: *Resumen*.

El andamiaje anuncia una categoría que agrupa varias cosas; contiene una. En mobile, donde los grupos se apilan (`portalModuleTabsShellClassName` es `flex-col … md:flex-row`), ese peso se paga en scroll antes de llegar al contenido.

**Recomendación:** resolver junto al hallazgo 9 al reorganizar los grupos — o promover *Resumen* fuera de la agrupación, o absorberlo. No corregir por separado.

**Esfuerzo:** S

---

## Restricciones

- **`AGENTS.md` manda**, y por encima de este prompt. Tailwind v4 CSS-first: no crear `tailwind.config.js` bajo ninguna circunstancia.
- Tokens reales de `packages/ui/src/styles/globals.css` y primitives de `portal-ui.tsx`. **No inventar tokens.** Si necesitas uno que no existe, proponlo explícitamente como token nuevo y usa lo existente mientras tanto.
- Texto visible en español, sentence case, sin exponer enums crudos.
- TypeScript estricto: sin `any` explícito, sin promesas flotantes.
- Reglas semánticas del lima: avance / éxito / acción principal. **Nunca** urgencia ni fondo base.
- Sin PII, secretos ni tokens en código, tests, docs ni logs.
- **No commitees ni hagas push.** La consolidación y el commit los ejecuta AI-EM-ARCH tras verificar los gates.

## Regla dura

**Si al corregir un hallazgo descubres un defecto distinto, repórtalo — no lo absorbas en el fix ni ajustes un test para que pase.**

Aplica en particular al hallazgo 1: si al envolver Radix aparece que algún consumidor dependía del comportamiento roto (por ejemplo, que el foco *no* se moviera), eso es un hallazgo de diseño y se escala a AI-EM-ARCH antes de continuar.

Aplica también al hallazgo 2: si al añadir la columna Estado aparece que la API de promociones no devuelve `isActive` de forma fiable, **para** — eso deja de ser trabajo de frontend.

## Entregables

1. Los hallazgos 1–7 y 10–12 cerrados, o declarados con justificación escrita si se decide no corregirlos. Los hallazgos 8 y 9 entregan **especificación aprobada** en esta fase; su implementación puede diferirse a una fase F si el alcance lo justifica, siempre que quede con dueño y fecha.
2. **Script de auditoría limpio** sobre los archivos tocados:
   ```bash
   node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial apps/portal/src/components/shared/portal-ui.tsx
   ```
   Los hallazgos `[revisar]` que se descarten deben justificarse uno por uno.
3. **Cobertura de la corrección con tests**, no solo el fix: los dos P1 requieren test que falle sin la corrección. Para el hallazgo 1, un test de teclado (Tab confinado, Escape cierra). Para el hallazgo 2, aserción de que la columna Estado se renderiza con `canEdit={false}`.
4. Informe de ejecución: qué corregiste, **qué defectos nuevos encontraste** (es el entregable de más valor), salida real del script y de los tests sin maquillar, y qué queda abierto y por qué.
5. Consulta a AI-DS-OWNER registrada (hallazgos 1 y 3) con su veredicto.

## Stop / Go

- `pnpm --filter @iwana/portal test` en verde. **Baseline: 11 suites / 39 tests** en `components/commercial`; la suite completa del portal debe seguir en 148/148.
- `pnpm lint` y `pnpm typecheck` en verde (8/8).
- Script de auditoría sin P0/P1 deterministas.
- Puntaje recalculado según la fórmula de la skill (`100 − 20·P0 − 10·P1 − 3·P2 − 1·P3`): **≥ 80/100 cerrando 1–7 y 10–12**; **≥ 90/100** una vez implementados 8 y 9.

**Nota sobre el puntaje.** No lo reporte el mismo agente que ejecutó la corrección (protocolo: el aprobador de un gate nunca es el productor). Lo recalcula AI-SR-QA o AI-EM-ARCH sobre el código entregado. El script cubre lo grep-able; las dimensiones de UX, identidad e IA exigen recorrer la pantalla contra la tarea del usuario — **es exactamente el paso cuya omisión produjo el 97/100 del informe v1.1 y los cinco hallazgos de la pasada 3.**

**Para y escala a AI-EM-ARCH si:**

- La envoltura de Radix exige cambiar la API pública de `PortalSidePeek` (afecta a 4 consumidores — es decisión de contrato del DS).
- Corregir el hallazgo 2 revela un problema en el contrato de la API de promociones.
- Aparece un hallazgo P0 no contemplado aquí.
- Alcanzar el puntaje objetivo exige tocar código fuera de `components/commercial` y `portal-ui.tsx`.

---

## Trazabilidad

- [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.1](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.1.md) — fases A–D
- `.agents/skills/iwana-identity-ui-review` — disciplina aplicada, modo diseño
- `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` — dirección visual vigente
- ADR-056 §2 — superficies dark (`dark-surface-*`)
