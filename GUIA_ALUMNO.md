# Guía del alumno: instalar CanteraHub en tu ordenador

## Qué es esto

CanteraHub es una aplicación web que se ejecuta **en tu propio ordenador**. Es tu copia personal:

- Tus datos (cuenta, progreso, resultados de quizzes) se quedan en tu ordenador. No se envían a ningún sitio.
- Nadie más ve lo que haces, a no ser que tú exportes tus resultados en un fichero y se lo envíes a tu profesor (ver [Enviar tus resultados](#enviar-tus-resultados)).
- Tú eres el administrador de tu copia.

Para que funcione usamos **Docker**, un programa que ejecuta aplicaciones ya preparadas sin que tengas que instalar nada más. Solo lo instalas una vez.

## Qué necesitas

- Windows 10/11, macOS o Linux.
- Conexión a Internet (para instalar y actualizar).
- Unos 5 GB libres en disco.
- Unos 15 minutos la primera vez.

## Paso 1. Instala Docker Desktop

**Windows**

1. Descarga e instala Docker Desktop: <https://docs.docker.com/desktop/setup/install/windows-install/>
2. Si el instalador pide activar **WSL 2**, acepta. Puede que te pida **reiniciar el ordenador**: hazlo.

**macOS**

1. Descarga e instala Docker Desktop: <https://docs.docker.com/desktop/setup/install/mac-install/>
2. Elige la versión según tu Mac: **Apple silicon** (chip M1, M2, M3...) o **Intel**. Lo ves en menú  > *Acerca de este Mac*.

**Después (todos)**

3. Abre **Docker Desktop** y espera hasta que indique que está funcionando (en la parte inferior suele aparecer "Engine running" en verde). Puede tardar un par de minutos.

> Docker Desktop debe estar abierto cada vez que uses CanteraHub.

## Paso 2. Abre una terminal

Una terminal es una ventana donde se escriben órdenes.

- **Windows:** pulsa la tecla Windows, escribe `PowerShell` y abre **Windows PowerShell**.
- **macOS:** pulsa `Cmd + Espacio`, escribe `Terminal` y pulsa Intro.

## Paso 3. Instala CanteraHub

Copia **una sola línea** (la de tu sistema), pégala en la terminal y pulsa Intro.

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/EnriqueVPlexus/my_personal_moodle/main/scripts/install/instalar.ps1 | iex
```

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/EnriqueVPlexus/my_personal_moodle/main/scripts/install/instalar.sh | bash
```

El script comprueba que Docker funciona, descarga la aplicación (la primera vez tarda unos minutos), la arranca y al terminar te muestra:

- La dirección de la aplicación, normalmente <http://localhost:3000>.
- Un **código de configuración** (una cadena larga de letras y números). Lo necesitas en el paso siguiente.

Se instala en la carpeta `cantera-hub` de tu carpeta personal. No tienes que editar ningún fichero.

<details>
<summary>Prefiero descargar el fichero y ejecutarlo yo (opción para quien quiera revisarlo antes)</summary>

1. Descarga el script de tu sistema:
   - Windows: <https://raw.githubusercontent.com/EnriqueVPlexus/my_personal_moodle/main/scripts/install/instalar.ps1>
   - macOS / Linux: <https://raw.githubusercontent.com/EnriqueVPlexus/my_personal_moodle/main/scripts/install/instalar.sh>
2. Ábrelo con un editor de texto si quieres ver qué hace.
3. Ejecútalo desde la terminal, en la carpeta donde lo hayas guardado:
   - Windows: `powershell -ExecutionPolicy Bypass -File .\instalar.ps1`
   - macOS / Linux: `bash instalar.sh`

</details>

## Paso 4. Crea tu cuenta (solo la primera vez)

1. Abre en el navegador la dirección que te mostró el script, añadiendo `/setup`. Normalmente: <http://localhost:3000/setup> (se abre sola en muchos casos).
2. Rellena tu correo, tu nombre y una contraseña.
3. Pega el **código de configuración** que mostró el script.
4. Listo: ya puedes usar la aplicación.

**¿Perdiste el código?** Está en el fichero `.env.docker` de la carpeta `cantera-hub`, en la línea `AUTH_SETUP_TOKEN=`. Para mostrarlo:

- Windows: `Select-String AUTH_SETUP_TOKEN "$env:USERPROFILE\cantera-hub\.env.docker"`
- macOS / Linux: `grep AUTH_SETUP_TOKEN ~/cantera-hub/.env.docker`

> No compartas ni borres `.env.docker`: contiene las claves de tu instalación.

## Uso diario

Con Docker Desktop abierto, la aplicación suele arrancar sola. Entra en <http://localhost:3000> (o el puerto que te indicó el script) e inicia sesión.

Si prefieres pararla o arrancarla a mano, abre una terminal y entra en la carpeta de instalación:

- Windows: `cd "$env:USERPROFILE\cantera-hub"`
- macOS / Linux: `cd ~/cantera-hub`

Después:

| Qué quieres | Orden |
| --- | --- |
| Parar | `docker compose --env-file .env.docker stop` |
| Arrancar | `docker compose --env-file .env.docker start` |

Tus datos se conservan al parar.

## Enviar tus resultados

1. Inicia sesión y entra en **Portfolio** (`/portfolio`, por ejemplo <http://localhost:3000/portfolio>).
2. Busca el apartado **Exportar mis resultados de quizzes**.
3. Pulsa **Exportar resultados (CSV)** (o JSON si tu profesor lo pide). Se descargará un fichero.
4. Envía ese fichero a tu profesor por el canal que él te indique.

## Actualizar a una versión nueva

Vuelve a ejecutar **el mismo comando del Paso 3**. Se descarga la versión nueva y **conserva tus datos y tu cuenta**. No generará un código nuevo.

> **Importante: no borres la carpeta `cantera-hub` ni el fichero `.env.docker`**, ni antes ni después de actualizar. Ahí están las claves que abren tus datos. Si los borras y vuelves a instalar, la aplicación no arrancará o no podrás entrar con tu contraseña. Para actualizar basta con repetir el comando; no hace falta desinstalar nada.

## Ver qué versión tienes

Abre la aplicación y mira el **pie de página** (abajo del todo): aparece el número de versión.

## Problemas frecuentes

**"Docker no está en marcha" / el script dice que no encuentra Docker**
Abre Docker Desktop y espera a que indique que está funcionando. Luego repite el comando del Paso 3.

**El puerto 3000 está ocupado**
El instalador lo detecta y usa otro (3001, 3002...). Fíjate en la dirección que muestra al terminar. Si ya lo instalaste antes y quieres cambiarlo, pide ayuda a tu profesor.

**La página no carga o se queda en blanco**
Espera un minuto y recarga. Si sigue igual, mira qué dice la aplicación (en la carpeta `cantera-hub`):

```
docker compose --env-file .env.docker logs app --tail 50
```

y envía esas líneas a tu profesor.

**"Error interno del servidor" al crear la cuenta o iniciar sesión**
No debería ocurrir con el instalador. Si pasa, ejecuta la orden de los registros de arriba y envía el resultado a tu profesor. No borres nada todavía.

**Borré la carpeta `cantera-hub` (o `.env.docker`) y ahora no arranca o no puedo entrar**
Tus datos siguen guardados en Docker, pero las claves para abrirlos estaban en `.env.docker` y no se pueden recuperar. Si tienes una copia de ese fichero (por ejemplo, en la papelera), vuelve a ponerlo en la carpeta `cantera-hub` y repite el comando del Paso 3. Si no, la única salida es empezar de cero, lo que **borra todos tus datos**:

1. Ejecuta estas dos órdenes, una detrás de otra (si la primera dice que algo no existe, no pasa nada):
   - `docker rm -f cantera-hub-app-1 cantera-hub-migrate-1 cantera-hub-db-1`
   - `docker volume rm cantera-hub_cantera_pgdata`
2. Repite el comando del Paso 3 y crea tu cuenta de nuevo.

**Se me ha olvidado la contraseña**
No existe "recuperar contraseña" en esta versión. Opciones:

- Intenta recordarla con calma (prueba las contraseñas que sueles usar).
- Si no hay manera, la única salida es **desinstalar y volver a instalar**, lo que **borra todos tus datos** (progreso y resultados). Si ya habías enviado tus resultados a tu profesor, esa copia no se pierde.

**Quiero desinstalar**

> Atención: esto **borra todos tus datos** de CanteraHub de forma definitiva.

1. Entra en la carpeta de instalación (ver [Uso diario](#uso-diario)).
2. Ejecuta: `docker compose --env-file .env.docker down -v`
3. Sal de la carpeta y bórrala (`cantera-hub`) desde el explorador de archivos o el Finder.

Si ya no quieres Docker, desinstálalo como cualquier otro programa.
