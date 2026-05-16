# Anexo de actualización PRD base (v2.2 a v2.3)

**Descripción:** Instrucciones de actualización para integrar el módulo Comercial y refinar la vista Suscriptor 360.
**Fecha:** 2026-04-18
**Documento objetivo:** PRD_Sistema_ISP_Colombia_v2_2.md

Instrucción para Arquitectura: integrar los siguientes bloques en el documento maestro para generar la versión 2.3.

## 1. Actualización del changelog (cabecera)

Modificar en la cabecera:

```text
version: "2.3"
previousVersion: "2.2 (2026-02-24)"
changelog: "v2.3: Extracción del Módulo Comercial como Bounded Context independiente. Definición del patrón SCD Tipo 2 para historial de precios. Refinamiento de la Ficha Suscriptor 360° eliminando redundancias y conectándola mediante Snapshots a Facturación e Inventario."
```

## 2. Nueva sección a insertar en "5. Requerimientos funcionales por dominio"

### 5.X Dominio: Catálogo y Gestión Comercial (Módulo Comercial)

Se establece un módulo de primer nivel dedicado exclusivamente a la configuración de la oferta de valor.

- **Desacoplamiento:** totalmente independiente del módulo de Inventario. El catálogo maneja entidades abstractas, como planes, tipos de equipos y servicios, mientras el inventario maneja instancias físicas, como MACs y seriales.
- **Motor de precios:** implementa SCD Tipo 2. Todo cambio de precio genera un nuevo registro de vigencia con aplicación inmediata (`fecha_inicio = NOW()`), manteniendo intacto el registro anterior para consultas históricas.
- **Visibilidad:** CRUD exclusivo para Gerencia y Facturación. Acceso de solo lectura para CRM, Soporte Técnico y WFM.

## 3. Actualización de la sección "Ficha 360° del Suscriptor" (CRM)

Reemplazar o complementar la definición actual con:

La ficha Suscriptor 360° operará como un agregador de dominios (BFF, Backend for Frontend). No almacenará datos operativos directamente, sino que los consultará en tiempo real de los bounded contexts respectivos:

- **Datos del cliente:** Dominio CRM, con datos básicos y de contacto.
- **Servicios activos:** Dominio Comercial + Contratos, mostrando el plan asociado consultando el ID en el catálogo.
- **Activos físicos:** Dominio Inventario, listando los equipos instalados (MAC/Serial) consultando al inventario por aquellos activos en estado "Comodato/Instalado" bajo el ID del cliente.
- **Estado financiero:** Dominio Facturación, con saldo y facturas emitidas, utilizando patrón Snapshot para garantizar que el valor mostrado es el que se cobró, independientemente de los cambios actuales en el catálogo.
- **Soporte técnico:** unificación de tickets y tareas en un solo historial de casos de soporte, de los cuales se derivan las órdenes de trabajo de WFM.

## 4. Actualización del modelo de bounded contexts (sección arquitectura)

Agregar un nuevo bounded context: Commercial Catalog Context.

Eventos de integración:

```text
Commercial Catalog -> emite -> PlanPriceUpdated
Billing Context -> escucha -> PlanPriceUpdated
```

Billing Context escucha `PlanPriceUpdated` para recalcular las proyecciones del próximo ciclo de facturación, respetando las facturas ya emitidas.
