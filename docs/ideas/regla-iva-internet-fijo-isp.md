> **Insumo no verificado para la escalación E-1** (MOD05). Sin autor ni fuente oficial declarados; no es norma del proyecto. Movido desde `docs/RegladeiVA.md` el 2026-10-12 por gobernanza documental. Ver `docs/informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md` §11.

Para un proveedor de servicios de internet (ISP) en Colombia, el tratamiento del Impuesto sobre las Ventas (IVA) para el servicio de acceso y conexión a internet fijo no depende únicamente de la naturaleza jurídica del cliente, sino principalmente de la **destinación del servicio (residencial vs. comercial)** y del  **estrato socioeconómico**.   
A continuación se detalla la aplicación legal según el Estatuto Tributario (E.T.) colombiano:   
### **1. Matriz de Aplicación del IVA por Tipo de Usuario**  
| | | | | |  
|-|-|-|-|-|  
| **Tipo de Cliente / Usuario** | **Tratamiento del IVA** | **Tarifa** | **Fundamento Legal** | **Efecto en la Facturación y el ISP** |   
| **Residencial - Estratos 1 y 2** | **EXENTO** | **0%** | Art. 481, Lit. h) del E.T. | No se le cobra IVA al usuario. **Ventaja para el ISP:** Permite tomar los IVA descontables (compras de red, tránsito IP, equipos) asociados a este servicio o solicitar su devolución/compensación. |   
| **Residencial - Estrato 3** | **EXCLUIDO** | **0%** (Sin IVA) | Art. 476, Num. 7 del E.T. | No se le cobra IVA al usuario. **Atención:** El IVA de las compras/costos que realice el ISP para prestar este servicio  **NO** es descontable; se convierte en mayor valor del costo/gasto. |   
| **Residencial - Estratos 4, 5 y 6** | **GRAVADO** | **19%** | Regla General Art. 468 del E.T. | Se liquida y cobra el 19% de IVA sobre la tarifa base mensual de internet. |   
| **Empresas Privadas** *(Comercial / Industrial)* | **GRAVADO** | **19%** | Regla General Art. 468 del E.T. | Todo plan comercial, corporativo o pyme lleva IVA del 19%, **incluso si la oficina o local funciona en un inmueble de estrato 1, 2 o 3**. Prevalece la destinación comercial. |   
| **Entidades del Estado** | **GRAVADO** | **19%** | Regla General Art. 468 del E.T. | Salvo exenciones muy específicas fijadas por tratados internacionales o donaciones especiales, la contratación pública ordinaria de telecomunicaciones está sujetas al IVA del 19%. |   
| **ONGs y Entidades Sin Ánimo de Lucro (ESAL)** | **GRAVADO** | **19%** | Regla General Art. 468 del E.T. | Estar registradas en el Régimen Tributario Especial (RTE) otorga beneficios en Impuesto a la Renta, pero **no las exime de pagar IVA** como consumidoras de servicios comprados. |   
### **2. Puntos Clave y Consideraciones Especiales para el ISP**  
#### ***A. Restricción por Tipo de Red (Fija vs. Móvil)***  
Los beneficios de exención (Estratos 1 y 2) y exclusión (Estrato 3) aplican **únicamente a servicios de internet fijo** (fibra óptica, radioenlaces fijos, cable coaxial). Si el ISP presta servicios de datos móviles, estos están gravados con IVA del 19% e Impuesto Nacional al Consumo (INC) del 4% en la porción que exceda el tope fijado por la norma (1,5 UVT).   
#### ***B. Destinación Residencial vs. Uso Comercial***  
Para aplicar la exención (1 y 2) o exclusión (3) es obligatorio que el suscriptor sea un **usuario residencial** que utilice el servicio en su lugar de vivienda.   
- **Riesgo DIAN:** Si el ISP factura con beneficio fiscal (0% IVA) a una tienda de barrio, droguería, taller u oficina, aunque esté en estrato 1, 2 o 3, la DIAN puede reclasificar los ingresos como gravados y exigir el 19% de IVA omitido más sanciones e intereses.   
#### ***C. Prorrateo del IVA Descontable (Art. 490 del Estatuto Tributario)***  
Dado que un ISP factura simultáneamente servicios **Gravados** (Empresas, Estratos 4-6),  **Exentos** (Estratos 1-2) y  **Excluidos** (Estrato 3):   
1. El IVA pagado en costos directamente imputables a clientes gravados y exentos es **100% descontable**.  
2. El IVA de los costos imputables a estrato 3 **NO es descontable** (va al gasto o costo).   
3. El IVA de los **costos y gastos comunes de la red** (tránsito de internet mayorista, arrendamiento de nodos, enlaces de transporte principal, software de gestión) debe  **prorratearse proporcionalmente** al porcentaje que representen las ventas excluidas sobre las ventas totales del periodo.  
#### ***D. Servicios Adicionales o Empaquetados***  
Si el ISP cobra valores adicionales por:  
- Arriendo o venta de routers / ONTs.  
- Asignación de direcciones IP públicas fijas.  
- Mantenimientos técnicos o visitas domiciliarias cobradas por separado.  
- Televisión por IP (IPTV) o telefonía adicional.  
Estos conceptos **no comparten la exención ni la exclusión del internet residencial** y deben facturarse con la tarifa general del  **19% de IVA** de forma discriminada en la Factura Electrónica.   
### **3. Recomendaciones de Control y Planeación Fiscal**  
1. **Soportes de Estratificación:** Exigir en la vinculación del usuario residencial una copia del recibo de servicios públicos (energía/acueducto) o certificado de estratificación municipal que valide la dirección de instalación.  
2. **Parametrización en Facturación Electrónica:** Configurar en el software de facturación (WispHub, Siigo, ERP propio) la correcta codificación del impuesto por tipo de cliente:  
  - **Estratos 1 y 2:** Código de Exención (Lit. h, Art. 481 E.T.).   
  - **Estrato 3:** Código de Exclusión (Num. 7, Art. 476 E.T.).   
  - **Demás clientes:** Tarifa 19%.   
3. **Contratos Diferenciados:** Mantener claramente separados los formatos de contrato de prestación de servicios residenciales frente a los contratos de servicios comerciales/corporativos.  
   
