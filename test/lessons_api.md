# Pruebas De API: Lecciones

Ejemplos con `curl` para probar los endpoints de lecciones en local.

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

## Listar Lecciones De Un Módulo

```bash
curl "http://localhost:3000/api/lessons?module_id=1"
```

`module_id` es obligatorio. Si falta, la API devuelve `400`.

## Obtener Lección

```bash
curl http://localhost:3000/api/lessons/1
```

## Crear Lección

Requiere admin:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/lessons \
  -H 'Content-Type: application/json' \
  -d '{"title":"Lección 1","module_id":1}'
```

Campos requeridos:

- `title`
- `module_id`

Las lecciones nuevas se crean con `completed = 0`.

## Actualizar Lección

Requiere admin:

```bash
curl -b cookies.txt -X PUT http://localhost:3000/api/lessons/1 \
  -H 'Content-Type: application/json' \
  -d '{"title":"Lección 1","completed":1}'
```

`completed` se normaliza a `1` o `0`.

## Eliminar Lección

Requiere admin:

```bash
curl -i -b cookies.txt -X DELETE http://localhost:3000/api/lessons/1
```

Una eliminación correcta devuelve `204 No Content`.
