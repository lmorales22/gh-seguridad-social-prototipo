# Investigación: automatización con Aportes en Línea

Fecha de consulta: 2026-05-05.

## Hallazgos confirmados

1. Aportes en Línea ofrece PILA con generación de liquidaciones desde Excel, gestión autónoma de novedades e integración de planillas con software de nómina.

Fuente: https://www.aportesenlinea.com/administradora/productos/pila

2. En la página oficial de documentos y normas existen formatos descargables para cargue por portal empleador o por solicitud:

- `PlantillaXLSX.zip`: cargue de una planilla PILA, Excel 2007 o superior.
- `PlantillaNovedadesXLSX.zip`: cargue masivo de novedades, Excel 2007 o superior.
- `Formato Digitacion de Empleados v2.zip`: cargue masivo de empleados.
- También existen versiones Excel 97-2003 y formatos para correcciones, etiquetas, cesantías y pensiones voluntarias.

Fuente: https://servicios.aportesenlinea.com/Home/NormasRelevantes.aspx

Descargas directas verificadas:

- https://servicios.aportesenlinea.com/Home/Download.aspx?arc=PlantillaNovedadesXLSX.zip
- https://servicios.aportesenlinea.com/Home/Download.aspx?arc=PlantillaXLSX.zip
- https://servicios.aportesenlinea.com/Home/Download.aspx?arc=Formato%20Digitacion%20de%20Empleados%20v2.zip

3. La plantilla oficial de novedades masivas contiene la hoja `Novedades` con estas columnas principales:

- `No.`
- `Tipo ID`
- `No ID`
- `Año`
- `Mes`
- `Tipo de Novedad`
- `Valor Total`
- `Ajustar Valor de la Novedad`
- `Realizar Aportes Parafiscales`
- `Inicial`
- `Duración`
- `Tipo de Ingreso o Retiro`

Para ingresos y retiros, la fecha se representa como `Año`, `Mes` y día `Inicial`.

4. El producto `Datos en Línea` menciona consultas en batch por CSV, conexión API, portal web, API Gateway, datos históricos, novedades, historia laboral y monitoreo/alertas.

Fuente: https://www.aportesenlinea.com/en/datos-en-linea/inicio

5. El portafolio público menciona integraciones PILA para consultas de bases de referencia, generación de registros, asociación de usuarios, validación y cargue de planillas, pago de planillas, consulta y eliminación de liquidación, y certificados masivos.

Fuente: https://dh2cwfc2a6v9i.cloudfront.net/234/c7d26ac2-fd6e-4085-9751-5e745add329f/f664ea14-b23e-4c18-b945-e7078af51a0c/ea77bfed-bbd6-4827-980e-4fd565716cd8.pdf

## Hallazgos secundarios

Un instructivo alojado en Scribd describe el cargue de archivo plano por el portal y menciona formatos `txt`, `DAT` o `01E`, con validación, corrección de errores y carga final. Es útil como orientación, pero no lo trato como fuente oficial para implementación.

Fuente secundaria: https://www.scribd.com/document/659068806/2022-Instructivos-Instructivo-Modulo-Cargue-archivo-Plano

## Decisión para el prototipo

La primera automatización debe generar el archivo `PlantillaNovedadesXLSX` porque:

- Es un formato oficial y descargable.
- Cubre exactamente ingresos y retiros.
- Permite subir novedades masivas por portal empleador.
- No requiere credenciales API ni convenio comercial inicial.

La fase posterior puede evaluar:

- Archivo plano `txt`, `DAT` o `01E`.
- Integración API PILA comercial.
- Validación automática contra bases de referencia, si Aportes en Línea habilita credenciales y documentación técnica para el aportante.
