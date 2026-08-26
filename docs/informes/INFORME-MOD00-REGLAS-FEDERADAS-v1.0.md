# INFORME — Reglas federadas en Configuración (MOD00 / MOD07 / MOD06)

- **Tipo:** INFORME
- **Version:** v1.0
- **Modulo:** MOD00 Configuración Control Plane, MOD07 Taxation, MOD06 Commercial
- **Alcance:** sección federada `/dashboard/settings/rules`, extracción del motor tributario a Taxation, consumo CRM por puerto
- **Fecha:** 2026-08-20
- **Autor:** AI-EM-ARCH (ejecutor)
- **ADR:** docs/adrs/ADR-082-Reglas-Federadas-Taxation-Settings.md (Propuesto)
- **Antecedente:** docs/informes/INFORME-MOD06-IVA-CLIENTE-VS-PLAN-v1.0.md

## Resumen ejecutivo

El operador configura Reemplazos, Impuestos, Aplicación de impuestos y Simulador desde Configuración. MOD00 no posee tablas. Impuestos, reglas y simulador viven en `TaxationModule`. Reemplazos permanece en Comercial. CRM consume `ITaxApplicationReadPort` y alinea IVA con `VatTreatmentService` (persona natural sin estrato se rechaza). El KPI de cobertura tributaria es binario.

## Qué se entregó

### Gobernanza

- ADR-082 en estado Propuesto.
- Notas de actualización en ADR-029 D3 y ADR-031 D1.
- PRD MOD00 v1.6 (RF-CFG-05 sección Reglas).
- PRD MOD06 v1.3 (UI tributaria fuera de Comercial).

### UI federada

- Registry MOD00: `SettingsSectionKey.RULES`, ruta `/dashboard/settings/rules`, estado AVAILABLE.
- Portal: `RulesSettingsClient` reutiliza los cuatro paneles existentes.
- Comercial deja de mostrar el grupo Reglas. Deep-links `?tab=taxation*` y `?tab=compatibility` redirigen a Settings.
- Alertas comerciales con hueco solo tributario: CTA a Configuración → Reglas (`tax-rules-app`).
- Copy CRM (`TaxProfileBlock`): «Configuración → Reglas».
- ACCOUNTANT puede editar impuestos en la UI federada (alineado a la API).

### Motor tributario

- Entidades `TaxRule` / `TaxRuleApplication` y `TaxApplicationService` en Taxation.
- HTTP canónico `/taxation/tax-rules`, `/taxation/tax-rule-applications`, `/taxation/tax/simulate`.
- Alias deprecado `/commercial/tax-*` una release.
- Puerto `ITaxApplicationReadPort.resolve` exige `personType`. Natural sin estrato → 400.
- Tablas SQL sin rename (`tax_rules`, `tax_rule_applications`).
- Dashboard comercial: `taxRulesCoverageGapCount` es 0 o 1 vía `hasActiveCoverage()`.

### Consumo

| Módulo | Esta entrega | Fuera |
| --- | --- | --- |
| CRM | Inyecta el puerto; IVA por `VatTreatmentService`; tributos no IVA sugeridos desde `resolve` | No duplica la matriz IVA en assignments |
| Billing | Puerto listo; Settings Billing sigue COMING_SOON | No factura |
| Inventory | Documentado: `context: PURCHASE` (ADR-029 D2) | No lee `tax_rules` ni UI de costos |
| Comercial | Dueño de catálogo, precios, combos y Reemplazos | No posee reglas IVA |

## Fuera de alcance (sin cambio)

- Cálculo DIAN / UBL.
- Impuestos de compra en inventario.
- Recodificar IVA de siembra 115 por `customerSegment`.
- Inventar artículos DIAN.
- Tablas en `ConfigurationModule`.

## Riesgos abiertos

- Dual motor IVA: tratamiento canónico en CRM; matcher de Taxation no redefine IVA por segmento.
- ADR-082 sigue Propuesto hasta corte CTO.
- Deep-links E2E de Comercial deben seguir el redirect a Settings.

## Verificación

Ejecutado el 2026-08-20:

- `pnpm --filter @iwana/shared build`
- `pnpm --filter @iwana/api exec tsc --noEmit` — OK
- `pnpm --filter @iwana/portal exec tsc --noEmit` — OK
- Jest API (taxation, dashboard comercial, CRM tax-profile, registry, boundaries, aislamiento tenant): 10 suites, 101 tests, 0 fallos
- Jest portal (Reglas, redirects, alertas, nav comercial, SettingsSectionGrid, CommercialClient): 9 suites, 65 tests, 0 fallos
- E2E: smoke en `portal-settings-federated-shell` (card Reglas) y `portal-commercial-ui-evidence` (redirect + simulador). Requiere stack portal :3002.

## Vocabulario visible

«Reglas», «Aplicación de impuestos», «Reemplazos», «Simulador». Sin enums crudos en UI.
