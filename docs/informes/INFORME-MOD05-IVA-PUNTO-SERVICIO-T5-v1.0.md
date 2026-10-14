# Informe de entrega — MOD05 IVA por punto de servicio · T5 UX

**Versión:** 1.0  
**Fecha:** 2026-10-12  
**Estado:** Entregado — **ratificado con ajustes por AI-EM-ARCH el 2026-10-12** (spec §8 y §8.1). Lo que sigue es el registro original de la entrega  
**Agente:** AI-PROD-UX

## Resultado

Entregada la spec UX en [2026-10-12-mod05-iva-punto-servicio-ux-spec.md](../specs/2026-10-12-mod05-iva-punto-servicio-ux-spec.md). Incluye 23 criterios `CA-UX-IVA-01` a `CA-UX-IVA-23` para formularios de contrato, ficha 360°, presentación del IVA legado, catálogo, carga del soporte y WCAG 2.2 AA.

La decisión recomendada retira el IVA del nivel suscriptor (columna y banner), suprime únicamente el cálculo/sugerencia de IVA por estrato en `TaxProfileBlock`, y presenta el resultado por contrato en Servicios. Los demás datos tributarios fuera de ADR-093 se conservan.

## Evidencia y verificación

- Leídos `AGENTS.md`, `.github/copilot-instructions.md`, ADR-093 D1–D6, el plan MOD05 y el prompt C-API-3/T5.
- Leídos los perfiles/skills de AI-PROD-UX, `iwana-identity-ui-review`, `system-vocabulary-review`, `docs-architect` y el protocolo multiagente.
- Revisados Firma iWana, los prototipos propios, la spec existente de ficha 360°, PRD/HLD MOD05 y los formularios/detalle actuales de suscriptores y catálogo.
- Conteo documental real: **23 criterios de aceptación**, IDs consecutivos sin duplicados.
- No se ejecutaron pruebas automatizadas: entrega solo documental; no se modificó código.
- La spec queda pendiente de ratificación de AI-EM-ARCH. No se hizo commit.

## Deuda nueva por severidad

- **P0:** ninguna.
- **P1:** ninguna introducida por T5.
- **P2:** confirmar en T7 que los permisos actuales de Media permiten a los operadores autorizados cargar y consultar el soporte privado de estrato. La spec referencia el endpoint existente y no define permisos ni una ruta nueva.
- **P3:** ninguna.
