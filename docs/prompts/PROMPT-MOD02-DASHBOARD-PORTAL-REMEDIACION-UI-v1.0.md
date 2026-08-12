# PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0

## Prompt de ejecución — remediación UI del Centro de control (`/dashboard`)

**Versión:** 1.0
**Estado:** Emitido — autoriza implementación multiagente
**Fecha:** 2026-08-11
**Emite:** AI-EM-ARCH (modo Orchestrator)
**Etapa del workflow:** remediación post-review UI §11 · protocolo v1.5 §3bis
**Destinatarios:** AI-PROD-UX (UX) · AI-DS-OWNER (B, carril rápido) · AI-FE-PLATFORM (C) · AI-SR-QA (D)
**Origen:** [informe vivo §11](../informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md) — review UI 60/100, aprobada con cambios bloqueantes. Auditoría PLAT-OPS: 0 hallazgos deterministas; Jest 129/129; cobertura lines 93,12% / branches 85,15%; Playwright Firma 4/4 y Axe 10/10. **No ratifica G6.5 ni G7.**

> Sin prompt de ejecución no hay implementación (protocolo §3, G4). Lo que no está aquí no entra.
> **Plantilla de formato (en revisión):** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md).

---

## 1. Declaración de contratos congelados (protocolo §3bis)

| Contrato | Ruta | Versión / estado | Nota en esta remediación |
| --- | --- | --- | --- |
| **HLD** | [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) | v2.0.1 G1 firmado | Sin cambio |
| **UX spec** | [`2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md) | v1.0 + adendas delta v1.2 + **adendas R-A…R-D de este prompt** | Re-sync formalizado por PROD-UX en el mismo ciclo |
| **DS contrato** | [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) | **v1.3 — Congelado** | Sin bump. Carril rápido: componer primitives existentes |
| **Informe vivo** | [`INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md) | v1.0 G6 GO + delta GO + §11 | Actualizar §12 al cerrar |
| **ADR-075** | capas z | Aprobado | Sin cambio |

**API tipada:** sin endpoints nuevos, sin ampliar `@Roles`, sin migraciones.

**FE no espera** el archivo UX si este prompt ya publicó las adendas R-A…R-D. PROD-UX las copia al spec en el mismo ciclo.

---

## 2. [DESEMPATE] Primer viewport a 1280 px vs adenda B1

**Área RACI:** UX (PROD-UX R · EM-ARCH A)

**Posiciones:**
- UX spec §8 (v1.0): a 1280 px el primer viewport muestra B0 + banda completa de indicadores + inicio de B2.
- Adenda B1 (2026-08-11): sustituye la retícula plana / «4 por fila» por bandas de dominio. No derogó de forma explícita el presupuesto de §8.
- Review §11: captura fresca ADMIN = seis indicadores completos + parte del séptimo, sin B2. Registrado como decisión por aclarar, no como hallazgo puntuado.

**Decisión:** la adenda B1 **deroga** el tramo «banda completa + inicio de B2» de §8 **solo a 1280 px y solo para roles con ≥ 2 grupos de dominio**. El suelo no negociable de §2.2 se mantiene: B0 con al menos una acción operable + **al menos dos indicadores** en los tres tamaños. A 1280 px el primer viewport debe mostrar B0 + **los dos primeros grupos de dominio completos**. B2 puede quedar bajo el pliegue. No se comprimen tarjetas, no se eliminan I-1…I-7 y no se vuelve a la retícula plana.

**Justificación:** el defecto de escaneo que autorizó la agrupación (tarjetas gemelas) tiene más peso operativo que ver el arranque de B2 sin scroll. El suelo de §2.2 ya garantiza acción + señal en el primer pantallazo.

**Registro en:** este §2 · UX spec adenda R-D · informe vivo §12.

---

## 3. Alcance exacto

### Entra

| ID | Hallazgo §11 | Sev. | Esfuerzo | Cierra |
| --- | --- | --- | --- | --- |
| R-P1-01 | «Última lectura» avanza aunque una fuente falle | P1 Confianza | M | Honestidad de R-3 |
| R-P1-02 | Error → reintento no anuncia el bloque ni devuelve el foco | P1 A11y | M | UX §6.4 + DS §2.1 nota (a) |
| R-P1-03 | Menú móvil declara `menu` sin teclado | P1 A11y | M | Patrón `DropdownMenu` existente |
| R-P2-01 | B0 no respeta 1+menú / 2 / 2+menú | P2 Responsive | S | UX §8 |
| R-P2-02 | Historial y campana: lecturas y vocabularios paralelos | P2 Ingeniería | M | R-8 |
| R-P2-03 | «Ofertas en riesgo» no lleva foco ni anuncia el bloque | P2 Feedback | M | Adenda R-C |
| R-P3-01 | Tiempos secundarios sin mono/`<time>` | P3 Firma | S | Firma iWana |

### No entra — anti-alcance

- Rediseño del Centro de control · tokens de marca · primitive nueva · endpoints · `@Roles` · migraciones · npm · G6.5/G7 · página de historial completo (P-4) · reabrir I-1…I-7 · comprimir B1 para forzar B2 en el primer viewport.

---

## 4. Adendas autorizadas (este prompt)

### R-A · Honestidad de «Última lectura» (R-P1-01)

Aclara R-3 / R-6 / R-7; no las sustituye.

1. Cada fuente conserva la marca de su **última lectura exitosa**.
2. La hora global de B0 **solo avanza** cuando **todas** las fuentes pedidas en esa oleada terminan en éxito.
3. Si al menos una fuente falla y otra conserva dato previo: B0 **no** publica una hora nueva; junto a la hora se muestra aviso recuperable de dato desactualizado (texto de negocio, no técnico). La cifra antigua sigue visible.
4. Una métrica en `error + data` **debe** mostrar el estado de error/reintento aunque conserve valor. Hoy `DashboardClient.tsx` oculta el error si `value != null` (`:1252-1254`).
5. Un reintento de un solo bloque (R-6) no avanza la hora global salvo que esa oleada cubra todas las fuentes del rol y todas tengan éxito.

### R-B · Anuncio y foco del error de B1 (R-P1-02)

Materializa UX §6.4 y DS §2.1 nota (a). No abre `aria-live` en cada tarjeta.

1. Cada **grupo de dominio B1** que tenga al menos una métrica en error monta un `PortalAlert variant='error' live='polite'` **del grupo**, además del estado visual/reintento por tarjeta.
2. El encabezado del grupo es destino de foco estable: `tabIndex={-1}` + `ref`.
3. Tras un reintento con éxito, si el botón «Reintentar» desaparece, el foco pasa a ese encabezado.
4. Un segundo fallo se anuncia en la misma región viva del grupo.
5. El grupo no se desmonta ni se colapsa.

### R-C · «Ofertas en riesgo» → bloque comercial (R-P2-03)

1. El clic en I-6 sigue abriendo el pliegue y marcando el bloque comercial.
2. Tras revelar, el foco va al encabezado del bloque `commercial-attention` (destino estable `tabIndex={-1}`).
3. El bloque anunciado usa región viva educada (`aria-live='polite'` o `PortalAlert`/`role='status'` ya existente). No se inventa un toast.
4. Si hace falta desplazamiento, `scrollIntoView` solo cuando **no** hay `prefers-reduced-motion`; con la preferencia activa, solo se mueve el foco.

### R-D · Viewport 1280 (desempate §2)

Texto normativo del desempate. PROD-UX lo copia a la UX spec. QA **no** falla D-5 si B2 queda bajo el pliegue a 1280 px, siempre que B0 + dos grupos de dominio estén completos.

---

## 5. Tracks concurrentes

### Track UX — AI-PROD-UX

No escribe código. Formaliza en la UX spec (sección «Adendas remediación UI — 2026-08-11»):

| # | Paso |
| --- | --- |
| U-R1 | Copiar R-A…R-D con copy exacto de avisos (hora desactualizada, anuncio de grupo, anuncio de I-6) |
| U-R2 | Fijar la matriz B0: **375** = 1 visible (primaria) + menú; **768** = 2 visibles (primaria + «Actualizar»); **1280** = 2 visibles + menú (secundaria y resto) |
| U-R3 | Confirmar que R-8 sigue vigente: una lectura compartida home ↔ campana; sin identificadores en UI salvo necesidad operativa explícita |

**Stop:** si algún R-\* exige dato ausente en HLD §4.2 → `[BLOQUEO]`.

### Track B — AI-DS-OWNER (carril rápido)

No escribe código de pantalla. No bump a v1.4.

| # | Paso |
| --- | --- |
| B-R1 | Veredicto: el desbordamiento de B0 se compone con `Button` + `DropdownMenu` / `DropdownMenuTrigger` / `DropdownMenuContent` / `DropdownMenuItem` de `@iwana/ui`. Sin primitive nueva. |
| B-R2 | Confirmar que `headerActionClassName` no debe llevar `inline-flex` en el token compartido (rompe `hidden md:inline-flex`). Receta: `cn`/`CVA` por variante. |
| B-R3 | Confirmar DS §2.1 nota (a): anuncio en el **grupo**, no en la tarjeta. Sin `aria-live` nuevo en `PortalDashboardMetric`. |

**Prohibido:** tokens de marca, lima en urgencia, card-dentro-de-card.

### Track C — AI-FE-PLATFORM

Skills: `iwana-identity-ui-review` (modo diseño) · `frontend-dev-guidelines` · `core-components` · `system-vocabulary-review` · `test-driven-development`.

| # | Paso | Cierra | Criterio de hecho |
| --- | --- | --- | --- |
| C-R1 | Hora por fuente + hora global condicional; aviso de dato desactualizado; `error + data` visible | R-P1-01 | Fallo parcial no avanza B0; tarjeta con valor previo muestra error/reintento |
| C-R2 | `PortalAlert` por grupo B1 afectado + foco al encabezado en `error → success` | R-P1-02 | Un anuncio por grupo; foco no se pierde |
| C-R3 | Sustituir el menú ad hoc (`DashboardClient.tsx:409-453`) por `DropdownMenu` de `@iwana/ui` | R-P1-03 | Escape, flechas, clic exterior, foco inicial y retorno al disparador |
| C-R4 | Matriz B0 exacta; quitar `inline-flex` del token base | R-P2-01 | 375/768/1280 coinciden con U-R2 |
| C-R5 | Una lectura `audit` compartida (contexto de shell o cache de módulo). Helper canónico de acción/entidad. Campana sin fallback de enum crudo ni id visible | R-P2-02 | Una petición por carga; mismo vocabulario |
| C-R6 | Foco + anuncio + scroll respetuoso al bloque comercial | R-P2-03 | Adenda R-C |
| C-R7 | `font-mono tabular-nums` + `<time dateTime>` en hora de B0 y tiempo relativo del historial | R-P3-01 | Firma iWana |

**Archivos previstos (no exhaustivo):**
- `apps/portal/src/components/dashboard/DashboardClient.tsx` y `*.spec.tsx`
- `apps/portal/src/components/dashboard/RecentActivityPanel.tsx` y spec
- `apps/portal/src/components/layout/NotificationBell.tsx` y spec
- helper de vocabulario de auditoría (promover, no duplicar)
- E2E `e2e/tests/**/portal-dashboard*` (cantidad de acciones + teclado del menú)

**Prohibido:** inventar tokens; tocar backend; sondeo nuevo (R-2 sigue: el home no se auto-refresca; si la campana hoy sondea, no ampliar el intervalo ni duplicar el fetch del home).

### Track D — AI-SR-QA

Arranca en cuanto C entregue, o escribe contra este prompt si llega antes. No implementa features.

| # | Paso |
| --- | --- |
| D-R1 | Unit: fallo parcial no avanza `lastFetchedAt`; `error + data` renderiza reintento |
| D-R2 | Unit: grupo B1 en error monta `PortalAlert`; tras éxito el encabezado recibe foco |
| D-R3 | Unit/E2E: menú — Escape, flecha abajo, retorno de foco al disparador |
| D-R4 | E2E responsive: conteo exacto de acciones B0 a 375 / 768 / 1280 |
| D-R5 | Unit: una llamada `audit` por carga ADMIN; campana y panel comparten labels |
| D-R6 | Cobertura `components/dashboard` sin retroceso vs §11 (lines ≥ 93%, branches ≥ 85%) |
| D-R7 | `audit-ui.mjs` en rutas tocadas → P0/P1 = 0 |

---

## 6. Criterios de aceptación

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| CA-REM-01 | Con una fuente forzada a fallar y otra en éxito, B0 no muestra una hora más reciente que la última oleada completa | Unit + lectura de B0 |
| CA-REM-02 | La métrica con dato previo y fuente en error muestra error y «Reintentar» | Unit |
| CA-REM-03 | Un grupo B1 en error anuncia una sola vez vía `PortalAlert live='polite'` | Unit + axe |
| CA-REM-04 | Tras reintento exitoso, el foco está en el encabezado del grupo | Unit (ref/document.activeElement) |
| CA-REM-05 | El menú de desbordamiento cierra con Escape, recorre ítems con flechas y devuelve el foco al disparador | E2E teclado |
| CA-REM-06 | Acciones B0: 375 → 1+menú; 768 → 2; 1280 → 2+menú | E2E viewport |
| CA-REM-07 | Una petición `audit` por carga del home ADMIN; sin enum crudo ni id en campana/historial | Unit (mock del cliente) |
| CA-REM-08 | Clic en «Ofertas en riesgo» mueve el foco al bloque comercial y lo anuncia; sin scroll animado si `prefers-reduced-motion` | Unit |
| CA-REM-09 | Hora de B0 y tiempo del historial usan `font-mono tabular-nums` y `<time>` | Unit |
| CA-REM-10 | audit-ui P0/P1 = 0; cobertura sin retroceso; lint/typecheck de lo tocado en verde | Comandos |

---

## 7. Criterio stop / go

### Stop — `[BLOQUEO]` a AI-EM-ARCH

- Campo o endpoint nuevo.
- Primitive nueva distinta de componer `DropdownMenu`.
- Reabrir I-1…I-7 o forzar B2 en el primer viewport a 1280.
- Tokens de marca o lima como urgencia.

### Go

1. CA-REM-01…10 con evidencia ejecutada.
2. P1 R-P1-01…03 cerrados.
3. Informe vivo §12 actualizado.
4. **No** anticipar G6.5 ni G7 (ADR-069).

---

## 8. Decisiones — no reabrir

| Asunto | Decisión | Quién |
| --- | --- | --- |
| G6 recomposición / calidad delta | Siguen GO; esta remediación no los invalida | AI-EM-ARCH |
| Review §11 | No ratifica el delta hasta cerrar los tres P1 | AI-EM-ARCH |
| Viewport 1280 vs B1 por dominio | Adenda B1 deroga «B1 completa + inicio B2»; suelo §2.2 intacto | AI-EM-ARCH §2 |
| Menú B0 | Componer `@iwana/ui` `DropdownMenu`; no reimplementar | AI-EM-ARCH |
| Lectura `audit` | Una por carga; helper de vocabulario único | R-8 vigente |
| G6.5 / G7 | Fuera | ADR-069 |

---

## 9. Orden sugerido

```text
U-R* + B-R*  (paralelo, docs)
        └──► C-R1…C-R7 ──► D-R* ──► informe §12
```

Esfuerzo estimado: **~1–1,5 días-persona** (UX/DS medio día + FE 0,75–1 + QA 0,5).

**Emitido por AI-EM-ARCH el 2026-08-11.** Todo re-sync de contrato se documenta como adenda a este prompt.
