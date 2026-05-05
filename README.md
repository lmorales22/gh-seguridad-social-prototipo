# GH Seguridad Social

Prototipo vivo para gestionar base de trabajadores, ingresos, retiros y novedades mensuales de seguridad social.

Esta publicación usa datos demo anonimizados. Los archivos Excel reales y la información personal de trabajadores no hacen parte del repositorio público.

## Qué incluye

- Base histórica de trabajadores, aunque estén vigentes o retirados.
- Vista de trabajadores activos sin arrastrar retirados visualmente.
- Vista de liquidación mensual: vigentes que vienen de meses anteriores más todas las novedades del mes seleccionado, incluyendo retirados del mes.
- Historial de retirados conservado para consulta.
- Novedades por mes: ingreso, retiro, ARL, EPS y PILA.
- Alta de trabajador nuevo o reingreso de una persona existente.
- Persistencia en el navegador con `localStorage`.
- Exportación JSON, CSV y archivo `Planilla XLSX` del mes para preparar PILA.
- Modelo de datos inicial en `DATA_MODEL.md`.
- Investigación de automatización con Aportes en Línea en `RESEARCH_APORTES_EN_LINEA.md`.

## Planilla de novedades

El botón `Planilla XLSX` genera una hoja `Novedades` basada en la plantilla oficial de cargue masivo de novedades de Aportes en Línea:

- Una fila por novedad: `INGRESO (ING)` o `RETIRO DE LA EMPRESA (RET)`.
- Año, mes y día inicial de la novedad.
- Tipo de ingreso/retiro: todos los sistemas.
- Hoja `Validacion` con fecha completa, días PILA estimados, códigos de referencia y observaciones.
- Hoja `Liquidacion` con la base mensual completa: activos anteriores y trabajadores con ingreso/retiro del mes.

## Cómo probarlo

Abre `index.html` en el navegador o levanta un servidor estático:

```bash
python3 -m http.server 4173
```

Luego abre:

```text
http://localhost:4173
```

## Publicación en GitHub Pages

1. Sube estos archivos a un repositorio de GitHub.
2. En `Settings > Pages`, selecciona la rama principal y la carpeta raíz.
3. GitHub Pages publicará el dashboard estático.

El archivo `data/seed-data.js` fue anonimizado para publicación. La versión local conserva los Excel reales fuera del repositorio público.
