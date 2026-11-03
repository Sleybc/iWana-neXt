# INFORME — `privacy` · Verificación de la Ley 2573 de 2026 en fuente oficial

**Versión:** 1.0
**Fecha:** 2026-11-02
**Autor:** AI-EM-ARCH
**Origen:** pendiente del [cierre de DT-3](INFORME-PRIVACY-DT3-RER-CIERRE-v1.0.md) §6 y de la [spec DT-3](../specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md) §2 (⚠ «verificar antes de G7»). [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) H6 se apoyó en fuentes secundarias porque el texto oficial no estaba accesible.

## 1. Fuente

**Compilación Jurídica del Ministerio TIC:** [normograma.mintic.gov.co · Ley 2573 de 2026](https://normograma.mintic.gov.co/mintic/compilacion/docs/ley_2573_2026.htm), consultada el 2026-11-02. La página la identifica como **Ley Estatutaria 2573 del 19 de mayo de 2026**, publicada en el **Diario Oficial 53.496 del 20 de mayo de 2026**. Se ocupa de la suplantación de identidad ante operadores de telecomunicaciones, entidades financieras y crediticias y establecimientos comerciales, con efectos sobre el reporte negativo y el cobro.

No se pudo consultar la Secretaría del Senado (conexión rechazada) ni se cotejó el Diario Oficial. Los apartes marcados como de exequibilidad condicionada remiten a anotaciones de jurisprudencia que no se pudieron desplegar; el número de la sentencia queda sin verificar.

## 2. Contraste con lo implementado

| Tema | Texto oficial (paráfrasis) | ADR-094 H6 y código | Veredicto |
| --- | --- | --- | --- |
| **Vigencia** | Art. 13: rige dentro de los 6 meses siguientes a la promulgación, salvo los parágrafos 1 y 2 del art. 5, que rigen desde la promulgación | ADR-094: 19-nov-2026 ⚠ | El plazo de 6 meses desde el 20-may-2026 vence hacia el **20-nov-2026**. El 19-nov es un día antes: **se mantiene como fecha interna, porque es la más conservadora**. El ⚠ de ADR-094 queda resuelto en el sentido de no relajarla |
| **Respuesta del operador** | Art. 5 num. 4: los operadores de telecomunicaciones y demás obligados dan trámite a las solicitudes o quejas dentro de los **10 días hábiles** siguientes a la radicación | `REQUEST_DUE_DAYS.SUPLANTACION = 10` en días hábiles colombianos (`privacy/requests/requests-domain.ts:9-13`) | **Conforme** |
| Plazo de 15 + 8 días hábiles | Art. 7 num. 8: modifica el art. 16 de la Ley 1266 de 2008 (resolver peticiones o reclamos en 15 días hábiles, prorrogables 8; si no, se entienden a favor del peticionario). No nombra al destinatario; por contexto se aplica a fuentes y operadores de información | No implementado como plazo propio | No contradice el código: el plazo de 10 días es más estricto. ⚠ El dictamen debe aclarar si al ISP, como fuente, le aplica también el silencio positivo del art. 7 |
| **Suspensión** | Art. 8: suspender de inmediato el cobro, intereses y gastos de cobranza al ser informado. Art. 5 num. 5: suspender de inmediato el bien o servicio | Suspensión de contratos por `IContractImpersonationPort` (HLD §6.3) | **Conforme** en el diseño |
| **Denuncia ante la Fiscalía** | Art. 8 inc. 2 (exequibilidad condicionada): el operador comunica al titular que desde ese momento tiene **20 días hábiles** para denunciar; si no denuncia, el operador puede reanudar el cobro y el reporte (par. 1) | `calculateImpersonationComplaintDueAt` = radicación + 20 días hábiles (`requests-domain.ts:24-25`) | **Diferencia de anclaje:** la ley cuenta desde la comunicación del operador; el código, desde la radicación. Coinciden solo si la comunicación sale el mismo día. ⚠ Dictamen sobre el alcance de la exequibilidad condicionada |
| **Leyenda** | Art. 7 num. 7: «Víctima de Falsedad Personal», que no constituye reporte negativo | Marca de suplantación (HLD §6.3) | **Conforme** |
| **Ya vigentes** | Art. 5 par. 1: SIC, SFC y MinTIC reglamentan protocolos de atención en 6 meses. Par. 2: si se incumplieron los protocolos de seguridad, se suspende la cobranza, se corrige el reporte y se devuelven dineros o se eliminan acreencias | Par. 1 no exige nada del ISP hasta que salga la reglamentación. Par. 2 depende de facturación (MOD14) y de centrales de riesgo (Fase 3) | Sin acción de código hoy. **Vigilar la reglamentación** de SIC, SFC y MinTIC |
| Supresión | La ley no ordena suprimir datos personales; ordena corregir el reporte y desvincular a la víctima del cobro (art. 9) | DT-3 no se apoya en esta ley | Sin impacto en DT-3 |

## 3. Resultado

- **El punto «verificar la Ley 2573 en fuente oficial» queda cerrado.** La implementación cumple el plazo de 10 días hábiles, la suspensión inmediata y la leyenda.
- **Una diferencia sustantiva:** el anclaje de los 20 días de la denuncia. Pasa a los dictámenes de ADR-094 §7.3, junto con el alcance de las exequibilidades condicionadas (art. 2 lit. d, art. 3 num. 5, art. 8 inc. 2, art. 9 inc. 1 y parágrafo, art. 12) y la sentencia que las declara.
- **ADR-094 H6:** está aprobado y no se reescribe. Esta verificación lo complementa y se cita desde el HLD Privacy en su próxima versión. Si el dictamen cambia el anclaje de la denuncia, se emite un ADR sucesor.
