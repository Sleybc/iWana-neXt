title: "Anexo de Actualización PRD Base (v2.2 a v2.3)"
description: "Instrucciones de actualización para integrar el Módulo Comercial y refinar la Vista Suscriptor 360"
date: "2026-04-18"

Actualizaciones al Documento: PRD_Sistema_ISP_Colombia_v2_2.md

Instrucción para el Arquitecto: Integrar los siguientes bloques en el documento maestro para generar la versión 2.3.

1. Actualización del Changelog (Cabecera)

Modificar en la cabecera:

version: "2.3"

previousVersion: "2.2 (2026-02-24)"

changelog: "v2.3: Extracción del Módulo Comercial como Bounded Context independiente. Definición del patrón SCD Tipo 2 para historial de precios. Refinamiento de la Ficha Suscriptor 360° eliminando redundancias y conectándola mediante Snapshots a Facturación e Inventario."

2. Nueva Sección a insertar en "5. Requerimientos Funcionales por Dominio"

5.X Dominio: Catálogo y Gestión Comercial (Módulo Comercial)

Se establece un módulo de primer nivel dedicado exclusivamente a la configuración de la oferta de valor.

Desacoplamiento: Totalmente independiente del Módulo de Inventario. El Catálogo maneja entidades abstractas (Planes, Tipos de Equipos, Servicios), mientras el Inventario maneja instancias físicas (MACs, Seriales).

Motor de Precios: Implementa SCD Tipo 2. Todo cambio de precio genera un nuevo registro de vigencia con aplicación inmediata (fecha_inicio = NOW()), manteniendo intacto el registro anterior para consultas históricas.

Visibilidad: CRUD exclusivo para Gerencia y Facturación. Acceso de Solo Lectura para CRM, Soporte Técnico y WFM.

3. Actualización de la Sección "Ficha 360° del Suscriptor" (CRM)

Reemplazar o complementar la definición actual con:

La "Ficha Suscriptor 360°" operará como un Agregador de Dominios (BFF - Backend for Frontend). No almacenará datos operativos directamente, sino que los consultará en tiempo real de los Bounded Contexts respectivos:

Datos del Cliente: (Dominio CRM) Datos básicos y de contacto.

Servicios Activos: (Dominio Comercial + Contratos) Muestra el Plan asociado consultando el ID en el Catálogo.

Activos Físicos: (Dominio Inventario) Lista los equipos instalados (MAC/Serial) consultando al Inventario por aquellos activos en estado "Comodato/Instalado" bajo el ID del cliente.

Estado Financiero: (Dominio Facturación) Saldo, facturas emitidas (utilizando patrón Snapshot para garantizar que el valor mostrado es el que se cobró, independientemente de los cambios actuales en el Catálogo).

Soporte Técnico: Unificación de Tickets y Tareas en un solo historial de "Casos de Soporte", de los cuales se derivan las Órdenes de Trabajo (WFM).

4. Actualización del Modelo Bounded Contexts (Sección Arquitectura)

Agregar un nuevo Bounded Context: Commercial Catalog Context.

Eventos de Integración:

Commercial Catalog -> emite -> PlanPriceUpdated

Billing Context -> escucha -> PlanPriceUpdated (para recalcular las proyecciones del próximo ciclo de facturación, respetando las facturas ya emitidas).