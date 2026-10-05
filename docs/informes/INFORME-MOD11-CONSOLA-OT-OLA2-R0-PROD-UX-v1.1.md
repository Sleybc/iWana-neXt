# Informe — MOD11 Consola de OT · Ola 2 · R0 + UX de E4

**Versión:** 1.1  
**Fecha:** 2026-10-05  
**Autora:** AI-PROD-UX (prod-ux)  
**Estado:** **Entregado · GO recomendado a G2**  
**Relanzamiento:** este informe supera el registro de bloqueo de v1.0 conforme a la adenda A1.

## Trazabilidad

- Encargo: [PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0](../prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md), incluida A1.
- Plan: [MOD11 consola OT, remediación v1.2](../plans/2026-09-14-mod11-consola-ot-remediacion.md).
- Fuente: [Spec base del requisito como eje v1.2](../specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md).
- Entregable: [Spec UX R0 por requisito y momento](../specs/2026-10-05-mod11-consola-ot-requisito-ux.md).
- Contratos consumidos sin edición: execution-orders.ts v1.4 según historial, execution-orders-completion.ts v1 y tablas operativas v1.1.
- Registro histórico preservado: [informe R0 v1.0](INFORME-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md), que documenta el bloqueo inicial.

## 1. Resumen

Se completó la definición UX de la consola organizada por requisito y momento, más la parte UX de E4. La fuente A1 permite diseñar la celda bloqueada usando solo el estado publicado, sin exponer motivo ni pedir una ampliación de contrato. La especificación propone **GO a G2** y deja dos consultas acotadas para AI-EM-ARCH y R1.

## 2. Entregables

| Artefacto | Resultado |
| --- | --- |
| docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md | Nueva spec UX v1.0, estado Borrador para G2. |
| Este informe | v1.1; supera el v1.0 de bloqueo sin alterarlo. |

## 3. Cobertura contra §7 del encargo

| Criterio | Evidencia |
| --- | --- |
| Cinco requisitos v2 con estado, razón y acción o ausencia de acción. | Spec §§3 y 5: installed-equipment, service-test, work-photo, CUSTOMER_SIGNATURE e installation-activity. |
| Matriz completa por momento y rol; sin captura pre-inicio. | Spec §4: 4 momentos × 3 vistas de rol, con CREATED reservado a supervisión; no hay captura ni consulta de custodia antes del inicio. |
| Custodia bajo demanda. | Spec §6: consulta dentro del acto de consumo MATERIAL. |
| E4 en bandeja, detalle y orden por defecto. | Spec §7: «Por programar» para trabajo abierto sin ventana; orden estable que prioriza programación pendiente; resumen de detalle. |
| Decisión de arrastre de archivo. | Spec §§5 y 12: se retira el copy de arrastre y se usa selector de archivo. |
| Snapshot vivo bajo v1. | Spec §8: la OT de auditoría conserva sus tres requisitos v1; no se re-snapshotea. |

## 4. Aplicación de A1 y decisiones

- BLOQUEADA se presenta sin motivo y sin expresiones que insinúen un motivo consultable.
- Solo se representa UNBLOCK si allowedActions la ofrece; se preserva «Desbloqueo no disponible» mientras el catálogo/ruta no permitan ejecutarla.
- Se reutilizan los hallazgos previos de mapeo de cinco requisitos y la disponibilidad de window nulo + createdAt para diseñar E4.
- La definición de E4 es server-owned. La tabla no obtiene orden local ni encabezados ordenables.
- El contrato de tabla v1.1 permanece intacto aunque su raya para null no comunica el estado de programación. Se asigna resolución formal a R1.

## 5. Consultas y necesidades de siguiente fase

**[CONSULTA a AI-EM-ARCH] Accesibilidad de firma.** La evidencia SIGNATURE debe nacer de captura en navegador. Se requiere decidir una alternativa equivalente y operable por teclado antes de G3; R0 no convierte texto escrito en firma por decisión propia.

**[CONSULTA a AI-DS-OWNER, R1] Ventana nula.** El contrato de tablas v1.1 prescribe raya y E4 requiere «Por programar». R1 debe indicar si el contrato v1.1 permite ese significado en su render o emitir la propuesta formal de versión posterior para aprobación. No se modifica en R0.

**Para G3 de fe-platform:** comprobar el artefacto de lienzo y el endpoint de evidencia existentes, MIME/tamaño/expiry requerido, política de dependencia, accesibilidad de teclado, borrador local offline, consultas bajo demanda y refetch selectivo, orden server-owned y estabilidad con paginación. La lista accionable está en spec §11.2.

## 6. Alcance y verificación

El trabajo fue documental. No se tocaron código, contratos, plan, prompt, design tokens ni componentes; no se ejecutaron tests ni verificación en navegador. Se consumieron la adenda A1, el plan v1.2, la spec base v1.2, la plantilla y las decisiones de E4; se leyeron como documentación las skills obligatorias brainstorming, system-vocabulary-review y ui-ux-pro-max, además de iwana-identity-ui-review y wcag-audit-patterns como apoyo.

Fuera de alcance conforme al encargo: Oportunidades/punto 7, superficie de anulación, línea de tiempo, tokens y componentes de R1, y datos de E4 CA-13.

## 7. Decisión de salida — §7 del encargo

**GO para G2.** Los seis criterios de salida se cumplen según la matriz de §3 y la spec entregada. El bloqueo de la ejecución anterior queda resuelto por A1; no se emite un bloqueo nuevo porque los campos necesarios para diseñar R0 existen en los contratos congelados.

El pase a implementación sigue sujeto a la aprobación G2, a que R1 resuelva el render de ventana nula y a que AI-EM-ARCH cierre la consulta de alternativa accesible de firma antes de G3. El contrato de tabla v1.1 no fue modificado.
