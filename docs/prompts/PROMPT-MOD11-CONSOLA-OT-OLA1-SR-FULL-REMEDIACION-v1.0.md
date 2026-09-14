# PROMPT DE EJECUCIÓN — MOD11 Consola de OT · Ola 1 · Remediación de backend

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`)
**Fase que cubre:** remediación de C2 y C1 tras la auditoría de consolidación
**Estado:** **Ejecutable.** Bloquea el despacho de la Ola B (C3/C4).

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Encargo original: `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-SR-FULL-v1.0.md` — **entregado con GO condicionado**
- Informe de la fase: `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA1-SR-FULL-v1.0.md` v1.0
- Spec: `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 (Aprobada) — CA-06
- Plan: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.1

---

## 1. Objetivo exacto

Cerrar los dos hallazgos de la auditoría de consolidación. **Tu entrega anterior es correcta y se conserva**: C0, C1 y C2 quedaron verificados con conteo real (548 tests en `tasks`, typecheck sin caché, lint limpio) y la ampliación E2 del contrato congelado se ejecutó exactamente como se autorizó. Esto no es un rehacer: son dos correcciones acotadas.

**Lo que sí entra:** P1 (criterio de aceptación divergente) y P2 (degradación silenciosa residual), más sus tests y la corrección del informe.

**Lo que no entra:**

- Tocar el contrato `@iwana/shared`. **La ampliación v1.1 ya está cerrada y no se vuelve a abrir.**
- Cambiar la regla del evaluador para requisitos `EVIDENCE` en general. El cierre **solo** exige `assetStatus` para la aceptación del cliente; ampliarlo a toda evidencia es cambio de alcance.
- Ampliar `RegisterFieldWorkSchema` ni dar vía de captura a `FIELD`/`MEASUREMENT`. Sigue siendo deuda declarada (spec §10.1-10.2).
- Cualquier cambio en `apps/portal/`.

## 2. Hallazgo P1 — el criterio de aceptación diverge del cierre (bloqueante)

### Qué encontró la auditoría

`getCompletion` da por satisfecha la aceptación del cliente con **dos** condiciones (`apps/api/src/modules/tasks/services/execution-orders.service.ts:306-310`):

- `evidenceType === 'SIGNATURE'`
- `requirementKey === CUSTOMER_SIGNATURE_REQUIREMENT_KEY`

El cierre exige **tres**. `assertCustomerAcceptanceArtifactLinked` añade una tercera validación con su propio error:

```
if (linkedEvidence.assetStatus !== 'AVAILABLE') {
  throw new UnprocessableEntityException({
    code: 'CUSTOMER_ACCEPTANCE_ARTIFACT_NOT_AVAILABLE', …
```

**La ventana no es teórica.** La subida de evidencia responde `202 ACCEPTED` y deja el asset en cuarentena hasta que el worker de análisis lo promueve a `AVAILABLE` (`apps/worker/src/processors/evidence-analysis.processor.ts`). En ese intervalo —y de forma permanente si el análisis la rechaza o expira— el checklist publicaría **"aceptación cumplida"** y el cierre respondería **422**.

Es exactamente el defecto que esta ola vino a eliminar: la pantalla afirmando algo que el backend contradice. Y el comentario que acompaña al predicado —*"La misma fuente que el cierre considera aceptación válida"*— hoy es inexacto.

### Detalle que hace fallar el arreglo ingenuo — léelo antes de tocar nada

La query de evidencias **no selecciona `assetStatus`** (`:276-277`):

```
.select(['evidence.evidenceType', 'evidence.requirementKey'])
```

Si añades la condición al predicado **sin ampliar el `select`**, `evidence.assetStatus` llegará `undefined`, el predicado será siempre falso y **COMPLIANCE no se satisfará nunca**: habrás invertido el defecto en vez de cerrarlo, y los tests actuales de CA-06 lo detectarán como fallo. Amplía el `select` en el mismo cambio.

### Pasos

1. Añade `evidence.assetStatus` al `select` de la query de evidencias de `getCompletion`.
2. Añade `assetStatus === 'AVAILABLE'` como tercera condición del predicado `hasCustomerAcceptance`, alineándolo con `assertCustomerAcceptanceArtifactLinked`.
3. Corrige el comentario para que describa lo que el código hace: las **tres** condiciones, no dos.
4. Ten en cuenta que `assetStatus` es opcional y puede ser `null` en el contrato (`'PENDING' | 'PENDING_ANALYSIS' | 'AVAILABLE' | 'REJECTED' | 'EXPIRED' | 'CLAIM_FAILED' | null`). Una comparación estricta contra `'AVAILABLE'` es fail-closed y es lo correcto: coincide con el cierre.
5. **No toques** el mapeo de `context.evidences` que alimenta la regla `EVIDENCE`: esa regla no mira `assetStatus` y el cierre tampoco se lo exige.

## 3. Hallazgo P2 — degradación silenciosa residual (menor)

`resolveTechnicianDisplayLabel` loguea un `warn` cuando el lookup falla, pero la rama de servicio ausente retorna en silencio:

```
if (!this.usersService) {
  return undefined;
}
```

Hoy **no se dispara**: la auditoría verificó que `UsersModule` está importado en `apps/api/src/modules/tasks/tasks.module.ts:50` y la inyección funciona. El riesgo es futuro: si un refactor rompiera esa importación, el detalle volvería a *"Sin responsable asignado"* **sin ninguna señal** — el defecto A1 reapareciendo mudo, que es justo lo que C1 corrigió.

### Pasos

6. Emite un `warn` también en esa rama, distinguible del fallo de lookup (por ejemplo, nombrando que el directorio de usuarios no está disponible en el módulo).
7. Mantén el comportamiento: el `assignee` sigue viajando con su `id`. **No conviertas la ausencia en excepción**; la etiqueta es enriquecimiento, no núcleo.

## 4. Tests obligatorios

8. **Caso P1 — aceptación en cuarentena no cuenta.** Una OT con requisito `COMPLIANCE` y una evidencia `SIGNATURE` + `CUSTOMER_SIGNATURE` cuyo `assetStatus` **no** es `AVAILABLE` (usa `PENDING_ANALYSIS`, el estado real tras la subida) debe producir el requisito **insatisfecho**, con su razón.
9. **Caso P1 inverso — no invertir el defecto.** La misma OT con `assetStatus: 'AVAILABLE'` sigue produciendo el requisito **satisfecho**. Este caso es el que atrapa el arreglo ingenuo del §2.
10. Revisa los fixtures del spec existente: los casos que hoy verifican CA-06 deben declarar `assetStatus: 'AVAILABLE'` explícitamente, no depender de que el campo no se mire.
11. Corre con **conteo real**: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`. Un verde de caché no es evidencia.

## 5. Restricciones no negociables

- **Boundaries del Modulith intactos**; sin acceso a tablas de otro módulo.
- **Sin PII real** en fixtures.
- **Tenant isolation sin cambios**: el predicado sigue operando sobre evidencias ya filtradas por `executionOrderId` y `tenantId`.
- **No amplíes `@Roles` ni `@Permissions`.**
- Si el arreglo exigiera cambiar el contrato congelado, **detente y emite `[BLOQUEO]`**: no debería hacer falta, y si hace falta es una decisión de AI-EM-ARCH.

## 6. Entregables

- `getCompletion` con el predicado y el `select` alineados al cierre.
- La rama de servicio ausente con señal en logs.
- Los dos casos de test nuevos, en verde con conteo real.
- **Corrección del informe de fase** `INFORME-MOD11-CONSOLA-OT-OLA1-SR-FULL-v1.0.md`: pasa a v1.1 y su §5 deja de decir *"Ninguna deuda nueva"* — registra los dos hallazgos, su severidad y su cierre. Su §3 marca CA-06 como aceptado en firme, no con reserva.

## 7. Stop/go

**GO si y solo si:**

- Una evidencia de firma en cuarentena **no** satisface el requisito `COMPLIANCE` (CA-06 real).
- Una evidencia de firma `AVAILABLE` **sí** lo satisface: el defecto no quedó invertido.
- La suite del módulo `tasks` sigue en verde **con conteo real**, sin regresión sobre los 548 tests de la entrega anterior.
- `pnpm typecheck` y `eslint` limpios sobre lo tocado.
- El informe de fase ya no declara cero deuda.

**NO-GO si:** para alinear el criterio hubo que tocar el contrato de `@iwana/shared`, cambiar la regla `EVIDENCE` general, o modificar `assertCustomerAcceptanceArtifactLinked`. El cierre es la fuente de verdad de la aceptación: **quien se alinea es `getCompletion`**, no al revés.
