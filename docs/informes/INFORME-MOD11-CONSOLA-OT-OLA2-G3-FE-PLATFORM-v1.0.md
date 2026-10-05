# Informe G3 — Factibilidad de la Ola 2b de la consola de OT

- **Versión:** 1.0
- **Fecha:** 2026-10-05
- **Agente:** AI-FE-PLATFORM (`fe-platform`)
- **Dictamen:** **GO**

**Alcance de esta sesión:** lectura y factibilidad; sin cambios de producción, contratos ni dependencias.

## Fuentes congeladas y gate

- Plan `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2: G2 consta cerrado en el registro de bloqueos de la Ola 2. La sección 2b depende además de E3 en GO.
- UX `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.1, **Aprobado**.
- Componentes `docs/specs/2026-10-05-mod11-consola-ot-requisito-contrato-componente.md` v1.0, **Aprobado**.
- Tablas `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.2, **Aprobado**; v1.1 superada.
- API compartida: `packages/shared/src/contracts/operations/execution-orders.ts` v1.4 y `execution-orders-completion.ts` v1.

La UX, los componentes y las tablas son factibles con la arquitectura y las APIs existentes. No emito `[BLOQUEO]` ni `[CONSULTA]`. La firma puede usar el mismo vencimiento de su propio intento de carga que usa hoy el uploader; ese vencimiento no se interpreta como retención del archivo.

## §2 — Respuestas con evidencia

### 1. Firma: transporte, `expiresAt` y cierre

**Factible con sondeo del análisis antes del registro.** El canvas debe exportar PNG (`image/png`) a un `File` y usar `POST /tasks/execution-orders/:id/evidence-assets`. El parser limita el multipart a 25 MiB (`apps/api/src/modules/tasks/execution-orders.controller.ts:527-535`); el proveedor vuelve a aplicar el máximo (`apps/api/src/modules/media/evidence-asset.provider.ts:95-99`) y valida tanto la allowlist como los bytes reales (`:108-122`). `image/png` está permitido en `apps/api/src/modules/tasks/ports/evidence-asset.port.ts:110-117`, y `apps/api/src/modules/media/magic-bytes.ts:27` reconoce su firma PNG. Por tanto, MIME y magic bytes aceptan el binario de canvas si se envía como PNG auténtico.

La carga crea el asset en cuarentena y encola el análisis asíncrono (`apps/api/src/modules/media/evidence-asset.provider.ts:135-159, 198-210`); el recibo expone `PENDING_ANALYSIS` mientras no esté listo (`:367-383`). `registerEvidence()` consulta el estado y rechaza todo lo que todavía no sea `AVAILABLE` (`apps/api/src/modules/tasks/services/execution-orders.service.ts:2165-2180`). El uploader actual no espera: `use-execution-order-console.ts:569-587` sube y llama inmediatamente a `registerEvidence`. La Ola 2b debe usar el GET ya existente `GET :id/evidence-assets/:mediaAssetId` (`execution-orders.controller.ts:561-569`) hasta obtener `AVAILABLE`, o presentar el rechazo terminal si el análisis devuelve `REJECTED`/`EXPIRED`. El portal aún no expone ese GET desde `api-client.ts`; R2 necesita añadir su wrapper tipado, sin endpoint backend nuevo. La captura debe conservarse en memoria cuando el análisis o el registro fallen, conforme al contrato de componente §5.

El registro debe enviar explícitamente `evidenceType: 'SIGNATURE'`, `requirementKey: 'CUSTOMER_SIGNATURE'` y el `expiresAt` del recibo de ese mismo intento. El uploader actual valida y reenvía `uploadReceipt.expiresAt` (`use-execution-order-console.ts:574-584`). El intent nace con TTL de 24 horas (`execution-orders.service.ts:2350-2353`); tras vincular el asset, el servidor limpia `expiresAt` del intent (`:2417-2425`). La fecha representa el vencimiento del intento/reserva, no la retención de la evidencia firmada. El DTO genérico exige una fecha futura para los tres tipos `PHOTO`, `DOCUMENT` y `SIGNATURE` (`dto/execution-orders.dto.ts:275-303`), así que SIGNATURE reutiliza el valor que el servidor devuelve para su propia carga; no se fija una política de retención adicional.

El cierre existente es compatible: exige `customerAcceptance.method === 'SIGNATURE'` y comprueba que el artefacto referenciado esté vinculado a la OT, sea `SIGNATURE`, use `CUSTOMER_SIGNATURE` y esté disponible (`execution-orders.service.ts:1621-1670, 2931-2971`). La firma crea el artefacto; no reemplaza ni ejecuta `close()`.

### 2. Firma: dependencia

**Recomiendo canvas nativo**, con eventos de puntero y exportación PNG mediante `canvas.toBlob`. La lista permitida y el validador de contenido aceptan el formato que produce; no hay librería de firma en `apps/portal/package.json`, y el contrato de componentes §3.2/§7 no selecciona ninguna. No hace falta sumar paquete, licencia ni carga JavaScript de tercero. R2 debe acotar la superficie a trazo, limpiar, guardar y cancelar, y manejar errores de exportación/carga.

La superficie conserva instrucciones asociadas, foco gestionado, anuncios y controles nativos «Limpiar», «Guardar firma» y «Cancelar» operables por teclado, con targets mínimos de 44 px. Solo el trazo libre dependiente de trayectoria queda exceptuado por WCAG 2.1.1; no se convierte un nombre escrito en `SIGNATURE` (UX v1.1 §3.1/§9 y contrato de componente v1.0 §3.2). La ausencia de una vía alternativa para quien no puede usar puntero ya está declarada como deuda de v1; no bloquea el contrato congelado.

### 3. Corte del drawer y propiedad de archivos

`ExecutionOrderDrawer.tsx` mide **92.282 bytes y 2.192 líneas**. Contiene el resumen, compromiso, checklist, formularios de actividad, materiales, evidencia y cierre junto con su estado local. No conviene repartir ese monolito entre R2 y R3 en paralelo: hoy ambos necesitan su composición, y R2/R3/R4 también concurren sobre `use-execution-order-console.ts`.

**Corte recomendado para la Ola 2b:**

| Bloque | Archivos de su propiedad después del corte | Responsabilidad |
| --- | --- | --- |
| FE seam único, antes de despachar R2–R4 | `ExecutionOrderDrawer.tsx`, `ExecutionOrdersClient.tsx`, `use-execution-order-console.ts` y sus pruebas de integración | Extraer `RequirementChecklist`, `RequirementActionSheet` y `ExecutionOrderMomentContainer`; dejar contratos de props/acciones estables y delegar carga/mutación en adaptadores separados. Este bloque deja el drawer público como shell/composición. |
| R2 | `ExecutionOrderSignatureCapture.tsx`, `ExecutionOrderEvidenceAction.tsx`, `use-execution-order-evidence.ts`, wrapper GET en `apps/portal/src/lib/api-client.ts` y pruebas propias | Canvas, carga, sondeo del análisis y registro tipado por requisito. |
| R3 | `ExecutionOrderMaterialAction.tsx`, `use-execution-order-custody.ts` y pruebas propias | Acto MATERIAL, carga de custodia bajo demanda y filtro de categoría. |
| R4 | `use-execution-order-refresh.ts` y pruebas propias | Política de refetch selectivo; el hook fachada ya queda desacoplado por el FE seam. |
| E4-portal | `ExecutionOrdersTable.tsx`, `ExecutionOrderSummary.tsx`, `execution-order-window-copy.ts` si hace falta, y sus pruebas | Copy de ventana nula según tablas v1.2. Sin ordenación local. |

El seam tiene un solo propietario y se integra antes de abrir R2/R3/R4; después cada bloque trabaja sobre sus archivos de acción/refetch, sin editar el shell o la fachada compartidos. Las pruebas de integración que necesariamente cubran varios bloques se consolidan después del trabajo de cada propietario. E4 queda en archivos aparte y puede ejecutarse en paralelo con R2–R4 una vez separado el shell.

**Si el seam no se despacha como bloque previo**, el orden obligatorio para evitar colisiones sobre los archivos actuales es: **R3 (extracción y custodia) → R2 (captura y carga) → R4 (refetch)**. E4-portal permanece independiente sobre tabla y resumen. No lanzar R2/R3/R4 simultáneamente sobre `ExecutionOrderDrawer.tsx`, `ExecutionOrdersClient.tsx`, `use-execution-order-console.ts` o sus pruebas mientras sigan acoplados.

### 4. Refetch selectivo (R4)

No hace falta endpoint nuevo: están disponibles detalle y colecciones actuales. Hoy `refreshExecutionOrder()` vuelve a llamar `openExecutionOrder()` (`use-execution-order-console.ts:138-195, 302-304`), que vuelve a leer detalle, actividades, consumos, evidencias, ítems, ubicaciones móviles y custodia. Mapa selectivo propuesto:

| Mutación existente | Lecturas posteriores necesarias |
| --- | --- |
| Iniciar | Detalle: actualiza estado, versión y `allowedActions`. |
| Registrar, modificar o eliminar actividad | Detalle + actividades: actualiza versión/evaluación e historial de actividad. |
| Registrar consumo | Detalle + consumos; recargar la página/categoría de custodia solo si el acto MATERIAL queda abierto para otra operación. |
| Registrar evidencia/firma | Detalle + evidencias del requisito; no volver a cargar inventario/custodia ni actividades/consumos. |
| Cerrar | Detalle: actualiza estado terminal, versión y acciones. |

Los handlers que hoy invocan el refresco completo están en `use-execution-order-console.ts:443-609`. Deben quedar cubiertos `loading`, `error`, `success` y la conservación de datos previos según el contrato. La captura/registro no cambia el recurso: `GET :id`, `GET :id/activities`, `GET :id/item-usage` y `GET :id/evidence` bastan.

### 5. Custodia bajo demanda (R3)

`openExecutionOrder()` inicia hoy `getExecutorCustody(assigneeId)` y consulta inventario/ubicaciones móviles (`use-execution-order-console.ts:138-195`). Esa carga se mueve al momento en que se abre `RequirementActionSheet` para un descriptor `kind: 'consumption'`; no se dispara al abrir una OT ni en pre-inicio. Se consulta al responsable de `order.assignee.id`, no a un `StockLocation.id`: el propio hook documenta que `technicianCustodyId` requiere id de técnico/cuadrilla (`:181-189`).

El lookup de ítems debe limitarse a `category: itemCategory` y `status: ACTIVE` mediante `inventoryApi.listItems` (`api-client.ts:8065-8069, 8802-8818`). Para el snapshot vigente de instalación, el valor es CPE (UX §3; `InventoryItemCategory.CPE`). `getExecutorCustody` solo admite `page`/`limit`, no categoría (`api-client.ts:8957-8968`); sus registros sí enlazan por `SerializedAssetRecord.inventoryItemId` y `StockBalanceRecord.itemId` con los ítems devueltos (`:7348-7353, 7510-7519`). R3 puede filtrar en portal por ese conjunto de IDs sin modificar API. Debe conservar paginación y no mostrar un vacío definitivo hasta agotar páginas sin coincidencias.

### 6. Tipos de `api-client`

La observación E2 §6 sobre tipos anteriores a v1.3 ya no aplica al código actual. `apps/portal/tsconfig.json:7-11` dirige `@iwana/shared` a `packages/shared/src/index.ts`; `api-client.ts:6721-6740` reexporta/importa `ExecutionOrderListItem` desde ese contrato y `:6781` aliasa el detalle a `ExecutionOrderDetail`. Las definiciones actuales hacen `schedule.window` nulable (`execution-orders-list.ts:27-47`, `execution-orders.ts:70-78, 203-218`).

E2 §6 enumeraba los accesos que el typecheck habría señalado al regenerar esos tipos: `ExecutionOrdersTable.tsx` (el antiguo `order.schedule.window.startAt`) y `ExecutionOrderSummary.tsx` (el antiguo acceso a `window.startAt/endAt`). El hotfix ya protege ambos: la tabla comprueba `window` antes de formatear (`ExecutionOrdersTable.tsx:202-213`) y el resumen reduce a `null` el caso no-detail y renderiza la fecha solo dentro de `window ? … : …` (`ExecutionOrderSummary.tsx:194-196, 254-265`). No quedan derefs inseguros en portal; `ExecutionOrderDrawer`, `SchedulingClient` y `ScheduleEventDrawer` tampoco los tenían, como consigna E2 §6. El comportamiento visual aún pinta `'—'` en tabla/resumen y debe pasar a los dos textos de tablas v1.2 en E4; eso es deuda de presentación, no de tipos.

### 7. Copy residual duplicado

- `ExecutionOrderDrawer.tsx:234-249` duplica `REQUIREMENT_KIND_LABELS` de `execution-order-requirements.ts:78-86`. Los mapas no solo repiten kinds: difieren en contexto y texto («Actividad requerida» frente a «Actividad pendiente», etc.). Consolidar en `execution-order-requirements.ts` una única función tipada para fallback por kind, y hacer que tanto `requirementLabel` del checklist como `productRequirementLabel` de errores de cierre la consuman. Mantener siempre la etiqueta no vacía del snapshot literalmente; el fallback no debe sustituir datos reales.
- `ExecutionOrderDrawer.tsx:200-216` (`syncStateCopy`, sobre el enum de API) y `ExecutionOrderSummary.tsx:57-72` (`syncCopy`, sobre el estado de vista) mapean de nuevo PENDING/FAILED/DIVERGED. Consolidar traducción de estado API → estado visible y etiquetas en un helper de feature común, usando la misma fuente en resumen y drawer; mantener fuera del mapa solo las frases contextuales que explican qué puede hacer la persona.

La duplicación y la divergencia coinciden con la spec base v1.2 §10.5. No se propone nuevo token ni componente de `@iwana/ui`; es consolidación de copy dentro de la feature.

### 8. Riesgo de regresión y suites

**Expectativas que cambian intencionalmente con el nuevo contrato de UX:**

- `ExecutionOrderDrawer.spec.tsx`: la prueba «renders the 6 blocks» y los bloques 3–6 (actividad/material/evidencia/cierre), el formulario global de carga y las pruebas de custodia permanentemente visible ya no describirán la composición por requisito/momento. Reubicar los asserts en `RequirementChecklist`, `RequirementActionSheet` y sus acciones; preservar payloads, validaciones y resultados de cierre.
- `ExecutionOrdersClient.spec.tsx:346-552`: los casos que exigen consultar custodia al abrir el drawer deben convertirse en «sin consulta hasta MATERIAL», filtro por categoría, carga/error/vacío y paginación del acto.
- `ExecutionOrdersTable.spec.tsx:114-120` y `ExecutionOrderSummary.spec.tsx:132-155`: cambiar expectativa de `'—'` por «Por programar» para órdenes abiertas y «Sin ventana planificada» para terminales, como exige tablas v1.2 §7.2 y UX §7.

**Regresiones que deben seguir verdes, no eliminarse ni debilitarse:**

- `ExecutionOrderConsolaOtOla1Regression.spec.tsx`: CA-03/04 y checklist real/degradado, incluida la ausencia de alerta falsa para todos los roles en `IN_PROGRESS`.
- `ExecutionOrderDrawerCommitment.spec.tsx`: lente de rol y copy de compromiso C3/C4.
- `ExecutionOrderExperience.spec.tsx`: overlay único, foco, Escape, retorno de foco y target táctil de `OperationalSidePeek`.
- En `ExecutionOrderDrawer.spec.tsx`, conservar como comportamiento las pruebas de payloads, gate de cierre, modo offline y seguridad sin persistencia en storage; moverlas junto al nuevo componente dueño, no quitarlas.
- `ExecutionOrdersClient.spec.tsx`: deep links, autorización, lectura degradada y estado de bandeja quedan fuera del cambio de custodia y se mantienen. `use-execution-order-console.spec.ts` conserva reintento de apertura y gana cobertura del mapa selectivo.

No ejecuté typecheck, Jest ni pruebas de navegador: esta fase es un dictamen de solo lectura y no introdujo código que verificar.

## Cierre del §5 del encargo

**GO de factibilidad G3.** Las ocho preguntas quedan respondidas, no hay contrato infactible ni dependencia de firma pendiente, y el corte indica un seam FE de propietario único antes de separar R2–R4. Si no se incorpora ese seam, debe usarse el orden serial indicado para los tres bloques que hoy comparten archivos. El GO de lanzamiento de la Ola 2b sigue condicionado al GO separado de E3 y a los gates globales del plan v1.2.

**[BLOQUEO]: ninguno.**
**[CONSULTA]: ninguna.**
