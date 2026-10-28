# Propuesta Ejecutiva de Rediseño UI/UX
## iWana Telecomunicaciones — Transformación Digital & Dirección de Arte

---

## 1. Resumen Ejecutivo y Enfoque Creativo

El presente documento detalla la estrategia integral para la evolución visual y funcional del sitio web de **iWana Telecomunicaciones** ([iwana.co](https://iwana.co/)). 

El objetivo primordial es elevar la percepción de marca hacia un nivel **High-Tech B2B/SaaS**, adoptando los patrones de sofisticación, dinamismo y jerarquía visual del referente **Energy Pack Colombia**, mientras se mantiene intacta la esencia identitaria de iWana: su concepto tecno-natural, el logotipo institucional con la iguana emblemática, la tipografía corporativa *Exo 2* y el color Verde Lima (`#A5C330`).

Como respuesta a la revisión del prototipo inicial, **se ha descartado el fondo azul noche convencional**, sustituyéndolo por tres alternativas estéticas modernas de alto rendimiento visual.

---

## 2. Propuestas de Paletas de Color (Soluciones de Fondo)

Para resolver la inquietud sobre el fondo azul y alinear la plataforma a los estándares más vanguardistas de diseño web, se han formulado **tres opciones cromáticas**:

```
+-----------------------------------------------------------------------------------+
|  OPCIÓN A (RECOMENDADA)  |         OPCIÓN B         |          OPCIÓN C          |
|    Obsidiana / Grafito   |   Tecno-Orgánico Dark    |   High-Tech Clean Light    |
|--------------------------|--------------------------|----------------------------|
| Base: #0B0E14 (Carbón)   | Base: #070D0A (Bosque)   | Base: #F8FAFC (Blanco)     |
| Cards: #131722 (Grafito) | Cards: #0F1914 (Verde)   | Cards: #FFFFFF (Limpio)    |
| Acento: #A5C330 (Lima)   | Acento: #A5C330 (Lima)   | Acento: #88A31D (Verde)    |
+-----------------------------------------------------------------------------------+
```

### Opción A: Obsidiana Oscuro & Grafito Mate (Recomendada)
* **Concepto:** Réplica fiel del estilo *Dark B2B* de Energy Pack Colombia. Elimina cualquier tonalidad azul, utilizando un fondo negro carbón mate profundo combinado con tarjetas en tono grafito neutro.
* **Tokens Cromáticos:**
  * **Fondo Principal (`bg-main`):** `#0B0E14` (Negro Obsidiana)
  * **Superficie / Tarjetas (`bg-card`):** `#131722` (Grafito Mate)
  * **Bordes & Biseles (`border`):** `rgba(255, 255, 255, 0.08)`
  * **Acento Primario (`brand-lime`):** `#A5C330` (Verde Lima iWana)
  * **Texto Principal (`text-main`):** `#FFFFFF` (Blanco Puro)
  * **Texto Secundario (`text-muted`):** `#94A3B8` (Gris Pizarra)
* **Impacto Visual:** Máximo contraste visual, sofisticación tecnológica, transmite velocidad y solidez de red de fibra óptica.

---

### Opción B: Tecno-Orgánico Eco-Dark
* **Concepto:** Inspirado directamente en el origen de la marca iWana (sostenibilidad, naturaleza y tecnología). Emplea un verde oscuro mineral muy profundo como base con tarjetas verdosas semi-transparentes.
* **Tokens Cromáticos:**
  * **Fondo Principal (`bg-main`):** `#070D0A` (Verde Mineral Oscuro)
  * **Superficie / Tarjetas (`bg-card`):** `#0F1914` (Sombra Verde)
  * **Bordes & Biseles (`border`):** `rgba(165, 195, 48, 0.14)`
  * **Acento Primario (`brand-lime`):** `#A5C330` (Verde Lima)
  * **Texto Principal (`text-main`):** `#F1F5F9` (Blanco Hielo)
  * **Texto Secundario (`text-muted`):** `#8E9F95` (Gris Musgo)
* **Impacto Visual:** Identidad única y diferenciada en el sector de telecomunicaciones; resalta fuertemente la cobertura de internet rural y conectividad en fincas.

---

### Opción C: High-Tech Clean Light (Modo Claro de Alto Contraste)
* **Concepto:** Alternativa luminosa y corporativa. Utiliza fondos limpios en blanco e hiper-gris con acentos en verde corporativo y tipografías oscuras de alta legibilidad.
* **Tokens Cromáticos:**
  * **Fondo Principal (`bg-main`):** `#F8FAFC` (Gris Nieve)
  * **Superficie / Tarjetas (`bg-card`):** `#FFFFFF` (Blanco Impoluto)
  * **Bordes & Biseles (`border`):** `#E2E8F0` (Gris Claro)
  * **Acento Primario (`brand-lime`):** `#88A31D` (Verde Corporativo Ajustado)
  * **Texto Principal (`text-main`):** `#0F172A` (Azul Noche Oscuro/Casi Negro)
  * **Texto Secundario (`text-muted`):** `#64748B` (Gris Medio)
* **Impacto Visual:** Estética institucional, limpia, accesible y fácil de navegar bajo luz solar directa.

---

## 3. Sistema de Diseño (Design System & Interfaz)

### 3.1. Tipografía Corporativa
Se mantiene como columna vertebral la tipografía oficial especificada en el manual de identidad: **Exo 2**.

| Rol Tipográfico | Peso (Weight) | Tamaño Desktop | Tracking / Letter Spacing | Uso en Interfaz |
| :--- | :--- | :--- | :--- | :--- |
| **Display / Hero** | Bold (700) | `3.75rem` (60px) | `-0.025em` | Titulares principales del Hero |
| **Encabezados H2** | ExtraBold (800) | `2.25rem` (36px) | `-0.02em` | Títulos de secciones principales |
| **Subtítulos H3** | Bold (700) | `1.25rem` (20px) | `Normal` | Títulos de tarjetas de planes y pasos |
| **Micro Badges** | SemiBold (600) | `0.75rem` (12px) | `+0.05em` | Etiquetas en mayúsculas, pills |
| **Cuerpo de Texto** | Regular (400) / Light (300) | `0.875rem` (14px) | `Normal` | Descripciones, especificaciones |

---

### 3.2. Componentes UI Reutilizables

1. **Header Flotante Glassmorphism:**
   * Fijado en la parte superior (`sticky top-0`), con efecto de desenfoque de fondo (`backdrop-blur-md`) y borde inferior sutil.
   * Logotipo alineado a la izquierda, enlaces centrado y botones directos a la derecha (**Speedtest** y **Portal PSE**).

2. **Tarjetas Modulares (Cards):**
   * Estructura con micro-interacciones: al pasar el cursor (`hover`), la tarjeta se eleva `-5px`, su borde resalta con el Verde Lima (`#A5C330`) y emite un suave destello sutil (`box-shadow glow`).

3. **Badges / Pills Informativos:**
   * Cápsulas pequeñas redondeadas (`rounded-full`) con bordes finos, utilizadas para comunicar velocidad ("200 Mbps"), estados de red ("ONLINE") o categorías ("RURAL").

4. **Botones de Acción (CTAs):**
   * **Primarios:** Relleno sólido Verde Lima (`#A5C330`) con texto oscuro de alto contraste y bordes redondeados (`rounded-xl`).
   * **Secundarios:** Estilo fantasma u oscuro (`bg-card`), con borde de `1px` e ícono descriptivo.

---

## 4. Arquitectura de Información y Layout (Wireframe)

El sitio se organiza en una sola página fluida (*Landing Page*) dividida en **6 módulos estratégicos**:

```
====================================================================================
 01. HEADER FLOTANTE (Navegación + Acceso Rápido PSE)
====================================================================================
 02. HERO SECTION
     - Pill: "NUEVA RED DE FIBRA ÓPTICA Y INTERNET RURAL"
     - Titular: "Fibra Óptica Ultrarrápida y Conectividad Sin Interrupciones"
     - CTAs: [Ver Planes Disponibles] [Medir Mi Velocidad]
     - Módulo de Métricas en Vivo: Uptime 99.9%, Latencia < 10ms, Cobertura Regional
====================================================================================
 03. CÓMO FUNCIONA EL SERVICIO (Pasos 01 a 04 estilo Energy Pack)
     - 01. Selecciona tu Plan
     - 02. Valida Cobertura (El Colegio / San Antonio)
     - 03. Instalación Ágil
     - 04. Navega sin Límites
====================================================================================
 04. TABLA INTERACTIVA DE PLANES & TARIFAS
     - Tabs de Categoría: [ Hogar Fibra ] [ Internet Rural ] [ Empresas ]
     - Tarjetas Dinámicas de Velocidad (80 Mbps, 200 Mbps, 400 Mbps)
     - Botón directo de solicitud por plan -> Abre modal de contacto
====================================================================================
 05. HERRAMIENTAS DIGITALES INTEGRADAS
     - Widget Speedtest Interactivo: Gauge SVG en tiempo real para medir Ping, Bajada y Subida.
     - Módulo de Pago PSE: Formulario de consulta de factura con número de contrato.
====================================================================================
 06. PRUEBA SOCIAL & COBERTURA REGIONAL
     - Opiniones de clientes reales con ubicación (El Colegio, San Antonio, Pradilla).
     - Acordeón de Preguntas Frecuentes (FAQ).
====================================================================================
 07. FOOTER TÉCNICO
     - Puntos de atención física, teléfonos PBX, WhatsApp, soporte y derechos de autor.
====================================================================================
```

---

## 5. Especificaciones Técnicas de Desarrollo

* **Framework CSS:** Tailwind CSS v3+ (con configuración de variables CSS nativas para el cambio dinámico de temas).
* **Librerías de Iconos:** FontAwesome 6 Pro / Lucide Icons.
* **Animaciones y Rendimiento:**
  * Transiciones de color dinámicas mediante CSS variables (`transition: background-color 0.4s ease`).
  * Indicadores de gauge renderizados en **Vector SVG** nativo sin dependencias de librerías pesadas.
  * Carga asíncrona de fuentes (*Google Fonts Exo 2*).
* **Adaptabilidad Móvil (Responsive Design):**
  * Breakpoints clave: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px).
  * Menú desplegable animado para dispositivos móviles.

---

## 6. Recomendación de Dirección de Arte

Como propuesta final de diseño, **se sugiere adoptar la Opción A (Obsidiana Oscuro & Grafito Mate)**. Esta paleta resuelve de forma definitiva la objeción sobre el fondo azul, aporta la sofisticación tecnológica del referente de Energy Pack Colombia y logra que el color Verde Lima de iWana destaque de manera excepcional en pantallas OLED y móviles.