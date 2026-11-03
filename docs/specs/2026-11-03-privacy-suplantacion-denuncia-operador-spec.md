# Spec — `privacy` · Suplantación: denuncia del operador y comunicación del plazo (Sentencia C-413 de 2025)

**Versión:** 1.0
**Estado:** Aprobado. G0 del CTO el 2026-11-03, con las tres decisiones de §7. Se preparó **antes** del dictamen, por orden del usuario, porque la Ley 2573 rige el **19-11-2026**. El dictamen sigue pendiente: el texto generado por IA del 2026-11-03 [no tiene valor de dictamen](../informes/INFORME-PRIVACY-BORRADOR-POSICIONES-JURIDICAS-IA-v1.0.md). La pregunta 3(b) de la [consulta jurídica v1.1](../informes/INFORME-CONSULTA-JURIDICA-PROTECCION-DATOS-v1.1.md) puede confirmar o ajustar D-DO-1, y la 3(c), D-DO-2
**Fecha:** 2026-11-03
**Autor:** AI-EM-ARCH
**Base:** [HLD Privacy v1.3](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.3.md) §6.3 · [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) H6 y D3 · [verificación de la Ley 2573](../informes/INFORME-PRIVACY-LEY-2573-VERIFICACION-v1.0.md)
**Plan:** [2026-11-03-privacy-denuncia-operador-orquestacion.md](../plans/2026-11-03-privacy-denuncia-operador-orquestacion.md) · **Prompt:** [PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0](../prompts/PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0.md)

> Las rutas se leyeron en `main` (`271b658f`) el 2026-11-03.

## 1. Fundamento

| Fuente | Contenido (paráfrasis) | URL oficial |
| --- | --- | --- |
| Ley 2573 de 2026, art. 8 | El operador comunica al titular que, desde ese momento, tiene **20 días hábiles** para denunciar ante la Fiscalía. Si no denuncia, el operador puede reanudar el cobro (par. 1) | [Normograma MinTIC](https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_2573_2026.htm) |
| **Sentencia C-413 de 2025**, sobre el art. 8, inciso tercero | Exequible en el entendido de que, **en el mismo término, el operador debe formular la denuncia penal** que corresponda | [Relatoría de la Corte Constitucional](https://www.corteconstitucional.gov.co/relatoria/2025/C-413-25.htm) |
| C-413 de 2025, sobre el art. 5 num. 7 | Son inexequibles las expresiones que exigían a la víctima copia de su denuncia | Ídem |
| Ley 2573, art. 13 | Rige el **19-11-2026**, según la Secretaría Jurídica Distrital | [SISJUR](https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?dt=S&i=193210) |

> La síntesis de los resolutivos de la C-413 se leyó en la relatoría; la sección «VI. Decisión» falta cotejarla.

## 2. Estado actual

- Al radicar una SUPLANTACION se crean dos tareas: `SUSPENDER_COBRO_EXTERNO`, que vence el día de la radicación, y `ENTREGAR_COPIA_DOCUMENTOS`, que vence con la solicitud (`requests.service.ts:336-356`, `requests-domain.ts:28-34`).
- Se calcula `impersonation_complaint_due_at` como la radicación más 20 días hábiles (`requests-domain.ts:24-25`), y el portal lo muestra (`PrivacyRequestDetail.tsx:398-401`).
- **No hay tarea para que el operador denuncie, ni registro de que se comunicó el plazo al titular.**
- No se pide al titular copia de su denuncia, lo que es conforme con la C-413.
- Para cerrar una tarea, `POST …/:id/tasks/:taskId/complete` exige `privacy.manage` y una nota (`requests.controller.ts:260-272`).
- Los tipos de tarea los limita un `CHECK` (`146_privacy_module.ts:421`) y el enum compartido `requestTaskKindSchema` (`packages/shared/src/schemas/privacy/requests.ts:44-47`).
- El portal elige la etiqueta con un ternario de dos casos (`PrivacyRequestDetail.tsx:510-512`).

## 3. Decisiones

### D-DO-1. Tarea «Formular denuncia penal del operador»

- `FORMULAR_DENUNCIA_OPERADOR` es un tipo de tarea nuevo. Se crea al radicar toda SUPLANTACION, junto a las dos existentes.
- **Vence** el día de `impersonation_complaint_due_at`: el mismo término que tiene el titular (C-413).
- **Para completarla** hay que indicar en la nota el número de radicado o de noticia criminal que entregó la Fiscalía o la Policía. No se suben archivos en esta fase. La nota tiene un máximo de 120 caracteres y se valida con Zod: obligatoria, sin saltos de línea. Es un dato del operador, no del titular, pero no se escribe en logs.
- Completarla no cambia el estado de la solicitud. Igual que las otras tareas, no bloquea `resolve`.

### D-DO-2. Tarea «Comunicar al titular el plazo para denunciar»

- `COMUNICAR_PLAZO_DENUNCIA` es otro tipo de tarea nuevo, que también se crea al radicar. **Vence el día de la radicación.**
- Para completarla, la nota registra el canal y la fecha de la comunicación, por ejemplo «Correo, 2026-11-20». Máximo 120 caracteres.
- **Anclaje:** los 20 días se siguen calculando desde la radicación, que es lo que propone la consulta 3(c). Si la tarea se completa después del día de radicación, el detalle muestra «Comunicación tardía», derivado de `doneAt` frente a `dueAt` y sin columna nueva. El vencimiento no se recalcula. Si el dictamen dice que los 20 días corren desde la comunicación efectiva, se ajusta en una versión posterior.

### D-DO-3. Contrato y datos

- **Migración tenant 172** (o el siguiente número libre en `runner.ts`, con sufijo único de 13 dígitos): reemplaza `ck_data_subject_request_tasks_kind` por un `CHECK` con los cuatro valores. El `down` vuelve a los dos originales y falla con un mensaje claro si existen filas con los valores nuevos; no las borra.
- **Backfill** en la misma migración: a cada SUPLANTACION que no esté en `RESUELTA`, `NO_PROCEDENTE` ni `TRASLADADA` se le insertan las dos tareas nuevas si no las tiene. La de denuncia vence en su `impersonation_complaint_due_at`; la de comunicación, en su `received_at`. Esta segunda queda vencida si ya pasó su fecha: así se refleja la realidad. La migración cuenta cuántas inserta, sin PII.
- `requestTaskKindSchema` en `@iwana/shared` pasa a tener los cuatro valores. La paridad con el `CHECK` se verifica con una prueba.
- `calculateRequestTaskDueAt` recibe `complaintDueAt` y devuelve:
  - `receivedAt` para `SUSPENDER_COBRO_EXTERNO` y `COMUNICAR_PLAZO_DENUNCIA`;
  - `complaintDueAt` para `FORMULAR_DENUNCIA_OPERADOR`;
  - `requestDueAt` para `ENTREGAR_COPIA_DOCUMENTOS`.

### D-DO-4. Portal

- El ternario de `PrivacyRequestDetail.tsx:510` pasa a ser un mapa exhaustivo con los cuatro tipos (`Record<RequestTaskKind, string>`): si mañana aparece un tipo nuevo, falla en compilación. Textos:
  - «Suspender el cobro en el sistema de facturación de la empresa» (sin cambios);
  - «Entregar copia de los documentos de aprobación» (sin cambios);
  - «Formular la denuncia penal de la empresa»;
  - «Comunicar al titular el plazo para denunciar».
- El diálogo para completar la tarea muestra, según el tipo, la ayuda de la nota: «Número de radicado o noticia criminal» o «Canal y fecha de la comunicación».
- Badge «Comunicación tardía» con el token de advertencia existente, sin color nuevo. `prod-ux` revisa el vocabulario con `system-vocabulary-review`.

## 4. Fuera de alcance

- Subir la constancia de la denuncia como archivo (Media).
- Que las alertas diarias cuenten las tareas vencidas.
- Reanudar el cobro al vencer los 20 días (art. 8 par. 1), que depende de la consulta 3(d) y de facturación.
- La evidencia de los protocolos de identificación (art. 5 par. 2), que depende de la consulta 3(e).

## 5. Criterios de aceptación

| # | Criterio | Tipo |
| --- | --- | --- |
| CA-DO-01 | Al radicar una SUPLANTACION se crean 4 tareas con sus vencimientos: suspensión y comunicación, el día de la radicación; denuncia, en `impersonation_complaint_due_at`; copia, en `due_at` | PG |
| CA-DO-02 | Completar la denuncia sin nota, con una nota de más de 120 caracteres o con saltos de línea → 400. Con una nota válida → 200, evento `TAREA_COMPLETADA:FORMULAR_DENUNCIA_OPERADOR` y auditoría sin la nota | HTTP + PG |
| CA-DO-03 | Sin `privacy.manage` → 403 (el decorador existente) | HTTP |
| CA-DO-04 | La comunicación completada después de la radicación aparece como «Comunicación tardía» en el detalle; el mismo día, no | Portal |
| CA-DO-05 | Migración: `up → down → up`. El `down` falla si hay filas nuevas. El backfill crea las tareas solo en las SUPLANTACION abiertas, una sola vez, y es idempotente | PG + migración |
| CA-DO-06 | Paridad entre `requestTaskKindSchema` y el `CHECK` | PG |
| CA-DO-07 | El portal muestra los cuatro textos, y un tipo desconocido no compila (mapa exhaustivo) | Portal + typecheck |
| CA-DO-08 | E2E de suplantación contra la API real: radicar, ver las 4 tareas y completar la denuncia con su radicado | E2E |
| CA-DO-09 | Regresión: las suites de privacidad y la E2E de Fase 1b siguen en verde sin ajustar sus expectativas, salvo las que cuentan tareas de suplantación (de 2 a 4), que se ajustan como categoría (b) citando D-DO-1 y D-DO-2 | PG + E2E |

Gates de AGENTS.md:
- cobertura ≥ 80 % sin bajar la línea base de `privacy/**` (94,61 % / 82,73 %);
- migración reversible;
- sin PII en logs;
- OpenAPI actualizado para el enum de tareas;
- integraciones PG con `IWANA_DB_INTEGRATION_AVAILABLE=true`, sin omisiones nuevas;
- G6.5 sobre el SHA publicado **antes del 19-11-2026**.

## 6. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El dictamen cambia D-DO-1 o D-DO-2 | Son tipos de tarea aditivos; un ajuste es una versión posterior, no un rediseño |
| Una prueba existente cuenta 2 tareas | Se ajusta como categoría (b), citando D-DO-1 y D-DO-2, y la revisa `test-change-reviewer` |
| Calendario hasta el 19-11 | Tres bloques en paralelo con rutas disjuntas (plan §2) |

## 7. Decisiones que pide esta spec al CTO (G0)

1. Construir ahora D-DO-1 y D-DO-2, sin esperar el dictamen.
2. Una nota con el número de radicado como única evidencia de la denuncia en esta fase, sin archivo.
3. Anclar los 20 días en la radicación y mostrar «Comunicación tardía», sin recalcular el vencimiento.
