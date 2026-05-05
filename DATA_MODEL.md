# Modelo de datos inicial

## Trabajadores

Guarda la información base vigente de la persona, aunque tenga historial de retiros.

- `id`: identificador interno derivado de la cédula.
- `nombres`
- `apellidos`
- `cedula`
- `direccion`
- `telefono`
- `correo`: opcional.
- `eps`
- `pension`
- `obra`
- `contratista`
- `estadoManual`: campo heredado del Excel si aplica.

## Novedades mensuales

Cada novedad pertenece a un trabajador y a un mes.

- `workerId`
- `month`: formato `YYYY-MM`.
- `obra`
- `contratista`
- `eps`
- `pension`
- `ingreso.fecha`
- `ingreso.arlOk`
- `ingreso.epsOk`
- `ingreso.pilaOk`
- `retiro.fecha`
- `retiro.arlOk`
- `retiro.epsOk`
- `retiro.pilaOk`

## Reglas del prototipo

- Un trabajador aparece como vigente si no tiene retiro posterior a su último ingreso.
- Un trabajador retirado queda en historial y no aparece en la vista de activos.
- La vista `Liquidación` no usa la misma regla visual de `Activos`: incluye quienes estaban activos antes del mes seleccionado y todas las novedades del mes, incluso trabajadores retirados durante ese mes.
- Un reingreso actualiza la información base y crea una nueva novedad de ingreso en el mes seleccionado.
- La vista PILA marca pendientes cuando falta ARL, EPS o PILA en ingresos/retiros con fecha.
- Los datos se guardan en `localStorage`; exportar JSON sirve como respaldo temporal.

## Referencia de planilla

`data/planilla-reference.js` contiene una referencia demo basada en la estructura de liquidación:

- Tipo y número de identificación.
- Banderas `ing` y `ret` observadas en la liquidación.
- Códigos de pensión, salud, CCF y ARL.
- Días e IBC de referencia.

El exportador `Planilla XLSX` usa esa referencia para completar códigos y deja observaciones cuando un trabajador no aparece en la planilla de liquidación cargada. La hoja principal `Novedades` sigue la estructura oficial descargada de Aportes en Línea para cargue masivo de novedades: `Tipo ID`, `No ID`, `Año`, `Mes`, `Tipo de Novedad`, `Inicial`, `Duración` y `Tipo de Ingreso o Retiro`.
