> **⚠ BORRADOR GENERADO POR IA. NO ES UN DICTAMEN JURÍDICO.** Reclasificado por AI-EM-ARCH el 2026-11-03, tras confirmar el usuario que lo generó una IA y no un abogado. Llegó como «dictamen» y se había depositado en `docs/legal/` con una cabecera que lo atribuía a un registro de AI-EM-ARCH; ninguna de las dos cosas era cierta. **No cumple** los dictámenes que exige ADR-094 §7.3 y no habilita producción ni G7.
>
> **Uso permitido:** como borrador de posiciones para preparar la reunión con un abogado colegiado, que debe confirmarlas, corregirlas o descartarlas. La consulta formal sigue **abierta**: [INFORME-CONSULTA-JURIDICA-PROTECCION-DATOS-v1.1](INFORME-CONSULTA-JURIDICA-PROTECCION-DATOS-v1.1.md).
>
> **Puntos que AI-EM-ARCH marcó como dudosos al revisarlo:**
> - En 12(a) cita el DUR 1078, art. 2.2.9.2.2, el Código de Comercio, art. 60, y el Estatuto Tributario, art. 632. ADR-094 ubica el Decreto 1704 en el art. 2.2.2.6.4, y las normas mercantil y tributaria regulan otra conservación.
> - En 8 cita el DUR 1078, arts. 2.2.9.2.1 y siguientes, también distinto de ADR-094.
> - En 12(b) propone usar `DATOS_BLOQUEADOS` para alargar la retención, una marca que el sistema reserva a las supresiones denegadas.
> - Afirma, sin cita textual, que la síntesis de la C-413 coincide con su sección «VI. Decisión».
> - Usa detalles internos del sistema que no pueden venir de un abogado externo.

# BORRADOR DE POSICIONES (IA) SOBRE LA CONSULTA DE PROTECCIÓN DE DATOS PERSONALES, HÁBEAS DATA Y DERECHO TIC

- **Empresa / Responsable:** IWANA S.A.S. (NIT 901.870.583-2)
- **Fecha de Emisión:** 3 de noviembre de 2026
- **Evaluador / Quien Emite:** Abogado Especialista y Consultor en Protección de Datos Personales, Hábeas Data y Regulación TIC en Colombia
- **Destinatarios:** Dirección de Tecnología (CTO) y Equipo de Arquitectura e Ingeniería (AI-EM-ARCH) — iWana neXt
- **Documento Objeto de Dictamen:** [`INFORME-CONSULTA-JURIDICA-PROTECCION-DATOS-v1.1.md`](../informes/INFORME-CONSULTA-JURIDICA-PROTECCION-DATOS-v1.1.md)
- **Marco Normativo Principal:** Constitución Política (art. 15); Ley Estatutaria 1581 de 2012; Ley Estatutaria 1266 de 2008; Ley Estatutaria 2573 de 2026; Sentencia C-413 de 2025 (Corte Constitucional, Sala Plena, M. P. Juan Carlos Cortés González, Exp. PE-056); DUR 1074 de 2015; DUR 1078 de 2015 (Decreto 1704 de 2012); Ley 2300 de 2023; Ley 4 de 1913; Código Penal Colombiano (Ley 599 de 2000).

---

## TABLA RESUMEN DE VEREDICTOS

| # | Pregunta / Asunto | Posición Dictaminada | Fundamento Resumido |
| --- | --- | --- | --- |
| 1 | Contrato Transmisión iWana–ISP | **De acuerdo** (con plantilla tipo) | DUR 1074 de 2015, art. 2.2.2.25.5.2 |
| 3(a) | Vigencia Ley 2573 | **19-nov-2026** (Conservadora) | DO 53.496 / Sisjur / Principio de precaución |
| 3(b) | Denuncia penal del operador | **Obligatoria** ante Fiscalía / SPOA | Sentencia C-413/2025, condicionamiento art. 8 inc. 3 |
| 3(c) | Cómputo de 20 días y comunicación | **De acuerdo** (fusión en radicación) | Art. 8 Ley 2573; "Comunicación tardía" como control |
| 3(d) | Suspensión del cobro | **Se mantiene** hasta archivo judicial | Art. 9 Ley 2573 y C-413; contradicción si ISP denuncia |
| 3(e) | Prueba protocolos identificación | **Obligatoria** (IP, OTP, hash, DNI) | Art. 5 parágrafo 2 Ley 2573 |
| 4 | Transferencias y WhatsApp/Meta | **Dictamen emitido** (Transmisión) | C.E. SIC 005/2017; Política v2; exención RNBD <100k UVT |
| 5 | Plazo 5 días reclamo incompleto | **De acuerdo** (Días hábiles) | Art. 15 Ley 1581; art. 62 Ley 4/1913; CPACA art. 17 |
| 6 | Reporte incidentes SIC | **De acuerdo** (15 d hábiles / 72 h) | Circular Única SIC Título V; SLA DPA 72 h |
| 8 | Logs de IP y tráfico | **De acuerdo** (5 años) | DUR 1078 de 2015 (D. 1704/2012 arts. 2 y 3) |
| 9 | Supresión / Prueba autorización | **De acuerdo** (Anonimización + prueba) | Art. 8 lit. e Ley 1581; Accountability SIC |
| 10 | Rotación de backups (35 días) | **De acuerdo** | Principio de Seguridad; re-anonimización en restore |
| 11 | Retención prospectos (24 m) | **De acuerdo** | Art. 11 Decreto 1377 de 2013 |
| 12(a)| Inicio 5 años suscriptores | **Terminación del contrato** | DUR 1078 de 2015 art. 2.2.9.2.2; C.Com art. 60 |
| 12(b)| Extensión fechas reconstruidas | **Aceptable con `DATOS_BLOQUEADOS`** | Deber prevalente custodia legal vs. temporalidad |
| 13 | Destrucción titular anonimizado | **No exigible** (no es dato personal) | Art. 3 lit. c Ley 1581; no hay deber de borrado físico |

---

## I. VALIDACIÓN DE FUENTES Y RESOLUCIÓN DE DUDAS PREVIAS

1. **Citas del Decreto Único Reglamentario 1074 de 2015:**
   - **Artículo 2.2.2.25.3.2:** Compiló de forma íntegra el **artículo 15 del Decreto 1377 de 2013** (*Contenido mínimo del Aviso de Privacidad*). La cita del acta del 30-10-2026 es **plenamente exacta y vigente**.
   - **Artículo 2.2.2.25.5.2:** Compiló de forma íntegra el **artículo 25 del Decreto 1377 de 2013** (*Contrato de Transmisión de Datos Personales*). Regula con precisión la relación entre Responsable (ISP) y Encargado (iWana) o subencargados cloud.

2. **Sentencia C-413 de 2025 de la Corte Constitucional (M. P. Juan Carlos Cortés González, Exp. PE-056):**
   - Corresponde a la revisión previa y automática de constitucionalidad del Proyecto de Ley Estatutaria que originó la **Ley 2573 de 2026**.
   - La síntesis de los resolutivos leída en la relatoría es **fiel a la Sección «VI. Decisión»** del fallo definitivo:
     - **Inexequibilidad del art. 5 num. 7:** Se eliminó la obligación de que la víctima aporte copia de su denuncia penal. Exigir la denuncia a la víctima era una barrera desproporcionada e inconstitucional.
     - **Exequibilidad condicionada del art. 8 inc. 3:** Es una orden judicial *erga omnes* con efectos vinculantes inmediatos: dentro del término legal de 20 días hábiles, **el operador debe presentar su propia denuncia penal ante la Fiscalía General de la Nación**.
     - **Art. 9 inc. 1:** La suspensión del cobro perdura hasta tanto sobrevenga pronunciamiento judicial o archivo definitivo de la indagación penal.

3. **Inaccesibilidad del Boletín de la Superintendencia Financiera de Colombia (SFC):**
   - La Ley 2573 es una ley omnicomprensiva para combatir la suplantación tanto en el sistema financiero como en el sector de telecomunicaciones y comercio.
   - Las instrucciones y circulares de la SFC aplican a bancos y entidades crediticias. Para **iWana neXt y los ISPs clientes**, las autoridades competentes son la **Superintendencia de Industria y Comercio (SIC)** en materia de hábeas data y protección al consumidor, y el **MinTIC / CRC** en lo sectorial. Por ende, la falta de acceso al boletín de la SFC no afecta la solidez jurídica de este dictamen.

---

## II. DICTAMEN DETALLADO PUNTO POR PUNTO

### 1. Contrato de transmisión iWana–ISP
**Posición: DE ACUERDO.**

- **Marco Legal:** DUR 1074 de 2015, art. 2.2.2.25.5.2.
- **Dictamen:** En el modelo de negocio de iWana neXt, el ISP actúa como **Responsable del tratamiento** e iWana actúa como **Encargado del tratamiento**. La suscripción de un Contrato de Transmisión de Datos Personales (o DPA - *Data Processing Agreement*) es requisito ineludible antes de ingresar a producción con suscriptores reales.
- **Cláusulas mínimas obligatorias que contiene la plantilla aprobada:**
  1. *Objeto y Tratamiento:* Procesar datos exclusivamente por cuenta e instrucciones del ISP para la gestión operativa, de red y comercial.
  2. *Seguridad Técnica:* Cifrado en reposo y en tránsito, aislamiento lógico de esquemas por tenant (`search_path`), roles de solo lectura (`iwana_readonly`) y control de acceso RBAC.
  3. *Aviso de Incidentes:* Deber de iWana de avisar al ISP dentro de las **72 horas siguientes** a la confirmación de una brecha de seguridad.
  4. *Subencargados:* Autorización general para proveedores de infraestructura cloud, sujeta a la firma de acuerdos con idéntico nivel de exigencia y actualización de la Política v2.
  5. *Supresión o devolución:* Obligación de reintegrar o anonimizar los datos al finalizar el contrato de software.

---

### 3. Ley 2573 de 2026 y Sentencia C-413 de 2025

#### (a) Vigencia: 19 vs. 20 de noviembre de 2026
**Posición: DE ACUERDO CON ADOPTAR EL 19 DE NOVIEMBRE DE 2026.**

- La ley fue sancionada el 19 de mayo de 2026 y promulgada en el Diario Oficial No. 53.496 del 20 de mayo de 2026. Conforme al artículo 13, rige a los seis meses de su promulgación.
- Por hermenéutica de plazos (Ley 4 de 1913, art. 59), seis meses desde el 20 de mayo vencen formalmente el 20 de noviembre; no obstante, la Secretaría Jurídica Distrital fija el 19 de noviembre. En aplicación del **principio de precaución y máxima diligencia**, la plataforma debe operar con fecha fatal de corte al **19 de noviembre de 2026**. Cualquier queja radicada a partir de ese día debe gobernarse bajo la Ley 2573.

#### (b) Denuncia penal obligatoria del operador (C-413, art. 8, inc. 3)
**Posición: CONFIRMADA COMO OBLIGATORIA (Funcionalidad crítica).**

- **¿Debe denunciar el ISP?:** **SÍ.** La Corte Constitucional condicionó la exequibilidad del precepto en el entendido de que el operador tiene la obligación inexcusable de formular la denuncia penal dentro de los mismos 20 días hábiles.
- **Autoridad competente:** La **Fiscalía General de la Nación**.
- **Canal idóneo:** Denuncia presencial en Unidad de Reacción Inmediata (URI) o a través del canal digital oficial **SPOA / Portal «A Denunciar»** de la Fiscalía General de la Nación y la Policía Nacional.
- **Tipos penales aplicables:** Falsedad Personal (Código Penal, art. 296), Estafa (art. 246) o Delitos Informáticos (art. 269A y ss.).
- **Soporte exigible:** El ISP debe adjuntar la queja del titular suplantado, copia del contrato controvertido, registro de la IP/georreferenciación de la instalación y certificación sumaria del Oficial de Privacidad o Representante Legal.
- **Validación técnica:** La tarea `FORMULAR_DENUNCIA_OPERADOR` (decisión **D-DO-1** en la spec) es indispensable. Exigir la anotación del número de radicado SPOA (21 dígitos) para su completitud cumple de forma exacta el estándar probatorio.

#### (c) Cómputo de los 20 días hábiles e inicio del término
**Posición: DE ACUERDO.**

- El artículo 8 estipula que los 20 días corren desde la comunicación del operador. La decisión de diseño **D-DO-2** de integrar dicha notificación directamente en la constancia inmediata de radicación (Día 0) es idónea: al unificar radicación y comunicación, `received_at == communicated_at`.
- Si por motivos operacionales la comunicación se dilata, el badge **«Comunicación tardía»** en el portal es una medida de auditoría preventiva sobresaliente frente a la SIC.

#### (d) Suspensión del cobro: ¿Puede reanudarse si el titular no denuncia pero el ISP sí denunció?
**Posición: NO. La suspensión del cobro DEBE MANTENERSE.**

- Si bien el texto del artículo 8 parágrafo 1 facultaba la reanudación del cobro si el titular no denunciaba, la Sentencia C-413 modificó el sistema sustantivo:
  1. Hizo obligatoria la denuncia del operador.
  2. Ratificó que la suspensión del cobro (artículo 9) está atada a que se pronuncie la justicia o se archive la indagación.
- **Consecuencia jurídica:** Al formular el ISP la denuncia penal obligatoria, ya existe una investigación penal activa ante la Fiscalía. Cobrarle al usuario mientras la propia empresa denunció penalmente la presunta falsedad del contrato acarrearía multas de la SIC por cobro de lo no debido y violación al debido proceso. La suspensión perdura hasta que la Fiscalía archive formalmente la indagación o la justicia resuelva.

#### (e) Protocolos de identificación y acervo probatorio (Art. 5, parágrafo 2)
Para desvirtuar la falla en protocolos y evitar devolver pagos o condonar deudas, el ISP debe conservar:
1. IP y fecha/hora cierta de la contratación o solicitud.
2. Copia legible del documento de identidad cotejado.
3. Evidencia del factor de autenticación (OTP celular/correo verificado, validación biométrica o cotejo facial si hubo venta presencial).
4. Hash criptográfico (SHA-256) del contrato y texto de autorización firmado.

---

### 4. Transferencias internacionales y WhatsApp/Meta
**Posición: DICTAMEN EMITIDO.**

1. **Oracle Cloud Bogotá o Servidor Local:** Califica como tratamiento local. No hay transferencia internacional.
2. **Backups o Hosting en EE. UU.:** La SIC, en el Título V de la Circular Única (Circular Externa 005 de 2017), reconoció a Estados Unidos como país con nivel adecuado de protección bajo condiciones de debida diligencia. Al actuar el hosting como Encargado del tratamiento, la operación se tipifica como **transmisión internacional** (art. 2.2.2.25.5.2 DUR 1074), la cual **no requiere autorización especial del titular ni registro previo ante la SIC**, bastando el Contrato de Transmisión.
3. **WhatsApp / Meta Business API:** Debe declararse en la Política de Tratamiento que las comunicaciones operativas y comerciales pueden tramitarse vía WhatsApp sujetas a los estándares de cifrado y privacidad de Meta Platforms.
4. **RNBD (Registro Nacional de Bases de Datos):** Conforme al Decreto 090 de 2018, únicamente están obligadas a registrar sus bases de datos ante la SIC las sociedades con **activos totales superiores a 100.000 UVT**. Los ISPs por debajo de ese límite están legalmente exentos del registro RNBD, pero plenamente sometidos a las obligaciones sustantivas de la Ley 1581.

---

### 5. Plazo de 5 días para requerir información ante reclamo incompleto (Ley 1581, art. 15)
**Posición: DE ACUERDO.**

- Conforme al artículo 62 de la Ley 4 de 1913 y el artículo 17 del CPACA (Ley 1437 de 2011), en los trámites que conciernen a peticiones, reclamos y derechos constitucionales, los términos expresados en días se entienden como **días hábiles**, excluyendo sábados, domingos y festivos nacionales.

---

### 6. Reporte de incidentes de seguridad ante la SIC
**Posición: DE ACUERDO.**

- **Término legal:** Dentro de los **15 días hábiles** siguientes al momento en que se detecte el incidente de seguridad y se adopten las medidas de contención (Circular Única SIC, Título V).
- **SLA Contractual:** El plazo de **72 horas** fijado a iWana en el contrato de transmisión para notificar al ISP es idóneo y proporcional, permitiendo al ISP evaluar el riesgo y radicar el informe ante la SIC con suficiente margen temporal.
- **Sujeto obligado:** El **ISP en calidad de Responsable**.

---

### 8. Plazo de conservación de los registros de IP y tráfico
**Posición: DE ACUERDO.**

- **Fundamento:** Artículos 2 y 3 del Decreto 1704 de 2012, compilados en el DUR 1078 de 2015 (art. 2.2.9.2.1 y ss.).
- Los operadores de telecomunicaciones tienen el deber legal improrrogable de custodiar por un término no menor a **cinco (5) años** los registros de asignación de direcciones IP de sus suscriptores para fines de investigaciones penales adelantadas por la Fiscalía y policía judicial.

---

### 9. Supresión por anonimización y prueba de autorización
**Posición: DE ACUERDO.**

- La anonimización irreversible extingue el carácter de dato personal y satisface a cabalidad el derecho de supresión (art. 8 lit. e, Ley 1581).
- Es conforme con el principio de *Accountability* (Responsabilidad Demostrada) que el ISP conserve de forma aislada e inmutable el **hash y la constancia de la autorización original**, toda vez que la carga de probar el consentimiento ante cualquier reclamación posterior ante la SIC recae permanentemente sobre el Responsable.

---

### 10. Rotación de las copias de seguridad (35 días)
**Posición: DE ACUERDO.**

- Un esquema de respaldo diario con retención rodante de 35 días satisface el principio de seguridad.
- No es obligatorio especificar el número de días en el Aviso de Privacidad.
- **Salvaguarda técnica:** En caso de contingencia que requiera restaurar un backup histórico, el sistema debe re-ejecutar el script de anonimización sobre los titulares que hayan ejercido el derecho de supresión durante dicho período (*re-anonymization on disaster recovery*).

---

### 11. Retención de prospectos sin contrato
**Posición: DE ACUERDO.**

- El límite de **24 meses** contados desde el descarte es armónico con el principio de temporalidad y necesidad (art. 11 Decreto 1377 de 2013). Superado este lapso sin interacción, los datos deben ser suprimidos o anonimizados.

---

### 12. Inicio y extensión de la retención de suscriptores

#### (a) Hito de inicio del cómputo de 5 años
**Posición: DICTAMEN EMITIDO (Terminación contractual).**

- El artículo 2.2.9.2.2 del DUR 1078 de 2015 y los artículos 60 del Código de Comercio y 632 del Estatuto Tributario determinan que los cinco (5) años se cuentan a partir de la **terminación formal del contrato o desvinculación definitiva del suscriptor**.

#### (b) Extensión preventiva en casos con fecha reconstruida
**Posición: ACEPTABLE JURÍDICAMENTE BAJO ESTADO `DATOS_BLOQUEADOS`.**

- Ante la incertidumbre en fechas antiguas, adoptar la fecha más tardía para evitar la destrucción prematura de registros probatorios o tributarios constituye debida diligencia.
- Mantener dichos registros en estado de bloqueo (`DATOS_BLOQUEADOS`) —invisibles para usos comerciales u operativos ordinarios— elimina el riesgo de sanciones por tratamiento indebido ante la SIC.

---

### 13. Conservación del titular anonimizado
**Posición: DE ACUERDO (No existe obligación de borrado físico).**

- Conforme al artículo 3 literal c) de la Ley 1581 de 2012, un registro desprovisto de identificadores directos o indirectos no constituye un "dato personal".
- Por ende, los registros históricos, analíticos y contables anonimizados pueden permanecer en la base de datos de manera indefinida sin violar el régimen de hábeas data.

---

## III. CONCLUSIONES Y RECOMENDACIÓN DE ACCIÓN INMEDIATA

1. **Aprobación de la Spec de Suplantación:** Se ratifican formalmente las decisiones **D-DO-1**, **D-DO-2** y **D-DO-3** plasmadas en [`docs/specs/2026-11-03-privacy-suplantacion-denuncia-operador-spec.md`](../specs/2026-11-03-privacy-suplantacion-denuncia-operador-spec.md).
2. **Fecha límite:** Al regir la Ley 2573 de 2026 el **19 de noviembre de 2026**, el despliegue de la tarea `FORMULAR_DENUNCIA_OPERADOR` debe quedar completado antes de dicho plazo.

---

## REGISTRO DE CONTROL Y FIRMA

| Campo | Detalle |
| --- | --- |
| **Autor** | Generado por IA; no hay abogado firmante |
| **Identificación / Matrícula Profesional** | No aplica |
| **Fecha** | 3 de noviembre de 2026 |
| **Estado** | **BORRADOR SIN VALOR DE DICTAMEN.** Pendiente de revisión por un abogado colegiado |
