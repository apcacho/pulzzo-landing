# Identidad visual PULZZO (backoffice) · v36l

Guía sacada de los estilos calculados en Chrome real (1366×900) de las pantallas de referencia: **Dashboard**, **CRM · Clientes** (lista, kanban y ficha) y los originales de onboarding (`references/original-onboarding/`). Capturas en `pulzzo-work-out/browser-v36l/guia/`. Antes de crear una clase nueva, reutiliza un componente de esta lista.

## Tipografía
| Rol | Familia | Tamaño / peso | Color |
|---|---|---|---|
| Título de página (topbar h1) | Plus Jakarta Sans | 25px / 700 | #07142F |
| Subtítulo de página | Inter | 13px / 400 | #64748B |
| Título de bloque del Dashboard (h3) | Plus Jakarta Sans | 21px / 650 | #07142F |
| Título de tarjeta / panel (CRM h2, tarjetas de Configuración) | Plus Jakarta Sans | 17px / 650 | #07142F |
| Subtítulo dentro de tarjeta (kanban h3) | Plus Jakarta Sans | 14px / 600 | #07142F |
| Texto base | Inter | 13px / 400, line-height 1.5 | #07142F |
| Texto de ayuda | Inter | 12px / 400 | #64748B |
| Etiqueta de campo | Inter | 11px / 500 | #64748B |
| Valor (Dashboard metric) | Inter | 15px / 520 | #07142F |
| KPI | Plus Jakarta Sans | 30px / 560 | #07142F |
| Onboarding: etiqueta / ayuda / input | Inter | 13px/700 · 11.5px · 15px | — |

Solo dos familias: **Inter** (texto) y **Plus Jakarta Sans** (títulos y KPIs).

## Color
Navy #07142F (texto) · tinta de botón #030A18 · gris #64748B · aqua #20C7D4 (primario) · fondo #F8FAFC · borde de tarjeta #E8EEF6 · borde de control #D7E1EE · estado seleccionado: fondo #EFFFFF y borde #B9E0E4.

## Superficies
- **Tarjeta de página** (Dashboard `.card`): blanca, borde 1px #E8EEF6, radio 24px, sin sombra.
- **Tarjeta interna / KPI**: borde 1px #E8EEF6, radio 22px, padding 18–20px, sin sombra.
- **Panel CRM** (`.panel`): radio 12px, encabezado con padding 22px 24px; el cuerpo usa el mismo margen lateral de 24px, simétrico.
- Avisos: caja con borde completo de 1px (sin acento a la izquierda) o línea de ayuda gris.

## Controles
- **Botón primario** `.btn-primary`: fondo #20C7D4, texto #030A18, 12px/500, padding 7px 12px, radio 8px.
- **Botón secundario** `.btn-secondary`: fondo blanco, borde #D7E1EE; el resto igual al primario.
- **Pestañas** `.tab` (y las del CRM): caja de 36px, radio 8px, 12px. Inactiva: blanca con borde #D7E1EE. **Activa: #EFFFFF con borde #B9E0E4, peso 600.**
- **Menú lateral**: botón activo #EFFFFF con borde #B9E0E4, radio 14px.
- **Input / select**: 13px, borde #D7E1EE, radio 8px, padding 7px 12px, alto 38px.
- **Chips / badges** (CRM): 11px/500, fondo #F5F7FA, borde #E8EEF6, radio 999px.
- **Switch** `.pz-switch`: componente compartido (flat-design-tokens.css).
- **Selector de opciones**: cajas seleccionables **sin círculo de radio**, como `.option` del onboarding o la pestaña activa. Seleccionada: #EFFFFF y borde #B9E0E4 (el onboarding usa aqua con un anillo de 4px).

## Espaciado
Escala de 4px: 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 24. Entre tarjetas: 16px. Padding lateral de panel: 24px en escritorio y 16px en móvil.

## Reglas
1. No crear clases ad hoc si existe un componente de esta guía.
2. Nada de círculos de radio visibles: se usan cajas seleccionables.
3. Nada de cajas con acento a la izquierda.
4. Reglas y listas como filas limpias con separador de 1px, no muros de viñetas.
5. Padding simétrico en cada tarjeta.
