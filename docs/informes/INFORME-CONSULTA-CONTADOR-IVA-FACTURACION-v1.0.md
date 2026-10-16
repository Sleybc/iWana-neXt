# Consulta al contador o revisor fiscal — IVA del servicio de internet y factura electrónica

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Preparado por:** iWana neXt (AI-EM-ARCH), para el CTO
**Destinatario:** el contador o revisor fiscal del primer ISP que use iWana en su beta, junto con su proveedor tecnológico de facturación electrónica (pregunta 4)
**Origen interno:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) §6 (puntos pendientes de dictamen)

## Cómo responder

Cada pregunta trae una **posición propuesta**. Basta marcar **De acuerdo** o escribir el ajuste con su fundamento. Mientras no haya respuesta, el sistema factura esos conceptos con **IVA del 19 %**, que es el tratamiento más conservador. Este documento no contiene datos personales.

## Contexto

iWana es el software con el que un ISP colombiano gestiona sus suscriptores, contratos y facturación. Las reglas que el sistema ya aplica, verificadas contra el Estatuto Tributario y la doctrina DIAN vigente, son:
- internet fijo residencial de estratos 1 y 2: **exento** (art. 481 lit. h);
- internet fijo residencial de estrato 3: **excluido** (art. 476 num. 7);
- todo lo demás (estratos 4 a 6, no residencial, móvil): **gravado al 19 %** (art. 468);
- el estrato y el uso residencial se toman del **punto de servicio** (la dirección de instalación), no de la persona;
- sin soporte del estrato, se cobra el 19 %;
- la instalación, la conexión y la reconexión **heredan** el tratamiento del servicio (Conceptos DIAN 11602 de 2026 y 15495 de 2025);
- la venta de equipos está gravada.

## Preguntas

### 1. Equipos en comodato o en arriendo (módem, ONT, router)

- **Contexto:** muchos ISP entregan el equipo sin cobro aparte (comodato) y otros cobran un canon mensual. La DIAN indicó que debe analizarse caso a caso (Concepto 11602 de 2026).
- **Posición propuesta:**
  - comodato sin contraprestación separada: no genera IVA;
  - arriendo con canon cobrado aparte: gravado al 19 % como arrendamiento de un bien mueble.
- **Impacto en el sistema:** el concepto de factura «arriendo de equipo».
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 2. IP pública fija y televisión por IP (IPTV)

- **Posición propuesta:**
  - IP fija incluida en el plan, sin precio aparte: hereda el tratamiento del internet;
  - IP fija cobrada como adicional: 19 %;
  - IPTV: 19 %.
- **Impacto:** los conceptos adicionales de la factura.
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 3. Telefonía (solo si el ISP la vende)

- **Posición propuesta:** se excluyen los primeros 325 minutos mensuales de telefonía local de usuarios de estratos 1, 2 y 3 (art. 476 num. 8); el resto, al 19 %. ¿Sigue vigente y cómo se discrimina en la factura?
- **Respuesta:** ☐ De acuerdo · ☐ No aplica a este ISP · ☐ Ajuste: ______________________

### 4. Codificación en la factura electrónica (con el proveedor tecnológico) — **prioritaria**

- **Pregunta:** ¿cómo se representa en la factura electrónica cada caso según el Anexo Técnico de la DIAN y la implementación del proveedor?
  - **exento** (estratos 1–2, tarifa 0 % con derecho a devolución);
  - **excluido** (estrato 3, no causa IVA);
  - **gravado** (19 %).
- **Posición propuesta:** ninguna. Necesitamos los códigos exactos (tributo, tarifa y concepto) que espera el proveedor.
- **Impacto:** la integración de facturación electrónica; sin esto no se emite factura.
- **Respuesta:** ______________________

### 5. Uso mixto (vivienda con negocio)

- **Posición propuesta:** se trata como **no residencial** (19 %), porque el beneficio exige uso residencial y se interpreta de forma restrictiva (Oficio DIAN 66561 de 2011).
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 6. Soporte documental del estrato

- **Posición propuesta:**
  - basta un recibo reciente de un servicio público domiciliario de la dirección de instalación, o un certificado de estratificación de la alcaldía;
  - se conserva 10 años junto con las facturas a las que dio el beneficio (Ley 962 de 2005, art. 28; ET art. 632);
  - si el soporte no se aporta, se factura al 19 %.
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 7. Datos tributarios del cliente para la factura

- **Contexto:** el sistema aún usa «régimen simplificado o común». Se reemplazará por «responsable o no responsable de IVA», más las responsabilidades del RUT.
- **Pregunta:** ¿qué catálogo de responsabilidades del RUT debe capturarse del cliente para la factura electrónica?
- **Respuesta:** ______________________

## Firma

| Campo | Valor |
| --- | --- |
| Nombre y tarjeta profesional | |
| Fecha | |
| Observaciones generales | |
