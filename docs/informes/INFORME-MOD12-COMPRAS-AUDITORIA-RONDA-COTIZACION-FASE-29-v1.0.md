# INFORME — MOD12 Compras Fase 29: auditoría de código de la ronda de cotización

**Fecha:** 2026-09-11
**Módulo:** MOD12 Inventario / SCM — Compras (purchasing), capa RFQ
**Superficie auditada:** `RfqInvitationsPanel.tsx`, `PurchaseRequestWorkbenchDrawer.tsx`, `purchase-workbench.ts`, `SupplierMultiPicker.tsx`, `SupplierPicker.tsx`, `rfq.service.ts` y su entorno directo (~4.400 líneas) — la superficie que la Fase 28 acababa de tocar
**Tipo:** Auditoría de código (correctness, seguridad, rendimiento, mantenibilidad) + corrección de hallazgos P0
**Modo:** Orchestrator — despliegue del protocolo multiagente v1.5 por dimensión, con verificación independiente de cada entrega
**Continúa de:** [`INFORME-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md`](INFORME-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md)

## 1. Alcance y decisión de encuadre

El usuario pidió auditar y refactorizar. Antes de desplegar, se decidió (consulta al usuario) que la auditoría **se fusiona con la Fase 28**, no corre en paralelo sobre archivos que otro track ya estaba modificando — refactorizar `RfqInvitationsPanel.tsx` en una línea mientras la Fase 28 lo modificaba en otra habría sido conflicto garantizado. Alcance elegido: la superficie de la ronda de cotización, no todo MOD12 ni todo Inventario.

## 2. Tracks desplegados

| Track | Agente | Dimensión | Resultado |
| --- | --- | --- | --- |
| Auditoría FE | AI-FE-PLATFORM | Corrección, rendimiento, React/TS, duplicación, a11y, i18n — `RfqInvitationsPanel.tsx`, `purchase-workbench.ts`, pickers | 22 hallazgos (5 alto, 10 medio, 7 bajo) |
| Auditoría SEC | AI-SEC-ENG | Tenant isolation, autorización, concurrencia, validación de entrada, PII, boundaries — `rfq.service.ts` y entorno | 11 hallazgos (3 alto, 5 medio, 3 bajo); aislamiento por tenant y boundaries verificados limpios |
| Auditoría QA | AI-SR-QA | Complejidad del drawer, cobertura, calidad de tests, a11y — `PurchaseRequestWorkbenchDrawer.tsx` y specs | 2 críticos, 6 altos, 7 medios + huecos de cobertura enumerados por función |
| Corrección FE | AI-FE-PLATFORM | Aplicar 7 hallazgos P0 (1 regresión propia + C1/C2/A1 de QA + 3 altos de FE) | Aplicado y verificado |
| Corrección BE | AI-SR-FULL | Aplicar 5 hallazgos altos/medios de SEC | Aplicado y verificado (en dos actos — ver §5) |

## 3. Hallazgo de gobernanza detectado en el propio proceso

Al iniciar la auditoría se descubrió que **la Fase 28 ya estaba implementada en el working copy sin que este perfil hubiera despachado su ejecución** (T3-T5 del plan de Fase 28 habían corrido por una vía no trazada en esta conversación). Se verificó contra el informe de Fase 28 ya presente en `docs/informes/`: CA-28-01..08 cerrados, G6 GO, G6.5 pendiente de CI. No se repitió ni se deshizo ese trabajo — se auditó tal como quedó.

Adicionalmente, una regresión propia de esa implementación se detectó en el track QA (**A4** abajo): el JSDoc de `getCotizarPrimarySection` prometía que la comparación de cotizaciones conserva prioridad sobre la apertura de ronda, pero el llamador en el drawer no neutralizaba `canStartRfq` cuando ya había cotizaciones. `[DESEMPATE]` resuelto por este perfil: manda el JSDoc; el arreglo va en el llamador. Registrado y corregido (ver §4, A4).

**Interrupción operativa:** los dos despachos de corrección (FE y BE) fueron rechazados por el usuario a mitad de camino en la sesión anterior. Al retomar, se verificó el estado real del working copy antes de reintentar — no se asumió nada del reporte de los agentes interrumpidos. Se encontró **el backend en estado no compilable** (`rfq.service.ts:151` llamaba a un método ya renombrado en `supplier-profile.service.ts`), consecuencia directa de la interrupción a mitad de una operación de refactor de varios archivos. Se corrigió como prioridad 0 del segundo despacho, antes de las 5 correcciones propiamente dichas.

## 4. Hallazgos P0 corregidos (verificados de forma independiente por este perfil)

### Frontend (AI-FE-PLATFORM)

| # | Hallazgo | Archivo:línea | Arreglo |
| --- | --- | --- | --- |
| **A4** | Regresión de Fase 28: `canStartRfq` no neutralizado por cotizaciones existentes → comparación nace colapsada en `PENDING_QUOTES` con cotizaciones y sin ronda (rompe CA-24-06) | `PurchaseRequestWorkbenchDrawer.tsx:602-611` | El llamador pasa `canStartRfq && quotesCount === 0` a `getCotizarPrimarySection`; test del llamador añadido, test unitario de la función corregido para reflejar su contrato real |
| **C1** | Error de cancelación de orden inalcanzable: el formulario se desmonta antes de que el alert de error pueda pintarse; el operador cree que canceló sin haberlo hecho | `PurchaseRequestWorkbenchDrawer.tsx:1109-1136` | `PortalAlert` de `cancelOrderError` movido fuera del bloque condicional `cancelOrderMode` |
| **C2** | Doble POST tras rechazar/cancelar: el formulario de resolución no se resetea ni desaparece en estado terminal | `PurchaseRequestWorkbenchDrawer.tsx:1254-1311` | Guard `&& (canReject \|\| canCancel)` añadido a la condición de render |
| **A1** | Presets tributarios del tenant nunca se aplican a la cotización manual: el `useState` lazy siembra con `detail === null` en el montaje y nunca se re-siembra | `PurchaseRequestWorkbenchDrawer.tsx:348-350` + nuevo efecto | `useEffect([purchaseTaxPresetsSignature])` re-siembra solo si el operador no tocó nada (comparación estructural contra el último sembrado) |
| **FE-ALTO-1** | `runAction` confunde fallo del refresco con fallo de la acción: un GET fallido tras una escritura exitosa se presenta como error, induciendo reintentos sobre estado ya mutado | `RfqInvitationsPanel.tsx:228-243` | `onRefresh()` sacado del `try` de la escritura; éxito se marca en cuanto la acción resuelve; fallo de refresco se comunica aparte, sin invitar a reintentar |
| **FE-ALTO-2** | Toda cotización se pinta en formato COP aunque sea USD/EUR — cifra visible que induce decisión de compra errónea | `RfqInvitationsPanel.tsx:666`, `inventory-labels.ts:718-730` | `formatInventoryMoney(value, currency = 'COP')` acepta moneda opcional (compatible hacia atrás); código de moneda visible junto al importe |
| **FE-ALTO-4** | `title` en botón deshabilitado: nunca dispara tooltip (el DS aplica `pointer-events-none` en disabled) y el botón sale del orden de tabulación — motivo inaccesible | `RfqInvitationsPanel.tsx:573, 591-593` | `title` eliminado; `aria-describedby` apunta al `<p>` visible del motivo |

Verificación independiente: `npx jest` directo sobre `RfqInvitationsPanel.spec.tsx`, `PurchaseRequestWorkbenchDrawer.spec.tsx`, `purchase-workbench.spec.ts`, `AwardLinesPanel.spec.tsx` → **4 suites, 66/66 tests, 0 fallos**. `pnpm typecheck` en `apps/portal` → limpio.

### Backend (AI-SR-FULL)

| # | Hallazgo | Archivo:línea | Arreglo |
| --- | --- | --- | --- |
| **P0** *(descubierto al retomar)* | Build no compilaba: `rfq.service.ts:151` llamaba a `assertEligibleForPurchasing`, ya renombrado | `rfq.service.ts` | Resuelto integrado en la reescritura de `invite()` (siguiente fila) |
| **Alto 1** | `close()` degrada `request.status` a `PENDING_APPROVAL` sin guarda de estado → con la solicitud ya en `APPROVED`/`CONVERTED_TO_PO`, cerrar una ronda tardía habilita una segunda orden de compra | `rfq.service.ts:350-357` | Guarda idéntica a la de `send()`: solo transiciona desde `PENDING_QUOTES` o `DRAFT` |
| **Alto 2** | `invite()` aceptaba cualquier UUID como proveedor: sin perfil comercial pasaba sin validar existencia ni rol `SUPPLIER` activo en MOD08 — una ronda podía "cumplirse" sin proveedores reales | `rfq.service.ts` (`invite()` reescrito) + `supplier-party.port.ts` + `party-read.port.ts`/`.adapter.ts` (método nuevo `filterPartyIdsByActiveRole`/`filterActiveSupplierRefs`) | Resolución de existencia + rol activo por lote antes de insertar; rechazo explícito si algún `partyRefId` no resuelve |
| **Alto 3** | `partyRefIds` sin cota superior — vector de agotamiento de recursos (miles de UUIDs por request, amplificado en la descarga ZIP de PDFs) | `dto/index.ts` (`InviteSuppliersSchema`) | `.max(50)` + deduplicación por `Set` en el propio schema |
| **Medio** | Recuperación de idempotencia ante 23505 no podía funcionar: PostgreSQL aborta la transacción tras la violación de unicidad (25P02), y no había `SAVEPOINT` antes del insert — el error escapaba como 500 en vez de la respuesta idempotente pretendida | `rfq.service.ts` (`invite()` reescrito) | Resuelto de raíz, no parcheado: inserción por lote con `INSERT ... ON CONFLICT DO NOTHING` — no hay 23505 que capturar, así que tampoco hay 25P02 |
| **Medio** | `applyQuoteToInvitation` no validaba que la invitación perteneciera a la solicitud que se está cotizando: una cotización de la solicitud A podía enlazarse a una invitación de la ronda de la solicitud B (mismo proveedor en ambas), bloqueando con 409 la respuesta legítima de B | `rfq.service.ts:409` | `rfq.purchaseRequestId !== input.quote.purchaseRequestId` → `BadRequestException` |

Verificación independiente de este perfil (no solo el reporte del agente): `npx tsc --noEmit` en `apps/api` → limpio. `npx jest rfq.service.spec.ts supplier-profile.service.spec.ts` → **49/49**. `npx jest src/modules/inventory` completo → **72 suites (3 skipped), 699/707 tests, 0 fallos**. Se leyó el código resultante de `invite()`, `close()` y `applyQuoteToInvitation()` línea por línea antes de aceptar el cierre.

**Alcance respetado:** ninguna corrección backend cambió el contrato de API publicado (mismos endpoints, mismos DTOs de entrada/salida salvo el `.max()` que solo restringe, nunca amplía, lo aceptado). Sin migraciones — ninguna de las 5 correcciones lo requería, confirmado por el ejecutor antes de aplicar.

## 5. Hallazgo de proceso — dos actos, no uno

El primer despacho de corrección fue interrumpido por el usuario a mitad de la reescritura de `invite()`. Quedó en un estado intermedio: infraestructura nueva creada (`filterActiveSupplierRefs`, `filterPartyIdsByActiveRole`, rename + variante batch de `assertNotBlockedForPurchasing`) pero **no conectada** — y con `purchasing.service.ts` ya migrado a la firma nueva mientras `rfq.service.ts` seguía llamando a la vieja. Esto dejó `main` en un estado no compilable de haberse comiteado así. Ninguna de las dos partes se comiteó — el working copy quedó sucio pero el repositorio remoto nunca vio el estado roto. Se documenta como recordatorio operativo: una corrección multi-archivo debe verificarse compilable en cada punto de interrupción posible, no solo al final.

## 6. Hallazgo fuera de mandato — `AwardLinesPanel.tsx`, corregido tras confirmación

Durante la verificación se encontraron cambios en `AwardLinesPanel.tsx`/`.spec.tsx` (líneas colapsables, resaltado de la cotización más barata por línea, opciones de `<Select>` reestructuradas) que no correspondían a ningún hallazgo de esta auditoría ni a ningún track que este perfil hubiera despachado. **El usuario confirmó su origen: trabajo legítimo de otra sesión, con instrucción explícita de dejarlo corregido antes de comitear.**

Revisando el código de esa sesión se encontró un defecto real, de la misma clase que **FE-ALTO-2** (§4): `getQuoteUnitPriceForLine`/`formatQuoteUnitLabel` comparaban `quote.amount`/`unitCost` **por su valor numérico sin mirar `quote.currency`** para ordenar y marcar la oferta «más barata» por línea. El módulo admite cotizaciones en COP, USD y EUR (el propio panel de la ronda las registra así); sin conversión de cambio en el módulo, una oferta de 50 USD se marcaba «más barata» que una de 200.000 COP por comparar `50 < 200000`, sin relación con el costo real — una recomendación falsa exactamente en el punto donde se decide a quién adjudicar la compra.

**Corregido en esta fase:** ordenar y marcar «más barata» solo cuando todas las cotizaciones comparadas comparten moneda; con monedas mixtas se conserva el orden original sin marcar ninguna, y el código de moneda queda visible junto a cada importe en todos los casos (`quotesShareCurrency`, `formatQuoteUnitLabel` extendido). Test de regresión añadido con dos cotizaciones en COP/USD que no deben mostrar «Más barato» en ninguna. Verificado: 8/8 tests (7 previos + 1 nuevo, sin caché de turbo), typecheck limpio.

Nota de gobernanza: esta corrección puntual se aplicó directamente por este perfil (Read/Edit), no vía despacho a AI-FE-PLATFORM — desviación menor del patrón de delegación seguido en el resto de esta fase, justificada por ser una corrección de una sola función, de bajo riesgo, verificada de inmediato con typecheck y tests reales antes de aceptarla.

## 7. Deuda registrada, no pagada en esta fase

De los ~35 hallazgos totales de las tres auditorías, se corrigieron los 12 P0 (críticos/altos con impacto funcional o económico directo, más las dos correcciones de seguridad media que cerraban de raíz un vector de datos corruptos). Quedan sin aplicar, por severidad:

| Severidad | Cantidad aprox. | Ejemplos representativos | Destino |
| --- | --- | --- | --- |
| Medio (FE) | ~9 | Componente de cotización duplicado entre panel y drawer (`useQuoteEconomicsForm` propuesto); `RfqInvitationsPanel.tsx` con 827 líneas y 3 responsabilidades; fechas con `.slice(0,10)` (desfase de zona horaria); `rfqNumber` con prefijo «RFQ-» visible (vocabulario congelado — requiere consulta a DS-OWNER, es dato de backend); foco perdido al abrir/cerrar el formulario de cotización | Fase de refactor propia — no P0, riesgo de romper la superficie recién estabilizada si se mezcla |
| Bajo (FE) | 7 | `searchSuppliers` duplicado entre pickers; falta contrato `Textarea` en el DS; código muerto en `normalizePurchaseWorkbenchTab` | Backlog |
| Medio/Bajo (SEC) | 6 | `rfq_number` sin índice único (colisión bajo concurrencia); audit log de `invite` sin `entityId` resoluble; segregación de funciones (una sola clave de permiso cubre solicitar/cotizar/aprobar) — **este último es pregunta de matriz de permisos del PRD, no defecto de implementación** | Fase propia; el de permisos requiere consulta a producto antes de tocar código |
| Crítico/Alto (QA, drawer) | **1461 líneas, 11 responsabilidades, 20 `useState`, 0 `useMemo`** | Descomposición propuesta en 7 piezas (`usePurchaseQuoteForm`, `PurchaseOrdersTab`, `PurchaseCotizarTab`, `PurchaseRequestLinesTab`, `PurchaseResolutionFooter`, `PurchaseWorkbenchPhaseNav`, `usePurchaseWorkbenchDerived`) con `key={detail?.request.id}` como arreglo transversal que elimina de raíz la fuga de estado entre solicitudes (A3) | Fase de refactor dedicada — cambio estructural grande, no compatible con "aplica solo estos P0, no refactorices" |
| Cobertura | huecos enumerados | Paso entre fases del stepper (0%), cancelar orden (0% — donde vivía C1), 4 acciones de orden (0% unit y E2E), `handleInvite`/`handleClose`/`handleDecline` del panel (0%) | AI-SR-QA, fase propia |
| Accesibilidad (`packages/ui`) | 2 | `TabsList` sin navegación por flechas/roving tabindex; stepper con `disabled` en vez de `aria-disabled` | Escala a AI-DS-OWNER / AI-FE-PLATFORM — componente compartido, fuera de esta superficie |

**Deuda ya reiterada de Fase 28** (no duplicada aquí): sin RF de «invitar proveedores» en PRD/HLD; tipos de transporte duplicados en `api-client.ts`; eje `fulfillmentStatus` sin ADR; multi-ronda en Fase 11.

## 7bis. Commits — todos en `main`

Tres commits, cada uno self-consistent (compila y pasa su propia suite de forma independiente), por instrucción explícita del usuario de comitear directamente en `main`:

| Commit | Alcance |
| --- | --- |
| `6b318845` | Fase 28 + correcciones FE de Fase 29 — superficie de la ronda de cotización (`RfqInvitationsPanel`, `PurchaseRequestWorkbenchDrawer`, `purchase-workbench`, `inventory-labels`, e2e, docs) |
| `a7025c26` | Correcciones backend de Fase 29 — capa RFQ (`rfq.service.ts` y su entorno directo) |
| `268d4a0a` | Corrección de `AwardLinesPanel.tsx` (§6) |

`apps/api/src/modules/inventory/dto/index.ts` y `apps/api/src/modules/inventory/services/purchasing.service.ts` mezclaban esta fase con dos hunks ajenos de Fase 26 (`justification` opcional, mensaje de tributo duplicado). Se apartaron temporalmente antes de `a7025c26` (verificado que el resto compilaba y pasaba solo con contaminación esperada en los 2 tests de Fase 26 que dependen de ellos) y se restauraron íntegros justo después — el diff resultante contra esos dos hunks es idéntico byte a byte al de antes de esta fase. Fase 26 sigue sin comitear, tal como estaba.

## 8. Cierre de gates

- **G6 (calidad): GO** — 12 hallazgos P0 corregidos y verificados de forma independiente por este perfil (no solo por el reporte de los ejecutores); typecheck y tests en verde con conteo real en ambos paquetes.
- **G6.5 (merge readiness): pendiente** — requiere corrida Linux de CI por SHA; no se mergea con solo evidencia local. Se acumula con el G6.5 pendiente de Fase 28.
- **G7 (despliegue): N/A** — sin despliegue en esta fase.
- **Higiene de scope:** el working copy sigue arrastrando la Fase 26 (mostrador/tributos) sin commitear, más ahora los cambios de Fase 28 y de esta auditoría. **Se requieren como mínimo dos commits separados** (Fase 28, y esta auditoría) antes de tocar Fase 26 — y una decisión sobre `AwardLinesPanel.tsx` (§6) antes de incluirlo en cualquiera de los dos.

## 9. Protocolo y skills

Skill cargada: `engineering:code-review`. Tracks: auditoría en 3 dimensiones paralelas (FE/SEC/QA) sobre la misma superficie, consolidación y `[DESEMPATE]` de A4 por este perfil, corrección en 2 tracks secuenciales (FE, luego BE en dos actos por la interrupción), verificación independiente de ambos antes de este cierre. Ningún gate se autoaprobó: los agentes ejecutores reportaron, este perfil re-ejecutó los comandos de verificación por su cuenta antes de aceptar el cierre.
