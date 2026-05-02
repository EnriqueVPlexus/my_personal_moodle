# Pruebas de API: Módulos

Ejemplos básicos con `curl` para probar los endpoints de módulos.

- Listar módulos (todos):

```bash
curl http://localhost:3000/api/modules
```

- Listar módulos por roadmap:

```bash
curl "http://localhost:3000/api/modules?roadmap_id=1"
```

- Crear módulo:

```bash
curl -X POST http://localhost:3000/api/modules \
  -H 'Content-Type: application/json' \
  -d '{"title":"Introducción","roadmap_id":1}'
```

- Obtener módulo con lecciones:

```bash
curl http://localhost:3000/api/modules/1
```
