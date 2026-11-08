# Contraste del dictamen jurídico de protección de datos con fuentes primarias

**Fecha:** 2026-11-08
**Autor del contraste:** Claude Code (asistente IA), a pedido del usuario. **Este informe no es un dictamen**: compara el texto recibido con las fuentes que se pudieron leer.
**Objeto:** dos textos pegados por el usuario el 2026-11-08 como «respuestas del abogado»:
- **A:** los siete puntos de ADR-094 §7.3 (H3, H6, H13, incidentes, Ley 2300, contrato de transmisión, backups);
- **B:** D-H1-5 y las preguntas 4, 9, 11, 12 y 13 de la [consulta v1.1](INFORME-CONSULTA-JURIDICA-PROTECCION-DATOS-v1.1.md).

**Estado de autoría:** el texto no trae nombre, tarjeta profesional ni firma. Según la regla del proyecto, no entra en `docs/legal/` hasta que el usuario confirme el abogado que lo firma.

**Decisión del CTO (2026-11-08):** asume el criterio de §8 y de D-H1-5. Quedó registrado en ADR-094 v1.1 (§D7, expediente de vinculación) y en la spec H-1 (D-H1-5 cerrada). Los demás puntos de ADR-094 §7.3 siguen ⚠.

## 1. Veredicto

El dictamen **resiste el contraste**. Ninguna afirmación verificada resultó falsa. Hay tres imprecisiones y dos omisiones que conviene llevar al abogado, y cuatro consecuencias para el sistema que no dependen de esas dudas.

| Leyenda | Significado |
|---|---|
| ✅ | Confirmado en fuente primaria u oficial |
| 🟡 | Coherente, con un matiz o una fuente secundaria |
| ⚠ | Imprecisión u omisión que hay que aclarar |
| ⬜ | No se pudo verificar en esta pasada |

## 2. Texto A — puntos de ADR-094 §7.3

| Punto | Afirmación del dictamen | Resultado | Evidencia |
|---|---|---|---|
| H3 | Los 5 días del art. 15.1 de la Ley 1581 son hábiles por el art. 62 de la Ley 4 de 1913 | ✅ | Función Pública transcribe el art. 62: en los plazos de días de leyes y actos oficiales se excluyen feriados y vacancia |
| H3 | Desistimiento a los 2 meses desde el requerimiento | ✅ | Ley 1581 art. 15 |
| H3 | La política de la SIC aplica 5 días hábiles | ⬜ | No se localizó el documento |
| H6 | Los 20 días hábiles se cuentan desde la comunicación del operador al titular | 🟡 | El art. 8 dice que el operador «deberá comunicar a la persona suplantada que a partir de ese momento cuenta con veinte (20) días hábiles». Es la lectura más fiel del texto |
| H6 | El Boletín 123 de la Superfinanciera cuenta desde que la persona informó a la entidad | ✅ | El concepto 2026124048-004 (21-07-2026) dice «siguientes a la fecha en que informó a la entidad». La discrepancia que señala el dictamen es real |
| H6 | La C-413 de 2025 obliga también al operador a denunciar en el mismo término | ✅ | Condicionamiento del inciso del art. 8, «en el entendido que» el operador «deberá formular la denuncia penal que corresponda», citado por el mismo concepto |
| H6 | La ley aplica al ISP | ⚠ | El art. 1 dice «operadores de telecomunicaciones», sin nombrar el internet. Que un ISP es operador de telecomunicaciones (Ley 1341) es inferencia razonable, pero el dictamen la da por hecha |
| H6 | Vigencia general el **20-11-2026** (DO 53.496 del 20-05; art. 13, seis meses) | 🟡 | DO 53.496 del 20-05-2026 y texto del art. 13 confirmados. Calculan el **19-11** la Alcaldía de Bogotá, la Superfinanciera («publicada el 19 de mayo») y la infografía de la Rama. El art. 52 de la Ley 4 de 1913 (promulgación = inserción en el periódico oficial) no se pudo leer en línea |
| H6 | Parágrafos 1 y 2 del art. 5 rigen desde la promulgación | ✅ | Art. 13. El parágrafo 1 ordena a SIC, Superfinanciera y MinTIC reglamentar protocolos en seis meses: el dictamen no dice si ya se expidieron |
| H6 | (omisión) Plazo del operador para resolver la solicitud de la víctima | ⚠ | Art. 5 num. 4: **10 días hábiles desde la radicación**. Coincide con ADR-094; el dictamen no lo trata |
| H13 | El art. 2.2.2.6.4 del Decreto 1078 exige conservar 5 años la información de suscriptores | ✅ | Art. 4 del Decreto 1704 de 2012 (compilado), párrafo vigente: «mantener actualizada la información de sus suscriptores y conservarla por el término de cinco años» |
| H13 | Ese artículo «menciona identidad, dirección de facturación y tipo de conexión» | ⚠ | Esa lista está en el **primer párrafo, marcado «Aparte tachado NULO»** por el Consejo de Estado en el normograma de MinTIC. El texto vigente no enumera qué datos son «información de suscriptores». La conclusión no cambia, pero el alcance queda sin definir en la norma |
| H13 | No hay plazo único para logs de IP y tráfico | 🟡 | El decreto no menciona IP. El art. 5 sí regula **información de ubicación** de terminales; el dictamen no la menciona |
| Incidentes | 15 días hábiles desde la detección y puesta en conocimiento; RNBD o aplicativo para no obligados | ✅ | Circular Externa 003 del 1-08-2018 (DO 50.672), Título V de la Circular Única |
| Incidentes | Aviso al ISP en 24 h como plazo contractual | 🟡 | Recomendación, no norma. La consulta v1.1 proponía 72 h |
| Ley 2300 | Aplica a quien cobra directamente | ✅ | Parágrafo del art. 1 |
| Ley 2300 | Horarios L-V 7–19 y sábados 8–15 | ✅ | Art. 3; la CRC confirma el límite del sábado |
| Ley 2300 | Rige desde el 10-10-2023 | ✅ | Normograma MinTIC; exequible en C-278 de 2024 |
| Ley 2300 | Un contacto diario, un canal por semana, prohibición de contactar referencias | ⬜ | No se leyó el texto literal de esas reglas |
| Contrato | Contenido mínimo del contrato de transmisión | ✅ | Art. 25 del Decreto 1377 de 2013, compilado en la sección 5 del capítulo 25 del Decreto 1074 |
| Contrato | Roles responsable (ISP) / encargado (iWana) según quién decide | 🟡 | Coherente con las definiciones de la Ley 1581 art. 3 |
| Backups | No hay excepción general para esperar la rotación | 🟡 | No se encontró norma en contrario. Es criterio, no cita |

## 3. Texto B — D-H1-5 y preguntas abiertas

| Punto | Afirmación del dictamen | Resultado | Evidencia |
|---|---|---|---|
| D-H1-5 | La supresión no procede si subsiste un deber legal o contractual | ✅ | Art. 9 del Decreto 1377, transcrito por la SIC (Concepto 15-039288). Matiz: la norma habla del deber **del titular** «de permanecer en la base de datos»; el deber de conservación del responsable sale del art. 11 del mismo decreto |
| D-H1-5 | La inmutabilidad técnica no es excepción legal | 🟡 | Criterio coherente con finalidad y temporalidad (Ley 1581 art. 4) |
| D-H1-5 | Criterio para G7: inventario, evidencia, no reaparición y registro de excepciones | 🟡 | Criterio del abogado; no contradice ninguna fuente |
| P4 | Transmisión (contrato, sin autorización adicional) frente a transferencia (art. 26) | ✅ | Ley 1581 art. 26; Decreto 1377 arts. 24-25 |
| P4 | El addendum global de WhatsApp trae cláusulas para Latinoamérica | ✅ | Business Data Transfer Addendum (22-08-2025): cláusulas modelo de la Red Iberoamericana («LATAM and Canada SCCs») |
| P9 | Cifrar conservando la llave no es anonimizar | ✅ | La SIC rechazó en el caso World Foundation que códigos de iris cifrados y fragmentados dejaran de ser datos personales |
| P9 | La SIC reconoce que lo anonimizado irreversiblemente deja de ser dato personal | ⬜ | No se encontró el pronunciamiento citado («Sede Electronica»); el caso anterior lo apoya solo por contraste |
| P11 | No hay plazo legal para prospectos; 6 a 12 meses sería justificable | 🟡 | No se encontró plazo legal. ADR-094 adoptó **24 meses** el 2026-10-14: no es ilegal según el dictamen, pero hay que justificarlo |
| P12 | Ley 962 art. 28: 10 años desde el último asiento | ✅ | Ya citado en ADR-094 |
| P12 | El Decreto 1078 no dice desde cuándo corren los 5 años | ✅ | Art. 4 del Decreto 1704: solo «por el término de cinco años» |
| P12 | El PRD v2.4 atribuye «vigencia del contrato + 5 años» a la Ley 1581 | ✅ | [PRD_Sistema_ISP_Colombia_v2_4.md:1063](../prds/PRD_Sistema_ISP_Colombia_v2_4.md); el mismo error está en los dos PRD de MOD01 (línea 252) |
| P13 | Facturas y comprobantes conservados siguen siendo datos personales | 🟡 | Coherente con P9 |

## 4. Señales de autoría

- **Retiro una señal que di antes:** la etiqueta «Normograma [DECRETO_1074_2015_PR026]» corresponde a un archivo real del normograma de la Cancillería (`decreto_1074_2015_pr026.pdf`), no a un artefacto.
- Las demás etiquetas («Sede Electronica», «Documento interactivo», «Gestor Normativo») corresponden a sitios oficiales reales. No prueban ni descartan la autoría.
- El texto sigue sin firma. La verificación de fuentes no sustituye ese requisito.

## 5. Consecuencias para el sistema

Valen si el abogado firma el dictamen tal como está.

1. **La bitácora de H-1 es dato personal.** `privacy_erasure_mutation_log` guarda `row_id` (el UUID del suscriptor) y es append-only por diseño. Según D-H1-5, esa inmutabilidad no la exime: necesita finalidad, acceso restringido y vencimiento. La spec H-1 ya los define en D-H1-3 (la misma retención que el registro de la solicitud, con lectura solo para el oficial de privacidad). **Corrección:** una versión anterior de este punto decía que no tenía retención. Lo que falta verificar es que el vencimiento se ejecute, porque la migración 178 no lo implementa.
2. **«Anonimizado» no puede declararse en G7 sin prueba de irreversibilidad.** El titular suprimido conserva su UUID enlazado a contratos y documentos de facturación. Según P9 y P13, ese conjunto es dato personal conservado por excepción, no anónimo. El diseño es correcto si así se registra; lo incorrecto sería certificarlo como anonimización.
3. **H6 necesita dos fechas y no reanudar el cobro automáticamente.** Registrar la recepción del aviso y la comunicación del plazo; comunicar el plazo el mismo día hace que las dos lecturas (texto y Superfinanciera) coincidan. Falta la tarea de denuncia del operador (C-413).
4. **Fecha de vigencia.** Con el 20-11 el riesgo de equivocarse es de un día. Recomiendo tener H6 operativo el **19-11**, que satisface ambas lecturas.
5. **Corregir la atribución en los PRD** (v2.4 y MOD01) y en lo que derive de ellos.

## 6. Preguntas para el abogado

1. ¿Un ISP es «operador de telecomunicaciones» para la Ley 2573, sin más?
2. Si el párrafo con la lista de datos del art. 4 del Decreto 1704 fue anulado, ¿qué comprende hoy «información de sus suscriptores»? ¿Y la información de ubicación del art. 5?
3. ¿Se expidieron ya los protocolos del parágrafo 1 del art. 5 de la Ley 2573?
4. ¿Qué plazo de conservación propone para la bitácora de supresión, y desde qué evento?
5. ¿Ratifica los 24 meses de prospectos de ADR-094 o recomienda bajarlos?
6. Firma, nombre y tarjeta profesional para registrar el dictamen en `docs/legal/`.

## 7. Segunda ronda (2026-11-08): respuestas a las preguntas 1 y 3

El usuario pegó una segunda respuesta sobre el ámbito de la Ley 2573 y los protocolos de la SIC. Tampoco trae firma. Contraste:

| Afirmación | Resultado | Evidencia |
|---|---|---|
| El art. 3 define siete términos, incluida «fuente», y no define «operador de telecomunicaciones» | ✅ | Texto de la ley: numerales 1 a 7; «fuente» es el 7 |
| Un ISP habilitado es operador de telecomunicaciones (Ley 1341) | 🟡 | Argumento sistemático sólido; sigue sin estar escrito en la ley. Cierra la pregunta 1 de §6 si el abogado lo firma |
| SIC: 13.983 reclamaciones (2022–mayo 2026), 11.365 de telecomunicaciones (81 %), multas por 2.390 millones desde 2023 | ✅ | Campaña de la SIC del 23-06-2026, recogida por varios medios |
| El art. 7 aplica a cualquier «fuente» que reporte a centrales: cotejo en 10 días hábiles y leyenda «Víctima de Falsedad Personal» | ✅ | Art. 7, numerales 7 y 8 (modifican la Ley 1266) |
| 10 días hábiles (art. 5 num. 4) para la solicitud; 15 + 8 con silencio para peticiones ante la fuente | ✅ | Art. 5 num. 4 y art. 7 num. 8. Resuelve la omisión de §2 |
| El parágrafo 3 del art. 5 remite por error al numeral 3 en vez del 4 | ✅ | El parágrafo dice «del numeral 3»; las solicitudes y quejas están en el numeral 4 |
| Suspensión inmediata del cobro, con intereses y gastos de cobranza | ✅ | Art. 8, inciso 1 |
| La suspensión dura hasta un pronunciamiento judicial que ponga fin a la actuación penal | ✅ con matiz | Está en el **art. 9**, inciso 1, no en el 8, y ese inciso es **condicionalmente constitucional**: el condicionamiento de la C-413 no se leyó |
| Entregar copia de los documentos de vinculación; no puede negarse «bajo ninguna circunstancia» | ✅ | Art. 5, numeral 7 |
| Reporte a la DIAN | ✅ | Art. 5, numeral 8 («Dirección de Impuestos Nacionales»); la ley no fija forma ni formato |
| Proyecto de Título V: comentarios del 27-05 al 10-06-2026; instrucciones de la Ley 2573 desde el 20-11-2026 | 🟡 | Sede electrónica de la SIC (proyecto del 26-05) y Cerlatam; la fecha del 20-11 solo aparece en Cerlatam |
| Cronograma de protocolos: propuesta el 2-11 y expedición el 20-11 | ⬜ | No se encontró ese cronograma |
| No hay protocolos ni resolución definitiva expedidos | ⬜ | No se encontraron. Que no aparezcan no prueba que no existan: hay que revisar la sede de la SIC y el Diario Oficial antes del 19-11 |

**Sobre los «cinco días hábiles» como política de la SIC.** La nota del usuario rastrea el plazo hasta un comentario de Avantel a un proyecto de la SIC sobre suplantación. Pero la afirmación del dictamen (§2, H3) se refiere a otro asunto: el requerimiento de un reclamo incompleto de la Ley 1581. Tampoco encontré en esta ronda una política de la SIC que lo diga. **Conclusión:** el dictamen debe apoyar H3 solo en el art. 15 de la Ley 1581 y el art. 62 de la Ley 4 de 1913, que bastan, y retirar la mención a la política de la SIC. Ni ADR-094 ni este informe la usan como fundamento.

### Consecuencias nuevas para el sistema

6. **H6 necesita un estado «suspendido por suplantación» sin vencimiento.** Termina con la decisión judicial (art. 9), no con un plazo. Además, si el titular no denuncia a tiempo, el cobro puede reanudarse (art. 8, parágrafo 1), pero no automáticamente.
7. **La meta de H6 es 10 días hábiles**, con silencio aplicado a la solicitud del numeral 4.
8. **Nueva categoría de retención en ADR-094 D7:** el expediente de vinculación no puede suprimirse mientras exista un reclamo por suplantación en curso o pueda presentarse uno. Esto choca con D-H1-5: hay que definir por cuánto tiempo «puede presentarse», o la excepción se vuelve indefinida. **Pregunta nueva para el abogado.**
9. **Tareas de H6:** entregar la copia de los documentos de vinculación, el reporte a la DIAN (manual hasta que se reglamente) y la denuncia del operador (C-413).
10. **Si el ISP reporta a centrales de riesgo**, aplican el cotejo en 10 días hábiles y la leyenda «Víctima de Falsedad Personal».
11. **H6 sale sin protocolos definitivos de la SIC.** La verificación de identidad en la vinculación debe poder cambiar sin rehacer el flujo.

## 8. Tercera ronda (2026-11-08): límite de la retención del expediente de vinculación

El abogado propone conservar el expediente de cada contrato hasta la **más tardía** de cuatro fechas: A (terminación + 5 años), B (fin de la exposición de cobro o reporte), C (decisión judicial + 3 años) y D (orden de conservación). Para el hito B, la exposición termina con lo primero de tres eventos: pago (más la permanencia del reporte, si lo hubo), castigo con renuncia al cobro y sin reporte activo, o exigibilidad + 10 años. Tampoco trae firma.

### Contraste

| Afirmación | Resultado | Evidencia |
|---|---|---|
| Dato negativo de deuda impaga: caduca a los 8 años desde la mora | ✅ | Ley 1266 art. 13, parágrafo 1, modificado por la Ley 2157 de 2021 |
| Deuda pagada: el doble de la mora, máximo 4 años desde el pago o la extinción | ✅ | Ley 2157 art. 3; C-1011 de 2008 |
| Caducidad del dato ≠ prescripción de la obligación | ✅ | Concepto citado por Ámbito Jurídico (Cpto 149874-22) |
| Acción ejecutiva 5 años y ordinaria 10 (CC art. 2536) | ✅ | Texto tras la Ley 791 de 2002. Matiz: la interrupción reinicia el término, así que el «tope duro» de 10 años puede correrse si hay una demanda o un reconocimiento de la deuda |
| Caducidad sancionatoria 3 años (CPACA art. 52) | ✅ | Regla general, salvo norma especial; cuenta desde la conducta o desde que cesa |
| Hito A: 5 años desde la terminación | 🟡 | El Decreto 1704 no fija el inicio (el propio abogado lo dijo en la P12). Es la regla de ADR-094 D7, que cuenta desde la terminación **del último contrato**; la propuesta cuenta por contrato |
| La redacción propuesta para D-H1-5 | ⚠ | Omite el hito D (orden judicial) que sí está en la tabla |
| Riesgo residual aceptado por escrito | 🟡 | Coherente con el principio de responsabilidad demostrada; debe quedar en el ADR |

### Efecto de la política de un año

El usuario informa que, por política de la empresa, la deuda solo se mantiene un año y luego se borra. Si eso significa **renuncia formal al cobro** al año de la exigibilidad:

- **El hito B nunca supera al A.**
  - Sin reporte: B = exigibilidad + 1 año.
  - Con reporte: la deuda queda extinguida, y el dato negativo dura el doble de la mora (unos 2 años) desde la extinción, unos 3 años en total.
  - En ambos casos, la fecha queda antes de terminación + 5 años.
- **La regla se reduce a:** terminación + 5 años; si hay reclamo por suplantación, decisión judicial + 3 años; si hay orden de conservación, lo que diga la orden.

Condiciones para que funcione:

1. **«Borrar la deuda» no puede ser borrar registros.** Las facturas, los pagos y el asiento de castigo se conservan 10 años (Ley 962 art. 28, H10 de ADR-094). Lo que termina es el cobro: un estado «castigada con renuncia», no una eliminación.
2. **La renuncia tiene que ser formal y documentada:** política aprobada, aplicada a todos y con fecha por obligación. Sin ella, el abogado mantiene el tope de 10 años.
3. **Si hubo reporte, hay que retirarlo o actualizarlo** cuando se renuncia. La deuda extinguida sigue un régimen de permanencia propio.
4. **¿De quién es la deuda?** El acreedor y responsable es el ISP, no iWana. **Decisión del usuario (2026-11-08): cada ISP decide el plazo de renuncia.** Es un parámetro por tenant, con estas reglas:
   - **Sin configurar:** no hay renuncia, y el hito B corre hasta exigibilidad + 10 años, como dice el abogado.
   - **Configurado (por ejemplo, 12 meses):** B se calcula con ese valor y queda dentro del piso de 5 años.
   - **Cambios:** se registran con fecha y aplican a las obligaciones que venzan después; las ya castigadas no cambian.
5. **Efecto tributario del castigo:** hay que consultarlo con el contador, en la línea de la consulta de IVA.

### Consecuencias para el sistema

12. **D-H1-5 y ADR-094 D7:** el expediente de vinculación se **bloquea, no se suprime**, hasta la fecha más tardía de A, B, C y D, calculada por contrato. B depende del plazo de renuncia de cada ISP; si el ISP lo configura en un año o menos, B queda absorbido por A. El acceso durante el bloqueo queda limitado a los roles de suplantación y legal.
13. **La supresión a pedido del titular**, si llega antes de esa fecha, debe responder con la excepción y su vencimiento, no anonimizar el expediente. Hay que verificar que el flujo actual de supresión (anonymize-titular y el participante CRM) se comporta así.
14. **Billing necesita un estado de castigo con renuncia** que conserve los documentos y detenga el cobro y el reporte.

## 9. Fuentes consultadas

- Ley 2573 de 2026, compilación de Colpensiones: https://normativa.colpensiones.gov.co/colpens/compilacion/docs/ley_2573_2026.htm (el sitio del Senado rechazó la conexión).
- Superfinanciera, Boletín Jurídico 123 (concepto 2026124048-004): https://www.superfinanciera.gov.co/publicaciones/10116246/boletin-juridico-no-123/
- Corte Constitucional, C-413 de 2025: https://www.corteconstitucional.gov.co/relatoria/2025/C-413-25.htm
- Alcaldía de Bogotá, Ley 2573: https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=193210
- Decreto 1704 de 2012, normograma MinTIC: https://normograma.mintic.gov.co/mintic/compilacion/docs/decreto_1704_2012.htm
- SIC, Título V de la Circular Única (Circular 003 de 2018): https://www.sic.gov.co/sites/default/files/normatividad/082018/Titulo-V-Circular-03-del-1-08-2018.pdf
- Ley 2300 de 2023, normograma MinTIC: https://normograma.mintic.gov.co/docs/pdf/ley_2300_2023.pdf
- SIC, Concepto 15-039288: https://sedeelectronica.sic.gov.co/sites/default/files/normatividad/Concepto_15-039288.pdf
- Cancillería, Decreto 1074 de 2015 (parte 26): https://cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/decreto_1074_2015_pr026.pdf
- WhatsApp Business Data Transfer Addendum: https://www.whatsapp.com/legal/business-data-transfer-addendum
- SIC, caso World Foundation: https://sedeelectronica.sic.gov.co/noticias/sic-sanctions-three-companies-personal-data-violation
- Función Pública, Ley 4 de 1913 art. 62: https://www.funcionpublica.gov.co/eva/gestornormativo/norma_pdf.php?i=163193
- SIC, campaña sobre suplantación (23-06-2026): https://sedeelectronica.sic.gov.co/noticias/la-sic-alerta-por-aumento-de-suplantacion-de-identidad-en-el-pais-y-lanza-campana-para-prevenir-fraudes-digitales
- SIC, proyecto de resolución que modifica el Título V: https://sedeelectronica.sic.gov.co/transparencia/normativa/proyecto-de-resolucion-por-la-cual-se-modifica-el-titulo-v-de-la-circular-unica-de-la-superintendencia-de-industria-y
- Cerlatam, proyecto SIC del 27-05-2026: https://www.cerlatam.com/normatividad/sic-proyecto-de-resolucion-27-may-2026/
- Ley 2157 de 2021, compilación de Colpensiones: https://normativa.colpensiones.gov.co/colpens/compilacion/docs/ley_2157_2021.htm
- Concepto 149874-22 (caducidad del dato y prescripción): https://www.ambitojuridico.com/sites/default/files/2022-11/Cpto-149874-22.pdf
- Código Civil art. 2536: https://normativa.colpensiones.gov.co/colpens/docs/codigo_civil_pr079.htm
- CPACA art. 52: https://leyes.co/codigo_de_procedimiento_administrativo_y_de_lo_contencioso_administrativo/52.htm
