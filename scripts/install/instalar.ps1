# Instalador de CanteraHub para Windows (Windows PowerShell 5.1 y PowerShell 7).
#
#   irm https://raw.githubusercontent.com/EnriqueVPlexus/my_personal_moodle/main/scripts/install/instalar.ps1 | iex
#
# - Primera vez: descarga el compose, genera .env.docker con secretos
#   aleatorios y arranca la app.
# - Si ya esta instalado: actualiza (descarga el compose, baja la imagen y
#   reinicia). NUNCA regenera .env.docker: otro pepper invalidaria todas las
#   contrasenas y otra POSTGRES_PASSWORD no coincidiria con la base existente.
#
# Variables opcionales: CANTERA_DIR, CANTERA_RAW_BASE, CANTERA_NO_BROWSER=1.
# Nota: este fichero esta pensado para ejecutarse tambien con "| iex", asi que
# no usa param(), $PSScriptRoot ni "exit" (cerraria la ventana del alumno).

function Install-CanteraHub {
    $ErrorActionPreference = 'Continue'
    $ProgressPreference = 'SilentlyContinue'
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

    $dir = $env:CANTERA_DIR
    if (-not $dir) { $dir = Join-Path $env:USERPROFILE 'cantera-hub' }
    $rawBase = $env:CANTERA_RAW_BASE
    if (-not $rawBase) { $rawBase = 'https://raw.githubusercontent.com/EnriqueVPlexus/my_personal_moodle/main' }
    $guide = 'https://github.com/EnriqueVPlexus/my_personal_moodle/blob/main/GUIA_ALUMNO.md'
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false

    function Test-Cmd([string[]]$cmdArgs) {
        # Ejecuta docker sin mostrar nada y devuelve $true si termina bien.
        try {
            & docker @cmdArgs *> $null
            return ($LASTEXITCODE -eq 0)
        } catch {
            return $false
        }
    }

    function New-RandomHex([int]$bytes) {
        $buf = New-Object 'byte[]' $bytes
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($buf) } finally { $rng.Dispose() }
        $sb = New-Object System.Text.StringBuilder
        foreach ($b in $buf) { [void]$sb.Append($b.ToString('x2')) }
        return $sb.ToString()
    }

    function Test-PortBusy([int]$port) {
        if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
            try {
                $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop
                return ($null -ne $c)
            } catch {
                # Sin resultados (puerto libre) o cmdlet no usable: se prueba con un socket.
            }
        }
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $client.Connect('127.0.0.1', $port)
            return $true
        } catch {
            return $false
        } finally {
            $client.Close()
        }
    }

    function Get-RemoteFile([string]$name, [string]$dest) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri ($rawBase + '/' + $name) -OutFile $dest
        } catch {
            throw ('No pude descargar ' + $rawBase + '/' + $name + '. Comprueba tu conexion a Internet.')
        }
    }

    function Invoke-Compose([string[]]$composeArgs) {
        & docker compose --env-file .env.docker @composeArgs
        if ($LASTEXITCODE -ne 0) { throw ('Fallo: docker compose ' + ($composeArgs -join ' ')) }
    }

    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('cantera-' + [Guid]::NewGuid().ToString('N'))
    $pushed = $false
    try {
        # --- 1. Requisitos ---------------------------------------------------
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
            throw ('No encuentro Docker. Instala Docker Desktop y vuelve a ejecutar este comando. Guia: ' + $guide)
        }
        if (-not (Test-Cmd @('info'))) {
            throw ('Docker esta instalado pero no esta en marcha. Abre Docker Desktop, espera a que diga que esta funcionando y vuelve a ejecutar este comando. Guia: ' + $guide)
        }
        if (-not (Test-Cmd @('compose', 'version'))) {
            throw ('Falta "docker compose" (version 2). Actualiza Docker Desktop. Guia: ' + $guide)
        }

        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        Push-Location $dir
        $pushed = $true
        Write-Host ('Carpeta de instalacion: ' + $dir)

        # --- 2. Descargas (a un temporal; solo se sustituye si todo va bien) --
        $composeTmp = Join-Path $tmp 'docker-compose.yml'
        Get-RemoteFile 'docker-compose.yml' $composeTmp
        Copy-Item -Force $composeTmp (Join-Path $dir 'docker-compose.yml')

        # --- 3. .env.docker (solo la primera vez) ----------------------------
        $envPath = Join-Path $dir '.env.docker'
        $firstRun = -not (Test-Path $envPath)
        if (-not $firstRun) {
            Write-Host 'Instalacion existente: se conserva .env.docker (contrasenas y datos intactos).'
            $text = [System.IO.File]::ReadAllText($envPath, $utf8NoBom)
            $m = [regex]::Match($text, '(?m)^APP_PORT=(\d+)')
            if ($m.Success) { $appPort = [int]$m.Groups[1].Value } else { $appPort = 3000 }
        } else {
            # Se parte de .env.docker.example (misma version que el compose) y solo
            # se sustituyen los marcadores: si alguien anade una variable nueva con
            # valor "change-me*", la comprobacion final aborta en vez de instalar
            # a medias.
            $exampleTmp = Join-Path $tmp '.env.docker.example'
            Get-RemoteFile '.env.docker.example' $exampleTmp

            $appPort = 0
            foreach ($p in 3000..3010) {
                if (-not (Test-PortBusy $p)) { $appPort = $p; break }
            }
            if ($appPort -eq 0) { throw 'Los puertos 3000 a 3010 estan ocupados. Cierra alguna aplicacion y vuelve a intentarlo.' }
            if ($appPort -ne 3000) { Write-Host ('El puerto 3000 esta ocupado; se usara el ' + $appPort + '.') }

            $pepper = New-RandomHex 32
            $setupToken = New-RandomHex 32
            $dbPassword = New-RandomHex 24   # hex = solo letras/numeros, valido dentro de DATABASE_URL

            $content = [System.IO.File]::ReadAllText($exampleTmp, $utf8NoBom)
            $content = $content.Replace("`r`n", "`n")
            $content = $content.Replace('change-me-db-password', $dbPassword)
            $content = $content.Replace('change-me-setup-token', $setupToken)
            $content = $content.Replace('change-me-random-pepper', $pepper)
            $content = $content.Replace('APP_PORT=3000', ('APP_PORT=' + $appPort))

            $active = $content.Split("`n") | Where-Object { $_ -notmatch '^\s*#' }
            if ($active -match 'change-me') {
                throw '.env.docker.example tiene valores nuevos que este instalador no conoce. Avisa a tu profesor.'
            }
            if ($active -notcontains ('APP_PORT=' + $appPort)) {
                throw 'No pude fijar el puerto en .env.docker. Avisa a tu profesor.'
            }

            # UTF-8 SIN BOM (un BOM rompe la primera variable) y saltos de linea LF.
            if (-not $content.EndsWith("`n")) { $content = $content + "`n" }
            [System.IO.File]::WriteAllText($envPath, $content, $utf8NoBom)
            Write-Host ('Configuracion creada en ' + $envPath)
        }

        # --- 4. Descargar imagen y arrancar ----------------------------------
        Write-Host 'Descargando la aplicacion (la primera vez puede tardar unos minutos)...'
        Invoke-Compose @('pull')
        Write-Host 'Arrancando...'
        Invoke-Compose @('up', '-d')

        $url = 'http://localhost:' + $appPort
        Write-Host -NoNewline 'Esperando a que la aplicacion responda'
        $ready = $false
        for ($i = 0; $i -lt 60; $i++) {
            try {
                $r = Invoke-WebRequest -UseBasicParsing -Uri ($url + '/') -TimeoutSec 5
                if ($r.StatusCode -eq 200) { $ready = $true; break }
            } catch { }
            Write-Host -NoNewline '.'
            Start-Sleep -Seconds 2
        }
        Write-Host ''
        if (-not $ready) {
            Write-Host 'La aplicacion no ha respondido en 2 minutos.' -ForegroundColor Red
            Write-Host 'Mira que ha pasado con:' -ForegroundColor Red
            Write-Host ('  cd "' + $dir + '"; docker compose --env-file .env.docker logs app --tail 50') -ForegroundColor Red
            return
        }

        # --- 5. Mensaje final ------------------------------------------------
        if ($env:CANTERA_NO_BROWSER -ne '1') {
            try { Start-Process ($url + '/setup') } catch { }
        }

        Write-Host ''
        Write-Host '============================================================'
        Write-Host (' CanteraHub esta funcionando: ' + $url)
        Write-Host '============================================================'
        if ($firstRun) {
            Write-Host ''
            Write-Host 'Primeros pasos:'
            Write-Host ('  1. Abre ' + $url + '/setup')
            Write-Host '  2. Crea tu cuenta y, cuando te lo pida, pega este codigo:'
            Write-Host ''
            Write-Host ('     ' + $setupToken)
            Write-Host ''
            Write-Host '     (Solo hace falta esta vez. Para verlo de nuevo:'
            Write-Host ('      Select-String AUTH_SETUP_TOKEN "' + $envPath + '")')
        } else {
            Write-Host ''
            Write-Host 'Actualizado. Tus datos y tu cuenta siguen igual.'
            Write-Host 'Si aun no has creado tu cuenta, el codigo de /setup esta en'
            Write-Host ('  ' + $envPath + '  (linea AUTH_SETUP_TOKEN)')
        }
        Write-Host ''
        Write-Host ('Comandos utiles (ejecutalos dentro de la carpeta: cd "' + $dir + '"):')
        Write-Host '  Parar:        docker compose --env-file .env.docker stop'
        Write-Host '  Arrancar:     docker compose --env-file .env.docker start'
        Write-Host '  Actualizar:   vuelve a ejecutar el comando de instalacion'
        Write-Host '  Desinstalar:  docker compose --env-file .env.docker down -v   (BORRA tus datos)'
        Write-Host ('Guia completa: ' + $guide)
    } catch {
        Write-Host ''
        Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    } finally {
        if ($pushed) { Pop-Location }
        if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
    }
}

Install-CanteraHub
