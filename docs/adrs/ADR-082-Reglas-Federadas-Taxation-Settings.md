# ADR-082: Reglas federadas en Configuración y motor tributario en Taxation

**Version:** 1.0  
**Estado:** Propuesto  
**Fecha:** 2026-08-20  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD00 Configuración Control Plane / MOD07 Taxation / MOD06 Commercial  
**PRD relacionado:** docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md  
**ADR antecedente:** docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md  
**ADRs que actualiza:** docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md (D3), docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md (D1, D7)  
**Informe relacionado:** docs/informes/INFORME-MOD06-IVA-CLIENTE-VS-PLAN-v1.0.md

---

## Contexto

El operador administra hoy cuatro destinos bajo Comercial → Reglas: Reemplazos, Impuestos, Aplicación de impuestos y Simulador. Esas reglas no son exclusivas de ventas: las necesitan CRM (tratamiento IVA del cliente), facturación futura e inventario/compras.

Restricciones vigentes:

- ADR-040: Configuración es control plane federado. Centraliza la experiencia, no el ownership de tablas operativas.
- ADR-029: `TaxationModule` es dueño de `tax_definitions`. D3 dejó las reglas de aplicación en Commercial.
- ADR-031: Impuestos + reglas + simulador se materializan en la UI de Comercial.
- ADR-025: el IVA de internet se resuelve con `personType` + `stratum` en el cliente, no en el plan.
- El puerto `ITaxApplicationReadPort` lo exporta Commercial y ningún módulo lo inyecta. El matcher no recibe `personType` aunque ADR-031 D2 lo pidió.

Si las reglas de aplicación permanecen internas de Commercial, CRM, Billing e Inventory tendrían que importar internals de ventas o duplicar el motor. Ambos caminos rompen el modulith.

## Decision

Se adopta la sección federada **Reglas** en MOD00 Settings.

Ruta canónica:

```text
/dashboard/settings/rules?tab=compatibility|tax-catalog|tax-rules-app|tax-simulator
```

### D1. Configuración navega; no posee tablas

MOD00 publica la sección `SettingsSectionKey.RULES`. No absorbe `tax_definitions`, `tax_rules`, `tax_rule_applications` ni `catalog_compatibility_rules`.

### D2. Dueños de datos

| Superficie | Tablas | Owner |
| --- | --- | --- |
| Impuestos | `tax_definitions` | Taxation (sin cambio) |
| Aplicación de impuestos y simulador | `tax_rules`, `tax_rule_applications` | **Taxation** (deja de ser Commercial) |
| Reemplazos | `catalog_compatibility_rules` tipo `REPLACES` | Commercial (catálogo) |

Reemplazos no es tributario. Convive en la misma sección UX porque el negocio agrupa esas cuatro tareas como «Reglas».

### D3. Consumo por puertos

- Catálogo: `TaxCatalogReadPort` (ya existente).
- Aplicación resuelta: `ITaxApplicationReadPort` lo exporta `TaxationModule`. `resolve` incluye `personType` además de segmento, estrato y municipio.
- Reemplazos: `CommercialCompatibilityReadPort` permanece en Commercial.

CRM, Billing e Inventory no leen entidades TypeORM de Taxation ni de Commercial para impuestos. Commercial no registra ya entidades `TaxRule` / `TaxRuleApplication`.

### D4. HTTP

Rutas canónicas bajo `/taxation/*` (`tax-rules`, `tax-rule-applications`, `tax/simulate`). Las rutas `/commercial/tax-*` quedan como alias deprecado una release.

Las tablas no se renombran en v1 (siguen en el schema tenant). El dueño es el módulo NestJS, no un prefijo SQL.

### D5. Deep-links Comercial

`/dashboard/commercial?tab=taxation*` y `?tab=compatibility` redirigen a `/dashboard/settings/rules?tab=…`. Comercial deja de mostrar el grupo Reglas.

### D6. IVA del cliente

El matcher no recodifica IVA por `customerSegment`. El tratamiento IVA canónico sigue en CRM (`VatTreatmentService`, ADR-025). `customerSegment` en `tax_rules` queda para tributos que sí dependan de segmento (retefuente, ICA, territoriales), no para redefinir IVA. Persona natural sin estrato se rechaza (CA-SUB-06), no se asume STANDARD.

### D7. Actualización de ADRs previos

- ADR-029 D3: las reglas de aplicación a clientes pasan de Commercial a Taxation. Las reglas de aplicación a proveedores siguen reservadas al futuro Purchasing. Perfiles fiscales de terceros y el cálculo de factura no cambian de owner (CRM y Billing).
- ADR-031 D1 / D7: las tres secciones tributarias visibles viven en Configuración → Reglas, no en `CommercialTabLayout`. El modelo Impuestos / Aplicación / Simulador se conserva.

## Consecuencias

### Positivas

- Un solo lugar de configuración para el operador.
- CRM, Billing e Inventory pueden consumir el mismo motor sin acoplarse a Comercial.
- Alinea el matcher con `personType` pedido en ADR-031 D2.

### Costos y tradeoffs

- Alias HTTP deprecado durante una release.
- Hay que reescribir deep-links, alertas comerciales y copy CRM.
- Reemplazos y tributación comparten nav UX con owners distintos; el registry debe declarar ambos owners.

### Riesgos aceptados

- Billing e Inventory no implementan cálculo en esta entrega; solo queda el puerto listo.
- La siembra histórica de IVA por segmento (migración 115) no se reescribe aquí; el matcher deja de usarla como verdad de IVA.
- El ADR queda Propuesto hasta corte CTO; la ejecución de producto puede adelantar UI federada y extracción de motor bajo este documento.

## Referencias

- AGENTS.md — boundaries y modulith
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md
- docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md
- docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md
- docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- docs/informes/INFORME-MOD06-IVA-CLIENTE-VS-PLAN-v1.0.md
