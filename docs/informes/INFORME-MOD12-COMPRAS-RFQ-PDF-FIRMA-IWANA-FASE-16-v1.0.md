# INFORME — MOD12 Compras RFQ PDF Firma iWana Fase 16

**Versión:** 1.0  
**Estado:** Implementado — pendiente GO CTO  
**Fecha:** 2026-07-17  
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ  
**Ejecutor:** AI-SR-FULL (layout PDFKit) + AI-DS-OWNER (contrato) + AI-SR-QA (tests)  
**Prompt:** `docs/prompts/PROMPT-MOD12-COMPRAS-RFQ-PDF-FIRMA-IWANA-FASE-16-v1.0.md`  
**Spec:** `docs/specs/2026-07-17-mod12-compras-rfq-pdf-firma-iwana-fase16-design.md`  
**Antecede:** Fase 14 (PDF personalizado) + Fase 15 (ZIP / PDF por fila)

## Objetivo

Aplicar el contrato visual **Firma iWana** al PDF de RFQ (membrete, barra lima, tipografía embebida, tabla de líneas, pie), sin cambiar endpoints ni UI de descarga.

## Cambios

### Assets (`apps/api/assets/`)
- `brand/iwiso6.png` — isotipo plataforma
- `fonts/Exo2-{Regular,SemiBold,Bold}.ttf` + `JetBrainsMono-Regular.ttf` (OFL)
- `fonts/LICENSE` + OFL por familia

### Backend
- Nuevo [`rfq-pdf.layout.ts`](../../apps/api/src/modules/inventory/services/rfq-pdf.layout.ts): tokens, registro de fuentes, membrete, barra `#A5C330`, tabla Descripción/Cantidad/UdM, pie, metadatos ASCII buscables, labels de estado en español
- [`rfq-pdf.service.ts`](../../apps/api/src/modules/inventory/services/rfq-pdf.service.ts): delega construcción a `buildRfqPdfDocument`; firmas `renderForInvitation` / `renderAllInvitationsZip` intactas

### Portal
- Sin cambios funcionales

## Criterios de aceptación

| CA | Estado |
| --- | --- |
| CA-16-01 PDF personalizado y ZIP mismo layout | Implementado + unit |
| CA-16-02 Tokens, logo, tipografías | Implementado + unit |
| CA-16-03 Tabla de líneas + cantidades mono | Implementado + unit |
| CA-16-04 Contacto + dirigido a | Implementado + unit (regresión 14/15) |
| CA-16-05 Sin regresión endpoints/UI | Cumplido (sin tocar) |
| CA-16-06 Sin PII nueva / sin fetch remoto | Cumplido |

## Verificación

| Suite | Resultado |
| --- | --- |
| API `rfq-pdf.service.spec` | **5/5 pass** |
| Typecheck `@iwana/api` | **OK** |

## Protocolo multiagente

| Rol | Track | Veredicto |
| --- | --- | --- |
| AI-DS-OWNER | Contrato visual congelado en spec | GO (carril rápido; sin cambio de tokens globales) |
| AI-SR-FULL | Implementación PDFKit | Completa |
| AI-SR-QA | CA-16 + regresión 14/15 | GO (tests verdes) |
| AI-EM-ARCH / CTO | GO producción | Pendiente |

## Fuera de alcance (confirmado)

- Logo tenant remoto, envío automático, Puppeteer, cambios UI Fase 15

## Notas técnicas

- Las fuentes TTF personalizadas no dejan texto legible en literales hex del content stream; los tests asertan contenido vía metadatos PDF (`Title`/`Subject`/`Keywords`) + operadores de color `scn` + nombres de fuente embebidos.
- Assets resueltos con `path.join(__dirname, '../../../../assets/...')` (válido desde `src` y `dist` sin copiar a `dist/`).

## Remedición — páginas vacías (2026-07-17)

**Síntoma:** el PDF de una RFQ corta generaba 3 páginas (1 con contenido + 2 casi vacías).

**Causa raíz (AI-SR-FULL + systematic-debugging):** PDFKit añade una página nueva cuando `text()` se dibuja fuera de los márgenes top/bottom. El membrete (y &lt; top) y el pie (y &gt; height − bottom) disparaban saltos; el bucle del pie amplificaba el conteo a 3.

**Fix:** helper `withOpenVerticalMargins` al dibujar header/footer; márgenes `top: 96` / `bottom: 56` para reservar franjas; test unitario que exige exactamente 1 página en RFQ corta.
