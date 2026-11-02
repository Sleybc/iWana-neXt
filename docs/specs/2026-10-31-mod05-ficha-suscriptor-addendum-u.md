# Spec — MOD05 Suscriptores · Addendum retroactivo «U»: ficha, confirmación tributaria y alias legible

**Versión:** 1.1
**Estado:** Vigente — alcance reconocido por el CTO el 2026-10-31; revisión pendiente en la consolidación del clúster MOD05
**Fecha:** 2026-10-31 (v1.1: 2026-11-01)
**Emisor:** AI-EM-ARCH
**Origen:** el mapa de hunks del clúster MOD05 (D, E, F) encontró un cuarto frente, **U**, implementado en el árbol sin plan ni prompt. El CTO confirmó el 2026-10-31 que fue trabajo pedido por él y ordenó documentarlo y revisarlo antes del commit.
**Plan:** [2026-10-31-mod05-consolidacion-cluster](../plans/2026-10-31-mod05-consolidacion-cluster.md)
**Relacionado:** [spec UX de Suscriptores](2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) · [ADR-100](../adrs/ADR-100-Responsabilidades-RUT-Condicionales-para-Activar-Suscriptor.md) (responsabilidades RUT) · [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) (IVA por punto de servicio)

---

## 1. Por qué existe este addendum

AGENTS.md no admite implementación sin artefacto de definición. U se implementó primero; este documento **no aprueba nada hacia atrás**. Su función es:
- fijar el alcance observable de lo que ya está en el árbol;
- dar a los revisores (UX/DS, seguridad, boundaries y deriva) un contrato contra el que medirlo.

Si una revisión encuentra algo fuera de este alcance o contra un ADR, se trata como hallazgo, no como cambio de alcance.

## 2. Alcance observado

### U-ficha · Rediseño de la ficha del suscriptor (portal)

| Pieza | Archivos | Comportamiento esperado |
| --- | --- | --- |
| Pestaña «Vista general» | `SubscriberOverviewTab.tsx` (+ spec), `SubscriberTabsContainer.tsx`, `SubscriberDetailClient.tsx` | Resumen del suscriptor como pestaña inicial; navegación a Servicios y Datos |
| Panel común | `apps/portal/src/components/shared/portal-ui.tsx` (`PortalPanel` con `labelled`) | Paneles con encabezado accesible (región etiquetada) |
| Servicios | `ServiciosTab.tsx` | Filtro de estado reflejado en la URL; estados vacíos explícitos |
| Tarjeta de contrato | `ContractCard.tsx` | «Activar» sale del menú y pasa al pie de la tarjeta. El menú de acciones usa `DropdownMenu` de `@iwana/ui` (estado expandido anunciado, Escape y retorno del foco al disparador) y su nombre accesible es «Acciones de {nombre del servicio}», con respaldo «Acciones de este servicio» |
| Ubicación | `LocationPreviewMap.tsx`, `SubscriberTechnicalServiceSection.tsx` | Vista previa de la ubicación del servicio |
| Alta de contrato | `CreateContractDialog.tsx` | Los datos fiscales del contrato no se piden a persona natural |
| Datos | `SubscriberSections.tsx`, `SubscriberFiscalSection.tsx`, `SubscriberFiscalFields.tsx` | Bloque «Datos fiscales según tipo de persona»; responsabilidades RUT plegables |

### U-trib · Confirmación del perfil tributario

- **API:** `POST /crm/subscribers/:subscriberId/tax-profile/confirm` (`subscriber-tax.controller.ts`, `subscriber-tax-profile.service.ts`, con sus specs). Confirma el perfil cuando no hay otros tributos pendientes. Roles: `ADMIN`, `ACCOUNTANT` y `SYSTEM_ADMIN`.
- **Portal:** `TaxProfileBlock.tsx`, `tributario-ux.portal.spec.tsx` y `subscribersApi.confirmProfile` en `api-client.ts`.

### U-alias · Alias legible del contrato

- **Backend:** `_buildAlias` en `contracts.service.ts` y la migración tenant `168_crm_contract_alias_readable`, que vuelve legibles los alias autogenerados («Servicio — …»), respalda el valor anterior y tiene `down`.
- **Portal:** `formatContractAlias` en `subscriber-ui.ts` (+ spec).

## 3. Criterios de aceptación para la revisión

| ID | Criterio | Revisor |
| --- | --- | --- |
| CA-U-01 | `audit-ui.mjs` en 0 hallazgos sobre los componentes de U-ficha; tokens y primitivas de `@iwana/ui` | `ds-owner` |
| CA-U-02 | El vocabulario visible pasa `system-vocabulary-review`; los estados vacío, carga y error existen en cada panel nuevo | `prod-ux` |
| CA-U-03 | Accesibilidad: las regiones etiquetadas, el foco tras «Activar» y la navegación por teclado de las pestañas cumplen WCAG 2.1 AA | `prod-ux` (`wcag-audit-patterns`) |
| CA-U-04 | `confirm` exige permiso y rol, audita dentro de su transacción, no expone PII en logs y respeta la guarda de titular bloqueado | `sec-eng` |
| CA-U-05 | U no importa entidades de otros módulos; el perfil tributario se consume por los puertos existentes (MOD07) | `boundary-reviewer` |
| CA-U-06 | Los tipos de `confirmProfile` y de la ficha salen de `@iwana/shared` o del contrato 360° publicado (RF-S404-50) | `contract-drift-reviewer` |
| CA-U-07 | La migración 168 es reversible y su prueba de ida y vuelta pasa contra Postgres real | `gate-verifier` |
| CA-U-08 | Ningún comportamiento de U contradice ADR-100 (RUT) ni ADR-093 (IVA) | `boundary-reviewer` |

## 4. Fuera de alcance

Cualquier cambio de U posterior a este addendum entra por spec propia. Los hallazgos de la revisión se corrigen dentro de la consolidación, sin ampliar U.

## 5. Historial

| Versión | Fecha | Cambio |
| --- | --- | --- |
| 1.0 | 2026-10-31 | Addendum retroactivo emitido |
| 1.1 | 2026-11-01 | Fija el menú de la tarjeta (`DropdownMenu`) y su nombre accesible, que no tenían regla escrita. Origen: auditoría K3 (prod-ux H1 y H2b; test-change-reviewer P3-2 y P3-6). La [spec de ciclo v1.1](2026-10-30-mod05-ciclo-facturacion-ux.md) ya no contradice la ubicación de «Activar» |
