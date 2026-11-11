# Spec — MOD05 Cierre de venta · Contrato firmado en la instalación y primer cobro

**Versión:** 1.0
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-11
**Fecha:** 2026-11-11
**Emisor:** Claude Code, con criterio de AI-PROD-UX y AI-SR-FULL
**Módulos:** MOD05 CRM (dueño del contrato) · MOD06 Comercial (permanencia en el plan) · worker (PDF) · MOD11 OT (paso en la consola del técnico) · MOD13 aprovisionamiento (sin cambio de dueño) · MOD14 facturación (primer cobro) · privacy (textos legales)
**ADR:** [ADR-109](../adrs/ADR-109-Contrato-Firmado-en-Instalacion-y-PDF-en-Worker.md) (Aprobado)
**Relacionado:** [ADR-088](../adrs/ADR-088-Cierre-OT-y-Culminacion-Instalacion-Hitos-Separados.md) (cierra su tramo T2) · [ADR-098](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md) D8 (se respeta) · [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md) · [spec del acta MOD11](2026-09-14-mod11-acta-instalacion-design.md) §9 · [spec de la ficha estilo UISP](2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md) (pestaña Documentos) · PRD maestro RF-CRM-04 y R03

---

## 0. Principio

Complementar sin retroceso: ningún flujo actual desaparece. La activación manual del contrato y el acta de conformidad de la OT se conservan.

## 1. Hechos verificados (2026-11-11, `main` en `f2593291`)

| # | Hecho | Fuente |
|---|---|---|
| H1 | El contrato nace en `DRAFT` solo por API manual (`create`, `createFromExpediente`) y exige la autorización `TRATAMIENTO_CONTRACTUAL` | `contracts.service.ts:151-206, 254-349, 1539-1560` |
| H2 | `DRAFT → ACTIVE` solo por `POST crm/contracts/:id/activate` (ADMIN, SALES, SUPPORT con `CRM_EXPEDIENTES_MANAGE`); exige `billingCycleDay`; **no emite evento** | `contracts.controller.ts:668-693`; `contracts.service.ts:1112-1119, 1680-1823` |
| H3 | No existe estado ni dato de firma (`signedAt`, `signedBy`, evidencia); «firmado» = `ACTIVE` por convención | ADR-088:30, :89 |
| H4 | MOD13 activa el servicio y CRM pasa el expediente a `CLIENTE_ACTIVO` y registra `commercialActivationStatus` (`DONE` o `BLOCKED`: `NO_EXPEDIENTE`, `CONTACT_REQUIRED`, `FISCAL_INCOMPLETE`); **no toca contratos** | `service-provisioning-activation.listener.ts:26-80`; `service-provisioning-commercial-status.adapter.ts:39`; ADR-098 D8 |
| H5 | El cierre de OT exige firma manuscrita del cliente (canvas → PNG) como acta de conformidad | `ExecutionOrderSignatureCapture.tsx:28-56`; `execution-orders.service.ts:642-649` |
| H6 | El primer cobro sale del lote diario (`automatic_generation`) o de generación manual; inicia en `billing_start_date` o `contracts.start_date`; nada lo dispara al activar | `billing-generation.processor.ts:55-122`; `billing-generation.service.ts:252-295` |
| H7 | Textos legales versionados solo para `POLITICA_TRATAMIENTO`, `AVISO_PRIVACIDAD`, `AUTORIZACION`; no hay plantilla de contrato | `packages/shared/src/schemas/privacy/legal-texts.ts:4-6` |
| H8 | PDF con `pdfkit` (cobros, inventario); correo con `MailerService` sin plantillas para suscriptores; sin SMS ni WhatsApp | `apps/api/package.json:56`; `mailer.service.ts:96` |

## 2. Marco regulatorio verificado

- **Modelo obligatorio:** Formato 2.3.1 «Contrato único convergente de servicios fijos y móviles en la modalidad pospago», Anexo 2.3 del Título II de la Res. CRC 5050 de 2016, modificado por el art. 129 de la **Res. CRC 7811 de 2025**, vigente desde el 1-ene-2026. La **Res. CRC 8171 de 2026** (17-mar) no modifica el Anexo 2.3 (verificado sobre sus 15 artículos).
- **Reglas de uso:** solo servicios fijos → se omiten los módulos móviles; permanencia solo si el usuario la aceptó, una vez y máximo 12 meses, ofreciendo siempre la opción sin permanencia; solo se modifican identificación del proveedor, condiciones comerciales, permanencia, enlaces, color y «Otras condiciones»; copia por medios electrónicos salvo que el usuario pida papel; anexo legal opcional.
- **Cobro:** el modelo dice que el cobro de servicios fijos inicia «a partir de su instalación», consistente con D3.
- **Texto de partida:** `contrato-unico-convergente-pospago.html` (raíz del repo, aportado por el usuario). **No verificado palabra por palabra** contra el oficial (la compilación lo publica como imagen).
- Fuentes: [compilación CRC 7811](https://normograma.crcom.gov.co/crc/compilacion/docs/resolucion_crc_7811_2025.htm), [Res. 8171 de 2026](https://www.crcom.gov.co/sites/default/files/normatividad/00008171.pdf).

## 3. Decisiones del usuario (2026-11-11)

| # | Decisión |
|---|---|
| D1 | Firma manuscrita en el celular del técnico + evidencia (huella del PDF, fecha, técnico, ubicación, dispositivo); copia por correo. Sin proveedor nuevo |
| D2 | Orden: instalar → aprovisionar → comprobar que funciona → firmar el contrato en la misma visita |
| D3 | El cobro corre **desde la activación del aprovisionamiento**, aunque la firma llegue después |
| D4 | Sin firma: plazo y alerta a ventas y soporte; suspensión manual. Sin suspensión automática |
| D5 | Texto: el modelo CRC vigente (HTML aportado) como plantilla versionada |
| D6 | PDF: plantilla HTML convertida a PDF en el servidor con Chromium sin interfaz |
| D7 | (Ejecución, 2026-11-11) «Servicio activo» = aprovisionamiento **certificado**: MOD13 fija `activated_at` solo al cerrar la OT, y la firma ocurre antes del cierre. La firma se habilita con aprovisionamiento CERTIFIED o ACTIVE y `billing_start_date` = `activated_at` o, si aún no existe, la fecha de certificación. MOD13 no cambia |

## 4. Flujo

```mermaid
sequenceDiagram
    participant T as Técnico (consola OT)
    participant N as MOD13
    participant C as MOD05 CRM
    participant B as MOD14
    T->>N: instala; aprovisionamiento activa el servicio
    N->>C: network.service-provisioning.activated
    C->>C: comercial BLOCKED «CONTRACT_UNSIGNED»; guarda fecha de activación
    T->>T: evidencia «servicio funcionando»
    T->>C: pide el contrato (snapshot) y lo muestra al cliente
    T->>C: firma del cliente + evidencia
    C->>C: PDF firmado + huella; DRAFT→ACTIVE; billing_start = fecha de activación
    C-->>B: crm.contract.activated
    B->>B: genera el primer cobro desde la activación
    T->>T: acta de conformidad y cierre de OT (sin cambio)
```

## 5. Alcance por bloques

| Bloque | Qué | Se conserva |
|---|---|---|
| **A0 · Datos del operador** | Sección nueva en `/dashboard/settings/organization` con los datos de G3, por empresa, con permiso de configuración | Gestión de sedes actual |
| **A · Plantilla** | Tipo `CONTRATO_SERVICIO` en textos legales versionados; HTML con campos variables; solo módulos fijos; una versión se publica solo con la declaración «aprobado por asesoría jurídica», quién la publica y la fecha (G2) | Los tres tipos legales actuales |
| **B · Generación** | Servicio MOD05 que toma un snapshot del contrato (titular, documento completo —ver G7—, plan, velocidades, precio, IVA, estrato, dirección, equipos `INSTALLED_AT_CUSTOMER` de la OT, reconexión, medios de atención, tope de incremento, permanencia solo si se pactó) y encola la generación; el **worker** renderiza HTML → PDF con `playwright-core` + Chromium sin interfaz (G1) y calcula la huella SHA-256; la consola muestra «Generando contrato…» hasta que el PDF esté listo | PDF de cobro con `pdfkit` sin cambio; imagen de la API sin Chromium |
| **H · Permanencia mínima** | MOD06: cada plan define su cargo por conexión y, si ofrece permanencia, meses (≤ 12) y valor descontado o diferido; siempre existe la opción sin permanencia. MOD05: el contrato registra si el cliente la aceptó, cargo total, valor descontado o diferido, inicio (= fecha de activación) y fin (se corre con la suspensión voluntaria); la tabla mes 1–12 del PDF se calcula (valor descontado prorrateado por meses restantes). El cobro de la penalidad por terminación anticipada queda fuera (MOD14, fase posterior) | Planes y contratos sin permanencia siguen igual |
| **C · Firma en la visita** | Paso «Contrato» en la consola de OT, habilitado con servicio aprovisionado y evidencia de servicio funcionando; lectura del PDF, firma en canvas (componente existente), confirmación de nombre y documento de quien firma; evidencia guardada; PDF firmado (firma incrustada) con su huella; copia al correo del titular si lo tiene | Acta de conformidad de OT y su firma, separadas (ADR-088 D3) |
| **D · Activación y evento** | La firma hace `DRAFT → ACTIVE` con `billing_start_date` = fecha de activación del aprovisionamiento; datos `signedAt`, `signedBy`, evidencia y versión de plantilla; emite `crm.contract.activated` vía outbox | Activación manual para ADMIN con motivo obligatorio y sin firma, auditada |
| **E · Primer cobro** | MOD14 consume `crm.contract.activated` y genera de inmediato el primer documento del contrato desde `billing_start_date`, idempotente | Lote diario y generación manual |
| **F · Pendiente de firma** | Motivo `CONTRACT_UNSIGNED` en la activación comercial; insignia «Pendiente de firma» en ficha y lista; trabajo diario que alerta a ventas y soporte a las 48 h | Motivos de bloqueo actuales |
| **G · Documentos** | El contrato firmado aparece en la pestaña Documentos del suscriptor con descarga | Pestaña Documentos actual |

**Fuera de alcance:** firma por OTP o SMS; suspensión automática por falta de firma; contrato de servicios móviles; modificación de contrato (copia del contrato ajustado, art. 2.1.10.5); canal digital de terminación (Res. 8171); factura electrónica DIAN (MOD14 Fase 02).

## 6. Seguridad y privacidad

- El PDF firmado y la imagen de la firma son datos personales: almacenamiento cifrado en el bucket de medios, acceso por URL firmada que vence, incluidos en la supresión y retención del titular (ADR-094).
- La ubicación del técnico se guarda solo como evidencia de la firma, con precisión limitada.
- Huella SHA-256 sobre el PDF final; cualquier descarga posterior verifica la huella.
- Nada de datos personales en logs ni en payloads de colas; el evento lleva solo identificadores.

## 7. Criterios de aceptación

| # | Criterio |
|---|---|
| CA-1 | Con el servicio aprovisionado y la evidencia de servicio funcionando, el técnico genera el contrato con los datos reales y el cliente lo firma en la consola de OT |
| CA-2 | La firma deja el contrato `ACTIVE`, con `billing_start_date` igual a la fecha de activación del aprovisionamiento, y emite `crm.contract.activated` una sola vez |
| CA-3 | MOD14 genera el primer cobro desde la activación sin esperar el lote; repetir el evento no duplica el cobro |
| CA-4 | El PDF firmado conserva su huella; alterarlo hace fallar la verificación |
| CA-5 | Sin firma, la activación comercial queda `BLOCKED` con `CONTRACT_UNSIGNED`, la ficha muestra «Pendiente de firma» y a las 48 h se alerta |
| CA-6 | Sin versión de plantilla aprobada por abogado, la generación responde con un error claro (no se firma un texto sin aprobar) |
| CA-7 | Los módulos móviles no aparecen; la permanencia solo aparece si se pactó |
| CA-8 | La activación manual sigue disponible para ADMIN con motivo obligatorio y queda auditada |
| CA-9 | El contrato firmado aparece en la pestaña Documentos y llega al correo del titular si tiene |
| CA-10 | Titular bloqueado o anonimizado: no se genera ni firma contrato (guardas existentes) |
| CA-13 | Un plan con permanencia ofrece siempre la opción sin ella; si el cliente la acepta, el PDF muestra cargo, descuento, fechas y la tabla mes 1–12 calculada, y nunca más de 12 meses |
| CA-14 | La generación del PDF corre en el worker; la imagen de la API no incluye Chromium |
| CA-11 | Los datos del operador se configuran en `/dashboard/settings/organization`; si falta uno obligatorio, la generación indica cuál |
| CA-12 | El técnico ve el documento completo solo en el contrato durante la firma; después no puede descargarlo ni reabrirlo, y el acceso queda auditado |

## 8. Gobierno y decisiones abiertas

| # | Asunto | Dueño |
|---|---|---|
| G1 | **Resuelta 2026-11-11:** ADR nuevo con el modelo de firma (cierra ADR-088 T2) y la generación HTML → PDF con `playwright-core` + Chromium **en el worker**, no en la API | Usuario; ADR por arquitectura + `plat-ops` |
| G2 | **Declarada por el usuario 2026-11-11:** «aprobado por el abogado». Decisión del usuario (2026-11-11): para publicar no se exige nombre ni tarjeta profesional del abogado; la publicación registra quién la aprobó en el sistema, la fecha y la declaración «aprobado por asesoría jurídica» | Usuario |
| G3 | **Resuelta 2026-11-11:** los datos del operador (razón social, web de calidad y cobertura, medios de atención, costo de reconexión, tope de incremento anual, dónde reportar hurto o daño de equipos, «Otras condiciones») se configuran por empresa en `/dashboard/settings/organization`, en una sección nueva junto a las sedes (`OrganizationSettingsClient.tsx`). Lo que ya exista en otra configuración (p. ej. razón social o NIT) se reutiliza, no se duplica. La generación del contrato falla con mensaje claro si falta un dato obligatorio | Usuario |
| G4 | **Resuelta 2026-11-11:** permanencia modelada como el bloque H (contrapartida del cargo por conexión, ≤ 12 meses, opción sin permanencia siempre disponible); el cobro de la penalidad queda para MOD14 en una fase posterior | Usuario |
| G5 | **Resuelta 2026-11-11:** el aviso «pendiente de firma» lo recibe quien tenga el permiso nuevo `crm.contracts.pending_signature.notify`, concedido por defecto a facturación (ACCOUNTANT) y aprovisionamiento (NOC) y configurable por rol; plazo 48 h | Usuario |
| G6 | Ubicación del HTML de partida en el repo (plantilla semilla versionada) | Arquitectura |
| G7 | **Resuelta 2026-11-11:** el PDF lleva el número de documento completo; el técnico (sin `crm.subscribers.document.read`) solo lo ve en el contrato durante la firma, con el titular presente, sin poder descargarlo ni reabrirlo después; el acceso queda auditado. Revisión de `sec-eng` en la ejecución | Usuario |
