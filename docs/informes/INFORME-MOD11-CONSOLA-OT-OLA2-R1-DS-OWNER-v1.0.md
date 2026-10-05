# Informe R1 — Contrato de componentes para la consola de OT

**Versión:** 1.0  
**Fecha:** 2026-10-05  
**Agente:** AI-DS-OWNER  
**Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R1-DS-OWNER-v1.0.md`  
**Resultado:** **GO para G2**, sujeto al consumo de los artefactos versionados por el orquestador y los agentes de implementación/QA.

## 1. Fuentes verificadas

Leí `AGENTS.md`, `.github/copilot-instructions.md`, el plan MOD11 v1.2, el encargo R1 completo, la spec UX R0 v1.1, la adenda A2 incluida en el encargo R0 y su informe final v1.2. R0 publicó cinco necesidades en la spec §11.1 y las ratificó en el informe §6; no hay handoff pendiente.

Leí antes de redactar las skills obligatorias `core-components`, `senior-ui-systems-designer`, `tailwind-patterns`, `iwana-identity-ui-review` y `wcag-audit-patterns`. Revisé primitives/exportaciones de `@iwana/ui`, tokens activos en `globals.css`, la dirección de Firma iWana, la identidad y los prototipos disponibles. Contrasté los contratos de datos requeridos: `execution-orders-completion.ts` v1, `execution-orders.ts` v1.4 y `ExecutionOrderListItem` del listado; no los modifiqué.

## 2. Cobertura de la salida obligatoria §6

| Criterio de GO | Evidencia | Resultado |
| --- | --- | --- |
| API, tokens y estados completos para `RequirementChecklist` | Contrato de componente §§2.1–2.4 y 5: API lógica, mapeo por clave de snapshot, estados degradados, superficies, claro/oscuro, hover/focus/active/disabled/loading/skeleton/empty/error/success/readonly/offline | Cumple |
| API, tokens y estados completos para `RequirementActionSheet` | Contrato §§3.1–3.2 y 5: descriptor de acción, composición, convivencia con drawer, controles, estados de escritura y foco | Cumple |
| Veredicto anti-duplicación | Contrato §4: tabla de 9 primitives requeridas y primitives auxiliares; composites quedan en Operations y reutilizan controles base | Cumple |
| «Sin ventana» resuelta | Contrato de tablas v1.2 §7.2: estado nulo depende de `ExecutionOrderListItem.status`; v1.1 marcada superada en el mismo acto y changelog añadido | Cumple |
| Necesidades de R0 cubiertas | Contrato §8 y el cruce detallado de §3 de este informe frente a UX §11.1 | Cumple |
| Sin `[DESEMPATE]` abierto | Contratos v1.4/v1 publicados y decisiones A2 compatibles; no se encontró conflicto que exceda carril rápido | Cumple |

### 2.1 Cruce con las cinco necesidades finales de R0

1. **API y permisos:** `RequirementChecklist` usa el snapshot como lista ordenada y une `key` con `requirementId`. `RequirementActionSheet` solo recibe un descriptor ya derivado de `allowedActions`, estado y momento; no recibe identidad ni rol. Sin descriptor no hay acción. La variante `COMPLIANCE` se integra al `CLOSE` existente y no inventa un permiso `REGISTER_ACCEPTANCE`.
2. **Estados textuales:** el contrato fija «Cumplido», «Pendiente», «Sin registrar» y «Estado no disponible», además de «Obligatorio»/«Opcional». El texto y la relación con la fila anuncian el estado; el color no es canal único. La etiqueta opcional del snapshot se conserva literalmente.
3. **Ventana nula E4:** la v1.1 no soportaba la diferencia semántica; se eligió versionar. Tabla v1.2 muestra «Por programar» en `CREATED`, `ASSIGNED`, `EN_ROUTE`, `IN_PROGRESS` y `BLOCKED`; «Sin ventana planificada» en `COMPLETED`, `COMPLETED_WITH_OBSERVATIONS`, `NOT_EXECUTED` y `CANCELLED`. No se añade columna ni ordenación local. El contrato de orden deja previsto v1.3 para una futura capability de orden.
4. **Historial y firma:** los registros permanecen bajo el requisito de origen, asociados por clave exacta, y la acción es temporal dentro del expediente. Instrucciones y botones «Limpiar», «Guardar firma» y «Cancelar» requieren teclado, foco gestionado, objetivo táctil y anuncios. Solo el trazo dependiente de trayectoria queda exceptuado por WCAG 2.1.1. No se acepta nombre escrito como `SIGNATURE` ni se elige librería.
5. **Carga, error y offline:** se usan `SkeletonBlock`, `Alert`, `FormStatus` y copy existente. Offline bloquea escrituras y no ofrece borrador persistido. Los datos válidos sobreviven al error de lectura; la captura sobrevive al error de subida para reintentar o cancelar.

## 3. Decisiones de sistema de diseño

Los composites son específicos de la feature Operations porque coordinan snapshot de plantilla, evaluación, permiso contextual e historial por clave. No reemplazan ni duplican un primitive genérico. `SectionHeader`, `ProgressMeter`, `Badge`, `Alert`, `Button`, campos de formulario, `FormStatus` y `SkeletonBlock` se reutilizan. `SectionAccordion` no se usa; `CheckboxCard` no modela una fila; `OperationalSidePeek` conserva el drawer único; `ModalLayer` y `Dialog` no se anidan.

No se añaden tokens de marca. La matriz de contraste del contrato usa tokens actuales y calcula AA en ambos temas: texto principal claro/oscuro 17.32:1/15.91:1; texto secundario 4.83:1/6.27:1; badge cumplido 7.47:1/7.89:1; badge pendiente 6.87:1/8.57:1; estado informativo 14.12:1/9.35:1. La firma mantiene foco visible, controles por teclado y anuncios; la excepción se limita al gesto de trazo ([W3C SC 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard)).

## 4. Artefactos publicados y gates

- Contrato nuevo en estado **Borrador para G2**: `docs/specs/2026-10-05-mod11-consola-ot-requisito-contrato-componente.md` v1.0.
- Contrato de tablas operativas ampliado a **v1.2 Aprobado**: `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md`; v1.1 superada en el mismo acto y changelog actualizado.
- UX spec R0 v1.1 e informe R0 v1.2 permanecen intactos.
- Mi trabajo no modificó código, contratos de datos, plan, tokens ni componentes. No se hizo commit.
- El encargo declara que no hay gate ejecutable en R1. No se ejecutaron pruebas; `git diff --check` no reportó errores de whitespace.

El cambio de tablas es carril rápido de UI: no modifica alcance, contrato de datos, boundary ni tokens. Conforme al protocolo §3bis, el orquestador debe comunicar el contrato v1.2 congelado a AI-FE-PLATFORM y AI-SR-QA antes de su implementación/validación.

## 5. Entradas para G3 y deuda fuera de R1

AI-FE-PLATFORM debe confirmar en G3 el MIME, tamaño y `expiresAt` del artefacto `SIGNATURE` con el endpoint vigente; identificar si existe una biblioteca aprobada y registrar decisión antes de agregar dependencia nueva; validar teclado, foco y anuncios; consultar custodia solo al abrir la acción `MATERIAL`; aplicar refetch selectivo; mantener el orden server-owned estable con paginación; y preservar la referencia a evidencia en `close()`.

Deuda heredada, no bloqueante para G2: no hay en v1 una alternativa de firma para quien no puede usar puntero; el análisis de una alternativa electrónica requiere fuente jurídica oficial y queda fuera de R1. La etiqueta «Registro de la actividad en bitácora (NO requerido)» permanece literal hasta una futura versión de la plantilla. La propuesta de orden E4 en tres tramos queda diferida según A2 y no se implementa en este contrato.

## 6. Decisión de salida

**GO para §6 del encargo R1.** Los dos componentes tienen API, tokens existentes y estados completos, incluyendo degradados; el veredicto anti-duplicación está escrito; E4 quedó versionado a v1.2 con la v1.1 superada; cada necesidad final de R0 está trazada; y no queda `[DESEMPATE]` abierto. No se emitió `[BLOQUEO]`.
