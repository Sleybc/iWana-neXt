# ADR-INV-SKU-COMPUESTO-v1: SKU compuesto de productos de inventario

**Estado:** Aprobado  
**Fecha:** 2026-07-02  
**Módulo:** MOD12 Inventario / SCM

## Contexto

El SKU autogenerado anterior usaba `{prefijo-categoria}-{NNNNNN}`. Ese formato era estable,
pero no comunicaba tipo de artículo, nombre, marca ni modelo. La operación de inventario necesita
SKUs más expresivos sin superar el límite vigente de `varchar(60)`.

## Decisión

Para productos nuevos sin SKU explícito, el sistema generará un SKU compuesto:

```text
{CAT}-{TIPO}-{NOMBRE}-{MARCA}-{MODELO}
```

`MARCA` y `MODELO` se omiten si no están disponibles. Ante colisión se agrega un sufijo
`-001` a `-999`.

El prefijo de categoría se reduce a 2-3 caracteres (`CFO`, `CRD`, `NET`) para conservar espacio
en el SKU final.

## Consecuencias

- Los SKUs nuevos son más legibles para operación.
- Los SKUs existentes no se migran ni se recalculan.
- `sku` sigue siendo inmutable tras la creación.
- La migración v2 puede acortar `codePrefix` para categorías existentes; no recalcula SKUs ya emitidos.
- Se mantiene el límite de 60 caracteres para no cambiar el contrato de BD del SKU.

## Alternativas consideradas

- Mantener `{prefijo}-NNNNNN`: simple, pero insuficiente para identificación operativa.
- Ampliar `sku` a 80/120 caracteres: más flexible, pero el usuario priorizó mantener 60.
- SKU compacto sin guiones: más corto, pero menos legible para usuarios finales.
