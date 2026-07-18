# PROMPT - MOD12 Compras: PDF de RFQ Firma iWana (Fase 16)

**Version:** 1.0
**Estado:** Implementado (pendiente GO CTO)
**Fecha:** 2026-07-17
**Modo activo:** Ejecucion
**Generado por:** AI-DS-OWNER + AI-EM-ARCH
**Ejecutor:** AI-SR-FULL (backend PDFKit) + AI-SR-QA (tests)
**Archivo destino:** `docs/prompts/PROMPT-MOD12-COMPRAS-RFQ-PDF-FIRMA-IWANA-FASE-16-v1.0.md`
**Habilitada por:** `docs/specs/2026-07-17-mod12-compras-rfq-pdf-firma-iwana-fase16-design.md`
**Secuencia:** Despues de Fase 14/15 (personalizacion + ZIP). No modifica endpoints ni UI.

---

## 1. Objetivo exacto

Redisenar visualmente el PDF de RFQ generado por `buildRfqPdfDocument` para que aplique el contrato Firma iWana (tokens, tipografia embebida, membrete con logo, barra lima, tabla de lineas, pie), sin cambiar firmas publicas `renderForInvitation` / `renderAllInvitationsZip` ni la UI del portal.

## 2. Artefactos de entrada obligatorios

- Spec: `docs/specs/2026-07-17-mod12-compras-rfq-pdf-firma-iwana-fase16-design.md`
- Firma iWana: `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`
- Servicio: `apps/api/src/modules/inventory/services/rfq-pdf.service.ts`
- Tests: `apps/api/src/modules/inventory/tests/rfq-pdf.service.spec.ts`
- Labels RFQ: `apps/portal/src/components/inventory/inventory-labels.ts` (`PURCHASE_RFQ_STATUS_LABELS`) — replicar mapa minimo en API
- Logo fuente: `apps/portal/public/brand/iwiso6.png` → copiar a `apps/api/assets/brand/`
- Skills: `nestjs-expert`, `testing-patterns`, `iwana-identity-ui-review`, `docs-architect`

## 3. Alcance exacto

### 3.1 Assets

- `apps/api/assets/brand/iwiso6.png`
- `apps/api/assets/fonts/Exo2-Regular.ttf`, `Exo2-SemiBold.ttf`, `Exo2-Bold.ttf`
- `apps/api/assets/fonts/JetBrainsMono-Regular.ttf`
- `apps/api/assets/fonts/LICENSE` (OFL)

### 3.2 Backend

- Reescribir `buildRfqPdfDocument` (o extraer `rfq-pdf.layout.ts`) contra el contrato de la spec.
- Resolver assets con `path.join(__dirname, '../../../../assets/...')` (valido desde `src` y `dist`).
- Mapear `PurchaseRfqStatus` a labels en espanol (sin enums crudos).
- Renombrar seccion lista a **Destinatario**.
- Tabla Descripcion | Cantidad | UdM.
- Pie con «Documento generado por iWana neXt».

### 3.3 Tests

- Conservar CAs Fase 14/15.
- Aserciones de anatomia: Destinatario, Descripcion, Cantidad, UdM, pie, colores `#17163A` / `#A5C330` en stream PDF, `%PDF`, tamano minimo (logo).

### 3.4 Docs

- Informe vivo `docs/informes/INFORME-MOD12-COMPRAS-RFQ-PDF-FIRMA-IWANA-FASE-16-v1.0.md`
- Plan opcional en `docs/plans/2026-07-17-mod12-rfq-pdf-firma-iwana.md`

## 4. Fuera de alcance

- Logo tenant remoto, cambios de endpoints/UI, envio automatico, Puppeteer, tokens nuevos en `globals.css`.

## 5. Criterios de aceptacion

CA-16-01 … CA-16-06 segun spec.
