# Diseño: Bounded Context Taxation (MOD07) — Catálogo unificado de impuestos

**Fecha:** 2026-04-21
**Módulo:** MOD07 — TaxationModule
**Estado:** Aprobado para implementación (condicionado a aprobación de ADR-029)
**Autor:** AI-EM-ARCH (sesión de diseño colaborativo con CTO)
**Referencias:** ADR-029, ADR-031, HLD-MOD07-TAXATION-v1.0.md, HLD-MOD06-ARQUITECTURA-v1.0.md, 2026-04-20-reglas-comerciales-design.md

---

## Resumen ejecutivo

Se extrae el catálogo de impuestos del `CommercialModule` (MOD06) a un bounded context propio llamado `TaxationModule` (MOD07). El cambio resuelve tres problemas concretos:

1. El catálogo de impuestos no es exclusivo de ventas: Purchasing, Payroll y Billing lo necesitan.
2. Evitar que futuras extensiones dupliquen impuestos o rompan boundaries.
3. Habilitar un campo `context = SALES | PURCHASE | BOTH` para compartir catálogo sin mezclar reglas.

Taxation es dueño solo del catálogo y sus presets. Las reglas de aplicación y los perfiles fiscales de terceros se quedan en los bounded contexts que los consumen.

---

## Decisiones de diseño

| Área | Decisión |
|---|---|
| Nombre del módulo | `TaxationModule` (confirma lenguaje técnico) |
| Alcance v1 | Catálogo + presets Colombia; sin cálculo financiero |
| Consumo externo | Solo por puerto `ITaxCatalogReadPort`; sin exponer entidades |
| Multi-tenant | Schema del tenant, estándar del modulith |
| Presets SYSTEM | No editables, no eliminables, sí duplicables |
| Integración DANE/DIAN | Fuera de v1 |
| Versionado histórico de tasas | Fuera de v1 (se evalúa SCD2 en v2) |

## Modelo objetivo

Tabla única `tax_definitions` en el schema del tenant (ver HLD-MOD07 §4). Campos clave: `code`, `name`, `category`, `jurisdictionLevel`, `municipalityCode`, `baseRate`, `treatment`, `context`, `origin`, `isActive`.

Presets obligatorios sembrados en provisioning: IVA 19%, IVA exento, IVA excluido, Retefuente servicios, ReteICA, estampilla departamental.

## Contrato externo

```ts
interface ITaxCatalogReadPort {
  getById(id: string): Promise<TaxDefinitionSnapshot | null>;
  listByContext(context: 'SALES' | 'PURCHASE' | 'BOTH'): Promise<TaxDefinitionSnapshot[]>;
  resolveSystemPreset(code: string): Promise<TaxDefinitionSnapshot | null>;
}
```

Los consumidores importan únicamente la interfaz y el snapshot.

## Plan de migración desde Commercial

1. Crear tabla `tax_definitions` y módulo Taxation.
2. Seeder de presets en provisioning (nuevos tenants) y backfill puntual para tenants existentes.
3. Por cada `tax_rule` actual con `taxType` + `ratePercentage`, asegurar su `TaxDefinition` correspondiente.
4. Actualizar `CommercialModule` para consumir el puerto y guardar `tax_definition_id` en una tabla puente `tax_rule_applications`.
5. Dejar `taxType` y `ratePercentage` en `tax_rule` como legacy durante ventana de corte; planificar migración reversible para su eliminación.
6. Deprecar `tax_classifications` al completar el corte (coordinación con ADR-031).

## Testing

- Unit: servicios con reglas SYSTEM/CUSTOM y unicidad por `(tenant, code)`.
- HTTP: controller con tenant isolation y bloqueo de edición de presets.
- Integración: provisioning siembra presets correctamente.
- Cobertura mínima: 80% en servicios y controllers (AGENTS.md).

## Riesgos

- Ventana de migración convive con modelo legacy; mitigado con feature flag y tests de ambos caminos.
- Error al sembrar presets podría afectar tenants nuevos: seeder idempotente y auditado.

## Pendientes para confirmar

- Código exacto y tasa de estampillas por departamento: preset placeholder hasta definir catálogo nacional.
- Integración futura con maestro DANE para `municipalityCode`: se deja trazado.

## Referencias

- ADR-029, ADR-031
- HLD-MOD07-TAXATION-v1.0.md
- 2026-04-20-reglas-comerciales-design.md
