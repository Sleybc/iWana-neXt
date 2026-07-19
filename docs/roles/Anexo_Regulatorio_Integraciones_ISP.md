# Anexo — Integraciones críticas y cumplimiento regulatorio mínimo por dominio ISP

**Versión:** 1.0
**Estado:** Vigente (contenido normativo extraído de Perfil_IA_EM_Architect_Unificado_v1 §13–§14, cuya vigencia como anexo declara [Perfil_IA_EM_Architect_Unificado_v2.md](Perfil_IA_EM_Architect_Unificado_v2.md) Parte III; extracción aprobada por el CTO, 2026-07-18)
**Fecha:** 2026-07-18
**Clasificación:** Estratégico — Confidencial
**Origen:** el documento v1 completo permanece archivado en el historial de git (commit `6770730c^`, ruta `docs/roles/_historico/Perfil_IA_EM_Architect_Unificado_v1.md`); este anexo conserva únicamente sus secciones aún normativas.
**Alcance:** referencia de consulta para todos los perfiles del [Protocolo_Colaboracion_Multiagente_v1.md](Protocolo_Colaboracion_Multiagente_v1.md). No fija versiones de stack ni reemplaza al PRD del módulo.

---

## 1. Integraciones críticas del dominio ISP

| Integración | Dominio | Criticidad | Regla de validación |
| --- | --- | --- | --- |
| FreeRADIUS | Provisioning | Alta | Happy path + CoA + rollback + auditoría |
| MikroTik RouterOS | NMS / Provisioning | Alta | Activación, suspensión, retry, idempotencia |
| OLT Huawei / ZTE / multi-marca | NMS | Alta/Media por fase | Adapter común + pruebas por vendor |
| DIAN vía Siigo/Alegra | Billing | Alta | Emisión, validación, rechazo, reintento, CUFE |
| Wompi / PSE / Nequi | Billing | Alta | Webhook idempotente + conciliación |
| WhatsApp Business | Omnicanal | Media | Rate limit, plantillas, sesión, trazabilidad |
| ETL WispHub / AdminOLT / Excel | Migración | Alta | Validación de calidad, reconciliación y rollback |

Toda integración financiera o de provisioning es idempotente, con retry, trazabilidad y auditoría (regla del [protocolo](Protocolo_Colaboracion_Multiagente_v1.md) §4 y del perfil AI-EM-ARCH §3.2).

## 2. Cumplimiento regulatorio mínimo por dominio

### 2.1 Billing

- Motor IVA por estrato y tipo de cliente.
- Facturación electrónica DIAN UBL 2.1 vía adapter aprobado.
- Retención y trazabilidad fiscal según fase del roadmap.

### 2.2 CRM y portal suscriptor

- Consentimiento Habeas Data con canal, fecha y versión.
- Derechos ARCO con SLA definido.
- Políticas de retención explícitas.

### 2.3 Assurance / SLA / PQR

- Tiempos CRC incorporados en criterios de servicio.
- Trazabilidad formal de PQR y escalamiento.
- Soporte para compensaciones cuando aplique.

### 2.4 Reporting

- Exportables para CRC, SUI y Colombia TIC cuando el módulo lo requiera.

### 2.5 HCM / SG-SST

- Monitoreo de jornada 42h.
- IPERC, capacitaciones, FURAT y soportes auditables según fase.

**Regla transversal (protocolo §7.2):** si un requisito regulatorio no está confirmado, se marca **"requiere verificación con fuente oficial"** — este anexo no sustituye esa verificación.
