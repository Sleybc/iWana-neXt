# PROMPT DE EJECUCIÓN — MOD12 Compras · Registrar oferta por invitación RFQ — Fase 17

**Versión:** 1.0
**Gate:** G4 emitido por AI-EM-ARCH — habilita etapa 5 (implementación)
**Ejecutor:** AI-FE-PLATFORM (frontend). **Prohibido tocar backend.**
**Spec base (leer primero):** [2026-07-17-mod12-compras-rfq-registro-oferta-fase17-design.md](../specs/2026-07-17-mod12-compras-rfq-registro-oferta-fase17-design.md)
**Precedencia:** `AGENTS.md` → CTO/ADRs → PRD MOD12 → este prompt. Skills: `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `testing-patterns`.

---

## 0. Objetivo en una línea

Añadir en `RfqInvitationsPanel` el registro de oferta **por proveedor invitado** (ligada a `rfqInvitationId`), reutilizando `purchasingApi.addQuote`. **Solo frontend.**

## 1. Restricciones (STOP si se violan)

1. **NO** modificar backend, DTO, endpoints, OpenAPI, ni migraciones. Todo el contrato ya existe.
2. **NO** crear helpers/librerías nuevas: reutilizar `purchasingApi.addQuote`, `PURCHASE_CURRENCY_OPTIONS`/`PurchaseCurrencyOption`/`formatInventoryCurrency` (`./inventory-labels`), `runAction`, `interactiveFocusClassName`, `Button`/`Input`/`Select` de `@iwana/ui`.
3. **NO** tocar la ruta manual "Nueva oferta" del drawer ni el flujo "sin ronda formal".
4. **NO** añadir tokens, componentes de design system ni dependencias. Si algo parece exigirlo → **STOP** y consultar a AI-EM-ARCH.
5. Texto visible en **español, sentence case**. Sin enums crudos.

## 2. Archivos a modificar

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/inventory/RfqInvitationsPanel.tsx` | Estado del form, handler, botón + form inline por fila, monto solo-lectura, prop `quotes` |
| `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx` | Pasar `quotes={detail?.quotes ?? []}` al panel |
| `apps/portal/src/components/inventory/RfqInvitationsPanel.spec.tsx` | Casos nuevos (ver §5) |
| `docs/informes/INFORME-MOD12-COMPRAS-RFQ-REGISTRO-OFERTA-FASE-17-v1.0.md` | Informe vivo de cierre |

## 3. Implementación — `RfqInvitationsPanel.tsx`

### 3.1 Props e imports
- Añadir a `RfqInvitationsPanelProps`: `quotes?: SupplierQuoteRecord[];` (default `[]` al desestructurar).
- Importar el tipo `SupplierQuoteRecord` de `@/lib/api-client` y `formatInventoryCurrency` de `./inventory-labels`.

### 3.2 Estado local
```ts
const [quoteFormInvitationId, setQuoteFormInvitationId] = useState<string | null>(null);
const [quoteNumber, setQuoteNumber] = useState('');
const [quoteAmount, setQuoteAmount] = useState('');
const [quoteCurrency, setQuoteCurrency] = useState<PurchaseCurrencyOption>('COP');
```
Al abrir el form de una invitación, inicializar `quoteCurrency` con `(rfq?.currency as PurchaseCurrencyOption) ?? 'COP'` y limpiar `quoteNumber`/`quoteAmount`.

### 3.3 Derivados
- `const parsedQuoteAmount = Number.parseFloat(quoteAmount);`
- `const quoteAmountValid = Number.isFinite(parsedQuoteAmount) && parsedQuoteAmount > 0;`
- Mapa de oferta por invitación: `quotes.find((q) => q.rfqInvitationId === invitation.id)`.
- `function canRegisterQuote(rfqStatus, invitationStatus)` → `rfqStatus ∈ {SENT, RECEIVING} && invitationStatus === INVITED`.

### 3.4 Handler (usar `runAction` existente)
```ts
async function handleRegisterInvitationQuote(invitation: PurchaseRfqInvitationRecord) {
  if (!quoteAmountValid || quoteNumber.trim().length === 0) return;
  await runAction(async () => {
    await purchasingApi.addQuote(purchaseRequestId, {
      partyRefId: invitation.partyRefId,
      rfqInvitationId: invitation.id,
      quoteNumber: quoteNumber.trim(),
      amount: parsedQuoteAmount,
      currency: quoteCurrency,
    });
    setQuoteFormInvitationId(null);
    setQuoteNumber('');
    setQuoteAmount('');
  }, 'Oferta registrada.');
}
```
> `runAction` ya hace `setError`/`setSuccess`/`onRefresh`. No dupliques ese manejo.

### 3.5 UI por fila (dentro de `invitations.map`)
- Junto a los botones actuales, si `canRegisterQuote(rfqStatus, invitationStatus)` → botón `size="sm" variant="secondary"` **"Registrar oferta"** con `aria-label={\`Registrar oferta de ${supplierName}\`}` y `disabled={panelDisabled}` que hace `setQuoteFormInvitationId(invitation.id)` (+ inicializa moneda/limpia campos).
- Si la invitación tiene oferta ligada (match en `quotes`) → mostrar `formatInventoryCurrency(quote.amount)` (solo lectura) en la fila.
- Cuando `quoteFormInvitationId === invitation.id` → renderizar **form inline bajo la fila** con `Input` (Número de cotización), `Input type="number"` (Monto, `min="0.01" step="0.01" inputMode="decimal"`, error inline si tocado e inválido), `Select` (Moneda con `PURCHASE_CURRENCY_OPTIONS`), botón **"Guardar oferta"** (`disabled={panelDisabled || !quoteAmountValid || !quoteNumber.trim()}`, `onClick` → `handleRegisterInvitationQuote(invitation)`) y **"Cancelar"** (`variant="ghost"`, cierra el form).

## 4. Implementación — `PurchaseRequestWorkbenchDrawer.tsx`

En el render de `<RfqInvitationsPanel ... />` (≈ línea 544), añadir la prop:
```tsx
quotes={detail?.quotes ?? []}
```
Nada más.

## 5. Tests — `RfqInvitationsPanel.spec.tsx`

Mockear `purchasingApi.addQuote`. Casos:
1. **CA-17-01/02:** RFQ `SENT` + invitación `INVITED` → clic "Registrar oferta de Proveedor Alfa", llenar número/monto, "Guardar oferta" → `addQuote` llamado con `{ partyRefId, rfqInvitationId: 'inv-1', quoteNumber, amount, currency }`; `onRefresh` invocado.
3. **CA-17-02:** invitación `RESPONDED` con quote en `quotes` → sin botón "Registrar oferta"; muestra el monto formateado.
4. **CA-17-03:** RFQ `DRAFT`/`CLOSED` → sin botón en ninguna fila.
5. **CA-17-04:** monto `0`/vacío o número vacío → "Guardar oferta" deshabilitado.
6. **CA-17-05:** `addQuote` rechaza (409) → alerta de error visible, panel sigue vivo.

Mantener verdes los 4 tests existentes (fila PDF, ZIP, hint, error de fila).

## 6. Informe vivo (obligatorio al cerrar)

Crear `docs/informes/INFORME-MOD12-COMPRAS-RFQ-REGISTRO-OFERTA-FASE-17-v1.0.md` con: contexto/hueco, cambios, tabla CA-17-01..06, tabla de verificación (suites + resultados), y sección de protocolo (G5/G6). Patrón: [INFORME Fase 15](../informes/INFORME-MOD12-COMPRAS-RFQ-PDF-ZIP-FASE-15-v1.0.md).

## 7. Verificación (gates técnicos §4 del protocolo) — STOP/GO

Ejecutar y adjuntar resultados reales (no declarativos):

```bash
# Frontend unit
pnpm --filter @iwana/portal exec jest src/components/inventory/RfqInvitationsPanel.spec.tsx src/components/inventory/PurchaseRequestWorkbenchDrawer.spec.tsx
# Regresión backend (sin cambios de código)
cd apps/api && npx jest src/modules/inventory/tests/rfq.service.spec.ts src/modules/inventory/tests/purchasing.flow.integration.spec.ts
# Typecheck + lint
pnpm --filter @iwana/portal exec tsc --noEmit
cd apps/portal && npx eslint src/components/inventory/RfqInvitationsPanel.tsx src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx src/components/inventory/RfqInvitationsPanel.spec.tsx
```

**GO** solo si: todos los tests verdes, typecheck y lint limpios, y CA-17-01..06 cubiertos. Cualquier necesidad de tocar backend/contrato → **STOP** y escalar a AI-EM-ARCH (sería un cambio de alcance, no un parche de implementación).

## 8. E2E manual recomendado (verify skill)

`pnpm dev` → RFQ en Borrador → invitar 2 proveedores → "Enviar solicitud" (`SENT`) → "Registrar oferta" en cada fila → confirmar: invitación `RESPONDED` + monto, oferta en "Comparación de ofertas", segundo intento sobre la misma invitación muestra 409, y la solicitud puede pasar a aprobación.
