# PROMPT DE EJECUCIÓN — MOD06 Comercial, Fase F: el resumen deja de ser un tab

**Versión:** 1.0
**Fase:** F — corrección estructural posterior a Fase E
**Emitido por:** AI-EM-ARCH · 2026-07-23
**Agentes destinatarios:** AI-PROD-UX (H13, decisión previa) · AI-FE-PLATFORM (ejecución) · AI-DS-OWNER (consulta, H13) · AI-SR-QA (verificación)
**Commit auditado:** `8340410e`
**Informe origen:** [PROMPT-MOD06-UI-FASE-E-v1.0](PROMPT-MOD06-UI-FASE-E-v1.0.md)
**Skill obligatoria:** `.agents/skills/iwana-identity-ui-review` (modo diseño)

---

## Contexto

Fase E cerró los 12 hallazgos y el resumen comercial pasó de índice de contenidos a vista operativa real: alertas accionables, cola de atención con destino y cambios recientes. El trabajo fue sustantivo — `commercial-dashboard.service.ts` +1101 líneas, tests de 39 a 55, taxonomía Ofertas/Reglas corregida, `PortalSidePeek` con foco.

La auditoría de cierre confirma que **H8 quedó bien resuelto**: el resumen ya contesta preguntas operativas en lugar de contar filas.

Aparece un defecto nuevo, consecuencia directa de haberlo resuelto: **el resumen ahora tiene contenido de urgencia, y sigue viviendo dentro de un tab.** Antes daba igual dónde estuviera porque no decía nada. Ahora sí dice, y está oculto 7 de cada 8 veces.

**Puntaje: 82/100** (P0: 0 · P1: 1 · P2: 2 · P3: 1). Banda: *aceptable con mejoras*.

## Hallazgo 13 — [P1][UX] Las alertas viven dentro de un tab y son invisibles desde el trabajo

**Destinatario:** AI-PROD-UX (decisión) → AI-FE-PLATFORM (ejecución) · consulta a AI-DS-OWNER

**Evidencia — dos hechos verificables:**

| Hecho | Ubicación |
| --- | --- |
| `loadSummary()` se ejecuta en **cada visita al módulo**, sin depender de `route.tab` | `CommercialClient.tsx:122-128` |
| Las alertas se renderizan **solo** dentro de `<TabsContent value="summary">` | `CommercialDashboard.tsx:274-305`, montado desde `CommercialTabLayout.tsx:119-121` |

**El defecto:** el cálculo se paga siempre y el resultado se muestra una de cada ocho veces. Un operador editando un plan tiene *"3 ofertas vencen pronto"* ya resuelto en memoria del cliente y no lo ve. Para enterarse debe abandonar la tarea en curso y volver al tab Resumen — exactamente lo que una alerta existe para evitar.

**Diagnóstico de arquitectura de información:** una barra de tabs comunica que sus elementos son pares intercambiables. Resumen **no es par** de Planes, Combos o Tributación: es una *lente sobre todos ellos*. Los siete tabs restantes son espacios de trabajo (se entra a operar sobre un tipo de entidad); el resumen es capa de orientación (se entra a saber dónde ir). Meterlos en la misma tira los declara equivalentes y produce este resultado.

**Recomendación (decisión de arquitectura, no preferencia):** promover la tira de alertas **por encima de la barra de tabs**, con visibilidad en todo el módulo. El tab Resumen conserva lo que sí justifica vista propia: *Requiere atención* y *Cambios recientes*, que son vistas transversales que ningún manager individual puede mostrar porque cruzan planes, combos, promociones y reglas.

**Alternativa evaluada y descartada:** eliminar el tab Resumen y repartir su contenido. Se descarta porque *Cambios recientes* quedaría sin ubicación natural — es el único lugar del módulo que contesta *qué pasó desde ayer*, y no pertenece a ningún manager en particular.

**Restricciones de la ejecución:**

- Las alertas ya montadas arriba **no deben duplicarse** dentro del tab Resumen (ver H14).
- La tira debe colapsar a cero altura cuando no hay alertas: sin alertas, sin contenedor vacío.
- El `PortalAlert` con `action` ya es el primitive correcto — no crear variante nueva sin pasar por AI-DS-OWNER.
- Verificar el comportamiento en mobile: tres alertas apiladas sobre la barra de tabs empujan el contenido operativo fuera del primer viewport. Si ocurre, la decisión de compactar es de AI-PROD-UX, no de implementación.

**Esfuerzo:** M

## Hallazgo 14 — [P2][UX] Alertas y KPIs dicen lo mismo, apilados

**Evidencia:**

| Dato | Como alerta | Como tarjeta |
| --- | --- | --- |
| `rulesGapCount` | `CommercialDashboard.tsx:138-148` — *"Huecos en reglas"* | `:332-339` — *"Huecos en reglas"* |
| `offersAtRiskCount` | `:114-124` — *"Ofertas en riesgo"* | `:311-322` — *"Vencen pronto"* |
| `catalogIncompleteActiveCount` | `:126-136` — *"Catálogo incompleto"* | `:323-331` — acento `danger` de *"Listos para vender"* |

En el caso de `rulesGapCount` el rótulo es **literalmente idéntico** y ambos elementos aparecen en el mismo viewport, uno encima del otro, con el mismo número y el mismo destino de navegación.

**El problema:** cuando hay un problema el operador lo ve dos veces y los dos elementos compiten por la misma acción. La alerta pierde fuerza precisamente cuando debería tenerla, porque deja de ser excepción y pasa a ser eco de una tarjeta.

**Recomendación:** al subir la tira de alertas (H13), **retirar del grid las tres tarjetas que duplican una alerta**. El grid queda con los indicadores de estado permanente (*Planes activos*, *Ofertas vigentes*) y las alertas se ocupan de lo excepcional. Cada dato en un solo lugar, con un solo rol: la tarjeta informa, la alerta interrumpe.

Si AI-PROD-UX considera que el operador necesita ver el conteo aunque no haya alerta —por ejemplo `rulesGapCount = 0` como confirmación de que todo está bien—, la tarjeta se conserva y **es la alerta la que debe cambiar de forma** para no repetir el rótulo. Decidir explícitamente, no dejar ambas.

**Esfuerzo:** S

## Hallazgo 15 — [P2][Ingeniería frontend] `onRetry` es código muerto

**Evidencia:** `CommercialDashboard.tsx:34` (declaración), `:399` (destructuring), `:426-434` (consumo). `CommercialClient.tsx:227-233` monta el componente pasando solo `summary`, `isLoading` y `onNavigateTab` — **nunca `onRetry`** (verificado por grep: 0 ocurrencias en el cliente).

**Consecuencia:** el estado vacío *"Indicadores no disponibles"* muestra el texto *"Usa actualizar para reintentar"* y no renderiza ningún botón. Existe un "Actualizar" en el `PageHeader` (`CommercialClient.tsx:206-211`), así que el usuario no queda varado — pero la afordancia que el propio componente promete no llega nunca a existir.

**Recomendación:** decidir una de las dos y ejecutarla completa —

1. Cablear `onRetry={handleRefresh}` desde `CommercialClient`, o
2. Eliminar la prop y el bloque condicional, y ajustar el texto para que apunte al botón del encabezado.

La opción 1 es preferible: el botón de reintento junto al error es el patrón que el resto del módulo ya usa (`BundlesManager.tsx:246-250`, `PromotionsManager.tsx:255-259`).

**Añadir test que falle sin el cable.** Un prop opcional no cableado no lo detecta ni el compilador ni el linter — es exactamente la clase de defecto que sobrevive a una fase completa.

**Esfuerzo:** S

## Hallazgo 16 — [P3][Vocabulario] El rótulo ya no describe el contenido

**Evidencia:** el tab se rotula *"Resumen"* (`CommercialTabLayout.tsx:51-53`) y el panel se titula *"Resumen comercial"* (`CommercialDashboard.tsx:404`), pero su propia descripción declara otra cosa: *"Qué requiere atención hoy en catálogo, ofertas y reglas — y dónde corregirlo"* (`:405`).

Tras Fase E el contenido es una **cola de trabajo priorizada**, no un resumen. "Resumen" describía con precisión la versión anterior —la que se corrigió por no aportar nada— y sobrevivió al rediseño.

**Recomendación:** derivar a `system-vocabulary-review` para el término definitivo. Candidatos a evaluar contra el vocabulario del producto: *Hoy*, *Estado*, *Atención*. **No decidir el nombre por criterio de frontend.**

Si H13 se ejecuta y las alertas suben, el contenido restante del tab será *atención + cambios recientes*, lo que refuerza que el rótulo debe revisarse **después** de H13, no antes.

**Esfuerzo:** S

---

## Restricciones

- **`AGENTS.md` manda**, por encima de este prompt. Tailwind v4 CSS-first: no crear `tailwind.config.js`.
- Tokens reales de `globals.css` y primitives de `portal-ui.tsx`. No inventar tokens; si falta uno, proponerlo explícitamente y usar lo existente mientras tanto.
- Texto visible en español, sentence case, sin enums crudos.
- TypeScript estricto: sin `any` explícito, sin promesas flotantes.
- Lima = avance / éxito / acción. **Nunca** urgencia — las alertas de vencimiento usan `warning`/`error`, como ya hace `buildAlerts`.
- Sin PII, secretos ni tokens en código, tests, docs ni logs.
- **No commitees ni hagas push.** Consolidación y commit los ejecuta AI-EM-ARCH tras verificar gates.

## Regla dura

**Si al ejecutar H13 descubres que algún consumidor dependía de que las alertas estuvieran ocultas, repórtalo y escala — no lo absorbas en el fix.**

Y la que aplica a toda la fase: **no consagres un defecto en un test.** Si al cablear `onRetry` (H15) aparece que `handleRefresh` no recarga lo que debería, eso es un hallazgo nuevo, no un test que escribir de otra forma.

## Entregables

1. H13 con **especificación de AI-PROD-UX aprobada por AI-EM-ARCH antes de implementar.** H14, H15 y H16 pueden ejecutarse en paralelo a esa decisión, salvo la parte de H14 que depende de dónde queden las alertas.
2. Script de auditoría limpio sobre los archivos tocados:
   ```bash
   node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial apps/portal/src/components/shared/portal-ui.tsx
   ```
   Los `[revisar]` que se descarten, justificados uno por uno.
3. **Tests que fallen sin la corrección**, no solo tests que pasen:
   - H13: aserción de que la alerta se renderiza con `activeTab` distinto de `summary`.
   - H15: aserción de que el botón de reintento existe y dispara la recarga.
4. Informe de ejecución: qué corregiste, **qué defectos nuevos encontraste** (entregable de más valor), salida real de script y tests sin maquillar, qué queda abierto y por qué.
5. Consulta a AI-DS-OWNER registrada (H13 — la tira de alertas por encima de tabs es patrón candidato a `portal-ui`) con su veredicto.

## Stop / Go

- `pnpm --filter @iwana/portal test` en verde. **Baseline: 10 suites / 55 tests** en `components/commercial`; la suite completa del portal no debe retroceder.
- `pnpm lint` y `pnpm typecheck` en verde (8/8).
- Script sin P0/P1 deterministas.
- Puntaje recalculado ≥ 90/100 (`100 − 20·P0 − 10·P1 − 3·P2 − 1·P3`).

**El puntaje no lo reporta quien ejecutó la corrección** (protocolo: el aprobador de un gate nunca es el productor). Lo recalcula AI-SR-QA o AI-EM-ARCH recorriendo la pantalla contra la tarea del operador — el script cubre lo grep-able, y H13/H14 no son grep-ables.

**Para y escala a AI-EM-ARCH si:**

- Subir las alertas exige cambiar la API pública de `CommercialTabLayout` de forma que afecte a otros módulos.
- La tira de alertas resulta ser patrón repetible en inventario o CRM — eso es promoción a `portal-ui` y decisión de AI-DS-OWNER.
- Aparece un hallazgo P0.
- Alcanzar el puntaje exige tocar código fuera de `components/commercial`, `portal-ui.tsx` y el contrato del summary.

---

## Trazabilidad

- Commit auditado: `8340410e` — Fase E
- [PROMPT-MOD06-UI-FASE-E-v1.0](PROMPT-MOD06-UI-FASE-E-v1.0.md) — H1–H12
- [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.1](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.1.md) — fases A–D
- `.agents/skills/iwana-identity-ui-review` — disciplina aplicada
- `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` — dirección visual vigente
