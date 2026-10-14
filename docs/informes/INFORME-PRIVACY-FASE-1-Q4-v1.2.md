# Informe Q4Δ — Spec UX de privacidad · Fase 1

**Fecha:** 2026-10-14  
**Versión:** 1.2  
**Estado:** Spec entregada para ratificación de AI-EM-ARCH; no aprobada por AI-PROD-UX  
**Contrato de referencia:** C-PRIV-API v1.2 y ADR-094  
**Artefacto:** [Spec UX de privacidad Fase 1 v1.2](../specs/2026-10-14-privacy-fase-1-ux-spec.md)

## Resultado

Actualicé la spec v1.1 para incorporar las siete condiciones de ratificación de AI-EM-ARCH en el prompt v1.2 §3. Se conserva la numeración CA-UX-PRIV-01 a CA-UX-PRIV-46, se sustituye CA-UX-PRIV-17 por el flujo **Ver evidencia**, y se agregan CA-UX-PRIV-47 a CA-UX-PRIV-52. La spec queda con **52 criterios únicos**, pendiente de ratificación; AI-PROD-UX no la aprueba.

La versión nueva cubre la verificación de identidad diferida, el reporte de suplantación iniciado desde la ficha 360° con contratos impugnados, el texto legal vigente y el bloqueo si no está publicado, la captura por cada superficie de CRM sin archivos, la carga de evidencia en radicación y ficha 360°, y las marcas de expediente solo cuando hay vínculo con Party.

## Deuda por severidad

| Severidad | Deuda                                                                                                          | Efecto y destino                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P3        | Los contratos de una suplantación se identifican por sus IDs; el detalle no tiene nombres ni números legibles. | La confirmación muestra la cantidad y enlaza a Contratos en la ficha 360°. Una proyección con nombres queda para una fase posterior. |
| P3        | No hay limpieza de archivos de evidencia huérfanos.                                                            | La limpieza queda para Fase 2 según A16.                                                                                             |

Las deudas P1 sobre lectura de evidencia de solicitudes y P2 sobre selección del texto legal, registradas en Q4 v1.1, quedan resueltas por A11 y A14.

## Fuentes y validación documental

- Fuentes de gobierno, producto, contrato, diseño y antecedentes consultadas: `AGENTS.md`, ADR-094, plan v1.2, prompts v1.2/v1.1/v1.0, informe Q4 v1.1, spec UX v1.1, spec de ficha 360°, perfil AI-PROD-UX, protocolo multiagente, dirección visual Firma iWana, manual de identidad y prototipos propios de expediente.
- Skills leídas antes de editar: **3/3** (`iwana-identity-ui-review`, `system-vocabulary-review`, `docs-architect`). Los patrones consultados usan el side peek operativo existente y mantienen los requisitos WCAG 2.2 AA; no se añadieron tokens.
- Criterios revisados: **52 únicos**, secuencia completa del 01 al 52. Las siete condiciones se trazan al reemplazo de CA-17 y los criterios nuevos 47–52.
- Rutas: el informe v1.2 estaba libre antes de crearse; la spec existente se actualizó en su ruta canónica. No se editaron código, contratos ni tokens.
- Pruebas de código: no aplican a este cambio documental. No se ejecutó la Fase 04 de suscriptores.

## Siguiente paso

AI-EM-ARCH ratifica esta versión o devuelve cambios versionados. Q7 consume la spec ratificada.
