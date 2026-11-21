import { Kysely } from 'kysely'

/**
 * Brings EXISTING installations up to date with the roadmap content fixes
 * shipped in commits a8ae5b4 / 5582c66 (new AWS module "Cuenta AWS, Free Tier,
 * seguridad inicial y control de costes", per-module AWS quizzes, AWS CLI via
 * IAM Identity Center, Free Tier notes, Trivy supply-chain notice, AI-901 and
 * Vertex AI renaming, permanent-redirect URL updates). `seedRoadmaps` only runs
 * on an empty `roadmaps` table, so without this migration those databases
 * would never receive the fixes.
 *
 * Policy ("only corrected fields"): FIXES below is a frozen snapshot of the
 * fields that changed between the pre-fix and post-fix seeds, per roadmap and
 * per module, as stored by the seed (JSON columns already stringified, so the
 * stored shape equals what a fresh seed writes). Every other column an admin
 * may have edited through the UI is left alone.
 *
 * Safe by construction (this runs against real data, e.g. Supabase):
 *  - Roadmaps and modules are matched by EXACT title only, never by position
 *    (the seed's `position = ? OR title = ?` matching is exactly what must be
 *    avoided here: the new AWS module shifts every later position). The one
 *    renamed module is mapped explicitly (`oldTitle` -> `title`) and also
 *    matched under its new title, which keeps re-runs idempotent.
 *  - Row ids are never changed and nothing is deleted, so progress, quiz
 *    attempts, quiz sessions, evidences and `current_module_id` stay attached
 *    to the same modules. (`modules` has no UNIQUE constraint on
 *    (roadmap_id, position), so shifting positions cannot collide.)
 *  - A missing roadmap or module (renamed/deleted by an admin) is skipped with
 *    console.warn. The new module is inserted only when no module with that
 *    exact title exists in the roadmap.
 *  - `quiz_bank` is replaced only when it still holds the pre-fix seed value
 *    (or is empty); a bank an admin customised is kept and reported. Open
 *    `quiz_attempt_sessions` carry a full snapshot of their questions
 *    (0002), so replacing a bank never breaks grading of an in-flight session.
 *  - On a fresh database `roadmaps` is empty at migration time, so this is a
 *    no-op and the seed inserts the current content afterwards.
 *  - Idempotent: a second run rewrites the same values and inserts nothing.
 *
 * Kysely wraps migrations in a transaction on PostgreSQL. This file is
 * self-contained on purpose: the production image only ships `migrations/`
 * (not `lib/`), so it cannot import the seed. A test keeps the snapshot in
 * sync with the seed's own normalization. `down` is a no-op: previous content
 * cannot be restored.
 */

type Columns = Record<string, string | number | null>

type ModuleFix = {
  /** Title before the fix (differs from `title` only for the renamed module). */
  oldTitle: string
  title: string
  /** Only the columns the fix changed, with their post-fix stored values. */
  changed: Columns
  /** Pre-fix seed `quiz_bank`, to tell an untouched bank from an admin's. */
  previousQuizBank?: string | null
}

type RoadmapFix = {
  roadmapTitle: string
  roadmapChanges: Columns
  modules: ModuleFix[]
  /** Modules that did not exist before: full post-fix columns. */
  inserts: Columns[]
}

const FIXES: RoadmapFix[] = [
  {
    "roadmapTitle": "Roadmap AWS gratuito para cantera junior DevOps",
    "roadmapChanges": {
      "description": "Este itinerario está diseñado para perfiles junior con base técnica que quieren iniciarse en AWS con enfoque práctico y orientado a DevOps. Está pensado para el plan gratuito de AWS para cuentas nuevas (créditos de bienvenida durante un máximo de 6 meses), con hábitos de control de costes desde el primer día.",
      "objectives": "[\"Abrir y proteger una cuenta AWS, entender el plan gratuito basado en créditos y controlar los costes\",\"Comprender los fundamentos de cloud computing\",\"Conocer los servicios básicos de AWS\",\"Adquirir nociones de red, seguridad y observabilidad\",\"Introducir automatización e infraestructura como código\",\"Dar los primeros pasos en contenedores y CI/CD\",\"Construir un proyecto final con enfoque de empleabilidad\"]",
      "duration_weeks_min": 12,
      "duration_weeks_max": 13
    },
    "modules": [
      {
        "oldTitle": "Fundamentos cloud",
        "title": "Fundamentos cloud",
        "changed": {
          "quiz_bank": "[{\"question\":\"¿Qué describe mejor el concepto de cloud computing?\",\"answer\":\"Usar recursos tecnológicos bajo demanda a través de Internet\",\"options\":[\"Comprar servidores físicos para instalarlos en un CPD propio\",\"Usar recursos tecnológicos bajo demanda a través de Internet\",\"Instalar aplicaciones únicamente en equipos locales\",\"Sustituir todos los sistemas por aplicaciones móviles\"],\"explanation\":\"Cloud computing permite consumir recursos como cómputo, almacenamiento o red bajo demanda, normalmente pagando por uso.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Cuál de estas opciones es un ejemplo de IaaS?\",\"answer\":\"Una máquina virtual que el cliente administra\",\"options\":[\"Una máquina virtual que el cliente administra\",\"Una aplicación web completamente gestionada por un proveedor\",\"Un correo electrónico tipo SaaS\",\"Un CRM ya preparado para usuarios finales\"],\"explanation\":\"IaaS proporciona infraestructura como máquinas virtuales, redes o almacenamiento, pero el cliente sigue administrando parte del sistema.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué diferencia hay entre una región y una Availability Zone en AWS?\",\"answer\":\"Una región es un área geográfica y una Availability Zone es una ubicación aislada dentro de esa región\",\"options\":[\"Una región es una cuenta de AWS y una Availability Zone es un usuario\",\"Una región es un área geográfica y una Availability Zone es una ubicación aislada dentro de esa región\",\"Una región es un servicio de almacenamiento y una Availability Zone es un servicio de red\",\"No hay diferencia, son términos equivalentes\"],\"explanation\":\"AWS organiza su infraestructura en regiones geográficas, y cada región suele tener varias zonas de disponibilidad aisladas entre sí.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué significa elasticidad en cloud?\",\"answer\":\"Poder aumentar o reducir recursos según la demanda\",\"options\":[\"Poder aumentar o reducir recursos según la demanda\",\"Usar siempre el mismo tamaño de servidor\",\"Tener los servidores apagados permanentemente\",\"Comprar hardware con más memoria RAM\"],\"explanation\":\"La elasticidad permite adaptar los recursos a la carga real, reduciendo desperdicio y mejorando disponibilidad.\",\"type\":\"multiple_choice\"},{\"question\":\"En el modelo de responsabilidad compartida, ¿qué suele ser responsabilidad del cliente?\",\"answer\":\"La configuración de permisos, datos y recursos dentro de su cuenta\",\"options\":[\"La seguridad física de los centros de datos de AWS\",\"La configuración de permisos, datos y recursos dentro de su cuenta\",\"El mantenimiento eléctrico de los CPD de AWS\",\"La sustitución de hardware físico en AWS\"],\"explanation\":\"AWS protege la infraestructura de la nube, pero el cliente debe configurar correctamente accesos, datos, redes y servicios que usa.\",\"type\":\"multiple_choice\"}]"
        },
        "previousQuizBank": "[{\"question\":\"¿Qué propiedad permite que un servicio cloud ajuste recursos según la demanda?\",\"answer\":\"Elasticidad\",\"options\":[\"Elasticidad\",\"Latencia fija\",\"Cableado local\"],\"explanation\":\"La elasticidad permite aumentar o reducir recursos según la demanda.\"}]"
      },
      {
        "oldTitle": "Amazon EC2",
        "title": "Amazon EC2",
        "changed": {
          "position": 2,
          "contents": "[\"Qué es EC2\",\"Tipos de instancia\",\"Tipos de instancia elegibles para el plan gratuito (p. ej. t3.micro; comprobar la lista con aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true)\",\"AMI\",\"Pares de claves\",\"Security Groups\",\"Acceso SSH\",\"User Data básico\"]",
          "official_resources": "[{\"label\":\"Amazon EC2\",\"url\":\"https://aws.amazon.com/es/ec2/instance-types/\"},{\"label\":\"Seguimiento del uso de Free Tier en Amazon EC2 (tipos elegibles)\",\"url\":\"https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html\"}]",
          "practical_activity": "[\"Crear una instancia EC2 Linux con un tipo de instancia elegible para Free Tier (p. ej. t3.micro)\",\"Acceder por SSH\",\"Instalar Nginx\",\"Publicar una página HTML simple\",\"Terminar la instancia al acabar la práctica\"]",
          "quiz_bank": "[{\"question\":\"¿Qué es Amazon EC2?\",\"answer\":\"Un servicio de máquinas virtuales en la nube\",\"options\":[\"Un servicio de máquinas virtuales en la nube\",\"Un servicio exclusivo de bases de datos relacionales\",\"Una herramienta para editar código\",\"Un sistema de correo electrónico\"],\"explanation\":\"EC2 permite crear y administrar instancias de cómputo, equivalentes a servidores virtuales.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué sirve una AMI en EC2?\",\"answer\":\"Para definir la imagen base desde la que se lanza una instancia\",\"options\":[\"Para definir la imagen base desde la que se lanza una instancia\",\"Para abrir puertos de red\",\"Para crear buckets S3\",\"Para configurar alarmas de coste\"],\"explanation\":\"Una AMI contiene el sistema operativo y configuración base para lanzar una instancia EC2.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué función cumple un Security Group asociado a una EC2?\",\"answer\":\"Controlar el tráfico permitido hacia y desde la instancia\",\"options\":[\"Controlar el tráfico permitido hacia y desde la instancia\",\"Aumentar automáticamente la CPU de la instancia\",\"Guardar copias de seguridad de S3\",\"Crear usuarios del sistema operativo\"],\"explanation\":\"Los Security Groups actúan como firewall virtual para controlar tráfico entrante y saliente.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué se usa normalmente una key pair en EC2 Linux?\",\"answer\":\"Para conectarse de forma segura por SSH\",\"options\":[\"Para conectarse de forma segura por SSH\",\"Para crear un bucket\",\"Para activar CloudWatch\",\"Para borrar una VPC\"],\"explanation\":\"La key pair permite autenticarse en la instancia Linux mediante SSH.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué diferencia general hay entre detener y terminar una instancia EC2?\",\"answer\":\"Detener la apaga temporalmente; terminarla la elimina\",\"options\":[\"Detener la apaga temporalmente; terminarla la elimina\",\"Detenerla borra siempre todos los datos de S3\",\"Terminarla solo reinicia el sistema operativo\",\"No hay ninguna diferencia\"],\"explanation\":\"Detener una instancia la apaga, mientras que terminarla implica eliminarla como recurso EC2.\",\"type\":\"multiple_choice\"}]"
        },
        "previousQuizBank": "[{\"question\":\"¿Qué recurso define las reglas de tráfico de una instancia EC2?\",\"answer\":\"Security group\",\"options\":[\"Security group\",\"S3 bucket\",\"CloudWatch alarm\"],\"explanation\":\"El security group controla el tráfico entrante y saliente de la instancia.\"}]"
      },
      {
        "oldTitle": "Amazon S3",
        "title": "Amazon S3",
        "changed": {
          "position": 3,
          "quiz_bank": "[{\"question\":\"¿Qué tipo de almacenamiento ofrece principalmente Amazon S3?\",\"answer\":\"Almacenamiento de objetos\",\"options\":[\"Almacenamiento de objetos\",\"Máquinas virtuales\",\"Bases de datos relacionales\",\"Balanceadores de carga\"],\"explanation\":\"S3 es un servicio de almacenamiento de objetos, organizado en buckets y objetos.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué es un bucket en S3?\",\"answer\":\"Un contenedor lógico donde se almacenan objetos\",\"options\":[\"Un contenedor lógico donde se almacenan objetos\",\"Una máquina virtual Linux\",\"Una tabla de base de datos\",\"Un usuario IAM\"],\"explanation\":\"Los buckets son contenedores donde se almacenan objetos en S3.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué sirve el versionado en S3?\",\"answer\":\"Para conservar versiones anteriores de los objetos\",\"options\":[\"Para conservar versiones anteriores de los objetos\",\"Para aumentar la CPU de una EC2\",\"Para crear una VPC privada\",\"Para instalar Docker\"],\"explanation\":\"El versionado permite mantener varias versiones de un objeto y facilita recuperación ante cambios o borrados accidentales.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Cuál es una buena práctica general con buckets S3?\",\"answer\":\"Mantenerlos privados salvo que exista una necesidad clara de acceso público\",\"options\":[\"Hacerlos públicos siempre\",\"Mantenerlos privados salvo que exista una necesidad clara de acceso público\",\"Guardar claves de acceso dentro de los objetos\",\"Eliminar todas las políticas de seguridad\"],\"explanation\":\"Por seguridad, los buckets deben mantenerse privados salvo casos justificados como hosting estático público.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué se necesita para alojar una web estática en S3?\",\"answer\":\"Un bucket configurado para hosting estático y archivos como index.html\",\"options\":[\"Un bucket configurado para hosting estático y archivos como index.html\",\"Una instancia EC2 obligatoriamente\",\"Un clúster Kubernetes\",\"Una base de datos RDS\"],\"explanation\":\"S3 puede servir sitios web estáticos si el bucket está configurado para ello y contiene los archivos necesarios.\",\"type\":\"multiple_choice\"}]"
        },
        "previousQuizBank": "[{\"question\":\"¿Qué modelo de almacenamiento usa Amazon S3?\",\"answer\":\"Objetos\",\"options\":[\"Objetos\",\"Bloques locales\",\"Cintas magnéticas\"],\"explanation\":\"S3 almacena datos como objetos dentro de buckets.\"}]"
      },
      {
        "oldTitle": "AWS IAM",
        "title": "AWS IAM",
        "changed": {
          "position": 4,
          "quiz_bank": "[{\"question\":\"¿Qué permite gestionar AWS IAM?\",\"answer\":\"Identidades y permisos de acceso a recursos AWS\",\"options\":[\"Identidades y permisos de acceso a recursos AWS\",\"Únicamente máquinas virtuales\",\"Solo almacenamiento de objetos\",\"La temperatura de los centros de datos\"],\"explanation\":\"IAM permite administrar usuarios, grupos, roles y políticas de permisos.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué es una política IAM?\",\"answer\":\"Un documento que define permisos permitidos o denegados\",\"options\":[\"Un documento que define permisos permitidos o denegados\",\"Una instancia EC2\",\"Una subred privada\",\"Un bucket de S3\"],\"explanation\":\"Las políticas IAM describen acciones permitidas o denegadas sobre recursos.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué significa principio de mínimo privilegio?\",\"answer\":\"Dar solo los permisos necesarios para realizar una tarea\",\"options\":[\"Dar solo los permisos necesarios para realizar una tarea\",\"Dar siempre permisos de administrador\",\"No usar ningún usuario\",\"Abrir todos los puertos\"],\"explanation\":\"El mínimo privilegio reduce riesgos dando a cada identidad únicamente los permisos necesarios.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué ventaja tiene usar un rol IAM frente a credenciales permanentes en muchos escenarios?\",\"answer\":\"Permite usar permisos temporales y más controlados\",\"options\":[\"Permite usar permisos temporales y más controlados\",\"Evita tener que configurar red\",\"Convierte una EC2 en un bucket\",\"Desactiva CloudWatch\"],\"explanation\":\"Los roles permiten delegar permisos sin exponer claves permanentes en muchos casos.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Cuál de estas prácticas es más segura?\",\"answer\":\"Crear permisos específicos según necesidad y evitar claves compartidas\",\"options\":[\"Compartir una misma clave de acceso entre todo el equipo\",\"Crear permisos específicos según necesidad y evitar claves compartidas\",\"Usar siempre el usuario root para todo\",\"Publicar claves en el README\"],\"explanation\":\"Cada usuario o servicio debe tener permisos adecuados y trazabilidad propia.\",\"type\":\"multiple_choice\"}]"
        },
        "previousQuizBank": "[{\"question\":\"¿Qué principio recomienda conceder solo los permisos necesarios?\",\"answer\":\"Mínimo privilegio\",\"options\":[\"Mínimo privilegio\",\"Acceso anónimo\",\"Administrador permanente\"],\"explanation\":\"El mínimo privilegio reduce el impacto de credenciales o acciones comprometidas.\"}]"
      },
      {
        "oldTitle": "Amazon VPC y red en AWS",
        "title": "Amazon VPC y red en AWS",
        "changed": {
          "position": 5,
          "contents": "[\"Qué es una VPC\",\"Subred pública y privada\",\"Route tables\",\"Internet Gateway\",\"Security Groups\",\"NACL\",\"Costes de red: NAT Gateway y direcciones IPv4 públicas\"]",
          "official_resources": "[{\"label\":\"Amazon VPC FAQ\",\"url\":\"https://aws.amazon.com/es/vpc/faqs/\"},{\"label\":\"Buenas prácticas para el diseño de IPv4 en Amazon VPC\",\"url\":\"https://aws.amazon.com/es/blogs/aws-spanish/buenas-practicas-para-el-diseno-de-ipv4-para-su-amazon-vpc/\"},{\"label\":\"Precios de Amazon VPC\",\"url\":\"https://aws.amazon.com/vpc/pricing/\"}]",
          "practical_activity": "[\"Crear una VPC\",\"Crear una subred pública\",\"Asociar tabla de rutas\",\"Añadir Internet Gateway\",\"Lanzar una EC2 dentro de esa red\",\"Eliminar la VPC y sus recursos asociados al terminar (sin crear NAT Gateway en el laboratorio)\"]",
          "quiz_bank": "[{\"question\":\"¿Qué es una VPC en AWS?\",\"answer\":\"Una red virtual aislada donde desplegar recursos\",\"options\":[\"Una red virtual aislada donde desplegar recursos\",\"Un servicio de almacenamiento de objetos\",\"Un usuario administrador\",\"Una imagen Docker\"],\"explanation\":\"Una VPC permite definir una red virtual propia dentro de AWS.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué suele necesitar una subred pública para tener salida directa a Internet?\",\"answer\":\"Una ruta hacia un Internet Gateway\",\"options\":[\"Una ruta hacia un Internet Gateway\",\"Un bucket S3\",\"Un repositorio GitHub\",\"Un workflow de GitHub Actions\"],\"explanation\":\"Una subred pública suele tener una tabla de rutas que envía tráfico de Internet hacia un Internet Gateway.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué es una route table?\",\"answer\":\"Una tabla que define hacia dónde se dirige el tráfico de red\",\"options\":[\"Una tabla que define hacia dónde se dirige el tráfico de red\",\"Una tabla SQL en una base de datos\",\"Un listado de usuarios IAM\",\"Una lista de contenedores Docker\"],\"explanation\":\"Las route tables determinan cómo se enruta el tráfico dentro de una VPC.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué diferencia general hay entre Security Group y NACL?\",\"answer\":\"El Security Group se asocia normalmente a recursos como instancias; la NACL se aplica a nivel de subred\",\"options\":[\"El Security Group se asocia normalmente a recursos como instancias; la NACL se aplica a nivel de subred\",\"Ambos son exactamente iguales\",\"La NACL sirve para crear usuarios\",\"El Security Group sirve para almacenar objetos\"],\"explanation\":\"Security Groups y NACLs controlan tráfico a distintos niveles dentro de la arquitectura de red.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué significa CIDR en el contexto de una VPC?\",\"answer\":\"Un rango de direcciones IP asignado a una red o subred\",\"options\":[\"Un rango de direcciones IP asignado a una red o subred\",\"Un tipo de instancia EC2\",\"Un servicio de monitorización\",\"Un sistema de autenticación MFA\"],\"explanation\":\"CIDR se usa para definir rangos de direcciones IP en redes y subredes.\",\"type\":\"multiple_choice\"}]"
        },
        "previousQuizBank": "[{\"question\":\"¿Qué componente permite enrutar tráfico entre subredes y otros destinos?\",\"answer\":\"Route table\",\"options\":[\"Route table\",\"IAM policy\",\"S3 lifecycle\"],\"explanation\":\"La tabla de rutas determina los destinos del tráfico de una subred.\"}]"
      },
      {
        "oldTitle": "Amazon CloudWatch y observabilidad",
        "title": "Amazon CloudWatch y observabilidad",
        "changed": {
          "position": 6,
          "quiz_bank": "[{\"question\":\"¿Para qué sirve principalmente Amazon CloudWatch?\",\"answer\":\"Para monitorizar recursos, métricas, logs y alarmas\",\"options\":[\"Para monitorizar recursos, métricas, logs y alarmas\",\"Para crear imágenes Docker\",\"Para almacenar objetos estáticos\",\"Para editar código fuente\"],\"explanation\":\"CloudWatch es el servicio de observabilidad y monitorización de AWS.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué es una métrica?\",\"answer\":\"Un dato numérico medido a lo largo del tiempo\",\"options\":[\"Un dato numérico medido a lo largo del tiempo\",\"Un usuario IAM\",\"Un archivo HTML\",\"Una clave SSH\"],\"explanation\":\"Una métrica representa mediciones como CPU, memoria, latencia o número de errores.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué sirve una alarma en CloudWatch?\",\"answer\":\"Para reaccionar cuando una métrica supera o baja de un umbral\",\"options\":[\"Para reaccionar cuando una métrica supera o baja de un umbral\",\"Para crear una nueva cuenta AWS\",\"Para modificar automáticamente el código fuente\",\"Para convertir un bucket en una EC2\"],\"explanation\":\"Las alarmas permiten detectar condiciones anómalas y notificar o activar acciones.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Cuál es un ejemplo típico de alarma básica en una EC2?\",\"answer\":\"Alarma cuando la CPU supera cierto porcentaje durante varios minutos\",\"options\":[\"Alarma cuando la CPU supera cierto porcentaje durante varios minutos\",\"Alarma cuando se crea un README\",\"Alarma cuando Docker compila una imagen\",\"Alarma cuando se abre un editor de texto\"],\"explanation\":\"Monitorizar la CPU es una práctica sencilla para introducir observabilidad básica.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué diferencia general hay entre logs y métricas?\",\"answer\":\"Los logs son registros de eventos; las métricas son valores medidos en el tiempo\",\"options\":[\"Los logs son registros de eventos; las métricas son valores medidos en el tiempo\",\"Los logs son usuarios y las métricas son roles\",\"No hay diferencia\",\"Las métricas solo existen en Docker\"],\"explanation\":\"Logs y métricas son complementarios: los logs ayudan a entender qué pasó y las métricas muestran tendencias o estado.\",\"type\":\"multiple_choice\"}]"
        },
        "previousQuizBank": "[{\"question\":\"¿Qué dato representa una medición numérica recogida por CloudWatch?\",\"answer\":\"Métrica\",\"options\":[\"Métrica\",\"Grupo IAM\",\"Imagen AMI\"],\"explanation\":\"Las métricas son series temporales numéricas usadas para observar recursos y aplicaciones.\"}]"
      },
      {
        "oldTitle": "AWS CLI",
        "title": "AWS CLI",
        "changed": {
          "position": 7,
          "contents": "[\"Instalación de AWS CLI\",\"Autenticación recomendada: IAM Identity Center con aws configure sso y aws sso login (credenciales temporales)\",\"Perfiles\",\"Claves de acceso estáticas con aws configure: solo como excepción desaconsejada, con permisos mínimos, rotación y nunca en repositorios\",\"Comandos básicos sobre S3 y EC2\"]",
          "official_resources": "[{\"label\":\"Configurar la AWS CLI con IAM Identity Center (aws configure sso)\",\"url\":\"https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html\"},{\"label\":\"Introducción a IAM Identity Center\",\"url\":\"https://docs.aws.amazon.com/singlesignon/latest/userguide/getting-started.html\"},{\"label\":\"Protección de sus claves de acceso en AWS\",\"url\":\"https://aws.amazon.com/es/blogs/aws-spanish/proteccion-de-sus-claves-de-acceso-en-aws/\"},{\"label\":\"Cómo rotar las claves de acceso para usuarios de IAM\",\"url\":\"https://aws.amazon.com/es/blogs/aws-spanish/como-rotar-las-claves-de-acceso-para-los-usuarios-de-iam/\"}]",
          "practical_activity": "[\"Instalar AWS CLI\",\"Configurar un perfil con aws configure sso e iniciar sesión con aws sso login\",\"Ejecutar comando para listar buckets\",\"Ejecutar comando para listar instancias\"]",
          "evaluation": "Quiz sobre perfiles, credenciales temporales (IAM Identity Center) y comandos básicos.",
          "quiz_bank": "[{\"question\":\"¿Qué es AWS CLI?\",\"answer\":\"Una herramienta de línea de comandos para interactuar con servicios AWS\",\"options\":[\"Una herramienta de línea de comandos para interactuar con servicios AWS\",\"Un servicio exclusivo para crear dashboards\",\"Una base de datos\",\"Una distribución Linux\"],\"explanation\":\"AWS CLI permite ejecutar operaciones sobre servicios AWS desde terminal.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué comando configura el acceso a AWS CLI con IAM Identity Center y credenciales temporales?\",\"answer\":\"aws configure sso\",\"options\":[\"aws configure sso\",\"aws install docker\",\"terraform apply\",\"git commit\"],\"explanation\":\"aws configure sso crea un perfil con IAM Identity Center; después aws sso login obtiene credenciales temporales. aws configure con claves de acceso estáticas queda como excepción desaconsejada.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué sirven los perfiles en AWS CLI?\",\"answer\":\"Para gestionar distintas configuraciones o cuentas de AWS\",\"options\":[\"Para gestionar distintas configuraciones o cuentas de AWS\",\"Para crear automáticamente una VPC\",\"Para subir código a GitHub\",\"Para instalar Nginx en local\"],\"explanation\":\"Los perfiles permiten trabajar con diferentes cuentas, usuarios o configuraciones de región.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Cuál de estos comandos podría listar buckets S3?\",\"answer\":\"aws s3 ls\",\"options\":[\"aws s3 ls\",\"docker ps\",\"terraform init\",\"git branch\"],\"explanation\":\"aws s3 ls se usa para listar buckets o contenido de S3, según cómo se ejecute.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Cuál es una buena práctica con claves de acceso usadas por AWS CLI?\",\"answer\":\"No compartirlas y aplicar mínimo privilegio\",\"options\":[\"No compartirlas y aplicar mínimo privilegio\",\"Publicarlas en GitHub para facilitar el trabajo\",\"Usarlas siempre con permisos de administrador\",\"Mandarlas por correo a todo el equipo\"],\"explanation\":\"Las claves deben protegerse, rotarse cuando proceda y tener permisos mínimos.\",\"type\":\"multiple_choice\"}]"
        },
        "previousQuizBank": "[{\"question\":\"¿Qué comando consulta información de una instancia EC2?\",\"answer\":\"aws ec2 describe-instances\",\"options\":[\"aws ec2 describe-instances\",\"aws s3 sync-only\",\"aws iam run-server\"],\"explanation\":\"describe-instances devuelve la configuración y estado de instancias EC2.\",\"type\":\"code_snippet\"}]"
      },
      {
        "oldTitle": "Terraform",
        "title": "Terraform",
        "changed": {
          "position": 8,
          "practical_activity": "[\"Crear una EC2 (tipo elegible para Free Tier) o un bucket S3 con Terraform\",\"Ejecutar terraform init\",\"Ejecutar terraform plan\",\"Ejecutar terraform apply\",\"Ejecutar terraform destroy al terminar para no dejar recursos activos\"]",
          "quiz_bank": "[{\"question\":\"¿Qué es Terraform?\",\"answer\":\"Una herramienta de Infraestructura como Código\",\"options\":[\"Una herramienta de Infraestructura como Código\",\"Un servicio de correo electrónico\",\"Un sistema operativo\",\"Un editor de vídeo\"],\"explanation\":\"Terraform permite definir y gestionar infraestructura mediante archivos declarativos.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué sirve terraform init?\",\"answer\":\"Para inicializar el directorio de trabajo y descargar providers necesarios\",\"options\":[\"Para inicializar el directorio de trabajo y descargar providers necesarios\",\"Para borrar todos los recursos directamente\",\"Para crear una imagen Docker\",\"Para hacer commit en GitHub\"],\"explanation\":\"terraform init prepara el proyecto y descarga los providers requeridos.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué muestra terraform plan?\",\"answer\":\"Los cambios que Terraform propone aplicar\",\"options\":[\"Los cambios que Terraform propone aplicar\",\"Los logs de una instancia EC2\",\"Los usuarios conectados por SSH\",\"El contenido de un contenedor Docker\"],\"explanation\":\"terraform plan permite revisar qué cambios se aplicarán antes de ejecutarlos.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué sirve terraform apply?\",\"answer\":\"Para aplicar los cambios definidos en la configuración\",\"options\":[\"Para aplicar los cambios definidos en la configuración\",\"Para abrir una pull request\",\"Para listar contenedores\",\"Para configurar MFA\"],\"explanation\":\"terraform apply ejecuta los cambios necesarios para que la infraestructura coincida con el código.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Por qué es útil versionar código Terraform en Git?\",\"answer\":\"Porque permite revisar cambios, colaborar y mantener histórico de la infraestructura\",\"options\":[\"Porque permite revisar cambios, colaborar y mantener histórico de la infraestructura\",\"Porque evita pagar cualquier recurso de AWS\",\"Porque sustituye todos los servicios de AWS\",\"Porque convierte automáticamente una app en contenedor\"],\"explanation\":\"La infraestructura como código debe tratarse como código: revisable, versionable y colaborativa.\",\"type\":\"multiple_choice\"}]"
        },
        "previousQuizBank": "[{\"question\":\"¿Qué archivo suele declarar la configuración principal de Terraform?\",\"answer\":\"main.tf\",\"options\":[\"main.tf\",\"Dockerfile\",\"package-lock.json\"],\"explanation\":\"Los archivos .tf contienen la configuración declarativa de Terraform.\"}]"
      },
      {
        "oldTitle": "Docker",
        "title": "Docker",
        "changed": {
          "position": 9,
          "quiz_bank": "[{\"question\":\"¿Qué es una imagen Docker?\",\"answer\":\"Una plantilla inmutable para crear contenedores\",\"options\":[\"Una plantilla inmutable para crear contenedores\",\"Una máquina física\",\"Una alarma de CloudWatch\",\"Una política IAM\"],\"explanation\":\"Una imagen contiene la aplicación y sus dependencias, y sirve para crear contenedores.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué es un contenedor Docker?\",\"answer\":\"Una instancia en ejecución de una imagen\",\"options\":[\"Una instancia en ejecución de una imagen\",\"Un bucket S3\",\"Una VPC\",\"Una key pair de EC2\"],\"explanation\":\"Un contenedor es una ejecución aislada basada en una imagen Docker.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué sirve un Dockerfile?\",\"answer\":\"Para definir cómo construir una imagen Docker\",\"options\":[\"Para definir cómo construir una imagen Docker\",\"Para crear usuarios IAM\",\"Para configurar AWS Budgets\",\"Para modificar tablas de rutas\"],\"explanation\":\"El Dockerfile contiene las instrucciones necesarias para construir una imagen.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué comando se usa habitualmente para construir una imagen Docker?\",\"answer\":\"docker build\",\"options\":[\"docker build\",\"aws configure\",\"terraform plan\",\"git pull-request\"],\"explanation\":\"docker build construye una imagen a partir de un Dockerfile y un contexto.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué sirve mapear puertos al ejecutar un contenedor?\",\"answer\":\"Para permitir acceder desde fuera al servicio que corre dentro del contenedor\",\"options\":[\"Para permitir acceder desde fuera al servicio que corre dentro del contenedor\",\"Para borrar una imagen\",\"Para crear un usuario AWS\",\"Para activar MFA\"],\"explanation\":\"El mapeo de puertos permite exponer servicios internos del contenedor hacia el host.\",\"type\":\"multiple_choice\"}]"
        },
        "previousQuizBank": "[{\"question\":\"¿Qué instrucción define la imagen base de un Dockerfile?\",\"answer\":\"FROM\",\"options\":[\"FROM\",\"PULLBASE\",\"USEIMAGE\"],\"explanation\":\"FROM inicia un Dockerfile indicando la imagen base.\",\"type\":\"code_snippet\"}]"
      },
      {
        "oldTitle": "GitHub Actions",
        "title": "GitHub Actions",
        "changed": {
          "position": 10,
          "official_resources": "[{\"label\":\"Descripción de GitHub Actions\",\"url\":\"https://docs.github.com/es/actions/get-started/understand-github-actions\"},{\"label\":\"Quickstart de GitHub Actions\",\"url\":\"https://docs.github.com/es/actions/get-started/quickstart\"}]",
          "quiz_bank": "[{\"question\":\"¿Qué es GitHub Actions?\",\"answer\":\"Una plataforma para automatizar workflows de CI/CD dentro de GitHub\",\"options\":[\"Una plataforma para automatizar workflows de CI/CD dentro de GitHub\",\"Un servicio de almacenamiento de objetos\",\"Un tipo de instancia EC2\",\"Una herramienta para crear VPCs manualmente\"],\"explanation\":\"GitHub Actions permite automatizar tareas como validación, build, test y despliegue.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué es un workflow en GitHub Actions?\",\"answer\":\"Un proceso automatizado definido normalmente en un archivo YAML\",\"options\":[\"Un proceso automatizado definido normalmente en un archivo YAML\",\"Un usuario IAM\",\"Una imagen AMI\",\"Una tabla de rutas\"],\"explanation\":\"Un workflow define qué acciones se ejecutan, cuándo y bajo qué condiciones.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué es un trigger en GitHub Actions?\",\"answer\":\"El evento que dispara la ejecución de un workflow\",\"options\":[\"El evento que dispara la ejecución de un workflow\",\"Una clave SSH de EC2\",\"Un tipo de bucket\",\"Un contenedor en ejecución\"],\"explanation\":\"Un trigger puede ser, por ejemplo, un push, una pull request o una ejecución manual.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué sirven los secrets en GitHub Actions?\",\"answer\":\"Para almacenar valores sensibles de forma segura, como tokens o claves\",\"options\":[\"Para almacenar valores sensibles de forma segura, como tokens o claves\",\"Para hacer público el código fuente\",\"Para crear un bucket automáticamente sin permisos\",\"Para borrar los logs del workflow\"],\"explanation\":\"Los secrets permiten usar valores sensibles sin escribirlos directamente en el código del repositorio.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Cuál sería un ejemplo sencillo de CI?\",\"answer\":\"Ejecutar automáticamente validaciones o tests cuando se hace push\",\"options\":[\"Ejecutar automáticamente validaciones o tests cuando se hace push\",\"Crear manualmente una instancia cada mañana\",\"Apagar el router local\",\"Subir claves privadas al repositorio\"],\"explanation\":\"La integración continua busca validar cambios de código de forma automática y repetible.\",\"type\":\"multiple_choice\"}]"
        },
        "previousQuizBank": "[{\"question\":\"¿Dónde se define normalmente un workflow de GitHub Actions?\",\"answer\":\".github/workflows\",\"options\":[\".github/workflows\",\".git/hooks/remote\",\"actions.config\"],\"explanation\":\"Los workflows se guardan como YAML dentro de .github/workflows.\"}]"
      },
      {
        "oldTitle": "Proyecto final",
        "title": "Proyecto final",
        "changed": {
          "position": 11,
          "official_resources": "[{\"label\":\"AWS Skill Builder: aprendizaje inmersivo (Builder Labs, Cloud Quest y Jam)\",\"url\":\"https://aws.amazon.com/training/digital/immersive-learning/\"}]"
        }
      }
    ],
    "inserts": [
      {
        "position": 1,
        "title": "Cuenta AWS, Free Tier, seguridad inicial y control de costes",
        "duration": "1 semana",
        "duration_weeks_min": 1,
        "duration_weeks_max": 1,
        "level": "beginner",
        "objective": "Crear una cuenta AWS de forma segura, entender los límites del plan gratuito y adquirir los hábitos básicos para no generar costes inesperados.",
        "contents": "[\"Crear la cuenta AWS y elegir el plan gratuito (Free plan) o de pago\",\"Plan gratuito actual: 100 USD de créditos de bienvenida más hasta 100 USD adicionales por completar actividades; la cuenta gratuita termina a los 6 meses o al agotar los créditos, lo que ocurra antes\",\"Al terminar el plan gratuito la cuenta se cierra; hay 90 días para pasar al plan de pago antes de perder los datos\",\"El plan gratuito solo da acceso a servicios seleccionados; el resto exige pasar al plan de pago\",\"Las cuentas creadas antes del 15 de julio de 2025 siguen el modelo antiguo de 12 meses; el plan basado en créditos se aplica a las cuentas nuevas\",\"Activar MFA en el usuario root y no usarlo para el trabajo diario\",\"Crear una alerta de presupuesto con AWS Budgets y revisar el consumo con Billing and Cost Management\",\"Estimar costes con AWS Pricing Calculator antes de desplegar\",\"Costes frecuentes que sorprenden: NAT Gateway, direcciones IPv4 públicas (se cobran por hora, estén en uso o no) y Elastic IPs sin asociar\",\"Hábito de limpieza: eliminar o terminar los recursos al acabar cada laboratorio\"]",
        "importance": "Abrir una cuenta sin proteger el usuario root ni vigilar el consumo es la causa más habitual de sustos de facturación y de incidentes de seguridad. Este módulo fija los hábitos que se aplican en todos los laboratorios posteriores.",
        "official_resources": "[{\"label\":\"Elegir un plan de AWS Free Tier (plan gratuito y plan de pago)\",\"url\":\"https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html\"},{\"label\":\"Seguimiento del uso de AWS Free Tier\",\"url\":\"https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/tracking-free-tier-usage.html\"},{\"label\":\"Activar MFA para el usuario root\",\"url\":\"https://docs.aws.amazon.com/IAM/latest/UserGuide/enable-mfa-for-root.html\"},{\"label\":\"Crear un presupuesto de costes con AWS Budgets\",\"url\":\"https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html\"},{\"label\":\"AWS Pricing Calculator\",\"url\":\"https://calculator.aws/\"},{\"label\":\"Precios de Amazon VPC (IPv4 públicas y NAT Gateway)\",\"url\":\"https://aws.amazon.com/vpc/pricing/\"}]",
        "support_videos": "[]",
        "practical_activity": "[\"Crear la cuenta AWS (o usar la cuenta de laboratorio asignada) y revisar el plan activo en Billing\",\"Activar MFA en el usuario root\",\"Crear una alerta de presupuesto con aviso por correo\",\"Redactar una lista de comprobación de limpieza de recursos para usar al final de cada práctica\"]",
        "deliverable_evidence": "[\"Captura de la alerta de presupuesto creada (sin datos personales)\",\"Captura de MFA activo en root (ocultando datos sensibles)\",\"Lista de comprobación de limpieza de recursos\"]",
        "evaluation": "Quiz sobre plan gratuito, MFA, presupuestos y control de costes.",
        "quiz_bank": "[{\"question\":\"¿Por qué es importante configurar alertas de presupuesto al empezar con AWS?\",\"answer\":\"Porque ayudan a detectar gastos inesperados\",\"options\":[\"Porque impiden aprender servicios nuevos\",\"Porque ayudan a detectar gastos inesperados\",\"Porque eliminan automáticamente todos los recursos\",\"Porque sustituyen a IAM\"],\"explanation\":\"AWS Budgets permite crear alertas para controlar costes y evitar sorpresas de facturación.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Qué significa activar MFA en una cuenta AWS?\",\"answer\":\"Añadir un segundo factor de autenticación para mejorar la seguridad\",\"options\":[\"Añadir un segundo factor de autenticación para mejorar la seguridad\",\"Duplicar automáticamente todos los recursos\",\"Crear una VPC privada\",\"Desactivar la facturación\"],\"explanation\":\"MFA añade una capa adicional de seguridad, normalmente mediante una app o dispositivo de autenticación.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Cuál es una buena práctica al finalizar una práctica en AWS?\",\"answer\":\"Eliminar o apagar los recursos que ya no sean necesarios\",\"options\":[\"Dejar todos los recursos encendidos por si se necesitan algún día\",\"Eliminar o apagar los recursos que ya no sean necesarios\",\"Compartir las claves de acceso con el resto de alumnos\",\"Desactivar todas las alertas de coste\"],\"explanation\":\"Limpiar recursos evita costes innecesarios y fomenta buenas prácticas operativas.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Para qué sirve AWS Pricing Calculator?\",\"answer\":\"Para estimar costes de servicios antes de desplegarlos\",\"options\":[\"Para estimar costes de servicios antes de desplegarlos\",\"Para crear usuarios IAM automáticamente\",\"Para conectarse por SSH a EC2\",\"Para crear contenedores Docker\"],\"explanation\":\"AWS Pricing Calculator permite estimar costes aproximados de uso de servicios.\",\"type\":\"multiple_choice\"},{\"question\":\"¿Cuál es el mayor riesgo de usar una cuenta AWS sin control de costes?\",\"answer\":\"Que se generen cargos inesperados\",\"options\":[\"Que no se puedan crear usuarios\",\"Que se generen cargos inesperados\",\"Que S3 deje de funcionar\",\"Que no se pueda usar GitHub\"],\"explanation\":\"Algunos recursos generan coste si se dejan activos (p. ej. NAT Gateway o IPv4 públicas), y el plan gratuito actual termina a los 6 meses o al agotar los créditos.\",\"type\":\"multiple_choice\"}]"
      }
    ]
  },
  {
    "roadmapTitle": "Roadmap IA para SRE/DevOps - Versión 2.0",
    "roadmapChanges": {},
    "modules": [
      {
        "oldTitle": "Fundamentos de IA, GenAI y modelos fundacionales",
        "title": "Fundamentos de IA, GenAI y modelos fundacionales",
        "changed": {
          "support_videos": "[{\"label\":\"LinkedIn Learning - Artificial Intelligence Foundations\",\"url\":\"https://www.linkedin.com/learning/topics/ai-foundations-and-literacy\"},{\"label\":\"Udemy Business - Buscar: Generative AI fundamentals, AI for beginners, Azure OpenAI fundamentals\",\"url\":\"https://www.udemy.com/\"}]"
        }
      },
      {
        "oldTitle": "Python aplicado a AI Engineering",
        "title": "Python aplicado a AI Engineering",
        "changed": {
          "official_resources": "[{\"label\":\"FastAPI Docs - FastAPI Documentation\",\"url\":\"https://fastapi.tiangolo.com/\"},{\"label\":\"Pydantic Docs - Pydantic Documentation\",\"url\":\"https://pydantic.dev/docs/\"}]"
        }
      },
      {
        "oldTitle": "Plataformas cloud de IA: Azure OpenAI, AWS Bedrock y Google Vertex AI",
        "title": "Plataformas cloud de IA: Azure OpenAI, AWS Bedrock y Google Gemini Enterprise Agent Platform (antes Vertex AI)",
        "changed": {
          "title": "Plataformas cloud de IA: Azure OpenAI, AWS Bedrock y Google Gemini Enterprise Agent Platform (antes Vertex AI)",
          "contents": "[\"Azure AI Foundry / Azure OpenAI\",\"AWS Bedrock\",\"Google Gemini Enterprise Agent Platform (antes Vertex AI) / Gemini\",\"model catalog\",\"quotas\",\"costes\",\"seguridad\",\"red privada\",\"IAM/RBAC\"]",
          "official_resources": "[{\"label\":\"Microsoft Learn - Azure AI Fundamentals (examen AI-901)\",\"url\":\"https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-fundamentals/\"},{\"label\":\"AWS Skill Builder - Generative AI\",\"url\":\"https://skillbuilder.aws/generative-ai\"},{\"label\":\"Google Skills - Machine learning and artificial intelligence training\",\"url\":\"https://cloud.google.com/learn/training/machinelearning-ai\"},{\"label\":\"Google Skills - Explore Generative AI with the Gemini API in Vertex AI\",\"url\":\"https://www.skills.google/course_templates/959\"},{\"label\":\"Udemy Business - Azure OpenAI Services - The Complete Guide\",\"url\":\"https://www.udemy.com/course/azure-chatgpt-and-openai-service-the-complete-guide/\"},{\"label\":\"Udemy Business - LangChain on Azure - Building Scalable LLM Applications\",\"url\":\"https://www.udemy.com/course/langchain-on-azure-building-scalable-llm-applications/\"}]",
          "practical_activity": "[\"Cloud AI Provider Comparison\",\"Comparativa práctica de Azure OpenAI, AWS Bedrock y Gemini Enterprise Agent Platform (antes Vertex AI) para un caso RAG SRE.\",\"Tabla de costes aproximados\",\"IAM/RBAC requerido\",\"opciones de red privada\",\"monitorización\",\"restricciones de datos\",\"ventajas/inconvenientes\"]"
        }
      },
      {
        "oldTitle": "Seguridad, privacidad y gobierno de IA",
        "title": "Seguridad, privacidad y gobierno de IA",
        "changed": {
          "official_resources": "[{\"label\":\"OWASP - OWASP Top 10 for Large Language Model Applications\",\"url\":\"https://owasp.org/projects/top-10-for-large-language-model-applications\"},{\"label\":\"OWASP Gen AI Security Project - OWASP Top 10 for LLMs and Gen AI Apps\",\"url\":\"https://genai.owasp.org/llm-top-10/\"},{\"label\":\"NIST - AI Risk Management Framework\",\"url\":\"https://www.nist.gov/itl/ai-risk-management-framework\"}]"
        }
      },
      {
        "oldTitle": "Proyecto final y posicionamiento profesional",
        "title": "Proyecto final y posicionamiento profesional",
        "changed": {
          "practical_activity": "[\"AI Incident Copilot\",\"Copiloto SRE que analiza alertas, logs y eventos de Kubernetes/OpenShift, consulta runbooks por RAG y propone diagnóstico, mitigación y comunicación.\",\"Debe incluir: FastAPI\",\"Debe incluir: RAG\",\"Debe incluir: tool calling simulado\",\"Debe incluir: Docker\",\"Debe incluir: Kubernetes/OpenShift manifests\",\"Debe incluir: Prometheus/Grafana\",\"Debe incluir: Langfuse o MLflow\",\"Debe incluir: controles OWASP LLM\",\"Runbook RAG Assistant\",\"Asistente RAG sobre documentación técnica con referencias, feedback, evaluación y trazabilidad.\",\"Debe incluir: ingesta de documentos\",\"Debe incluir: vector store\",\"Debe incluir: respuestas con fuentes\",\"Debe incluir: evaluación\",\"Debe incluir: dashboard\",\"LLMOps Starter Kit\",\"Plantilla reutilizable para desplegar apps LLM con CI/CD, observabilidad, prompt management, seguridad y documentación.\",\"Debe incluir: estructura limpia\",\"Debe incluir: CI/CD\",\"Debe incluir: Dockerfile\",\"Debe incluir: Helm/Kustomize\",\"Debe incluir: tests\",\"Debe incluir: README profesional\",\"Debe incluir: ADR\",\"Headline LinkedIn: SRE / DevOps especializado en AI Platform, MLOps y LLMOps\",\"About LinkedIn: SRE/DevOps con experiencia en Kubernetes/OpenShift, observabilidad, CI/CD y operación de plataformas críticas, especializado en llevar soluciones de IA generativa a producción mediante RAG, LLMOps, seguridad, trazabilidad y automatización de incidentes.\",\"Skill CV/LinkedIn: Generative AI\",\"Skill CV/LinkedIn: LLMOps\",\"Skill CV/LinkedIn: MLOps\",\"Skill CV/LinkedIn: RAG\",\"Skill CV/LinkedIn: Prompt Engineering\",\"Skill CV/LinkedIn: AI Observability\",\"Skill CV/LinkedIn: AI Governance\",\"Skill CV/LinkedIn: KServe\",\"Skill CV/LinkedIn: LangChain\",\"Skill CV/LinkedIn: Langfuse\",\"Skill CV/LinkedIn: MLflow\",\"Skill CV/LinkedIn: Azure OpenAI\",\"Skill CV/LinkedIn: AWS Bedrock\",\"Skill CV/LinkedIn: Google Gemini Enterprise Agent Platform (antes Vertex AI)\"]"
        }
      }
    ],
    "inserts": []
  },
  {
    "roadmapTitle": "Roadmap desde 0 a DevOps Junior",
    "roadmapChanges": {},
    "modules": [
      {
        "oldTitle": "Fase 1 - Linux y Bash Scripting",
        "title": "Fase 1 - Linux y Bash Scripting",
        "changed": {
          "official_resources": "[{\"label\":\"GNU Bash Reference Manual\",\"url\":\"https://www.gnu.org/software/bash/manual/bash.html\"},{\"label\":\"GNU Grep Manual\",\"url\":\"https://www.gnu.org/software/grep/manual/grep.html\"},{\"label\":\"GNU sed Manual\",\"url\":\"https://www.gnu.org/software/sed/manual/sed.html\"},{\"label\":\"GNU Awk Manual\",\"url\":\"https://www.gnu.org/software/gawk/manual/gawk.html\"},{\"label\":\"Everything curl\",\"url\":\"https://everything.curl.dev/\"},{\"label\":\"Linux Journey\",\"url\":\"https://labex.io/linuxjourney\"}]"
        }
      },
      {
        "oldTitle": "Fase 1 - Cloud básico: AWS, GCP o Azure",
        "title": "Fase 1 - Cloud básico: AWS, GCP o Azure",
        "changed": {
          "official_resources": "[{\"label\":\"AWS - Get started with Amazon EC2 (lanzar una instancia Linux)\",\"url\":\"https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html\"},{\"label\":\"Amazon S3 Getting Started\",\"url\":\"https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html\"},{\"label\":\"Google Cloud - Create and start a VM instance\",\"url\":\"https://docs.cloud.google.com/compute/docs/instances/create-start-instance\"},{\"label\":\"Azure - Quickstart Linux VM\",\"url\":\"https://learn.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-portal\"}]"
        }
      },
      {
        "oldTitle": "Fase 2 - Ansible y configuration management",
        "title": "Fase 2 - Ansible y configuration management",
        "changed": {
          "official_resources": "[{\"label\":\"Ansible Getting Started\",\"url\":\"https://docs.ansible.com/projects/ansible/latest/getting_started/index.html\"},{\"label\":\"Ansible inventory guide\",\"url\":\"https://docs.ansible.com/projects/ansible/latest/inventory_guide/intro_inventory.html\"},{\"label\":\"Ansible playbook guide\",\"url\":\"https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_intro.html\"},{\"label\":\"Ansible builtin modules\",\"url\":\"https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/\"}]"
        }
      },
      {
        "oldTitle": "Fase 3 - Helm y GitOps",
        "title": "Fase 3 - Helm y GitOps",
        "changed": {
          "support_videos": "[{\"label\":\"Canal CNCF\",\"url\":\"https://www.youtube.com/@cncf\"},{\"label\":\"Buscar en YouTube: Helm ArgoCD GitOps español\",\"url\":\"https://www.youtube.com/results?search_query=helm+argocd+gitops+espa%C3%B1ol\"}]"
        }
      },
      {
        "oldTitle": "Fase 4 - Pipeline de CI/CD",
        "title": "Fase 4 - Pipeline de CI/CD",
        "changed": {
          "official_resources": "[{\"label\":\"GitHub Actions Docs\",\"url\":\"https://docs.github.com/en/actions\"},{\"label\":\"GitHub Actions Quickstart\",\"url\":\"https://docs.github.com/en/actions/get-started/quickstart\"},{\"label\":\"GitLab CI/CD Quick Start\",\"url\":\"https://docs.gitlab.com/ci/quick_start/\"},{\"label\":\"Argo CD Getting Started\",\"url\":\"https://argo-cd.readthedocs.io/en/stable/getting_started/\"}]"
        }
      },
      {
        "oldTitle": "Fase 4 - Seguridad y hardening",
        "title": "Fase 4 - Seguridad y hardening",
        "changed": {
          "contents": "[\"Escaneo de imágenes con Trivy\",\"Escaneo IaC con Trivy o Checkov\",\"Higiene de la cadena de suministro: fijar GitHub Actions por SHA, verificar firmas o digests de las versiones y rotar secretos tras un incidente (caso Trivy v0.69.4, CVE-2026-33634)\",\"Principio de mínimo privilegio\",\"No ejecutar contenedores como root cuando sea posible\",\"Gestión de secretos\",\"Validaciones de seguridad en pipeline\",\"Criterios de aceptación y riesgo\"]",
          "official_resources": "[{\"label\":\"Trivy installation\",\"url\":\"https://www.trivy.dev/docs/latest/getting-started/installation/\"},{\"label\":\"Trivy container image scanning\",\"url\":\"https://www.trivy.dev/docs/latest/guide/target/container_image/\"},{\"label\":\"Trivy Terraform scanning\",\"url\":\"https://www.trivy.dev/docs/latest/guide/coverage/iac/terraform/\"},{\"label\":\"Aviso de seguridad de Trivy: compromiso de la cadena de suministro (CVE-2026-33634)\",\"url\":\"https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23\"},{\"label\":\"Checkov Quick Start\",\"url\":\"https://www.checkov.io/1.Welcome/Quick%20Start.html\"},{\"label\":\"Kubernetes Security Checklist\",\"url\":\"https://kubernetes.io/docs/concepts/security/security-checklist/\"}]",
          "support_videos": "[{\"label\":\"Canal Aqua Security\",\"url\":\"https://www.youtube.com/@AquaSec\"},{\"label\":\"Buscar en YouTube: Trivy Checkov DevSecOps español\",\"url\":\"https://www.youtube.com/results?search_query=trivy+checkov+devsecops+espa%C3%B1ol\"}]"
        }
      }
    ],
    "inserts": []
  }
]

async function applyModuleFix(db: Kysely<any>, roadmapId: number, fix: ModuleFix) {
  const rows: Array<{ id: number; quiz_bank: string | null }> = await db
    .selectFrom('modules')
    .select(['id', 'quiz_bank'])
    .where('roadmap_id', '=', roadmapId)
    .where('title', 'in', [fix.oldTitle, fix.title])
    .orderBy('id')
    .execute()

  if (rows.length === 0) {
    console.warn(`[0005] Module "${fix.oldTitle}" not found in roadmap ${roadmapId}: skipped.`)
    return
  }

  for (const row of rows) {
    const changes: Columns = { ...fix.changed }
    if ('quiz_bank' in changes) {
      const untouched = row.quiz_bank === null
        || row.quiz_bank === fix.previousQuizBank
        || row.quiz_bank === changes.quiz_bank
      if (!untouched) {
        console.warn(`[0005] Module ${row.id} ("${fix.title}") has a customised quiz bank: kept.`)
        delete changes.quiz_bank
      }
    }
    if (Object.keys(changes).length === 0) continue
    await db.updateTable('modules').set(changes).where('id', '=', row.id).execute()
  }
}

async function applyRoadmapFix(db: Kysely<any>, fix: RoadmapFix) {
  const roadmaps: Array<{ id: number }> = await db
    .selectFrom('roadmaps')
    .select('id')
    .where('title', '=', fix.roadmapTitle)
    .orderBy('id')
    .execute()

  if (roadmaps.length === 0) {
    console.warn(`[0005] Roadmap "${fix.roadmapTitle}" not found: skipped.`)
    return
  }

  for (const { id: roadmapId } of roadmaps) {
    if (Object.keys(fix.roadmapChanges).length > 0) {
      await db.updateTable('roadmaps').set(fix.roadmapChanges).where('id', '=', roadmapId).execute()
    }

    // Existing modules first (this shifts the AWS positions), then the new ones.
    for (const moduleFix of fix.modules) {
      await applyModuleFix(db, roadmapId, moduleFix)
    }

    for (const columns of fix.inserts) {
      const existing = await db
        .selectFrom('modules')
        .select('id')
        .where('roadmap_id', '=', roadmapId)
        .where('title', '=', columns.title as string)
        .executeTakeFirst()
      if (existing) continue
      await db.insertInto('modules').values({ roadmap_id: roadmapId, ...columns }).execute()
    }
  }
}

export async function up(db: Kysely<any>): Promise<void> {
  const { count } = await db
    .selectFrom('roadmaps')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .executeTakeFirstOrThrow()
  // Fresh database: the seed will insert the current content.
  if (Number(count) === 0) return

  for (const fix of FIXES) {
    await applyRoadmapFix(db, fix)
  }
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Intentionally a no-op: the pre-fix content cannot be reconstructed.
}
