# Busqueda y filtros del catalogo

## Semantica

- `q` busca texto sin distinguir mayusculas ni acentos.
- `category`, `topic`, `level` y `duration` se pueden repetir en la URL.
- Los valores de una misma familia se combinan con `OR`.
- Las familias diferentes se combinan con `AND`.
- `sort` admite `relevance`, `title` y `duration`.
- La interfaz elimina valores desconocidos y reescribe URLs no canonicas.

Rangos de duracion estables:

- `up-to-4`: hasta 4 semanas.
- `5-to-12`: entre 5 y 12 semanas.
- `over-12`: mas de 12 semanas.

## Rendimiento

La consulta del catalogo agrega modulos y topics en CTE independientes antes de
unirlos con los roadmaps. Esto evita multiplicar cada modulo por cada topic y
mantiene una sola consulta para el listado.

La migracion crea `idx_modules_roadmap_id`; la clave primaria de
`roadmap_topics` cubre su acceso por roadmap. El test de rendimiento usa 300
roadmaps, 2.400 modulos y 900 relaciones de topics, comprueba el plan con
`EXPLAIN QUERY PLAN` y exige resolver la consulta en menos de 1,5 segundos.

Con este volumen SQLite FTS5 no aporta suficiente valor para asumir su coste de
migracion y sincronizacion. La busqueda queda encapsulada en
`lib/roadmapSearch.ts`, facilitando sustituirla por FTS o por el motor de la base
de datos elegida durante la preparacion para despliegue.

## Verificacion

```bash
npm test
npm run build
```
