# PRD - MOD05 CRM Módulo Subscriber — Fase 08 (Lista móvil en tarjetas con acciones de llamar y WhatsApp)

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-10-21
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Aprobación:** CTO, 2026-10-21 — G0: D-E3-1 768 px, D-E3-2 teléfonos de la proyección vigente, D-E3-3 ocultar con aviso los no normalizables, D-E3-4 WhatsApp sin texto, D-E3-5 sin registrar el contacto y D-E3-6 normalizar solo al mostrar, según las recomendaciones de §9.1
**Origen:** cambio estructural **E3** de la [spec UX de Suscriptores](../specs/2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) §4 (hallazgo D11: «inservible para un técnico en terreno»)
**PRD vigente:** [Fase 07](PRD-MOD05-CRM-SUBSCRIBERS-FASE-07-v1.0.md). Esta fase cambia solo la presentación de la lista en pantallas angostas; no agrega endpoints ni datos
**ADRs aplicables:** ADR-067 (proyección PII de la lista), ADR-075 (capas Z), ADR-083 (RBAC)
**Contrato de datos vigente:** [mapa de campos por rol de la lista](../specs/2026-10-11-mod05-subscriber-list-field-role-map.md) (ratificado)
**ADR nuevo requerido:** ninguno

---

## 1. Contexto y motivación

En un teléfono la lista de suscriptores es una tabla con scroll horizontal: no se puede leer quién es el cliente ni llamarlo sin abrir la ficha. Es el uso típico de soporte y de cobranza en terreno.

| # | Hecho verificado (2026-10-21, `main` en `5e55f841`) | Fuente |
| --- | --- | --- |
| H1 | La lista renderiza siempre una `<table>` dentro de `overflow-x-auto`. Lo único adaptado a móvil es el selector de orden (`sm:hidden`) | `SubscribersListClient.tsx:820-853` |
| H2 | La proyección de la lista **ya entrega** `phone`, `altContactPhone` y `whatsapp` a ADMIN y SUPPORT, con finalidad declarada «Contacto directo». NOC, SALES y ACCOUNTANT no los reciben; los restringidos y anonimizados los reciben en `null` | `subscriber-projection.ts:5-60`; mapa de campos ratificado |
| H3 | El teléfono del suscriptor es **texto libre** de 5 a 100 caracteres, no E.164 | `subscriber.schema.ts:218, 257` |
| H4 | `@iwana/shared` ya tiene `getCountryPhonePrefix` (por defecto `+57`) y el patrón E.164 canónico | `constants/profile-phone.ts` |
| H5 | Ningún componente del portal usa todavía enlaces `tel:` ni `wa.me` | búsqueda en `apps/portal/src` |
| H6 | La Fase 06 dejó chips de cola, «Más filtros», vista lateral (`PortalSidePeek`) y navegación por teclado; todo pensado para escritorio | PRD Fase 06; `SubscriberPeek.tsx` |

## 2. Objetivo

Que en un teléfono el operador identifique al suscriptor de un vistazo, lo llame o le escriba por WhatsApp con un toque, y abra su resumen sin perder el lugar en la lista.

## 3. Alcance

**Dentro:**
- tarjetas en lugar de la tabla por debajo del punto de quiebre (D-E3-1);
- acciones «Llamar» y «WhatsApp» con los datos que la proyección ya entrega (D-E3-2);
- normalización de teléfonos a un número marcable (D-E3-3);
- chips, búsqueda, «Más filtros», paginación y vista lateral usables a 375 px.

**Fuera:**
- registrar los contactos como intentos de gestión (D-E3-5);
- mensajes de WhatsApp con texto predefinido (D-E3-4);
- cambiar el mapa de campos por rol (por ejemplo, dar teléfonos a NOC o SALES);
- validar o migrar los teléfonos guardados (D-E3-6);
- la ficha completa en móvil, que queda para una revisión posterior.

## 4. Casos de uso

| CU | Caso de uso |
| --- | --- |
| CU-MV-01 | En el teléfono, buscar a un suscriptor y reconocerlo por nombre, estado y servicio |
| CU-MV-02 | Llamar al suscriptor con un toque |
| CU-MV-03 | Abrir WhatsApp con el suscriptor con un toque |
| CU-MV-04 | Abrir su resumen y volver a la lista en el mismo punto |

## 5. Requerimientos funcionales

### 5.1 Tarjetas (sujeto a D-E3-1)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-MV-01 | Por debajo de 768 px la lista se muestra como tarjetas apiladas; desde 768 px, la tabla actual sin cambios | MVP |
| RF-MV-02 | Cada tarjeta muestra: nombre (enlace a la ficha), badge de estado, documento y tipo · segmento en texto secundario, servicio principal (plan y ciudad, «+N servicios») y las acciones de contacto | MVP |
| RF-MV-03 | Tocar la tarjeta fuera del nombre y de las acciones abre la vista lateral, que en móvil ocupa toda la pantalla y al cerrarse devuelve el foco y la posición de desplazamiento a la tarjeta | MVP |
| RF-MV-04 | Objetivos táctiles de al menos 44 × 44 px (WCAG 2.5.5 como referencia de la identidad); nada depende de hover | MVP |
| RF-MV-05 | Las tarjetas son una lista semántica (`<ul>`/`<li>`) con encabezado por suscriptor; los estados de carga, vacío y error son los mismos de la tabla, adaptados | MVP |

### 5.2 Acciones de contacto (sujeto a D-E3-2 y D-E3-3)

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-MV-06 | «Llamar» usa `phone`; si es nulo o no se puede normalizar, `altContactPhone`. Enlace `tel:<E.164>` | MVP |
| RF-MV-07 | «WhatsApp» usa `whatsapp`; si es nulo o no se puede normalizar, `phone`. Enlace `https://wa.me/<dígitos E.164 sin +>`, sin texto predefinido, con `target="_blank"` y `rel="noopener noreferrer"` | MVP |
| RF-MV-08 | La tarjeta **no muestra el número**: los botones llevan nombre accesible «Llamar a {nombre}» y «Escribir por WhatsApp a {nombre}» | MVP |
| RF-MV-09 | Si la proyección no entrega ningún teléfono (rol sin el campo, restringido o anonimizado), no hay botones; si lo entrega pero no es marcable, se muestra «Teléfono sin formato válido» en texto secundario | MVP |
| RF-MV-10 | Función pura `toDialablePhone(raw, countryPrefix)` en `@iwana/shared`: quita espacios, guiones, puntos y paréntesis; acepta `+` inicial o antepone el prefijo del país del tenant (`getCountryPhonePrefix`); devuelve E.164 que cumpla el patrón canónico, o `null` | MVP |
| RF-MV-11 | Las acciones de contacto también aparecen en la vista lateral en móvil y en escritorio, con la misma regla | MVP |

### 5.3 Controles en móvil

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-MV-12 | Los chips de cola se desplazan en horizontal en una sola fila, con el chip activo visible al cargar | MVP |
| RF-MV-13 | «Más filtros» se abre como panel inferior a pantalla completa con «Aplicar» y «Limpiar»; el selector de orden móvil existente se integra en ese panel | MVP |
| RF-MV-14 | El selector de modo de búsqueda (Texto, Documento, Teléfono, Correo) no desborda a 375 px | MVP |
| RF-MV-15 | A 375 px no hay desplazamiento horizontal de la página (ancho del documento ≤ ancho de la ventana) | MVP |

## 6. Requerimientos no funcionales

| ID | Requerimiento |
| --- | --- |
| RNF-MV-01 | Sin datos nuevos en la API ni en la proyección: solo se usan campos que el mapa ratificado ya entrega |
| RNF-MV-02 | Sin PII en la URL del portal; los enlaces `tel:` y `wa.me` se generan al renderizar y no se registran en logs ni métricas |
| RNF-MV-03 | Un solo árbol de datos para tabla y tarjetas (misma consulta y mismo estado de la URL); el cambio es de presentación |
| RNF-MV-04 | `audit-ui.mjs` en 0 y verificación visual a 375 y 768 px en claro y oscuro |
| RNF-MV-05 | El cambio de layout no duplica la petición de la lista al girar el teléfono o redimensionar |

## 7. Contratos (borrador)

```ts
// @iwana/shared — constants/profile-phone.ts (o un módulo hermano)
export function toDialablePhone(raw: string | null | undefined, countryPrefix: string): string | null;
```

Sin cambios de API, de esquema ni de migraciones.

## 8. Criterios de aceptación

| CA | Criterio |
| --- | --- |
| CA-MV-01 | A 375 px se ven tarjetas y no hay desplazamiento horizontal; a 768 px se ve la tabla |
| CA-MV-02 | ADMIN o SUPPORT con teléfono válido ven «Llamar» con `tel:+57…` y «WhatsApp» con `https://wa.me/57…`; NOC no ve botones |
| CA-MV-03 | Un suscriptor restringido o anonimizado no tiene botones de contacto |
| CA-MV-04 | `toDialablePhone` tiene pruebas para: número local colombiano, con `+57`, con espacios y guiones, con paréntesis, demasiado corto, con letras y vacío |
| CA-MV-05 | El número no aparece como texto en la tarjeta; los botones tienen nombre accesible con el nombre del suscriptor |
| CA-MV-06 | Tocar la tarjeta abre la vista lateral a pantalla completa y al cerrarla vuelve a la misma tarjeta |
| CA-MV-07 | Chips, «Más filtros» (panel inferior) y modos de búsqueda funcionan a 375 px |
| CA-MV-08 | E2E con viewport móvil (sintético) en el job «E2E portal» bloqueante |

## 9. Dependencias, riesgos y decisiones

### 9.1 Decisiones del CTO (G0) — aprobadas el 2026-10-21

**✅ Las seis decisiones se aprobaron con la recomendación de AI-EM-ARCH.** §5 y §7 quedan como contrato congelado.

| # | Decisión | Opciones | Recomendación de AI-EM-ARCH | Motivo |
| --- | --- | --- | --- | --- |
| D-E3-1 | Punto de quiebre | 768 px (tablet en vertical ve tarjetas) vs. 640 px | **768 px** | Con 7 columnas reducidas a 4, la tabla todavía no cabe bien en una tablet en vertical; coincide con el `md` del sistema |
| D-E3-2 | Fuente de los teléfonos | Los campos que la lista ya entrega por rol vs. pedirlos al tocar «Llamar» | **Los de la lista** | Ya están autorizados con la finalidad «Contacto directo» en el mapa ratificado; pedirlos aparte agrega latencia sin reducir exposición |
| D-E3-3 | Teléfonos no normalizables | Ocultar el botón con un aviso discreto vs. ofrecer el número crudo | **Ocultar con aviso** | Un `tel:` con texto libre puede marcar a otro número; mejor señalar el dato a corregir |
| D-E3-4 | Mensaje de WhatsApp | Sin texto predefinido vs. plantilla con el nombre del operador o de la empresa | **Sin texto** | Una plantilla saldría del sistema hacia un servicio externo con datos y sin aprobación de copy ni de privacidad |
| D-E3-5 | ¿Registrar el contacto? | No (el toque no pasa por el servidor) vs. registrar un intento de gestión | **No, en esta fase** | Registrar intentos exige su propio modelo (resultado, motivo, canal) y su finalidad de tratamiento; merece una fase propia |
| D-E3-6 | Teléfonos guardados como texto libre | Solo normalizar al mostrar vs. validar al guardar y migrar los existentes | **Solo al mostrar** | Validar al guardar cambia formularios y API de MOD05 y de expedientes; se puede medir primero cuántos no son normalizables (V1 lo reporta en el tenant de desarrollo) |

### 9.2 Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Muchos teléfonos guardados no son normalizables y los botones casi no aparecen | V1 mide el porcentaje en el tenant de desarrollo y el informe lo reporta; si es alto, D-E3-6 se reabre |
| Mantener dos presentaciones (tabla y tarjetas) duplica lógica | RNF-MV-03: un solo estado y una sola consulta; las celdas y la tarjeta comparten los formateadores de `subscriber-ui.ts` |
| Regresiones de foco en la vista lateral a pantalla completa | Guarda de foco consolidada de `@iwana/ui` (Fase 06) y E2E móvil |

## 10. Definición de terminado (DoD)

- RF-MV-01 a RF-MV-15 implementados; CA-MV-01 a CA-MV-08 verificados con conteo real.
- Verificación visual a 375 y 768 px, claro y oscuro.
- Gates Before Merge en local; commit y push; **CI de `main` en verde** con el job «E2E portal» bloqueante; informe de cierre.
