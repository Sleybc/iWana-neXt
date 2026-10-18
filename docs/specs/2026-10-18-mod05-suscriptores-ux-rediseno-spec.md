# MOD05 — CRM / Suscriptores · Spec UX de rediseño (lista y ficha 360)

**Fecha:** 2026-10-18 · **Versión:** 1.0 · **Estado:** Aprobado para los quick wins de la Ola 1 (G0 aprobado por el CTO en la sesión del 2026-10-18; ver [plan](../plans/2026-10-18-mod05-suscriptores-ux-quick-wins.md) §1). Los cambios estructurales de §4 siguen fuera de alcance.
**Emisor:** AI-EM-ARCH con criterio de AI-PROD-UX y AI-DS-OWNER
**Alcance de pantalla:** `/dashboard/crm/subscribers` (lista) y `/dashboard/crm/subscribers/[id]` (ficha)
**Autoridad:**
- [PRD-MOD05 Fase 04 vigente](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md), que sucede al PRD Subscriber inicial; este alcance de UX se limita a los quick wins aprobados por el CTO;
- `.agents/skills/iwana-identity-ui-review/references/component-recipes.md` (§2 tabla Firma, §3 cards, §4 tabs, §6 carga, §9 side peek, §10 Cmd+K, §13 timeline);
- [SPEC-PORTAL-SIDEPEEK-A11Y-v1.0](SPEC-PORTAL-SIDEPEEK-A11Y-v1.0.md) para la vista lateral;
- ADR-058 (PII cifrada y buscada por HMAC) y la Ley 1581.

**Método y límite:** el análisis se hizo **sobre el código**, sin sesión de uso en el navegador. La auditoría mecánica (`node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/crm/subscribers`) dio P0 0 · P1 0 · P2 0 · P3 8. La verificación visual queda como criterio de cierre de la Ola 2 del plan.

---

## 0. Hechos verificados en el código (2026-10-18, `main` en `d9018071`)

| # | Hecho | Fuente |
| --- | --- | --- |
| H1 | La búsqueda libre hace ILIKE sobre `firstName`, `lastName`, `businessName`, `nit` y `commercialName`. La cédula **no** entra porque se guarda cifrada (`documentNumberEncrypted`) y solo existe su HMAC | `subscribers.service.ts` ~L650 y L329-353 |
| H2 | `POST /crm/subscribers/search` acepta también un lookup exacto `{documentNumber \| nit \| email \| phone}` que compara por HMAC (o igualdad para el NIT). No pagina ni acepta filtros | `subscribers.controller.ts:217-260`; `subscribers.service.ts:985-1015` |
| H3 | El portal ya expone el lookup como `subscribersApi.search(params)`, pero ninguna pantalla lo usa. El placeholder de la lista promete «nombre, NIT o razón social» | `api-client.ts:6486`; `SubscribersListClient.tsx:346` |
| H4 | `SubscriberListItem` no trae plan, estado del servicio, saldo, zona, IP ni MAC | `subscriber.schema.ts:101-144` |
| H5 | No existe ninguna entidad de red (RADIUS, ONU, IP, MAC). Sí existen `coverage-zone` (tenant), tickets (`assurance`) y visitas (`wfm`) con `subscriberId` | búsqueda en `apps/api/src` |
| H6 | `Subscriber360Response` no incluye tickets, facturas ni diagnóstico | `api-client.ts:5702` |
| H7 | La ficha tiene 7 tabs en estado local (`activeSubscriberTab`), dos de ellas `StubCard` («Financiero», «Seguimiento») | `SubscriberDetailClient.tsx:78, 352, 395` |
| H8 | `SubscriberTabsContainer` envuelve tabs y contenido en una sola card y usa `portalTabActive/InactiveClassName`; tiene `role="tablist"` y `role="tab"` pero no `aria-controls`, `role="tabpanel"` ni navegación con flechas | `SubscriberTabsContainer.tsx:46-56` |
| H9 | El guardado de facturación captura el error solo con `console.error` y usa `<input>`/`<button>` crudos | `SubscriberDetailClient.tsx:262` |
| H10 | El encabezado: «Volver» es `button` + `router.push`; hasta 5 badges en mayúsculas de 10 px; texto de relleno «Suscriptor de la empresa» | `SubscriberHeader.tsx:59-107` |
| H11 | El diálogo de estado muestra «Razón» siempre, sin marca de obligatoria (solo lo es para `SUSPENDED` y `CANCELLED`), y reemplaza los errores genéricos por un texto fijo | `SubscriberStatusTransitionDialog.tsx:63, 133-139, 171` |
| H12 | `ContractCard` pinta el estado con clases Tailwind fijas (`STATUS_COLORS`), no con variantes de `Badge` | `ContractCard.tsx` |
| H13 | `Button` de `@iwana/ui` ya soporta `loading` (deshabilita y pone `aria-busy`) | `packages/ui/src/components/Button.tsx:65-82` |
| H14 | 8 spinners `animate-spin` hechos a mano | `ContractDetailDrawer.tsx:1230, 1252`; `ConvertExpedienteToContractDialog.tsx:331`; `CreateContractDialog.tsx:429, 695`; `TaxProfileBlock.tsx:260, 357, 417` |
| H15 | Hay dos máquinas de estado: la del suscriptor (`LEAD…CANCELLED`) y la de cada contrato (`DRAFT…ARCHIVED`). Ninguna pantalla explica cómo se relacionan | `subscriber-ui.ts:169-175`; `ContractCard.tsx` |

## 1. Matriz de diagnóstico

| # | Elemento | Problema | Impacto UX | Sev. | Resuelve |
| --- | --- | --- | --- | --- | --- |
| D1 | Búsqueda de la lista | No encuentra por cédula, teléfono ni correo (H1-H3) | La consulta más frecuente de soporte y cobranza falla | **P1** | QW1 |
| D2 | Facturación en la ficha | Falla silenciosa al guardar (H9) | El operador cree que guardó | **P1** | QW3 |
| D3 | Estados suscriptor vs. contrato | Dos flujos de suspensión sin relación explícita (H15) | No se sabe dónde ni con qué efecto suspender | **P1** | E4 (PRD) |
| D4 | Columnas de la lista | Faltan servicio, zona y saldo; sobran Tipo, Segmento y Creado (H4) | Hay que abrir la ficha para casi todo | P2 | E1 |
| D5 | Badges | Tres por fila y hasta cinco en el encabezado (H10) | El estado compite con atributos fijos | P2 | QW5, E1 |
| D6 | Tabs de la ficha | Dos stubs y «Vista general» duplica el encabezado (H7) | Callejones sin salida | P2 | QW2 |
| D7 | A11y de tabs | Sin `aria-controls`, `tabpanel` ni flechas; fuera de la URL (H8) | WCAG 4.1.2 y 2.1.1; se pierde la tab al recargar | P2 | QW2 |
| D8 | Fila de la tabla | Solo el nombre es enlace; sin vista lateral ni acciones | Ir y volver a la ficha para todo | P2 | E2 |
| D9 | Diálogo de estado | Razón siempre visible y sin marca; mensaje de la API perdido (H11) | Errores opacos y motivos no analizables | P2 | QW4 (parcial), E4 |
| D10 | Cambio de plan | No hay flujo | Tarea diaria sin camino guiado | P2 | E5 |
| D11 | Móvil / campo | Tabla con scroll horizontal, sin tarjetas ni tap-to-call | Inservible en terreno | P2 | E3 |
| D12 | Paleta de estados | `ContractCard` con colores fijos (H12) | Mismo concepto, distinto color | P2 | QW5 |
| D13 | Filtros | 4 selects de 48 px siempre visibles, sin chips ni vistas guardadas | La barra pesa más que lo que filtra | P3 | E2 |
| D14 | Encabezado | Relleno y «Volver» como botón (H10) | Espacio perdido; no abre en otra pestaña | P3 | QW5 |
| D15 | Carga | 8 spinners a mano (H14) | Inconsistencia con `Button loading` | P3 | QW6 |

**Fuera del dominio actual (no se diseñan como funcionalidad):** búsqueda por IP y MAC, diagnóstico técnico y estado de conexión. Requieren un ADR de dominio de red y a `data-eng` (RADIUS/OLT). En la ficha queda **reservado** el lugar, sin pestaña visible.

## 2. Arquitectura objetivo

### 2.1 Vista Lista: cola de trabajo

```
┌ Suscriptores ──────────────────────────────── [+ Nuevo suscriptor] ┐
│ [Texto | Documento | Teléfono | Correo] [🔍 ...................]   │
│ (Activos 1.204) (Suspendidos 38) (Contacto pendiente 12)            │
│ (Fiscal incompleto 9)            [Zona ▾] [Más filtros ▾] [Vistas ▾]│
├─────────────────────────────────────────────────────────────────────┤
│ Suscriptor            │ Servicio principal │ Estado    │ Zona   │ ⋯ │
│ Ana Ruiz              │ Hogar 300 Mb       │ ● Activo  │ Norte  │ ⋯ │
│ CC 1.020.***.**1      │ +1 servicio        │           │        │   │
└─────────────────────────────────────────────────────────────────────┘
```

- Modo de búsqueda explícito (QW1). Chips de cola con conteo, «Más filtros» con Tipo, Segmento y Estrato, y vistas guardadas (E2).
- Columna Suscriptor en dos líneas; Tipo y Segmento salen de la tabla (E1).
- Clic en la fila abre la vista lateral; `Enter` o «Abrir ficha» navega (E2, según SPEC-PORTAL-SIDEPEEK-A11Y).
- Menos de 768 px: tarjetas con nombre, estado, dirección y botones de llamar y WhatsApp (E3).

### 2.2 Vista Ficha

```
┌ ← Suscriptores                                                     ┐
│ Ana Ruiz  ● Activo                        [Acción primaria] [⋯]    │
│ Persona natural · Residencial · CC 1.020… · 📞 300… · Calle 12 #4-5│
│ ⚠ 2 pendientes: datos fiscales, contacto        [Resolver]         │
├ Resumen │ Servicios │ Datos │ Tributario │ Cumplimiento   (?tab=)  │
├─────────────────────────────────────────────┬──────────────────────┤
│ Servicios y puntos de servicio              │ Pendientes           │
│ (Facturación / Soporte cuando existan)      │ Actividad reciente   │
└─────────────────────────────────────────────┴──────────────────────┘
```

- Tabs en `?tab=` y fuera de cualquier card envolvente (QW2). «Facturación», «Soporte» y «Actividad» aparecen cuando su integración exista (E6, E7).
- Una sola acción primaria según el estado y un menú de desbordamiento (E4).
- Avisos agrupados en un banner con conteo (E4; en la Ola 1 se conservan los componentes actuales).

## 3. Contrato de los quick wins (congelado para la Ola 1)

Solo frontend. **No** cambia ningún contrato de `@iwana/shared` ni de la API.

### QW1 — Búsqueda con modo explícito

| Regla | Detalle |
| --- | --- |
| R1.1 | Control segmentado accesible antes del input: `Texto` (por defecto), `Documento`, `Teléfono`, `Correo`. Grupo con `role="radiogroup"` o `ToggleGroup` equivalente del DS, etiqueta visible «Buscar por» |
| R1.2 | `Texto` conserva el comportamiento actual (`subscribersApi.list` con `search`, debounce 350 ms, filtros y paginación) |
| R1.3 | `Documento`, `Teléfono` y `Correo` llaman a `subscribersApi.search({ documentNumber \| phone \| email })` **al enviar** (Enter o botón), sin debounce: cada consulta es un acceso a PII auditado. En `Documento`, si la persona es jurídica el operador escribe el NIT: se envía `nit` cuando el valor coincide con NIT con o sin DV; si no, `documentNumber` |
| R1.4 | En modo exacto se ocultan los filtros, el orden y el paginador, y aparece el texto «Coincidencia exacta · N resultado(s)». Con 0 resultados: estado vacío «No hay suscriptores con ese documento» y acción «Buscar como texto» |
| R1.5 | El modo vive en la URL (`?mode=document`) junto con el resto del estado de `useTableQueryState`; **el valor buscado en modo exacto no va a la URL** (privacidad: nunca PII en query string) |
| R1.6 | Placeholder por modo: «Nombre, razón social o NIT», «Cédula, NIT o pasaporte», «Teléfono», «Correo». Validación mínima en cliente (correo con formato; documento y teléfono de 3 a 50 caracteres) |
| R1.7 | Errores de la API se muestran en `PortalAlert` con su mensaje; `privacyRestricted` se respeta igual que en la lista actual |

### QW2 — Tabs de la ficha

| Regla | Detalle |
| --- | --- |
| R2.1 | La tab activa vive en `?tab=<slug>` (`router.replace`, sin scroll). Slug desconocido → `vista-general` |
| R2.2 | Se ocultan las tabs `financiero` y `seguimiento` (stubs). Un enlace antiguo con esos slugs cae en `vista-general` |
| R2.3 | Composición con `portalModuleTabsShellClassName` y `portalModuleTabsTrackClassName` (patrón de `OperationsModuleTabs.tsx`); el panel va **fuera** de la card de las tabs (recetas §3 y §4) |
| R2.4 | ARIA completo: `aria-controls` ↔ `id` del `role="tabpanel"` con `aria-labelledby`; roving tabindex; flechas izquierda/derecha, `Home` y `End` |
| R2.5 | Cambiar de tab y volver no pierde el estado de edición no guardado de la tab (mantener montado o elevar estado) |

### QW3 — Edición de facturación

| Regla | Detalle |
| --- | --- |
| R3.1 | `<input>` y `<button>` crudos se reemplazan por `Input` y `Button` de `@iwana/ui` |
| R3.2 | El error de guardado se muestra en `PortalAlert variant="error"` dentro de la tarjeta, con el mensaje de `ApiError` si existe; el `console.error` se elimina |
| R3.3 | Guardar usa `Button loading`; el éxito se anuncia en una región `aria-live="polite"` |

### QW4 — Diálogo de cambio de estado (parcial)

| Regla | Detalle |
| --- | --- |
| R4.1 | «Razón» solo aparece cuando el destino es `SUSPENDED` o `CANCELLED`, y se marca obligatoria (`required`, `aria-required`, asterisco visible) |
| R4.2 | El error genérico muestra el mensaje de `ApiError` cuando existe; el texto fijo queda como respaldo |
| R4.3 | «Confirmar» usa `Button loading` en lugar de cambiar el texto |
| R4.4 | **No** se agregan catálogo de motivos ni previsualización de efecto sobre contratos: dependen de E4 |

### QW5 — Encabezado y paleta de estados

| Regla | Detalle |
| --- | --- |
| R5.1 | «Volver a suscriptores» pasa a `Link` de Next (`href="/dashboard/crm/subscribers"`) |
| R5.2 | Se elimina «Suscriptor de la empresa». Tipo y Segmento dejan de ser badges: van como texto secundario en una línea bajo el nombre (`Persona natural · Residencial`) |
| R5.3 | Quedan como badges solo: estado, anonimizado y contacto pendiente |
| R5.4 | `ContractCard` usa `Badge` con un `CONTRACT_STATUS_META` en `subscriber-ui.ts`: `DRAFT` neutral, `ACTIVE` `portalActiveBadgeVariant`, `SUSPENDED` warning, `TERMINATED` error, `ARCHIVED` neutral. Se elimina `STATUS_COLORS` |
| R5.5 | El estado nunca se comunica solo por color: badge con texto siempre (WCAG 1.4.1) |

### QW6 — Indicadores de carga

| Regla | Detalle |
| --- | --- |
| R6.1 | Los 8 spinners de H14 pasan a `Button loading` cuando están dentro de un botón, o a skeleton cuando representan la carga de un bloque (receta §6) |
| R6.2 | `audit-ui.mjs` sobre la carpeta debe dar **P3 0** |

## 4. Cambios estructurales (fases siguientes, no lanzados)

| # | Cambio | Dependencia / decisión | Dueño |
| --- | --- | --- | --- |
| E1 | Columnas «Servicio principal» y «Zona», documento en segunda línea | Ampliar la proyección de `SubscriberListItem` (contrato compartido) | `sr-backend` + `contract-drift-reviewer`, luego `fe-platform` |
| E2 | Vista lateral, chips de cola con conteo, «Más filtros», vistas guardadas, atajos | Endpoint de conteos; SPEC-PORTAL-SIDEPEEK-A11Y; atajos sin choque con `GlobalSearch` y desactivables (WCAG 2.1.4) | `prod-ux` → `ds-owner` → `fe-platform` |
| E3 | Lista en tarjetas para móvil y tap-to-call | Spec de `prod-ux` | `prod-ux` → `fe-platform` |
| E4 | Relación estado suscriptor ↔ contrato, flujo único de suspensión, catálogo de motivos y previsualización de efecto | **Decisión de producto: addendum al PRD-MOD05** | CTO + `prod-ux` |
| E5 | Asistente de cambio de plan | PRD con reglas de prorrateo (MOD06 Comercial) | CTO + `prod-ux` + `sr-backend` |
| E6 | Tab Soporte (tickets y visitas) | Lectura cruzada vía puertos del Modulith (`assurance`, `wfm`); ampliar `Subscriber360Response` | `sr-backend` + `boundary-reviewer` |
| E7 | Tab Facturación, saldo y cobranza | Módulo de facturación | pendiente de roadmap |
| E8 | Búsqueda por IP/MAC y diagnóstico de conexión | **ADR de dominio de red** (RADIUS/OLT) | `data-eng` + AI-EM-ARCH |

## 5. Criterios de aceptación de la Ola 1

| CA | Criterio | Verifica |
| --- | --- | --- |
| CA1 | Buscar una cédula existente en modo Documento devuelve el suscriptor; en modo Texto no se promete cédula | test de componente + navegador |
| CA2 | El valor buscado en modo exacto nunca aparece en la URL | test de componente |
| CA3 | Recargar la ficha conserva la tab; `?tab=financiero` cae en Vista general | test de componente + navegador |
| CA4 | Las tabs se recorren con flechas, `Home` y `End`, y cada tab apunta a su `tabpanel` | test de componente (axe sin violaciones) |
| CA5 | Un fallo al guardar facturación muestra el error en pantalla | test de componente |
| CA6 | «Razón» solo aparece y es obligatoria para Suspender y Cancelar; el mensaje de la API se muestra | test de componente |
| CA7 | `ContractCard` y el badge del suscriptor usan la misma escala de variantes | test de componente |
| CA8 | `audit-ui.mjs` sobre `components/crm/subscribers` da P0-P3 en 0 | script |
| CA9 | `pnpm --filter @iwana/portal test`, `lint` y `typecheck` verdes con conteo real de tests (sin caché) | `gate-verifier` |
