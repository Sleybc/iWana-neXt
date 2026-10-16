# Consulta jurídica — Protección de datos personales en iWana neXt

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Preparado por:** iWana neXt (AI-EM-ARCH), para el CTO
**Destinatario:** abogado especialista en protección de datos personales y sector TIC
**Origen interno:**
- [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) §7.3;
- [ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md) (hosting);
- [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) D7 (finalidades);
- [runbook manual de bloqueo y supresión](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md).

## Cómo responder

Cada pregunta trae una **posición propuesta** con su fundamento. Basta marcar **De acuerdo** o escribir el ajuste con su fundamento. Las citas normativas se tomaron de fuentes secundarias y **requieren verificación con fuente oficial**. Este documento no contiene datos personales.

**Prioridad:** las preguntas 1 y 2 son documentos que necesitan todos los ISP antes de usar el sistema; el resto puede responderse después.

## Contexto

iWana es un software en la nube con el que los ISP colombianos (proveedores de internet) gestionan a sus suscriptores. **Cada ISP es Responsable del tratamiento e iWana es Encargado.**

El sistema ya implementa:
- autorizaciones por finalidad, con su prueba (texto y versión, fecha, medio por el que se otorgó);
- consultas y reclamos con plazos en días hábiles y festivos colombianos;
- el trámite de suplantación de la Ley 2573 de 2026 (suspensión inmediata, marca «víctima de falsedad personal», tareas);
- marcas de reclamo en trámite y de datos bloqueados;
- el registro de incidentes de seguridad;
- cifrado de los datos personales y auditoría de accesos.

**La supresión técnica** (bloqueo y anonimización automáticos) llegará en una fase posterior; mientras tanto se opera con un procedimiento manual. **La plataforma no estará en producción** antes de su beta.

## Preguntas

### 1. Contrato de transmisión iWana–ISP — **prioritaria**

- **Posición propuesta:** se requiere un contrato de transmisión (Decreto 1377 de 2013, compilado en el DUR 1074 de 2015). Que el abogado redacte la plantilla con:
  - objeto y finalidades;
  - medidas de seguridad;
  - subencargados autorizados (el proveedor de hosting);
  - aviso de incidentes del Encargado al Responsable en **72 horas**;
  - colaboración en consultas y reclamos;
  - devolución o eliminación de los datos al terminar;
  - derecho de auditoría;
  - confidencialidad.
- **Respuesta:** ☐ De acuerdo y entrego la plantilla · ☐ Ajuste: ______________________

### 2. Texto modelo de autorización para los ISP — **prioritaria**

- **Contexto:** el sistema solo deja registrar una autorización si el ISP publicó antes su texto. Cada finalidad se autoriza por separado y la casilla nunca viene marcada.
- **Posición propuesta:** un texto base que enumere estas finalidades.
  - **Necesarias para el servicio:**
    - localizar al suscriptor y su facturación por número de documento;
    - usar la dirección y las coordenadas para despachar a las cuadrillas técnicas;
    - usar el correo para avisos de fallas, cortes e información del servicio;
    - usar el teléfono para coordinar visitas técnicas.
  - **Opcionales, cada una por separado:**
    - ofertas y novedades;
    - datos biométricos, si llegan a usarse.
  - El reporte a centrales de riesgo queda para una fase posterior.
- **Pregunta adicional:** ¿la enumeración de finalidades debe constar en el texto que firma el titular, y con qué grado de detalle?
- **Respuesta:** ☐ De acuerdo y entrego el texto · ☐ Ajuste: ______________________

### 3. Ley 2573 de 2026 (suplantación de identidad)

- **Preguntas:**
  - (a) ¿Cuál es el texto oficial y su fecha de vigencia? Las fuentes secundarias indican el 19-11-2026.
  - (b) ¿Desde cuándo corren los 20 días hábiles que tiene la víctima para denunciar ante la Fiscalía?
  - (c) ¿Es válido este procedimiento manual que usará el ISP en su sistema actual hasta que iWana entre en beta?
    - suspensión inmediata del producto suplantado;
    - constancia de radicación;
    - entrega de copia de los documentos con que se aprobó el producto;
    - marca de «víctima de falsedad personal».
- **Posición propuesta para (b):** contar desde la radicación del reporte, porque es lo que más protege a la víctima. El sistema la muestra como «fecha estimada».
- **Respuesta:** ______________________

### 4. Ubicación de los datos y transferencias internacionales

- **Opciones de hosting en evaluación:**
  - (i) Oracle Cloud, región Bogotá: datos en Colombia;
  - (ii) un servidor propio en Colombia;
  - (iii) un VPS de Hostinger: datacenter por confirmar.
- **Posición propuesta:**
  - con (i) o (ii) no hay transferencia internacional;
  - las copias de seguridad cifradas en Estados Unidos estarían amparadas por la lista de países con nivel adecuado de la SIC (Circular Externa 005 de 2017), con un contrato de transmisión con el proveedor;
  - WhatsApp/Meta como canal de contacto requiere análisis aparte.
- **Pregunta:** ¿se confirma, y qué exige cada opción (contrato, aviso al titular, registro en el RNBD)?
- **Respuesta:** ______________________

### 5. Plazo de 5 días para pedir información en un reclamo incompleto (Ley 1581, art. 15)

- **Posición propuesta:** son **hábiles**, por la regla general del art. 62 de la Ley 4 de 1913: los plazos de días de las leyes excluyen los feriados, salvo disposición en contrario.
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 6. Reporte de incidentes de seguridad a la SIC

- **Posición propuesta:** el ISP, como Responsable, reporta dentro de los **15 días hábiles** siguientes a la detección. iWana avisa al ISP en 72 horas por contrato (pregunta 1). ¿Se confirma el plazo vigente y quién reporta?
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 7. Ley 2300 de 2023 (horarios y canales de cobranza)

- **Pregunta:** ¿aplica a la cobranza propia de un ISP?
- **Posición propuesta:** asumir que **sí** (art. 5): contactos solo de lunes a viernes de 7:00 a 19:00 y sábados de 8:00 a 15:00, nunca domingos ni festivos, y un solo canal por semana después de un contacto directo.
- **Respuesta:** ☐ De acuerdo · ☐ No aplica · ☐ Ajuste: ______________________

### 8. Registros de IP y de conexión

- **Pregunta:** si en el futuro iWana almacena las asignaciones de IP o los registros de conexión de los suscriptores, ¿cuál es el plazo de conservación obligatorio y bajo qué norma?
- **Posición propuesta:** 5 años (Decreto 1704 de 2012, compilado en el DUR 1078 de 2015). Hoy iWana no los almacena.
- **Respuesta:** ______________________

### 9. Supresión mediante anonimización, y lo que se conserva

- **Posición propuesta:** la supresión se cumple **anonimizando**: se sobrescriben los datos personales y se eliminan los identificadores, sin borrar los registros. Se conservan, por deber legal o como prueba:
  - las facturas y los soportes contables, 10 años (Ley 962, art. 28);
  - la prueba de la autorización;
  - la propia solicitud del titular, como prueba de cumplimiento;
  - los registros de auditoría, que no contienen datos personales.

  Cuando hay deber de conservar, la supresión no procede y los datos se **bloquean**: quedan restringidos a fines legales hasta que vence el plazo.
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 10. Rotación de las copias de seguridad

- **Posición propuesta:** backups diarios con retención de **35 días** y sin archivo largo, para que los datos suprimidos desaparezcan de las copias en ese plazo. ¿Es suficiente o debe informarse al titular?
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 11. Retención de datos de prospectos sin contrato

- **Posición propuesta:** 24 meses desde el descarte del prospecto, por la limitación temporal del tratamiento (Decreto 1377 de 2013, art. 11). Los suscriptores se conservan 5 años desde la terminación del último contrato (Decreto 1704 de 2012, art. 4).
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

## Firma

| Campo | Valor |
| --- | --- |
| Nombre y tarjeta profesional | |
| Fecha | |
| Observaciones generales | |
