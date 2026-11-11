# ADR-109: Contrato de servicio firmado en la instalación y generación del PDF en el worker

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** el usuario, 2026-11-11 — «Apruebo ambos» (spec G0 y ADR-109)
**Fecha:** 2026-11-11
**Autor:** Claude Code (AI-EM-ARCH, modo ejecutor) · **Revisión pendiente:** AI-SEC-ENG, AI-PLAT-OPS
**Módulos:** MOD05 CRM (dueño del contrato) · worker · MOD11 OT · MOD14 Facturación · MOD06 Comercial
**Cierra:** el tramo T2 «Contrato legal verificable» de [ADR-088](ADR-088-Cierre-OT-y-Culminacion-Instalacion-Hitos-Separados.md) y de la [spec del acta MOD11](../specs/2026-09-14-mod11-acta-instalacion-design.md) §9
**Respeta:** [ADR-098](ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md) D8 (el aprovisionamiento no activa contratos)
**Spec:** [2026-11-11-mod05-cierre-de-venta-contrato-firmado](../specs/2026-11-11-mod05-cierre-de-venta-contrato-firmado.md)

---

## 1. Contexto

- El contrato pasa de `DRAFT` a `ACTIVE` solo por una acción manual que no deja prueba de firma ni emite evento (ADR-088:30). El PRD maestro exige firma de contrato con cláusulas CRC en el MVP (RF-CRM-04, R03).
- La CRC obliga a usar el Formato 2.3.1 del Anexo 2.3 (Res. 7811 de 2025, vigente desde 2026-01-01; no lo modifica la Res. 8171 de 2026). Solo admite cambios en campos acotados y su formato es tipográfico (Calibri 13/11), difícil de reproducir con `pdfkit`.
- No hay proveedor de SMS ni WhatsApp. El técnico ya captura firma manuscrita en canvas para el acta de conformidad (MOD11).
- El usuario decidió (spec D1–D6, G1): firma manuscrita con evidencia en la visita, tras aprovisionar y comprobar el servicio; cobro desde la activación del aprovisionamiento; plantilla HTML convertida a PDF con Chromium **en el worker**.

## 2. Decisión

**D1 · Modelo de firma.** El contrato se firma en la consola de OT con firma manuscrita en canvas. Se guarda como evidencia: imagen de la firma, nombre y documento de quien firma, fecha y hora del servidor, técnico, ubicación aproximada, dispositivo, versión de plantilla y huella SHA-256 del PDF final con la firma incrustada. Esta firma es distinta del acta de conformidad de la OT (ADR-088 D3), aunque ocurran en la misma visita.

**D2 · Activación.** La firma, y no el aprovisionamiento, pasa el contrato de `DRAFT` a `ACTIVE`. `billing_start_date` toma la fecha de activación del aprovisionamiento. Se emite `crm.contract.activated` por outbox, con solo identificadores. Se conserva la activación manual para ADMIN, con motivo obligatorio y auditoría.

**D3 · Pendiente de firma.** Con servicio aprovisionado y contrato sin firmar, la activación comercial queda `BLOCKED` con el motivo nuevo `CONTRACT_UNSIGNED`. Un trabajo diario avisa a las 48 h a quien tenga `crm.contracts.pending_signature.notify` (por defecto ACCOUNTANT y NOC). No hay suspensión automática.

**D4 · Plantilla.** Tipo legal versionado `CONTRATO_SERVICIO` (módulo privacy de textos legales) en HTML con campos variables. Una versión solo se publica con la declaración «aprobado por asesoría jurídica», el usuario que la publica y la fecha (sin nombre ni tarjeta del abogado, por decisión del usuario 2026-11-11). Los datos del operador vienen de la configuración por empresa (`/dashboard/settings/organization`).

**D5 · Generación en el worker.** MOD05 toma el snapshot y encola un trabajo BullMQ con solo identificadores. El worker renderiza HTML → PDF con `playwright-core` y Chromium sin interfaz, calcula la huella y guarda el PDF cifrado en el almacenamiento de medios. La imagen de la API no incluye Chromium. Playwright ya está en el stack (1.58.2) para pruebas; aquí pasa a dependencia de ejecución del worker.

**D6 · Primer cobro.** MOD14 consume `crm.contract.activated` y genera el primer documento del contrato desde `billing_start_date`, idempotente por contrato y periodo.

## 3. Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Firma por OTP o SMS | Sin proveedor; requiere contrato y ADR propios |
| Aprovisionamiento activa el contrato | Contradice ADR-098 D8 y activaría contratos sin firma |
| PDF con `pdfkit` | No reproduce fielmente el formato CRC; cada cambio de texto exige código |
| Chromium en la API | Aumenta la imagen ~150 MB y el consumo de memoria del proceso que atiende las peticiones |

## 4. Consecuencias

**Positivas:** contrato legal verificable con huella; cumple el formato CRC; el abogado edita texto sin código; la API no crece; el cobro arranca sin esperar el lote.

**Costos:** la imagen del worker crece (Chromium y sus dependencias del sistema); el técnico espera unos segundos a que se genere el PDF; nuevo evento, motivo de bloqueo, permiso y tipo legal; migraciones tenant para los datos de firma y permanencia.

**Riesgos aceptados:** la validez de la firma manuscrita digital depende del concepto del abogado (registrado en la versión de plantilla); un fallo del worker retrasa la firma, no el servicio.

**Impacto:** OpenAPI (endpoints de generación, firma y estado), migraciones reversibles, Dockerfile del worker (`plat-ops`), pruebas de integración contra Postgres y Redis reales, E2E de la consola de OT.

## 5. Referencias

- `AGENTS.md`; [Stack_Tecnologico](../prds/Stack_Tecnologico.md)
- [PRD maestro](../prds/PRD_Sistema_ISP_Colombia_v2_4.md) RF-CRM-04, R03
- ADR-088, ADR-094, ADR-098, ADR-103
- Res. CRC 7811 de 2025 (art. 129) y 8171 de 2026
