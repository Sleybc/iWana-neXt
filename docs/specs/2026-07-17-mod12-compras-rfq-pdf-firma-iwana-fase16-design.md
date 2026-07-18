# SPEC: PDF de RFQ alineado a Firma iWana — MOD12 Compras (Fase 16)

**Versión:** 1.0
**Estado:** Aprobado para ejecución (carril rápido AI-DS-OWNER)
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Submódulo Compras (purchasing)
**Superficie:** Portal tenant → `/dashboard/inventory?tab=purchasing` → Trabajar solicitud → Cotizar → Invitar proveedores → Descargar PDF / ZIP
**Generado por:** AI-DS-OWNER (contrato) + AI-EM-ARCH (alcance)
**Clasificación:** Uso interno

---

## 1. Trazabilidad

| Artefacto | Relación |
| --- | --- |
| [2026-07-17-mod12-compras-rfq-pdf-personalizado-fase14-design.md](./2026-07-17-mod12-compras-rfq-pdf-personalizado-fase14-design.md) | Fase 14 — PDF personalizado + contacto tenant |
| [INFORME-MOD12-COMPRAS-RFQ-PDF-ZIP-FASE-15-v1.0.md](../informes/INFORME-MOD12-COMPRAS-RFQ-PDF-ZIP-FASE-15-v1.0.md) | Fase 15 — PDF por fila + ZIP |
| [2026-07-12-firma-iwana-diseno-visual-design.md](./2026-07-12-firma-iwana-diseno-visual-design.md) | Dirección visual Firma iWana |
| `apps/api/src/modules/inventory/services/rfq-pdf.service.ts` | Servicio a rediseñar visualmente (mismo builder para invitación y ZIP) |

**Numeración:** Fases 11–13 reservadas (rondas / envío / comparación). Fase 14–15 cerraron personalización y entrega. Esta fase es **Fase 16** — solo look&feel.

## 2. Contexto

`buildRfqPdfDocument` genera un PDF tipográfico en grises (`#111` / `#333`) con Helvetica, sin logo, sin barra lima y con líneas en bullets. El comprador envía ese documento a proveedores; no se reconoce como iWana.

## 3. Decisión de alcance (congelada)

1. **Lenguaje visual Firma iWana** sobre el documento del tenant (contacto ya vía `TenantContactPort`).
2. **Logo:** isotipo de plataforma embebido desde asset estático (`apps/api/assets/brand/iwiso6.png`). Sin fetch de `logoLightUrl` del tenant.
3. **Tipografía:** Exo 2 + JetBrains Mono embebidas (OFL) en `apps/api/assets/fonts/`. Sin fallback silencioso a Helvetica.
4. **Stack:** PDFKit (sin Puppeteer/HTML).
5. **Endpoints y UI Fase 15:** sin cambios.

## 4. Contrato visual

### 4.1 Tokens

| Rol | Hex |
| --- | --- |
| Primario / texto / títulos | `#17163A` |
| Acento barra membrete | `#A5C330` |
| Texto lima (si aplica) | `#6A7A1C` |
| Fondo franja header | `#F8FAF5` |
| Hairline / neutro | `#AEAEAD` |
| Fondo página | `#FFFFFF` |

Prohibido: lima como urgencia; degradado azul→lima decorativo en cabecera; `#A5C330` como texto sobre blanco.

### 4.2 Anatomía

1. Membrete: franja `surface-soft` + logo + título «Solicitud de cotización»
2. Barra lima full-width (~3–4 pt)
3. Meta: número RFQ (mono), solicitud, moneda (mono), fecha límite, estado (label español)
4. Dirigido a (si aplica)
5. Notas (si aplica)
6. Destinatario (sección renombrada; un proveedor por PDF)
7. Tabla de líneas: Descripción | Cantidad | UdM
8. Contacto del tenant
9. Pie: «Documento generado por iWana neXt» + número RFQ + página

### 4.3 Tipografía

| Uso | Fuente |
| --- | --- |
| Títulos / cuerpo | Exo 2 Regular / SemiBold / Bold |
| RFQ number, moneda, cantidades | JetBrains Mono Regular |

## 5. Fuera de alcance

- Logo tenant remoto, envío automático, cambio de endpoints/UI, tokens nuevos en `globals.css`, ADR de stack.

## 6. Criterios de aceptación

| ID | Criterio |
| --- | --- |
| CA-16-01 | PDF personalizado y ZIP usan el mismo layout Firma iWana |
| CA-16-02 | Presentes `#17163A`, barra `#A5C330`, logo embebido, tipografías registradas |
| CA-16-03 | Líneas en tabla; cantidades en mono |
| CA-16-04 | Contacto tenant + dirigido a se mantienen |
| CA-16-05 | Sin regresión endpoints/UI Fase 15; tests API verdes |
| CA-16-06 | Sin PII nueva; sin fetch remoto de logos |
