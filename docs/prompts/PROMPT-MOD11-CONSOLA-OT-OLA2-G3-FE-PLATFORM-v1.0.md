# PROMPT DE EJECUCIÓN — MOD11 Consola de OT · Ola 2 · Dictamen G3 (factibilidad)

**Versión:** 1.0
**Fecha:** 2026-10-05
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-FE-PLATFORM** (`fe-platform`)
**Tipo:** dictamen. **No se escribe código de producción.** Si los spikes dejan código, este se descarta antes de cerrar.

## Vínculos de trazabilidad

- Plan: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 (G2 cerrado el 2026-10-05; ver §Registro de bloqueos — Ola 2)
- **Contratos congelados**, que se citan y no se modifican:
  - UX: `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.1 (Aprobado)
  - Componente: `docs/specs/2026-10-05-mod11-consola-ot-requisito-contrato-componente.md` v1.0 (Aprobado)
  - Tablas: `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` **v1.2** (Aprobado). **Re-sync:** la v1.1 queda superada; la columna de ventana pasa a pintar «Por programar» y «Sin ventana planificada»
  - API: `packages/shared/src/contracts/operations/execution-orders.ts` v1.4 · `execution-orders-completion.ts` v1
- Spec base: `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.2

## 1. Objetivo

Emitir el **dictamen G3**: si la Ola 2b (R2 a R4 y la parte de portal de E4) se puede implementar tal como está contratada y con qué corte de bloques. Es la entrada del prompt de ejecución de la Ola 2b. Un dictamen que deja preguntas abiertas no cierra G3.

## 2. Preguntas que el dictamen responde, cada una con evidencia en el código

1. **Firma, transporte.** ¿El lienzo produce un binario que `POST :id/evidence-assets` acepta?
   - Hay que cubrir el MIME frente a la validación de magic bytes, el tope de 25 MB y la cuarentena con análisis asíncrono.
   - Después, el registro con `evidenceType = SIGNATURE` y `requirementKey = CUSTOMER_SIGNATURE`.
   - **`expiresAt` es obligatorio y debe ser futuro** (`dto/execution-orders.dto.ts:277-283`): ¿qué valor envía hoy el uploader y qué debe enviar la firma? No inventes una política de caducidad: si no hay una vigente, emite `[CONSULTA]`.
   - Confirma que `close()` acepta la evidencia ya registrada (`execution-orders.service.ts:1517-1520`, `method = SIGNATURE`).
2. **Firma, dependencia.** ¿Basta `<canvas>` nativo con eventos de puntero, o hace falta una librería? Si propones librería, el dictamen la **recomienda** con licencia, tamaño, mantenimiento y una alternativa nativa costeada. **No la instales**: la decisión es de AI-EM-ARCH y, si implica licencia o coste, del CTO.
3. **Corte del drawer.** `ExecutionOrderDrawer.tsx` pesa 92 KB. Propón cómo descomponerlo en `RequirementChecklist`, `RequirementActionSheet` y el contenedor por momento, de modo que **R2, R3, R4 y E4-portal no compartan archivo**. Si eso no es posible, declara el orden en que deben ir.
4. **Refetch selectivo (R4).** Mapa de mutación → qué se recarga, contrastado con `use-execution-order-console.ts`. Hoy `refreshExecutionOrder` relanza `openExecutionOrder`. Indica si hace falta un endpoint nuevo; la respuesta esperada es que no.
5. **Custodia bajo demanda (R3).** Cómo retirar la carga de custodia e inventario del `openExecutionOrder` y moverla a la apertura del acto `MATERIAL`, filtrada por categoría.
6. **Tipos del api-client.** ¿Siguen siendo anteriores a la v1.3 (`api-client.ts:6721-6781`, según el informe E2 §6)? Lista los derefs que el typecheck señalaría con los tipos regenerados.
7. **Copy residual.** Inventario de los mapas de copy duplicados (spec base §10.5: `requirementKindLabel` frente a `REQUIREMENT_KIND_LABELS`, y `syncStateCopy` frente a `syncCopy`), con propuesta de qué consolida la Ola 2b.
8. **Riesgo de regresión.** Qué suites existentes, entre ellas `ExecutionOrderConsolaOtOla1Regression.spec.tsx`, se rompen por diseño con la reestructuración y cuáles deben quedar intactas.

## 3. Restricciones

- No se modifica ningún contrato congelado. Si alguno resulta infactible, emite `[BLOQUEO]` contra el contrato concreto, citando ruta y sección.
- No se instalan dependencias.
- No se toca backend. El orden `DESC NULLS FIRST` es de `sr-backend` (datos de E4).

## 4. Skills

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `wcag-audit-patterns` |
| **De apoyo** | `typescript-expert`, para la pregunta 6; `frontend-security-coder`, para la pregunta 1 si el transporte del binario plantea dudas |
| **Descartadas** | `ui-ux-pro-max` e `iwana-identity-ui-review`, porque la presentación ya está contratada; `playwright-skill`, porque no hay flujo nuevo que verificar en un dictamen |

## 5. Entregable y stop/go

**Entregable:** `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2-G3-FE-PLATFORM-v1.0.md`, con las ocho respuestas, el corte de bloques propuesto para la Ola 2b y la recomendación sobre la firma.

**GO de G3:** las ocho preguntas están respondidas con evidencia, ningún contrato es infactible y el corte de la Ola 2b no deja dos bloques sobre el mismo archivo, o declara su orden.

**NO-GO:** un contrato es infactible (se emite `[BLOQUEO]`), o la firma solo es viable con una dependencia que nadie ha decidido. En ese caso G3 queda pendiente de esa decisión.
