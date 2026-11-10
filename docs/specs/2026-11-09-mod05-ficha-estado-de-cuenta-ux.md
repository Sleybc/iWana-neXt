# Spec UX — MOD05 Suscriptores · Estado de cuenta en la ficha y valores heredados de la política de cobro

**Versión:** 1.0
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-09 · Plan: [2026-11-09-mod05-ficha-estado-de-cuenta](../plans/2026-11-09-mod05-ficha-estado-de-cuenta.md)
**Fecha:** 2026-11-09
**Emisor:** Claude Code, con criterio de AI-PROD-UX
**Alcance de pantalla:** `/dashboard/crm/subscribers/[id]`: pestaña «Vista general» y panel «Política de facturación» de la pestaña «Facturación»
**Origen:** [referencia UISP CRM v1.1](../referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md) §15.8, filas tratadas como «Adoptar»
**Relacionado:** [spec UX de Suscriptores](2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) · [addendum U de la ficha](2026-10-31-mod05-ficha-suscriptor-addendum-u.md) · [PRD MOD14 Fase 01](../prds/PRD-MOD14-FACTURACION-FASE-01-v1.0.md) · [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md) (D4: política por tenant y contrato)

---

## 0. Hechos verificados (2026-11-09, `main` en `9ed55090` más el árbol de trabajo)

| # | Hecho | Fuente |
|---|---|---|
| H1 | La Vista general no muestra deuda ni saldo. Su panel «Facturación» solo muestra medio de pago, ciclo y razón social, tomados de la oportunidad de origen | `SubscriberOverviewTab.tsx:277-330` |
| H2 | La Vista general se compone en dos columnas: a la izquierda Servicios y Contacto; a la derecha Facturación, Oportunidad de origen y Privacidad | `SubscriberOverviewTab.tsx:501-510` |
| H3 | La pestaña «Facturación» existe solo con `BILLING_INVOICES_READ` y carga `GET /billing/subscribers/:id/statement` | `SubscriberDetailClient.tsx:59, 200-212`; `SubscriberBillingTab.tsx:57` |
| H4 | Ese endpoint exige `BILLING_INVOICES_READ` con techo de roles ADMIN, ACCOUNTANT, SUPPORT, SALES y AUDITOR. NOC lee la ficha pero no el estado de cuenta | `billing-payments.controller.ts:291-293`; `subscribers.controller.ts:275` |
| H5 | `BillingAccountStatement` trae `totalPending`, `creditBalance`, `buyerProtected`, `impersonationHold` y `documents`. Cada documento trae `number`, `periodStart`, `periodEnd`, `dueDate`, `paymentState` y `pendingAmount` | `billing-accounts.contract.ts:26-39`; `billing-documents.contract.ts:102-135` |
| H6 | El portal ya tiene `pendingDocuments()` (EMITIDO con `pendingAmount` > 0, ordenados por vencimiento), `formatBillingMoney()` y `formatBillingDate()` | `BillingPaymentDialog.tsx:33-41`; `billing-copy.ts`; `billing-cycle-ui.ts:4` |
| H7 | La Vista general solo navega a `servicios`, `datos` y `cumplimiento` | `SubscriberOverviewTab.tsx:31` |
| H8 | El panel de política del contrato ofrece «Heredar» como opción vacía o como placeholder, sin decir qué valor se hereda | `BillingContractPolicy.tsx:113-175` |
| H9 | La política del tenant se lee en `GET /billing/policy` con el mismo permiso y techo de roles que la del contrato | `billing-policy.controller.ts:134-136, 185-187` |
| H10 | Un contrato sin `billingStartDate` empieza a cobrar desde su activación | `billing-generation.service.ts:252` |
| H11 | El diálogo de registro de pago ya muestra el total aplicado y el remanente que queda como saldo a favor | `BillingPaymentDialog.tsx:325-329` |

## 1. Problema y objetivo

Hoy, para saber si el titular debe algo, el operador tiene que abrir la pestaña Facturación. En una llamada de soporte o de cobro ese dato hace falta de entrada. Además, la política del contrato dice «Heredar» sin decir qué hereda, así que el operador no sabe qué plazo o qué gracia aplica sin ir a la configuración del tenant.

Objetivo: el estado de cuenta se ve en la Vista general, y cada campo heredado de la política dice su valor efectivo. Sin endpoints nuevos ni cambios de contrato.

## 2. Alcance

| Bloque | Qué cambia | Archivos previstos |
|---|---|---|
| **A** | Panel «Estado de cuenta» en la Vista general | `SubscriberOverviewTab.tsx`, `SubscriberDetailClient.tsx`, `SubscriberBillingTab.tsx` (carga compartida) |
| **B** | Valor heredado visible en la política del contrato | `BillingContractPolicy.tsx` |

**Fuera de alcance:**
- La pista de monto en el registro de pago, porque ya existe (H11).
- El revelado progresivo en los formularios de suscriptor y contrato, que exige primero un inventario de campos (decisión abierta D4).
- El «próximo corte» en la Vista general: ya aparece en cada tarjeta de servicio, y con `VENCIMIENTO_MAS_GRACIA` la fecha del ciclo podría no coincidir con el corte real (ADR-103 D5).
- Las decisiones abiertas de §6.

## 3. Bloque A — Estado de cuenta en la Vista general

### 3.1 Ubicación

Una fila de ancho completo, **encima** de las dos columnas de la Vista general (H2).

Alternativas descartadas:
- Primer panel de la columna derecha: en móvil quedaría debajo de Servicios y Contacto.
- Solo un enlace en el encabezado: no da el dato.

### 3.2 Contenido

Un `PortalPanel` titulado «Estado de cuenta», con «Ver facturación» como acción del encabezado. De arriba abajo:

1. Avisos de protección, con los mismos textos que la pestaña: titular en custodia (`PROTECTED_LABEL`, `PROTECTED_NOTICE`) y cobro suspendido por suplantación (`SubscriberBillingTab.tsx:78-84`).
2. Dos métricas: **Deuda pendiente** (`totalPending`) y **Saldo a favor** (`creditBalance`).
3. Si algún documento está vencido, el acento de advertencia en «Deuda pendiente» **y** el texto «Tiene documentos vencidos».
4. Una lista de hasta tres documentos pendientes. Por fila: número («Documento sin número» si es nulo), periodo, vencimiento, monto pendiente y, si está vencido, la etiqueta «Vencido».
5. Si hay más de tres pendientes, el enlace «Ver los N documentos pendientes».

### 3.3 Reglas

| # | Regla |
|---|---|
| R-A1 | El panel y su petición existen solo con `BILLING_INVOICES_READ`. Sin permiso, la Vista general queda como hoy y no se llama al endpoint |
| R-A2 | Fuente única: `GET /billing/subscribers/:id/statement`. Sin endpoint nuevo ni cambio de esquema |
| R-A3 | Una sola carga por visita a la ficha, compartida entre la Vista general y la pestaña Facturación: `SubscriberDetailClient` la hace y entrega a las dos los datos y la función de recarga. Registrar un pago, aplicar saldo o anular desde la pestaña refresca los dos lugares |
| R-A4 | Las métricas muestran los montos tal como los entrega la API, formateados con `formatBillingMoney`. El portal no suma ni recalcula dinero |
| R-A5 | La lista usa `pendingDocuments()` (H6) y toma los tres primeros |
| R-A6 | «Vencido» se decide por `paymentState === 'VENCIDO'`, la misma regla que la pestaña (`SubscriberBillingTab.tsx:100-102`). El estado se lee como texto, no solo por color |
| R-A7 | «Ver facturación» y «Ver los N documentos» abren la pestaña Facturación. `SubscriberDetailClient` arma el panel y lo entrega a la Vista general como contenido; como el panel solo existe cuando existe la pestaña (R-A1), el enlace nunca apunta a una pestaña ausente |
| R-A8 | Sin pendientes, la lista se reemplaza por «No hay documentos de cobro pendientes». Las métricas se muestran igual |
| R-A9 | Si la carga falla, el panel muestra el error con «Reintentar» (`BillingLoadState`) y el resto de la Vista general funciona normalmente |
| R-A10 | Durante la carga, el panel muestra el indicador de `BillingLoadState` |
| R-A11 | El texto del aviso de suplantación se mueve a `billing-copy.ts` para que la pestaña y el panel usen el mismo |
| R-A12 | El periodo se muestra como «{inicio} – {fin}» y el vencimiento como fecha, ambos con `formatBillingDate` |

### 3.4 Accesibilidad

- Región etiquetada (`PortalPanel` con `labelled`); la lista es una `ul` y las métricas usan `PortalMetricCard`, como la pestaña Facturación.
- Los enlaces dicen su destino: «Ver facturación», «Ver los 5 documentos pendientes».
- Objetivos táctiles de al menos 44 px (`min-h-11`), como el resto de la ficha.

## 4. Bloque B — Valor heredado visible en la política del contrato

### 4.1 Reglas

| # | Regla |
|---|---|
| R-B1 | Al abrir el panel se piden en paralelo la política del contrato y la del tenant (`GET /billing/policy`). No hay permiso adicional (H9) |
| R-B2 | En los selectores, la opción vacía pasa de «Heredar» a «Heredar de la empresa: {valor}». La interfaz dice «empresa», no «tenant», como el texto vigente del panel (`BillingContractPolicy.tsx:111`) |
| R-B3 | En los campos numéricos, el placeholder deja de ser el único aviso: un texto de ayuda bajo el campo, enlazado con `aria-describedby`, dice «Vacío: se usa el valor de la empresa ({N} días)» |
| R-B4 | En «Fecha de inicio de cobro», el texto de ayuda dice «Vacía: el cobro empieza en la fecha de activación del servicio» (H10) |
| R-B5 | Si la política del tenant no carga, se vuelve a los textos actuales y se muestra el aviso «No fue posible consultar los valores de la empresa». El formulario sigue usable |
| R-B6 | No cambia el cuerpo que se guarda (`BillingContractPolicyUpdateSchema`) ni la validación |

### 4.2 Valor heredado por campo

| Campo del contrato | Campo del tenant (`BillingPolicySchema`) | Texto del valor |
|---|---|---|
| `periodTiming` | `periodTiming` | «Cobro anticipado» o «Cobro al final del periodo» |
| `generationLeadDays` | `generationLeadDays` | «{N} días» |
| `paymentTermDays` | `paymentTermDays` | «{N} días» |
| `graceDays` | `graceDays` | «{N} días» |
| `cutoffEnabled` | `cutoffEnabled` | «Habilitado» o «Deshabilitado» |
| `firstPeriodMode` | `firstPeriodMode` | «Documento inicial separado» o «Unir al siguiente periodo» |
| `billingStartDate` | — (no tiene equivalente en el tenant) | Texto fijo de R-B4 |

Los textos de los valores son los mismos de las opciones actuales del panel (`BillingContractPolicy.tsx:120-166`).

## 5. Criterios de aceptación y pruebas

| CA | Criterio | Prueba |
|---|---|---|
| CA-1 | Con `BILLING_INVOICES_READ`, la Vista general muestra deuda pendiente, saldo a favor y hasta tres documentos pendientes ordenados por vencimiento | Unitaria del panel |
| CA-2 | Sin el permiso, no hay panel ni llamada al endpoint | Unitaria con espía de `billingApi.statement` |
| CA-3 | Con un documento vencido aparecen el texto «Tiene documentos vencidos» y la etiqueta «Vencido» en su fila | Unitaria |
| CA-4 | Con más de tres pendientes aparece «Ver los N documentos pendientes», y ese enlace y «Ver facturación» abren la pestaña Facturación | Unitaria |
| CA-5 | Sin pendientes se ve «No hay documentos de cobro pendientes» | Unitaria |
| CA-6 | Con `buyerProtected` o `impersonationHold` se ven los mismos avisos que en la pestaña | Unitaria |
| CA-7 | Un error de carga muestra «Reintentar» y no rompe los demás paneles | Unitaria |
| CA-8 | Abrir la ficha y luego la pestaña Facturación hace una sola llamada al estado de cuenta, y una recarga desde cualquiera de los dos actualiza ambos | Unitaria del mecanismo compartido y conteo de peticiones en el E2E de CA-11 |
| CA-9 | Cada campo heredable muestra el valor de la empresa (§4.2), y los numéricos lo anuncian con `aria-describedby` | Unitaria de `BillingContractPolicy` |
| CA-10 | Si falla la política del tenant, el panel vuelve a «Heredar», muestra el aviso y permite guardar | Unitaria |
| CA-11 | Flujo real: tras el pago con remanente del flujo, la Vista general muestra el mismo saldo a favor que la pestaña y «No hay documentos de cobro pendientes»; «Ver facturación» abre la pestaña sin otra petición al estado de cuenta. La etiqueta «Vencido» queda en la prueba unitaria (CA-3), porque el E2E no siembra fechas vencidas | E2E: ampliar el caso «ficha con métricas» de `e2e/tests/portal-billing-flow.spec.ts` |
| CA-12 | Auditoría visual sin P0 ni P1 sobre `components/crm/subscribers` y `components/billing` | `audit-ui.mjs` de `iwana-identity-ui-review` |

Las pruebas existentes de la Vista general y de la pestaña Facturación deben seguir en verde sin cambiar sus expectativas, salvo las que cubran la carga compartida (R-A3). Si alguna se ajusta, se revisa con `test-change-reviewer`.

## 6. Decisiones abiertas (no forman parte de esta spec)

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Botón «Registrar ▾» en el encabezado de la ficha (pago, ticket, visita), como el botón dividido de UISP | Esperar a medir el uso de A. Si se hace, cada opción debe filtrarse por el permiso de su módulo dueño |
| D2 | Mapa del punto de servicio en la Vista general (hoy está en Datos) | No por ahora: la ubicación es dato personal y ya está a una pestaña |
| D3 | Ayuda (?) por campo, control segmentado e interruptor como primitives de `@iwana/ui` | Llevarlo a `ds-owner` como evaluación de consolidación antes de cualquier uso |
| D4 | Revelado progresivo en los formularios de suscriptor y contrato | Hacer primero un inventario de campos obligatorios y opcionales por camino de alta (manual y conversión) |

## 7. Omisiones y riesgos

- No se probó en el navegador: los hechos salen del código.
- La carga compartida (R-A3) toca la pestaña Facturación, que es de MOD14. El riesgo es duplicar o perder la recarga tras una mutación; lo cubre CA-8.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 2026-11-09 | Borrador inicial a partir de la referencia UISP §15.8; aprobado el mismo día |
| 1.0 (rev.) | 2026-11-09 | Al planificar: textos visibles con «empresa» en lugar de «tenant»; el panel llega a la Vista general como contenido (R-A7); métricas con `PortalMetricCard`; CA-8 y CA-11 ajustados a lo que cada prueba puede medir |
