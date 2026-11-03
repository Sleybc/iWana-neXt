# Consulta jurídica — Protección de datos personales en iWana neXt

**Versión:** 1.1 (reemplaza a [v1.0](INFORME-CONSULTA-JURIDICA-PROTECCION-DATOS-v1.0.md)) · **Fecha:** 2026-11-03 · **Preparado por:** iWana neXt (AI-EM-ARCH), para el CTO
**Destinatario:** abogado especialista en protección de datos personales y sector TIC
**Naturaleza:** es un **cuestionario con posiciones propuestas**, no un dictamen. El dictamen lo emite y firma el abogado. Este documento no contiene datos personales.
**Estado (2026-11-03): ABIERTA, sin respuesta de un abogado.** Una IA respondió y firmó esta consulta, y el texto llegó como «dictamen». El usuario confirmó que no lo redactó un abogado, así que AI-EM-ARCH dejó las respuestas otra vez en blanco y movió ese texto a [INFORME-PRIVACY-BORRADOR-POSICIONES-JURIDICAS-IA-v1.0](INFORME-PRIVACY-BORRADOR-POSICIONES-JURIDICAS-IA-v1.0.md), marcado como borrador sin valor de dictamen. Puede servir para preparar la reunión con el abogado, pero no sustituye su respuesta.
**Origen interno:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) §7.3 · [HLD Privacy v1.3](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.3.md) · [verificación de la Ley 2573](INFORME-PRIVACY-LEY-2573-VERIFICACION-v1.0.md) · [acta del 30-10-2026](../legal/ACTA-PRIVACY-TEXTOS-LEGALES-IWANA-2026-10-30.md)

**Cambios respecto a v1.0:**
- las citas normativas ya están **verificadas en fuente oficial** (§1);
- se cierran o acotan las preguntas que respondió el acta del 30-10-2026;
- se actualiza el contexto: la supresión ya es automática y los registros anonimizados son de solo lectura (§2);
- la pregunta de la Ley 2573 se reescribe a partir del texto oficial y de la **Sentencia C-413 de 2025**, que impone una obligación nueva al operador (pregunta 3);
- se añaden dos preguntas: la 12, sobre el inicio de la retención, y la 13, sobre lo que se conserva de un titular anonimizado.

## Cómo responder

Cada pregunta abierta trae una **posición propuesta** con su fundamento. Basta marcar **De acuerdo** o escribir el ajuste con su fundamento.

**Prioridad:**
1. **la pregunta 3 (Ley 2573)**, porque la ley rige desde el **19-11-2026** y la pregunta 3(b) puede exigir una funcionalidad nueva;
2. la pregunta 1, el contrato de transmisión, que es requisito antes de producción;
3. el resto.

## 1. Fuentes verificadas (2026-11-02 y 2026-11-03)

| Norma | Fuente oficial |
| --- | --- |
| Ley 1581 de 2012 | [Normograma MinTIC](https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_1581_2012.htm) |
| Decreto 1377 de 2013 (compilado en el DUR 1074 de 2015: art. 9 en 2.2.2.25.2.6 y art. 11 en 2.2.2.25.2.8) | [Normograma MinTIC](https://normograma.mintic.gov.co/mintic/compilacion/docs/decreto_1377_2013.htm) |
| Decreto 1704 de 2012 | [Normograma MinTIC](https://normograma.mintic.gov.co/mintic/compilacion/docs/decreto_1704_2012.htm) |
| Ley Estatutaria 2573 de 2026, del 19-05-2026 (Diario Oficial 53.496, 20-05-2026) | [Normograma MinTIC](https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_2573_2026.htm) · [Secretaría Jurídica Distrital](https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?dt=S&i=193210) (vigencia: 19-11-2026) |
| Sentencia C-413 de 2025, del 2-10-2025, M. P. Juan Carlos Cortés González (revisión previa del proyecto, expediente PE-056) | [Relatoría de la Corte Constitucional](https://www.corteconstitucional.gov.co/relatoria/2025/C-413-25.htm). Se leyó la síntesis de los resolutivos; la sección «VI. Decisión» no pudo leerse completa y queda por cotejar |

Las citas del Decreto 1074 que trae el acta (arts. 2.2.2.25.3.2 y 2.2.2.25.5.2) siguen sin verificar.

## 2. Contexto actualizado

Cada ISP es **Responsable del tratamiento** e iWana es **Encargado**. Desde la v1.0, el sistema construyó lo siguiente:
- **Supresión automática por anonimización**, en una sola transacción, con verificación de residuales. La supresión no procede si hay un contrato abierto o una retención vigente. El procedimiento manual queda como vía de emergencia.
- **Bloqueo** (`DATOS_BLOQUEADOS`) cuando hay deber de conservación: los datos salen de la operación y solo los ven el Oficial y Facturación, con lectura auditada.
- **Registros anonimizados de solo lectura:** nada puede reescribir un dato suprimido. La única excepción es archivar un contrato que ya estaba terminado.
- **Reloj de retención** anclado a la fecha de terminación de cada contrato, que no cambia una vez fijada; los contratos archivados cuentan.

La plataforma **no está en producción**: sale con la beta.

## 3. Preguntas cerradas por el acta del 30-10-2026

| v1.0 | Tema | Resolución |
| --- | --- | --- |
| 2 | Texto modelo de autorización | Aprobado: aviso y autorización con cláusulas separadas (acta §1 y §2), con el ajuste de la cláusula 1 sobre los datos técnicos (§4) |
| 7 | Ley 2300 en la cobranza del ISP | **Aplica** a contactos comerciales y de cobranza, y no a las notificaciones operativas y técnicas (acta §3) |
| 8 | Registros de IP (cobertura) | Las IP y los identificadores de equipo son datos semiprivados; la Política §7.2 y la cláusula 1 ajustada los cubren (acta §4). **Sigue abierto:** el plazo de conservación (pregunta 8) |
| 4 (en parte) | Proveedor de hosting | Si no hay proveedor elegido, no hace falta nueva autorización al elegirlo; basta el contrato de transmisión y la Política v2 (acta §5). **Sigue abierto:** transferencias internacionales y WhatsApp/Meta (pregunta 4) |

## 4. Preguntas abiertas

### 1. Contrato de transmisión iWana–ISP — **prioritaria antes de producción**

- **Posición propuesta:** sin cambios respecto a v1.0. Plantilla con objeto, finalidades, medidas de seguridad, subencargados (hosting), aviso de incidentes en **72 horas**, colaboración en consultas y reclamos, devolución o eliminación al terminar, auditoría y confidencialidad. El acta §5 confirma que hace falta un contrato igual con el proveedor de hosting.
- **Respuesta:** ☐ De acuerdo y entrego la plantilla · ☐ Ajuste: ______________________

### 3. Ley 2573 de 2026 y Sentencia C-413 de 2025 — **prioritaria (rige el 19-11-2026)**

**Lo que dice el texto oficial** (paráfrasis):
- art. 5 num. 4: el operador da trámite a la queja dentro de los **10 días hábiles** siguientes a la radicación;
- art. 5 num. 5 y art. 8: suspensión inmediata del servicio y del cobro;
- art. 8: el operador comunica al titular que, desde ese momento, tiene **20 días hábiles** para denunciar ante la Fiscalía; si no denuncia, el operador puede reanudar el cobro;
- art. 7 num. 7: leyenda «Víctima de Falsedad Personal», que no es reporte negativo;
- art. 13: rige a los seis meses de la promulgación, salvo el art. 5 pars. 1 y 2, que rigen desde la promulgación.

**Lo que agrega la C-413 de 2025**, según la síntesis de sus resolutivos:
- **art. 8, inciso tercero:** exequible en el entendido de que, **en el mismo término, el operador también debe formular la denuncia penal** que corresponda;
- **art. 5 num. 7:** son **inexequibles** las expresiones que exigían aportar copia de la denuncia;
- art. 9 inc. 1: la suspensión del cobro se mantiene hasta un pronunciamiento judicial, incluido el archivo de la indagación;
- art. 9 par.: «archivo» es la culminación formal de la indagación preliminar;
- art. 2 lit. d: la carga dinámica de la prueba solo opera en procesos judiciales no penales;
- art. 3 num. 5: la suplantación digital abarca cualquier tecnología.

**Lo que hace el sistema hoy:**
- responde en 10 días hábiles;
- suspende los contratos de inmediato;
- crea tareas de suspensión del cobro externo y de entrega de copia de los documentos;
- marca al titular como víctima;
- calcula el plazo de los 20 días **desde la radicación**;
- **no** exige copia de la denuncia, y eso es conforme con la C-413;
- **no** tiene una tarea para que el ISP presente su propia denuncia.

**Preguntas:**
- **(a) Vigencia:** ¿la fecha es el **19-11-2026** (seis meses desde la expedición, la que da la Secretaría Jurídica Distrital) o el 20-11-2026 (desde la publicación en el Diario Oficial)? *Posición propuesta:* operar desde el 19-11-2026, que es lo más conservador.
- **(b) Denuncia del operador (C-413, art. 8):** ¿el ISP debe presentar su propia denuncia penal dentro de los mismos 20 días hábiles, aunque el titular denuncie? ¿Ante qué autoridad y con qué soporte? *Posición propuesta:* sí. El sistema añadiría una tarea obligatoria «Formular denuncia penal del operador», con el mismo vencimiento que la del titular y su constancia como evidencia. Si se confirma, **es una funcionalidad que hay que construir antes del 19-11-2026**.
- **(c) Inicio de los 20 días:** el texto los cuenta desde la comunicación del operador al titular, y la C-413 no fija otro inicio. *Posición propuesta:* que la comunicación al titular forme parte de la constancia de radicación, para que las dos fechas coincidan y el cálculo actual quede conforme. ¿Es suficiente?
- **(d) Suspensión del cobro (art. 9):** con la C-413, la suspensión dura hasta un pronunciamiento judicial o el archivo. ¿El ISP puede reanudar el cobro al vencer los 20 días sin denuncia del titular (art. 8, par. 1) si él mismo sí denunció?
- **(e) Art. 5 par. 2** (ya vigente): si se incumplieron los protocolos de identificación, procede devolver los dineros o eliminar las acreencias. ¿Qué evidencia debe conservar el ISP de su verificación de identidad para defenderse?
- **Respuesta:** ______________________

### 4. Transferencias internacionales y WhatsApp/Meta

- **Opciones de hosting:** (i) Oracle Cloud, región Bogotá; (ii) un servidor propio en Colombia; (iii) un VPS cuyo datacenter está por confirmar.
- **Posición propuesta:** sin cambios respecto a v1.0.
  - Con (i) o (ii) no hay transferencia internacional.
  - Las copias cifradas en EE. UU. quedarían amparadas por la lista de países adecuados de la SIC, más un contrato de transmisión.
  - WhatsApp/Meta requiere un análisis aparte.
- **Pregunta:** ¿qué exige cada opción (contrato, aviso al titular, RNBD)?
- **Respuesta:** ______________________

### 5. Plazo de 5 días para pedir información en un reclamo incompleto (Ley 1581, art. 15)

- **Posición propuesta:** son **hábiles** (Ley 4 de 1913, art. 62). El sistema los calcula así, con el calendario de festivos colombiano.
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 6. Reporte de incidentes de seguridad a la SIC

- **Posición propuesta:** el ISP reporta dentro de los **15 días hábiles** siguientes a la detección; iWana le avisa en 72 horas por contrato. ¿Plazo vigente y quién reporta?
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 8. Plazo de conservación de los registros de IP y de conexión

- **Posición propuesta:** 5 años (Decreto 1704 de 2012, compilado en el DUR 1078 de 2015). Hoy iWana no los almacena.
- **Respuesta:** ______________________

### 9. Supresión por anonimización

- **Así funciona hoy:**
  - Se sobrescriben los datos personales y se borran los identificadores (HMAC) y la evidencia en Media.
  - Se conservan, sin datos personales: la solicitud y sus eventos, las autorizaciones **con su evidencia** (como prueba), las marcas, la auditoría y los contratos.
  - Los registros anonimizados no se pueden modificar.
- **Posición propuesta:** con esto se cumple la supresión del art. 8 lit. e de la Ley 1581 y el art. 9 del Decreto 1377. ¿Es válido conservar la **evidencia de la autorización** tras la supresión, como prueba frente a la SIC?
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 10. Rotación de las copias de seguridad

- **Posición propuesta:** backups diarios con retención de **35 días** y sin archivo largo. ¿Es suficiente, o hay que informarlo al titular al suprimir?
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 11. Retención de prospectos sin contrato

- **Posición propuesta:** 24 meses desde el descarte (Decreto 1377, art. 11).
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

### 12. Inicio y extensión de la retención de suscriptores — **nueva**

- **Contexto:** los 5 años corren desde la **terminación del último contrato** (ADR-094 D7, Decreto 1704). El sistema guarda esa fecha y no la cambia nunca. Para los contratos terminados antes de este cambio, la fecha se reconstruyó con un criterio que, en la duda, la pone más tarde, y por tanto **alarga** la retención.
- **Preguntas:**
  - (a) ¿El Decreto 1704 cuenta los 5 años desde la terminación del contrato o desde otro hecho, como la última conexión o el último pago?
  - (b) ¿Es aceptable alargar la retención en los casos reconstruidos frente a la limitación temporal (Decreto 1377, art. 11)?
- **Respuesta:** ______________________

### 13. Lo que se conserva del titular anonimizado — **nueva**

- **Contexto:** tras la supresión, los contratos del titular se conservan sin datos personales, para la contabilidad y los agregados. El sistema impide cualquier edición, salvo archivar un contrato ya terminado.
- **Posición propuesta:** es conforme con los principios de veracidad y seguridad (Ley 1581, art. 4 lits. d y g) y con los deberes de los arts. 17 lit. d y 18 lit. b. ¿Hay alguna obligación de **borrar** el registro, y no solo anonimizarlo, pasado algún plazo?
- **Respuesta:** ☐ De acuerdo · ☐ Ajuste: ______________________

## Firma

| Campo | Valor |
| --- | --- |
| Nombre y tarjeta profesional | (se registra fuera del repositorio, como en el acta del 30-10-2026) |
| Fecha | |
| Observaciones generales | |
