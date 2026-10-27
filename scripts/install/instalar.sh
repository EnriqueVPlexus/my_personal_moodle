#!/usr/bin/env bash
# Instalador de CanteraHub para macOS y Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/EnriqueVPlexus/my_personal_moodle/main/scripts/install/instalar.sh | bash
#
# - Primera vez: descarga el compose, genera .env.docker con secretos
#   aleatorios y arranca la app.
# - Si ya esta instalado: actualiza (descarga el compose, baja la imagen y
#   reinicia). NUNCA regenera .env.docker: otro pepper invalidaria todas las
#   contrasenas y otra POSTGRES_PASSWORD no coincidiria con la base existente.
#
# Variables opcionales: CANTERA_DIR, CANTERA_RAW_BASE, CANTERA_NO_BROWSER=1.
set -euo pipefail

CANTERA_DIR="${CANTERA_DIR:-$HOME/cantera-hub}"
RAW_BASE="${CANTERA_RAW_BASE:-https://raw.githubusercontent.com/EnriqueVPlexus/my_personal_moodle/main}"
GUIDE="https://github.com/EnriqueVPlexus/my_personal_moodle/blob/main/GUIA_ALUMNO.md"

die() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

# --- 1. Requisitos -----------------------------------------------------------
command -v docker >/dev/null 2>&1 ||
  die "No encuentro Docker. Instala Docker Desktop y vuelve a ejecutar este comando. Guia: $GUIDE"
docker info >/dev/null 2>&1 ||
  die "Docker esta instalado pero no esta en marcha. Abre Docker Desktop, espera a que diga que esta funcionando y vuelve a ejecutar este comando. Guia: $GUIDE"
docker compose version >/dev/null 2>&1 ||
  die "Falta 'docker compose' (version 2). Actualiza Docker Desktop. Guia: $GUIDE"
command -v curl >/dev/null 2>&1 || die "Falta 'curl'."

mkdir -p "$CANTERA_DIR"
cd "$CANTERA_DIR"
echo "Carpeta de instalacion: $CANTERA_DIR"

# --- 2. Descargas (a un temporal; solo se sustituye si todo va bien) ---------
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
fetch() {
  curl -fsSL "$RAW_BASE/$1" -o "$TMP_DIR/$1" ||
    die "No pude descargar $RAW_BASE/$1. Comprueba tu conexion a Internet."
}
fetch docker-compose.yml
mv "$TMP_DIR/docker-compose.yml" docker-compose.yml

# --- 3. .env.docker (solo la primera vez) ------------------------------------
random_hex() { # $1 = numero de bytes
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

port_busy() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$1" >/dev/null 2>&1
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
  fi
}

FIRST_RUN=0
if [ -f .env.docker ]; then
  echo "Instalacion existente: se conserva .env.docker (contrasenas y datos intactos)."
  APP_PORT="$(sed -n 's/^APP_PORT=//p' .env.docker | tail -n 1)"
  APP_PORT="${APP_PORT:-3000}"
else
  FIRST_RUN=1
  # Se parte de .env.docker.example (misma version que el compose) y solo se
  # sustituyen los marcadores: si alguien anade una variable nueva con valor
  # "change-me*", la comprobacion final aborta en vez de instalar a medias.
  fetch .env.docker.example

  APP_PORT=""
  for p in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do
    if ! port_busy "$p"; then APP_PORT="$p"; break; fi
  done
  [ -n "$APP_PORT" ] ||
    die "Los puertos 3000 a 3010 estan ocupados. Cierra alguna aplicacion y vuelve a intentarlo."
  [ "$APP_PORT" = "3000" ] || echo "El puerto 3000 esta ocupado; se usara el $APP_PORT."

  PEPPER="$(random_hex 32)"
  SETUP_TOKEN="$(random_hex 32)"
  DB_PASSWORD="$(random_hex 24)" # hex = solo letras/numeros, valido dentro de DATABASE_URL

  content="$(<"$TMP_DIR/.env.docker.example")"
  content="${content//change-me-db-password/$DB_PASSWORD}"
  content="${content//change-me-setup-token/$SETUP_TOKEN}"
  content="${content//change-me-random-pepper/$PEPPER}"
  content="${content//APP_PORT=3000/APP_PORT=$APP_PORT}"

  stripped="$(printf '%s\n' "$content" | sed 's/^[[:space:]]*#.*//')"
  case "$stripped" in
    *change-me*) die ".env.docker.example tiene valores nuevos que este instalador no conoce. Avisa a tu profesor." ;;
  esac
  case "
$content
" in
    *"
APP_PORT=$APP_PORT
"*) ;;
    *) die "No pude fijar el puerto en .env.docker. Avisa a tu profesor." ;;
  esac

  umask 077
  printf '%s\n' "$content" >.env.docker.tmp
  chmod 600 .env.docker.tmp
  mv .env.docker.tmp .env.docker
  echo "Configuracion creada en $CANTERA_DIR/.env.docker"
fi

# --- 4. Descargar imagen y arrancar ------------------------------------------
COMPOSE=(docker compose --env-file .env.docker)
echo "Descargando la aplicacion (la primera vez puede tardar unos minutos)..."
"${COMPOSE[@]}" pull
echo "Arrancando..."
"${COMPOSE[@]}" up -d

URL="http://localhost:$APP_PORT"
printf 'Esperando a que la aplicacion responda'
ready=0
for _ in $(seq 1 60); do
  if curl -fs -o /dev/null "$URL/"; then ready=1; break; fi
  printf '.'
  sleep 2
done
echo
if [ "$ready" -ne 1 ]; then
  echo "La aplicacion no ha respondido en 2 minutos." >&2
  echo "Mira que ha pasado con:" >&2
  echo "  cd \"$CANTERA_DIR\" && docker compose --env-file .env.docker logs app --tail 50" >&2
  exit 1
fi

# --- 5. Mensaje final --------------------------------------------------------
if [ "${CANTERA_NO_BROWSER:-0}" != "1" ]; then
  if command -v open >/dev/null 2>&1; then
    open "$URL/setup" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL/setup" >/dev/null 2>&1 || true
  fi
fi

echo
echo "============================================================"
echo " CanteraHub esta funcionando: $URL"
echo "============================================================"
if [ "$FIRST_RUN" -eq 1 ]; then
  echo
  echo "Primeros pasos:"
  echo "  1. Abre $URL/setup"
  echo "  2. Crea tu cuenta y, cuando te lo pida, pega este codigo:"
  echo
  echo "     $(sed -n 's/^AUTH_SETUP_TOKEN=//p' .env.docker)"
  echo
  echo "     (Solo hace falta esta vez. Para verlo de nuevo:"
  echo "      cat \"$CANTERA_DIR/.env.docker\"  y busca AUTH_SETUP_TOKEN)"
else
  echo
  echo "Actualizado. Tus datos y tu cuenta siguen igual."
  echo "Si aun no has creado tu cuenta, el codigo de /setup esta en"
  echo "  $CANTERA_DIR/.env.docker  (linea AUTH_SETUP_TOKEN)"
fi
echo
echo "Comandos utiles (ejecutalos dentro de la carpeta: cd \"$CANTERA_DIR\"):"
echo "  Parar:        docker compose --env-file .env.docker stop"
echo "  Arrancar:     docker compose --env-file .env.docker start"
echo "  Actualizar:   vuelve a ejecutar el comando de instalacion"
echo "  Desinstalar:  docker compose --env-file .env.docker down -v   (BORRA tus datos)"
echo "Guia completa: $GUIDE"
