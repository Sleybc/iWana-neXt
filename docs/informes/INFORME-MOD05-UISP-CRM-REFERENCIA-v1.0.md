# Informe — Referencia comparativa de UISP CRM para MOD05

**Tipo:** INFORME  
**Módulo:** MOD05 CRM  
**Fase:** REFERENCIA-UISP-CRM  
**Versión:** 1.0  
**Estado:** Cerrado  
**Fecha:** 2026-10-31  

## Resultado

Se creó una referencia técnica comparativa de UISP CRM orientada a futuras definiciones de iWana neXt: [REFERENCIA-UISP-CRM-MOD05-v1.0](../referencias/REFERENCIA-UISP-CRM-MOD05-v1.0.md).

El documento sintetiza el modelo funcional observable de UISP y clasifica patrones como ya alineados, candidatos a Facturación, adaptables mediante boundaries y no recomendados para adopción directa. Se añadieron fuentes oficiales de Ubiquiti y referencias internas a PRD/HLD MOD05 y ADR-102.

## Trazabilidad documental

- [PRD MOD05 CRM](../prds/PRD-MOD05-CRM-DEFINICION-v2.0.md) enlaza el comparativo como referencia externa no normativa.
- [HLD MOD05 CRM](../hlds/HLD-MOD05-ARQUITECTURA-v2.0.md) enlaza el comparativo como contexto de consulta.
- [Directorio de módulos](../directorio-modulos.md) y el [índice de referencias](../referencias/README.md) permiten encontrarlo.
- ADR-102 se mantiene sin cambios: el comparativo reafirma sus precondiciones, no habilita el corte automático.

## Alcance y límites

No se implementaron funcionalidades ni se modificaron contratos de API, modelos, migraciones o reglas de negocio. No se realizaron pruebas de software porque el cambio es documental.

El informe no aprueba la construcción de Facturación, pasarelas de pago, webhooks, suspensión automática ni drivers de red. Cada propuesta requiere su PRD/ADR y revisión de límites de módulo, regulación aplicable y contratos de integración.
