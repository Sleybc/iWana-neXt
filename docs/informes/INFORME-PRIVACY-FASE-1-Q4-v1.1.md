# Informe Q4 — Spec UX de privacidad · Fase 1

**Fecha:** 2026-10-14  
**Versión:** 1.1  
**Estado:** Spec entregada para ratificación de AI-EM-ARCH; no aprobada por AI-PROD-UX  
**Contrato de referencia:** C-PRIV-API v1.1 y v1.0 donde no cambia  
**Artefacto:** [Spec UX de privacidad Fase 1 v1.1](../specs/2026-10-14-privacy-fase-1-ux-spec.md)

## Resultado

Q4 completó la spec para los siete recorridos de la Ola 1-bis: bandeja y plazos; radicación y validación; transiciones y plantillas; autorizaciones; marcas; suplantación y sus tareas; y administración de textos legales, incidentes e inventario declarativo. La entrega queda pendiente de ratificación de AI-EM-ARCH.

La spec consume los campos y cuerpos de A1–A8, no amplía el contrato y mantiene la captura en Cumplimiento dentro de la ficha 360°. Incluye **46 criterios** `CA-UX-PRIV-01` a `CA-UX-PRIV-46`. No contiene PII real, código ni definiciones de tokens.

## Deuda nueva por severidad

| Severidad | Deuda | Efecto y responsable |
| --- | --- | --- |
| P1 | El contrato almacena `requester_evidence_media_id`, pero no publica una ruta de privacidad para generar una URL firmada y volver a abrir la evidencia de la solicitud. | Se permite adjuntar y verificar durante la radicación. El detalle posterior indica que hay evidencia, sin preview/descarga. AI-EM-ARCH/SR-FULL debe congelar la ruta antes de que Q7 implemente revisión posterior. |
| P2 | La respuesta de suplantación solo contiene `suspendedContractIds`, sin nombres o números legibles del contrato. | La confirmación muestra la cantidad derivada del array, nunca los UUID. Una lista de contratos legible requeriría proyección contractual futura. |
| P2 | Los textos legales no exponen estado de publicación o selección para los formularios de alta/expediente. | La spec no declara cuál versión está vigente ni introduce esa bandera. AI-EM-ARCH/SR-FULL debe precisar cómo se configura el texto vinculado antes de implementar la captura integrada. |

## Fuentes y validación documental

- Fuentes de producto, contrato, gobierno, dirección visual y prototipo consultadas: **13 artefactos** (AGENTS, ADR-094, plan v1.1, informe previo Q4 v1.0, prompts v1.0/v1.1, spec 360°, Firma iWana, manual de identidad, perfil AI-PROD-UX, protocolo y dos prototipos de expediente).
- Skills leídas antes de redactar: **4/4** (`iwana-identity-ui-review`, `system-vocabulary-review`, `docs-architect`, `ui-ux-pro-max`; esta última aplicada como apoyo subordinado, sin definir paleta ni tokens).
- Recorridos solicitados cubiertos: **7/7**.
- Criterios emitidos: **46**.
- Rutas verificadas libres antes de escribir: spec UX e informe Q4 v1.1, **2/2**. Al cierre: spec creada e informe creado, **2/2**.
- Pruebas de código: **no aplican** a este entregable UX documental. No se modificó UI, contrato, token, backend ni código.
- El informe Q4 v1.0 se conserva sin cambios. No se ejecutó Fase 04 de suscriptores.

## Siguiente paso

AI-EM-ARCH ratifica la spec o devuelve cambios versionados. Antes de Q7, resolver la lectura firmada de evidencia de solicitudes y la selección de texto legal configurado; Q7 consume esta spec ratificada y los contratos compartidos vigentes.
