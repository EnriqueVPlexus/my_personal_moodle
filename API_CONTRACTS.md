# Contratos De La API

Documento técnico de la iniciativa `Contratos API estables y documentados`
(rama `feature/api-contracts`). Explica cómo se define el contrato de la API HTTP,
cómo se genera el documento OpenAPI, cómo se comprueba, cómo añadir o cambiar un
endpoint y qué reglas de versionado y deprecación se siguen.

El contrato describe lo que la API hace hoy, también cuando es incoherente (ver
[Incoherencias conocidas](#incoherencias-conocidas)). La versión 1.0.0 solo
documentó; la 2.0.0 corrige una fuga de seguridad y unifica tipos; la 3.0.0
hace coherentes los errores y las respuestas de `DELETE` roadmap y `PATCH` usuario;
la 3.1.0 documenta por completo el documento de `POST /api/roadmaps/import`;
la 3.2.0 hace que `POST /api/users` devuelva `roadmap_access_ids` y corrige el doble
`401`+`404` de las evidencias; la 3.3.0 hace que todo fallo inesperado responda un
`500` JSON `{ error }`; la 3.4.0 sirve los quizzes por intento, con `attempt_id`; la 3.5.0 añade la exportación de los resultados de quiz del propio alumno (ver el [Historial](#historial-del-contrato)).

Si solo quieres consumir la API, lee la sección `API` de `README.md`.

## Fuente única de verdad

Todo sale de esquemas Zod. De ellos se derivan el documento OpenAPI, los tipos de
TypeScript y los tests de contrato:

```text
lib/validation (entradas)  ─┐
                            ├─>  lib/contracts/registry.ts  ─┬─>  openapi.json  (npm run contracts:generate)
lib/contracts (respuestas) ─┘                                ├─>  GET /api/openapi.json
                                                             ├─>  tipos  (z.infer, `import type`)
                                                             └─>  tests de contrato
```

| Archivo | Responsabilidad |
| --- | --- |
| `lib/contracts/common.ts` | Cuerpos de error (`{ error, issues? }`, `409` de importación, `429` de cuestionarios, `405`), `countSchema` y `flagSchema` para las diferencias SQLite/PostgreSQL. |
| `lib/contracts/auth.ts`, `content.ts`, `progress.ts`, `admin.ts` | Esquemas de **respuesta** por dominio, con los tipos `z.infer` exportados. |
| `lib/contracts/models.ts` | Nombres de los modelos que acaban en `components.schemas` del OpenAPI. |
| `lib/contracts/registry.ts` | Registro de rutas: método, ruta, acceso, solicitud y respuestas por estado. |
| `lib/contracts/openapi.ts` | Generador del documento OpenAPI 3.1 y `API_CONTRACT_VERSION`. |
| `lib/contracts/index.ts` | Punto de entrada público (esquemas, tipos, registro y generador). |
| `openapi.json` | Documento generado y versionado en git. No se edita a mano. |
| `scripts/generate-openapi.ts` | Escribe `openapi.json` (`npm run contracts:generate`). |
| `pages/api/openapi.json.ts` | Sirve el documento en `GET /api/openapi.json`. |

Las solicitudes **reutilizan** los esquemas de `lib/validation` (los mismos que
validan en el handler); no se duplican. Para que se documenten bien, esos esquemas
llevan `.meta({ ... })` en los campos que Zod no sabe describir (ids con
`transform`, `z.unknown()` validados después). Es solo metadato de documentación:
no cambia qué se acepta.

### Regla de dependencia

`lib/contracts` depende de `zod`, de `lib/validation` y de constantes puras de
`lib/domains` (los valores de los enumerados). **Ningún dominio, repositorio ni
`lib/http` importa `lib/contracts`**: el contrato describe el borde HTTP, no lo
gobierna. Handlers y UI pueden importarlo; la UI solo con `import type` (no debe
arrastrar Zod al navegador).

## El registro de rutas

Cada ruta de `pages/api/**` tiene una entrada por método en
`lib/contracts/registry.ts`, creada con `operation({ ... })`:

| Campo | Significado |
| --- | --- |
| `operationId`, `method`, `path`, `tag` | Identidad. `path` usa `{id}` (no `[id]`). |
| `summary`, `description` | Texto en español para el visor OpenAPI. |
| `auth` | `public`, `read`, `user` o `admin` (ver abajo). |
| `request` | `params`, `query` y `body` (esquemas de `lib/validation`). |
| `responses` | Estados documentados: esquema, tipo de contenido y cabeceras. |
| `deprecated` | Opcional. Ver [Deprecación](#deprecación). |

Niveles de acceso:

| `auth` | Significado |
| --- | --- |
| `public` | Sin sesión. |
| `read` | Pública salvo que el servidor defina `REQUIRE_AUTH_FOR_READS`; con él exige sesión (`401`). Un usuario con acceso restringido solo ve sus roadmaps. |
| `user` | Cualquier usuario activo con sesión. |
| `admin` | Usuario con rol `admin`. |

`operation()` añade por sí mismo los estados que comparten todas las rutas de un
mismo tipo (una entrada explícita en `responses` gana a la automática):

- `400` si hay `params`, `query` o `body` (contrato `{ error, issues? }`).
- `401` en `user`, `admin` y `read`; `403` `Necesitas permisos de administrador.` en `admin`.
- `403` de comprobación de origen en cualquier método que modifica (`POST`,
  `PUT`, `PATCH`, `DELETE`).

El generador añade además el `405` (JSON `{ error: 'Método no permitido.' }`) con la
cabecera `Allow` de la ruta, calculada con los métodos del registro.

### Cómo se genera el OpenAPI

`lib/contracts/openapi.ts` usa `z.toJSONSchema` de Zod 4 (target
`draft-2020-12`, compatible con OpenAPI 3.1). **No se añadió ninguna dependencia.**

- Se usa `io: 'input'` para solicitudes **y** respuestas. Para solicitudes, porque
  describe lo que el cliente puede enviar (antes de los `transform`). Para
  respuestas, porque no tienen `transform` y evita el `additionalProperties: false`
  que añadiría el modo `output`: un cliente debe ignorar los campos que no conozca.
- `unrepresentable: 'any'`: lo que no tiene equivalente en JSON Schema queda como
  `{}` (por eso los campos `z.unknown()` llevan `.meta`).
- Los modelos con nombre (`lib/contracts/models.ts`) se extraen a
  `components.schemas` y se referencian con `$ref`.
- La salida es determinista (orden estable); por eso se puede comparar con el
  archivo versionado.

`GET /api/openapi.json` es **público**: solo describe rutas y esquemas (los
mensajes de error ya los ve cualquiera que use la API) y no contiene datos ni
secretos; un test comprueba que no aparecen `password_hash` ni `token_hash`.
Si la API pasara a documentar rutas internas, habría que restringirlo a `admin`.

Comprobar que el documento es OpenAPI válido (sin añadir dependencia):

```bash
npx @redocly/cli lint openapi.json
```

El resultado esperado es válido, con dos avisos conocidos: falta `license` y las
rutas `/api/evidences/modules/{id}` y `/api/evidences/{id}/review` se consideran
ambiguas (Next resuelve por especificidad de segmento; no hay conflicto real).

## Tipos compartidos

Los tipos de respuesta se infieren de los esquemas y se importan de
`lib/contracts`:

```ts
import type { CatalogRoadmap, RoadmapDetailResponse } from '../lib/contracts'
```

Los usan las pantallas del catálogo, detalle de roadmap y módulo, progreso,
cuestionarios, evidencias, portfolio, usuarios admin, dashboard, auditoría e
importación, en lugar de interfaces locales. Los tipos de entrada siguen saliendo
de `lib/validation` (`z.infer`).

## Tests

| Test | Qué comprueba |
| --- | --- |
| `test/contracts-openapi.test.ts` | Cada archivo de `pages/api` tiene entrada en el registro (y al revés); ids únicos; parámetros de ruta declarados; `openapi.json` está al día (`run npm run contracts:generate`); los `$ref` resuelven; sin secretos; `GET /api/openapi.json`; la marca de deprecación; la tabla de `README.md` incluye todas las rutas. |
| `test/api-contracts.test.ts` | Cada handler, con servicios simulados, escribe cuerpos que **parsean** contra el esquema del estado correspondiente y **sin campos no documentados**. Auth, origen y límite de intentos son los reales. Comprueba el `405` y su `Allow` en todas las rutas y que se cubre el éxito de cada operación. |

Los servicios simulados devuelven datos con la forma de las filas reales (y usan
las funciones puras del dominio cuando existen), de modo que un cambio en la
respuesta que no se refleje en el registro hace fallar el test.

## Cómo añadir o cambiar un endpoint

1. Sigue los pasos de `ARCHITECTURE.md` (esquema de entrada, servicio, handler).
2. **Respuesta**: añade o ajusta el esquema en `lib/contracts/<dominio>.ts` (y su
   tipo `z.infer`). Si es un modelo reutilizable, regístralo en
   `lib/contracts/models.ts`.
3. **Registro**: añade la entrada con `operation({ ... })` en `registry.ts` con
   `auth`, `request` (reutilizando los esquemas de `lib/validation`) y los estados
   que el handler puede devolver. Describe el comportamiento **real**.
4. **Handler envuelto**: toda ruta exporta `export default withApiErrors(handler)`
   (`lib/http/errors.ts`); el `500` de fallos inesperados ya está documentado para
   todas las operaciones y `test/api-routes-wrapped.test.ts` falla si falta.
5. **Test de contrato**: añade un caso por estado relevante a `calls` en
   `test/api-contracts.test.ts` y el cargador del handler en `handlers`. Si la ruta
   es nueva, el test de cobertura del registro te avisará de lo que falte.
6. **Versión**: aplica la tabla de [Versionado](#versionado) y cambia
   `API_CONTRACT_VERSION` en `lib/contracts/openapi.ts`; añade una línea al
   [Historial](#historial-del-contrato).
7. `npm run contracts:generate` y confirma `openapi.json` junto al código.
8. Si añadiste una ruta, súbela también a la tabla de endpoints de `README.md`.
9. Verifica: `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`.

Para quitar o cambiar una ruta existente, primero decide si es un cambio
incompatible (ver abajo).

## Versionado

La versión del contrato es `info.version` del documento (`API_CONTRACT_VERSION`) y
sigue **semver**. Se actualiza en el mismo cambio que modifica el contrato.

### Qué es un cambio incompatible (rompe clientes)

- Quitar o renombrar una ruta, un método o un campo de respuesta.
- Cambiar el tipo, el formato o la nulabilidad de un campo de respuesta.
- Hacer obligatorio un campo de solicitud, o **endurecer** lo que se acepta
  (nuevos límites, valores antes tolerados que pasan a `400`).
- Cambiar el estado HTTP de un resultado existente (por ejemplo `204` a `404`).
- Endurecer el acceso (de `read` a `user`, de `user` a `admin`).
- Quitar un valor de un enumerado de solicitud o cambiar el significado de uno
  existente.
- Quitar o cambiar un campo de error del que dependan los clientes (`issues`,
  `code`, `eligibility`).

### Qué es un cambio aditivo (permitido sin versión nueva de la ruta)

- Añadir una ruta o un método nuevos.
- Añadir un campo **opcional** a una solicitud.
- Añadir un campo a una respuesta (los clientes deben ignorar los campos que no
  conozcan; por eso las respuestas no declaran `additionalProperties: false`).
- Relajar el acceso o ampliar lo que se acepta.
- Añadir un valor a un enumerado de solicitud. Un valor nuevo en un enumerado de
  **respuesta** también es aditivo, pero exige subir la versión menor y avisarlo
  en el historial, porque un cliente estricto podría no esperarlo.

El **texto** de `error` es para personas y puede reformularse sin que sea un
cambio incompatible; el contrato son los códigos de estado y los campos
estructurados.

### Qué sube la versión

| Cambio | Versión |
| --- | --- |
| Incompatible (solo con decisión explícita y `/api/v2`, ver abajo) | **MAJOR** |
| Aditivo (ruta, campo opcional, estado nuevo documentado) | **MINOR** |
| Solo documentación: descripciones, corrección del contrato para que refleje lo que la API ya hacía | **PATCH** |

Cambiar el contrato sin subir `API_CONTRACT_VERSION` es un error de revisión: el
test solo obliga a regenerar `openapi.json`, no a subir la versión.

### Correcciones de seguridad

Un campo de respuesta (o una ruta) que **filtra datos sensibles** (respuestas de
cuestionarios, credenciales, datos de otros usuarios) se puede quitar o restringir
**sin periodo de deprecación y sin `/api/v2`**: mantenerlo sería mantener la fuga.
El procedimiento es:

1. Es un cambio incompatible, así que sube el **MAJOR** de `info.version`.
2. Añade la entrada al [Historial](#historial-del-contrato) y una sección de
   changelog que diga qué se quitó, por qué y qué deben hacer los clientes.
3. Añade un test de regresión que compruebe que la respuesta ya no contiene el dato
   (para cada rol que pueda llamar a la ruta).
4. No marques la operación como `deprecated`: no hay reemplazo ni periodo de
   transición.

Cuándo no aplica: si el dato no es sensible, se sigue la deprecación normal.

### Cuándo introducir `/api/v2`

Solo cuando un cambio incompatible sea inevitable **y** existan clientes que no se
puedan actualizar a la vez que el servidor (hoy el único cliente es la propia UI,
que se despliega junto a la API; por eso no hay rutas versionadas). Entonces:

1. Se abre una decisión explícita (backlog o issue) que lista los clientes afectados.
2. Las rutas nuevas viven en `pages/api/v2/**` con su propia entrada en el registro
   (`/api/v2/...`). Las de `/api/...` siguen intactas y pasan por la deprecación.
3. Se sube el MAJOR de `info.version`.

Se prefiere el **prefijo en la ruta** a una cabecera de versión: es visible en
los registros y en el visor OpenAPI, funciona con cualquier cliente y con cachés, y
encaja con el enrutado por archivos de Next. Una cabecera sería menos invasiva en
las URL, pero esconde la versión y complica el registro (la misma ruta con dos
contratos).

### Deprecación

1. Anuncia el cambio en el [Historial](#historial-del-contrato) y sube la versión
   menor.
2. Marca la operación en el registro:
   `deprecated: { since: '1.4.0', sunset: '2027-03-01', replacement: '`GET /api/v2/...`' }`.
   El OpenAPI la publica como `deprecated: true` con la fecha y el reemplazo.
3. Mantén la ruta funcionando **al menos 90 días**, o hasta comprobar (UI,
   auditoría, registros) que ningún cliente conocido la usa.
4. Retírala en el siguiente MAJOR (o, si no se llegó a publicar una versión nueva,
   con una decisión explícita). Quita su entrada del registro y regenera.

## Historial del contrato

| Versión | Fecha | Cambio |
| --- | --- | --- |
| 1.0.0 | 2026-10-15 | Primer contrato: 27 rutas (26 existentes y `GET /api/openapi.json`), descritas tal y como funcionaban. |
| 2.0.0 | 2026-10-15 | Corrección de seguridad (módulos y exportación ya no exponen las respuestas de los cuestionarios) y contadores/indicadores con tipo único. Ver [2.0.0](#200-2026-10-15). |
| 3.0.0 | 2026-10-16 | Coherencia de la API: errores `401`/`403`/`405`/`429` en español, `405` en JSON, `DELETE /api/roadmaps/{id}` con `200` si no existía y `PATCH /api/users/{id}` con una única forma de usuario. Ver [3.0.0](#300-2026-10-16). |
| 3.1.0 | 2026-10-16 | Aditivo: `POST /api/roadmaps/import` describe el documento `roadmap` completo (modelo `RoadmapImportDocument`) en lugar de `object`. Sin cambios de comportamiento. Ver [3.1.0](#310-2026-10-16). |
| 3.2.0 | 2026-10-16 | Aditivo: `POST /api/users` devuelve el mismo usuario que el listado y `PATCH` (con `roadmap_access_ids`). Corrección: `PUT`/`DELETE /api/evidences/modules/{id}` ya no escriben un `404` tras el `401`. Ver [3.2.0](#320-2026-10-16). |
| 3.3.0 | 2026-10-17 | Aditivo: todas las rutas documentan el `500` JSON `{ error: "Error interno del servidor." }` para fallos inesperados (antes, el `500` por defecto de Next, sin JSON). Ver [3.3.0](#330-2026-10-17). |
| 3.4.0 | 2026-10-21 | Aditivo: los quizzes se sirven por intento (selección aleatoria del banco y opciones barajadas). `GET /api/quizzes/modules/{id}` devuelve `attempt_id`, `POST` acepta `attempt_id` opcional, lo devuelve y documenta el `409`. Los ids de pregunta de los quizzes con banco cambian de valor (opacos: recarga el cuestionario). Ver [3.4.0](#340-2026-10-21). |
| 3.5.0 | 2026-10-26 | Aditivo: nueva ruta `GET /api/progress/quiz-attempts/export` (`format=json\|csv`) con los intentos de quiz del usuario autenticado, para enviarlos al mentor. Ver [3.5.0](#350-2026-10-26). |

### 3.5.0 (2026-10-26)

Versión **MINOR**: solo añade una ruta; nada de lo existente cambia.

- `GET /api/progress/quiz-attempts/export?format=json|csv` (sesión; `json` por defecto).
  Devuelve solo los intentos del usuario de la sesión (no existe parámetro de usuario), del más
  antiguo al más reciente: `attempt_id`, roadmap y módulo (id y título), `quiz_scope`, `score`,
  `max_score`, `percentage`, `submitted_at`, más `user.email`/`user.name`, `exported_at` y
  `total_attempts`. No incluye las respuestas enviadas.
- Es una descarga: `Content-Disposition: attachment; filename="quiz-results-AAAA-MM-DD.json|csv"`.
  El CSV es UTF-8 con BOM, CRLF, una fila por intento (con `user_email` y `user_name` en cada fila)
  y neutraliza las fórmulas (celdas de texto que empiezan por `=`, `+`, `-` o `@` llevan un `'`).
- Un `format` desconocido responde `400` `{ "error": "El formato debe ser «json» o «csv»." }`.

### 3.4.0 (2026-10-21)

Versión **MINOR**. Todo lo que funcionaba sigue funcionando: el campo de petición nuevo es
opcional, los de respuesta son aditivos y el `409` solo aparece si un cliente envía un
`attempt_id`. Por la [política](#qué-sube-la-versión) no es **MAJOR** (no se quita ni cambia
un campo ni un estado existente) ni solo **PATCH** (hay campos y un estado nuevos).

- `GET /api/quizzes/modules/{id}` devuelve `attempt_id`. Con sesión, el servidor elige hasta 5
  preguntas del banco al azar y baraja las opciones; guarda lo servido (copia completa, con la
  respuesta correcta, que nunca sale al cliente) en un intento válido 24 horas. Recargar devuelve el
  mismo intento hasta que se envía o caduca. Sin sesión, `attempt_id` es `null` y se devuelve la vista
  previa estable de siempre.
- `POST /api/quizzes/modules/{id}` acepta `attempt_id` (opcional, hasta 64 caracteres
  alfanuméricos o guiones) y lo devuelve en la respuesta (`null` si se corrigió sin intento). Se corrige
  contra lo servido y solo se puede enviar una vez. Si el intento no existe, es de otro alumno o
  módulo, ya se envió o ha caducado responde `409`
  `{ "error": "El intento ya se envió o ha caducado. Recarga el cuestionario para empezar uno nuevo." }`.
  La comprobación de límite de intentos (`429`) sigue yendo antes.
- Compatibilidad: sin `attempt_id` (clientes antiguos) se corrige siempre el quiz determinista de
  siempre, exactamente como antes de la 3.4.0: no se consulta ni se cierra ningún intento, el intento
  guardado lleva `attempt_id: null` y la respuesta devuelve `attempt_id: null`.
- Los ids de pregunta de un banco pasan a ser `bank-<posición en el banco guardado>` (antes, la
  posición tras barajar). Los ids son identificadores opacos y sus valores cambian en los quizzes con
  banco: el cliente debe usar los ids devueltos por el último `GET`, y un cuestionario cargado antes de
  actualizar debe recargarse (si no, el envío sin `attempt_id` responde `400` por respuestas que no
  corresponden).
- `GET /api/modules/{id}` conserva `quiz`, ahora documentado como vista previa estable: quitarlo
  sería **MAJOR**. Para responder hay que usar `GET /api/quizzes/modules/{id}`; la interfaz ya no
  responde con el cuestionario embebido.

Qué hacer en un cliente: pide el cuestionario con `GET /api/quizzes/modules/{id}`, envía el
`attempt_id` recibido y, ante un `409`, vuelve a pedir el cuestionario para empezar otro intento.

### 3.3.0 (2026-10-17)

Versión **MINOR**. Ningún estado, campo ni mensaje existente deja de funcionar: un
fallo inesperado ya devolvía `500`; lo que cambia es que el cuerpo pasa a ser el
JSON `{ error }` del resto de la API en lugar de la respuesta de Next, que no era
JSON y que un cliente no podía interpretar. Por la [política](#qué-sube-la-versión)
no es **MAJOR** (no se cambia el estado ni se quita ni cambia un campo del que
dependiera un cliente) ni solo **PATCH** (aparece un estado documentado nuevo en cada
operación); es un estado nuevo documentado, es decir, **MINOR**.

- Todos los manejadores de `pages/api` pasan por `withApiErrors`
  (`lib/http/errors.ts`): una excepción o promesa rechazada responde `500` con
  `{ "error": "Error interno del servidor." }`. El error real solo se registra en el
  servidor (método y ruta, sin la query) y nunca llega al cliente (ni mensaje, ni
  traza, ni SQL). Si las cabeceras ya se habían enviado no se escribe nada más.
- Cada operación del registro documenta ese `500` (`crossCutting`). `POST /api/roadmaps`,
  `POST /api/users` y `POST /api/auth/setup` conservan su `500` de dominio
  (`No se pudo crear el roadmap.`/`No se pudo crear el usuario.`), que no es una excepción
  sino un resultado `failed` del servicio.
- `PUT /api/evidences/{id}/review` deja de tener un `500` propio
  (`Error al revisar la evidencia.`): usa el mensaje genérico unificado. El texto de
  `error` es para personas, así que no es un cambio incompatible.

Qué hacer en un cliente: ante un `500`, lee `error` como en cualquier otro error; no
dependas de su texto.

### 3.2.0 (2026-10-16)

Versión **MINOR**: un campo nuevo en una respuesta (aditivo) y la corrección de un
fallo que la propia documentación ya recogía como incoherencia. Ningún estado,
campo ni mensaje existente cambia para un cliente que se comporte bien.

- `POST /api/users` (`201`) devuelve ahora el usuario con la misma forma que
  `GET /api/users` y `PATCH /api/users/{id}`: `can_view_all_roadmaps` efectivo (un
  admin siempre `1`) y `roadmap_access_ids` (`[]` al crearlo). El modelo de la
  respuesta pasa de `AdminUser` a `AdminUserWithAccess`. Nunca incluye
  `password_hash` ni tokens.
- `PUT` y `DELETE /api/evidences/modules/{id}`: si no se podía resolver el
  alcance de lectura, la respuesta recibía un `401` y después un `404`
  sobre el mismo objeto. Ahora se escribe **una sola respuesta**, el `401`
  `Debes iniciar sesión.`. El orden de consultas no cambia (módulo y después alcance);
  el fallo estaba en que el manejador escribía el `404` aunque el `401` ya estuviera
  enviado. Un módulo inexistente o fuera del alcance sigue siendo `404`.
- Sin cambios de contrato: la validación de `version` y `published_at` de los roadmaps
  se unificó internamente (ver `VALIDATION.md`) con los mismos mensajes.

Qué hacer en un cliente: nada; puedes leer `roadmap_access_ids` de la respuesta de
`POST /api/users` en lugar de asumir `[]`.

### 3.1.0 (2026-10-16)

Versión **MINOR** (cambio aditivo): solo se amplía la documentación, no cambia ningún
estado, cuerpo ni mensaje.

- El cuerpo de `POST /api/roadmaps/import` describe `roadmap` con el nuevo modelo
  `RoadmapImportDocument` (campos, longitudes máximas, listas, `level`, enlaces,
  preguntas de los quizzes por tipo y límites de opciones) en lugar de un `object`.
- La validación del documento pasó de código manual a un esquema Zod con los mismos
  `path` y `message` en `issues`. Salvo una diferencia menor y deliberada, que no
  altera ni estados ni estructura de la respuesta: cuando una pregunta tiene un `type`
  no permitido, `issues` solo informa de ese `type` (antes añadía los problemas de
  `question`, `answer`, `explanation` y `options` de la misma pregunta) y el orden de
  `issues` entre campos distintos puede variar. Ver `VALIDATION.md`, sección Importación.

Qué hacer en un cliente: nada; puedes generar tipos del modelo `RoadmapImportDocument`.

### 3.0.0 (2026-10-16)

Versión **MAJOR**. La [política](#versionado) dice que el **texto** de `error` es
para personas y puede reformularse sin ser incompatible, así que traducir los
mensajes por sí solo habría sido un cambio menor (PATCH/MINOR). Lo que fuerza el
MAJOR son tres cambios de **estructura o de estado** que sí rompen a un cliente
que ya funcionaba:

- `405` pasa de texto plano (`Method Not Allowed`) a JSON `{ "error": "Método no permitido." }`
  (cambia el tipo y formato del cuerpo). La cabecera `Allow` no cambia.
- `DELETE /api/roadmaps/{id}` con un roadmap inexistente pasa de `204` a `200` con
  `{ "message": "El roadmap no existía; no había nada que borrar." }` (cambia un
  estado HTTP existente). Si existía sigue siendo `204` sin cuerpo.
- `PATCH /api/users/{id}` devuelve siempre el usuario con sus campos de acceso
  (`can_view_all_roadmaps` efectivo y `roadmap_access_ids`), sea cual sea la
  acción. Antes `set_active` y `reset_password` devolvían el registro sin
  `roadmap_access_ids` y con `can_view_all_roadmaps` tal y como estaba guardado
  (para un admin, `0` en vez de `1`).

**Mensajes en español** (no incompatible por sí solo, ver arriba; el `Allow`, los
estados y los campos estructurados no cambian):

| Antes | Ahora |
| --- | --- |
| `authentication required` | `Debes iniciar sesión.` |
| `admin role required` | `Necesitas permisos de administrador.` |
| `invalid origin` | `El origen de la petición no es válido.` |
| `origin not allowed` | `Origen de la petición no permitido.` |
| `origin check failed` | `No se pudo comprobar el origen de la petición.` |
| `too many attempts, please try again later` | `Demasiados intentos. Inténtalo de nuevo más tarde.` |
| `setup token required` | `Se requiere el token de configuración inicial.` |
| `invalid credentials` | `Credenciales no válidas.` |
| `Method Not Allowed` (texto plano) | `Método no permitido.` (JSON `{ error }`) |

Qué hacer en un cliente: no decidas la lógica por el texto de `error` (usa el
estado HTTP); trata el `405` como JSON; en `DELETE` de roadmaps acepta `200` y
`204` como éxito; en `PATCH /api/users/{id}` lee siempre la misma forma de
usuario. La UI del repositorio ya cumple las tres cosas.

**Auditoría de `DELETE` roadmap**: solo se escribe `roadmap.delete` cuando se
borró una fila (el servicio usa el número de filas afectadas del `DELETE`, sin una
comprobación previa que pudiera competir con otra petición). Una repetición
idempotente no genera registros.

### 2.0.0 (2026-10-15)

Versión **MAJOR** por la cláusula de [Correcciones de seguridad](#correcciones-de-seguridad):
la primera parte quita un campo que filtraba las respuestas correctas, sin
periodo de deprecación.

**Seguridad: respuestas de cuestionarios**

- `quiz_bank` **ya no aparece en ninguna respuesta**. Antes lo devolvían a
  cualquier lector `GET /api/modules`, `GET /api/modules/{id}`,
  `GET /api/roadmaps/{id}` (lista `modules`) y las respuestas de
  `POST /api/modules` y `PUT /api/modules/{id}`. Contiene, por cada pregunta, la
  respuesta correcta.
- `GET /api/roadmaps/{id}/export` pasa de acceso `read` a **`admin`**. Es una copia
  de seguridad que reimporta el roadmap y por eso incluye los cuestionarios con su
  respuesta (`quiz[].answer`); nunca debió ser legible por alumnos ni anónimos. La
  UI solo ofrecía el botón a administradores. Ahora responde `401` sin sesión y
  `403` si no eres administrador.
- Sin cambios: `GET /api/quizzes/modules/{id}` sigue devolviendo las preguntas sin
  `correct_option_index`; el detalle de módulo mantiene su campo `quiz` público.
- Qué hacer en un cliente: dejar de leer `quiz_bank` (usar `quiz` del detalle del
  módulo o `GET /api/quizzes/modules/{id}`) y, si exportas roadmaps, hacerlo con una
  sesión de administrador.

**Tipos únicos en SQLite y PostgreSQL**

- `module_count` (catálogo), `roadmap_count` (categorías, temas, niveles) y
  `unclassified_roadmaps` son siempre **números enteros**. En PostgreSQL llegaban
  como texto (`"4"`).
- `has_evidence` (módulos de `GET /api/roadmaps/{id}` con sesión) es siempre
  **booleano**. Antes era `0`/`1` en SQLite y `boolean` en PostgreSQL.
- Los repositorios normalizan estos valores (`lib/persistence/normalize.ts`): ni la
  API ni la UI necesitan convertirlos.

## Incoherencias conocidas

El contrato las documenta **tal cual**. Arreglarlas cambia respuestas y exige
aplicar el versionado anterior.

### Errores y mensajes

- Desde la [3.0.0](#300-2026-10-16) todos los errores de la API están en español
  y el `405` es el JSON `{ error }` del resto (con `Allow`).
- Desde la [3.3.0](#330-2026-10-17) los fallos inesperados devuelven el `500` JSON
  `{ error: "Error interno del servidor." }` en todas las rutas.
- `POST /api/quizzes/modules/{id}` responde `400` con `issues` (cuerpo no válido)
  o sin `issues` (respuestas incompletas): el mismo estado con dos formas.

### Orden de comprobaciones

- En `GET|PUT|DELETE /api/evidences/modules/{id}`, `PUT /api/progress/lessons/{id}`
  y `GET|POST /api/quizzes/modules/{id}` los parámetros se validan **antes** de
  comprobar la sesión: un id no válido sin sesión recibe `400`, no `401`.

### Comportamientos distintos entre rutas

- `DELETE /api/roadmaps/{id}` es idempotente (`204` si lo borra, `200` con
  `{ message }` si no existía) mientras que módulos, lecciones y evidencias
  responden `404` si no existen. Es una decisión explícita de la 3.0.0.
- `role` y `status` desconocidos se toleran (`user` y sin filtro) en lugar de `400`
  (ver `VALIDATION.md`).

### Diferencias SQLite y PostgreSQL

Los contadores (`COUNT`) y `has_evidence` ya se normalizan en los repositorios (ver
[2.0.0](#200-2026-10-15)); lo que sigue dependiendo del motor:

- Las fechas son texto: ISO 8601 en lo que genera la aplicación, y el formato de
  `CURRENT_TIMESTAMP` en las columnas con valor por defecto de SQLite.

## Seguimiento

Hallazgos que **no** se corrigieron aquí (no se cambia ninguna respuesta). La fuga
de `quiz_bank` y los contadores como texto en PostgreSQL se resolvieron en
[2.0.0](#200-2026-10-15); el idioma de los errores, el `405` en JSON, el
`DELETE` de roadmaps y la forma del `PATCH` de usuarios, en [3.0.0](#300-2026-10-16); el doble `401`+`404` de las evidencias y la forma de
`POST /api/users`, en [3.2.0](#320-2026-10-16); el `500` no JSON, en
[3.3.0](#330-2026-10-17).

1. El tipo local `quiz_eligibility` de la pantalla de módulo no correspondía a
   ningún campo de la API (el servidor devuelve la elegibilidad en
   `GET /api/quizzes/modules/{id}`); se eliminó al adoptar los tipos compartidos.
2. Añadir `license` al documento OpenAPI si el proyecto se publica.
