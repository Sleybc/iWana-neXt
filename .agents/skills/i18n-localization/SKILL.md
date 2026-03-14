---
name: i18n-localization
description: Internacionalizacion y localizacion para iWana neXt con Next.js App Router, textos externos, formatos locales y control de hardcodes en UI.
---

## Contexto de localización en iWana neXt

### Locale primario

- **Idioma:** Español Colombia (`es-CO`)
- **Moneda:** Peso colombiano (`COP`)
- **Zona horaria:** `America/Bogota` (UTC-5, sin horario de verano)
- **Formato de fecha:** `dd/MM/yyyy` (Colombia)
- **Separadores numéricos:** punto para miles, coma para decimales (ej: `1.234,56`)

### Estado de la librería i18n

> La librería de i18n no está decidida aún (ADR pendiente). Hasta que se apruebe el ADR:
> - Los mensajes de error de Zod deben definirse en archivos `messages/es-CO.ts` por módulo.
> - Los textos de UI deben centralizarse en constantes, no hardcodeados en JSX.
> - Referencia de estructura de mensajes: `docs/hlds/HLD-MOD01-Frontend-Auth-Zod-Schemas-Spec.md`

### Ejemplos de formateo para Colombia

```typescript
// Moneda COP
const formatCOP = (amount: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(amount);
// → "$ 1.234.567"

// Fecha en Colombia
const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota' }).format(date);

// Zona horaria explícita para timestamps almacenados
const toBogotaTime = (utcDate: Date) =>
  new Date(utcDate.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
```

# i18n & Localization

## Proposito

Usa esta skill cuando necesites diseñar, revisar o corregir internacionalizacion y localizacion en el frontend del proyecto.

El foco aqui no es una guia universal de i18n. El foco es evitar hardcodes, ordenar catalogos de mensajes, soportar formatos locales y mantener una UI web lista para crecer en idiomas sin romper accesibilidad, diseño ni estructura del repo.

## Cuando usarla

Activa esta skill para tareas como:

- Extraccion de textos hardcodeados.
- Estructura de mensajes por feature o modulo.
- Formatos de fecha, hora, moneda o numeros.
- Revisión de componentes con texto dinámico o pluralización.
- Preparacion de pantallas para multiples idiomas o expansion futura.

## Reglas del repo

### 1. Nada de texto de producto hardcodeado en componentes

- Los textos visibles al usuario deben salir de mensajes o catálogos mantenibles.
- Excepciones muy puntuales deben estar justificadas.
- Errores, labels, placeholders, empty states y mensajes de exito tambien cuentan.

### 2. La i18n debe convivir con App Router y el sistema de componentes

- No disperses traducciones sin criterio por cualquier carpeta.
- Organiza mensajes por feature, dominio o namespace estable.
- Mantén consistente el uso de componentes y textos reutilizables.

### 3. Localizacion no es solo traduccion

Revisa tambien:

- fechas y horas
- numeros y porcentajes
- moneda
- pluralizacion
- longitud variable de texto
- posibles necesidades RTL futuras si el producto lo requiere

## Patrones preferidos

### Catalogos de mensajes

- Nombres estables y legibles.
- Agrupacion por modulo o feature.
- Mensajes compartidos solo cuando de verdad son compartidos.
- Evitar claves ambiguas como `title`, `label` o `message` sin contexto.

### Componentes

- Pasar ya resueltos los mensajes cuando eso simplifique componentes puros.
- No concatenar fragments traducidos si la frase completa puede modelarse mejor.
- Tratar textos de botones, tablas, dialogs y formularios como parte del contrato UX.

### Formatos

- Usar APIs de internacionalizacion apropiadas.
- No formatear moneda, fecha o numeros manualmente.
- Mantener consistencia entre backend y frontend en nomenclatura y significado de estados.

## Checklist de revision

- No hay hardcodes de producto en UI sin justificacion.
- Los mensajes estan agrupados con criterio claro.
- Fechas, numeros y moneda usan formato apropiado.
- Los textos variables soportan longitud razonable.
- No hay concatenacion fragil de mensajes.
- Los errores visibles tambien siguen la estrategia de i18n.

## Heuristica para revisar codigo

Busca y corrige estas señales:

- strings visibles directamente en JSX
- claves demasiado genericas o repetidas
- formatos manuales de fechas y montos
- placeholders y mensajes de error olvidados fuera del catalogo
- componentes reutilizables que mezclan texto fijo y texto traducible sin criterio

## Anti-patrones

Evita:

- dejar i18n para el final cuando el flujo ya esta construido
- copiar el mismo texto en varios componentes en vez de unificar criterio
- mezclar idiomas en una misma pantalla por comodidad
- asumir que localizacion es solo reemplazar strings
- concatenar frases para “armar” traducciones

## Escalacion

Usa [ESCALACION AL CTO] si:

- una decision de i18n exige cambiar estrategia estructural del frontend o del producto
- aparece conflicto fuerte entre localizacion, regulacion o lenguaje de negocio aprobado
