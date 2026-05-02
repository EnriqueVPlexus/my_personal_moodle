# Pruebas de API: Lecciones

Ejemplos básicos con `curl` para probar los endpoints de lecciones.

- Listar lecciones de un módulo:

```bash
curl "http://localhost:3000/api/lessons?module_id=1"
```

- Crear lección:

```bash
curl -X POST http://localhost:3000/api/lessons \
  -H 'Content-Type: application/json' \
  -d '{"title":"Lección 1","module_id":1}'
```

- Actualizar lección (marcar completada):

```bash
curl -X PUT http://localhost:3000/api/lessons/1 \
  -H 'Content-Type: application/json' \
  -d '{"title":"Lección 1","completed":1}'
```
