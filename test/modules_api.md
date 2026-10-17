# Pruebas De API: Módulos

Ejemplos con `curl` para probar los endpoints de módulos en local.

Las lecturas son públicas por defecto. Si `REQUIRE_AUTH_FOR_READS=true`, inicia sesión también para los `GET`.

## Preparar Sesión Admin

Primero crea un admin desde `/setup` o mediante `ADMIN_EMAIL` y `ADMIN_PASSWORD`.

Guarda la cookie de sesión:

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"change-this-long-password"}'
```

Usa `-b cookies.txt` en las operaciones admin.

## Listar Módulos

Todos los módulos:

```bash
curl http://localhost:3000/api/modules
```

Por roadmap:

```bash
curl "http://localhost:3000/api/modules?roadmap_id=1"
```

## Obtener Módulo Con Lecciones

```bash
curl http://localhost:3000/api/modules/1
```

Respuesta esperada: datos del módulo y una propiedad `lessons` ordenada por `id`, más `progress`, `quiz`
(público, sin respuestas correctas) y `quiz_summary` (`null` sin sesión). Si no existe o no es visible, `404`.

## Crear Módulo

Requiere admin:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/modules \
  -H 'Content-Type: application/json' \
  -d '{"title":"Introducción","roadmap_id":1}'
```

Campos requeridos:

- `title`
- `roadmap_id`

Opcionales: `level`, `duration`, `duration_weeks_min` y `duration_weeks_max`. Responde `201` con el módulo creado.

## Actualizar Módulo

Requiere admin:

```bash
curl -b cookies.txt -X PUT http://localhost:3000/api/modules/1 \
  -H 'Content-Type: application/json' \
  -d '{"title":"Introducción actualizada"}'
```

## Eliminar Módulo

Requiere admin:

```bash
curl -i -b cookies.txt -X DELETE http://localhost:3000/api/modules/1
```

Una eliminación correcta devuelve `204 No Content`; si el módulo no existe, `404`.

Contrato completo (parámetros, respuestas y errores) en `openapi.json` y `API_CONTRACTS.md`.
