# Informe U1 — registro compacto de equipos y materiales en la consola de OT

**Versión:** 1.0  
**Fecha:** 2026-10-11  
**Estado:** U1 completado; listo para revisión consolidada de G2  
**Productora:** AI-PROD-UX (prod-ux)  
**Plan:** [MOD11: registro compacto de equipos y materiales](../plans/2026-10-11-mod11-consola-registro-material.md)  
**Encargo:** [PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0](../prompts/PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md)  
**Spec actualizada:** [Spec UX MOD11, v1.4](../specs/2026-10-05-mod11-consola-ot-requisito-ux.md)

## Resultado

U1 entrega el flujo con serial, el flujo de consumibles, el copy cerrado y los estados en la adenda §16 de la spec v1.4. El alcance aprobado se conserva: una acción por activo serializado, consumibles en el requisito opcional propio, ninguna entrada manual de serial y ningún cambio al contrato v1.7, al API o a MOD12.

**Bloqueantes documentales: 0.**

## Decisiones ratificadas

### Destino de consumibles

Se ratifica «Instalado en el sitio del cliente» para el requisito «Materiales usados en la instalación». El drop, el patchcord y la roseta forman parte del trabajo que queda instalado o incorporado para el cliente. La decisión coincide con la configuración del requisito ya publicada en la plantilla v3 y evita presentar dos destinos para el mismo flujo.

| Destino | Acción enviada | Etiqueta visible |
| --- | --- | --- |
| Instalado en el sitio del cliente | INSTALL | «Instalar» |
| Consumo interno | CONSUME | «Consumir» |

La acción no tiene selector independiente. Si el snapshot no fija destino, se conserva el selector de destino y la acción se calcula a partir de su valor.

### Flujo serializado

- Se elige un activo en tarjetas de radio; el serial es el título y el detalle muestra referencia, SKU y estado legible.
- La búsqueda por serial o MAC aparece con más de ocho activos.
- La custodia asignada y el destino fijo son contexto de lectura.
- El POST existente usa un activo, quantity 1 y la acción derivada; no se habilita serial manual.
- Los saldos de activos serializados y los materiales de otra categoría no se muestran.

### Flujo de consumibles

- Una fila muestra referencia y disponibilidad neta, con cantidad entera de cero hasta el disponible.
- «Registrar materiales» emite un POST por cada fila con cantidad positiva.
- Cada fila comunica su propio resultado; un error parcial no vuelve a enviar filas ya registradas.
- «Materiales usados en la instalación» es opcional y no afecta el cierre.

## Precondición de datos

El paso 0 se ejecutó en una transacción en el esquema tenant_iwana de la base de desarrollo. El respaldo previo estaba presente y los datos coincidían antes de aplicar el script. El COMMIT corrigió las tres categorías, publicó «Instalación estándar v3» con seis requisitos y movió OTE-20260828-001 y OTE-20260828-002 a la v3. La verificación posterior confirmó que ambas órdenes tienen los seis requisitos y el requisito opcional de consumibles.

## Verificación documental

- U1 cubre los seis puntos del encargo: flujo serial, flujo de consumibles, elementos retirados, estados y copy, destino, y derivación de acción.
- La MAC ya está disponible en el registro de activo serializado; no se solicita un campo ni contrato nuevo.
- La categoría se toma del snapshot del requisito. No se incluyen productos de otra categoría.
- La UI mantiene los permisos y el POST existentes; no se deriva acceso desde el rol ni desde la custodia visible.
- No se modificó código de interfaz ni se ejecutaron pruebas de implementación.

## Veredicto

**U1: GO para revisión consolidada de G2.** La spec v1.4 es suficientemente concreta para que frontend implemente los dos flujos sin decisiones de experiencia pendientes. No quedan bloqueos de copy o flujo. La aprobación formal del gate G2 corresponde a EM-ARCH según el plan.
