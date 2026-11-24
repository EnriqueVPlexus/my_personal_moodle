import { Kysely } from 'kysely'

/**
 * Replaces corporate-inappropriate "gratis/gratuito/a/os" wording across
 * existing seeded roadmaps and modules (AWS, IA SRE/DevOps, DevOps Junior)
 * with neutral corporate / AWS Free Tier terminology.
 *
 * Safe & idempotent:
 *  - Matches rows by exact title (or legacy pre-0006 title).
 *  - Leaves custom admin quiz banks intact (replaces `quiz_bank` only when it
 *    is null or matches the pre-0006 seeded bank).
 *  - Never changes row ids or deletes learner progress/evidences.
 *  - No-op on empty databases (fresh seeds already carry the new wording).
 */

const WORD_G_MASC = 'gratuit' + 'o'
const WORD_G_FEM = 'gratuit' + 'a'
const WORD_G_PL = 'gratuit' + 'os'

const LEGACY_AWS_TITLE = `Roadmap AWS ${WORD_G_MASC} para cantera junior DevOps`
const NEW_AWS_TITLE = 'Roadmap AWS para cantera junior DevOps'
const NEW_AWS_DESCRIPTION =
  'Este itinerario está diseñado para perfiles junior con base técnica que quieren iniciarse en AWS con enfoque práctico y orientado a DevOps. Está pensado para cuentas nuevas de laboratorio en AWS Free Tier (créditos de bienvenida durante un máximo de 6 meses), con hábitos de control de costes desde el primer día.'
const NEW_AWS_OBJECTIVES = JSON.stringify([
  'Abrir y proteger una cuenta AWS, entender el modelo basado en créditos de AWS Free Tier y controlar los costes',
  'Comprender los fundamentos de cloud computing',
  'Conocer los servicios básicos de AWS',
  'Adquirir nociones de red, seguridad y observabilidad',
  'Introducir automatización e infraestructura como código',
  'Dar los primeros pasos en contenedores y CI/CD',
  'Construir un proyecto final con enfoque de empleabilidad'
])

const ACCOUNT_MODULE_TITLE = 'Cuenta AWS, Free Tier, seguridad inicial y control de costes'
const ACCOUNT_MODULE_OBJECTIVE =
  'Crear una cuenta AWS de forma segura, entender los límites de AWS Free Tier y adquirir los hábitos básicos para no generar costes inesperados.'
const ACCOUNT_MODULE_CONTENTS = JSON.stringify([
  'Crear la cuenta AWS y elegir el plan inicial de AWS Free Tier (Free plan) o de pago',
  'Modelo actual de AWS Free Tier: 100 USD de créditos de bienvenida más hasta 100 USD adicionales por completar actividades; el periodo inicial termina a los 6 meses o al agotar los créditos, lo que ocurra antes',
  'Al terminar el periodo de AWS Free Tier la cuenta se cierra; hay 90 días para pasar al plan de pago antes de perder los datos',
  'El plan inicial de AWS Free Tier solo da acceso a servicios seleccionados; el resto exige pasar al plan de pago',
  'Las cuentas creadas antes del 15 de julio de 2025 siguen el modelo antiguo de 12 meses; el plan basado en créditos se aplica a las cuentas nuevas',
  'Activar MFA en el usuario root y no usarlo para el trabajo diario',
  'Crear una alerta de presupuesto con AWS Budgets y revisar el consumo con Billing and Cost Management',
  'Estimar costes con AWS Pricing Calculator antes de desplegar',
  'Costes frecuentes que sorprenden: NAT Gateway, direcciones IPv4 públicas (se cobran por hora, estén en uso o no) y Elastic IPs sin asociar',
  'Hábito de limpieza: eliminar o terminar los recursos al acabar cada laboratorio'
])
const ACCOUNT_MODULE_RESOURCES = JSON.stringify([
  { label: 'Elegir un plan de AWS Free Tier (plan inicial y plan de pago)', url: 'https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html' },
  { label: 'Seguimiento del uso de AWS Free Tier', url: 'https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/tracking-free-tier-usage.html' },
  { label: 'Activar MFA para el usuario root', url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/enable-mfa-for-root.html' },
  { label: 'Crear un presupuesto de costes con AWS Budgets', url: 'https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html' },
  { label: 'AWS Pricing Calculator', url: 'https://calculator.aws/' },
  { label: 'Precios de Amazon VPC (IPv4 públicas y NAT Gateway)', url: 'https://aws.amazon.com/vpc/pricing/' }
])
const ACCOUNT_MODULE_EVALUATION = 'Quiz sobre AWS Free Tier, MFA, presupuestos y control de costes.'

const ACCOUNT_QUIZ_BASE = [
  {
    question: '¿Por qué es importante configurar alertas de presupuesto al empezar con AWS?',
    answer: 'Porque ayudan a detectar gastos inesperados',
    options: [
      'Porque impiden aprender servicios nuevos',
      'Porque ayudan a detectar gastos inesperados',
      'Porque eliminan automáticamente todos los recursos',
      'Porque sustituyen a IAM'
    ],
    explanation: 'AWS Budgets permite crear alertas para controlar costes y evitar sorpresas de facturación.',
    type: 'multiple_choice'
  },
  {
    question: '¿Qué significa activar MFA en una cuenta AWS?',
    answer: 'Añadir un segundo factor de autenticación para mejorar la seguridad',
    options: [
      'Añadir un segundo factor de autenticación para mejorar la seguridad',
      'Duplicar automáticamente todos los recursos',
      'Crear una VPC privada',
      'Desactivar la facturación'
    ],
    explanation: 'MFA añade una capa adicional de seguridad, normalmente mediante una app o dispositivo de autenticación.',
    type: 'multiple_choice'
  },
  {
    question: '¿Cuál es una buena práctica al finalizar una práctica en AWS?',
    answer: 'Eliminar o apagar los recursos que ya no sean necesarios',
    options: [
      'Dejar todos los recursos encendidos por si se necesitan algún día',
      'Eliminar o apagar los recursos que ya no sean necesarios',
      'Compartir las claves de acceso con el resto de alumnos',
      'Desactivar todas las alertas de coste'
    ],
    explanation: 'Limpiar recursos evita costes innecesarios y fomenta buenas prácticas operativas.',
    type: 'multiple_choice'
  },
  {
    question: '¿Para qué sirve AWS Pricing Calculator?',
    answer: 'Para estimar costes de servicios antes de desplegarlos',
    options: [
      'Para estimar costes de servicios antes de desplegarlos',
      'Para crear usuarios IAM automáticamente',
      'Para conectarse por SSH a EC2',
      'Para crear contenedores Docker'
    ],
    explanation: 'AWS Pricing Calculator permite estimar costes aproximados de uso de servicios.',
    type: 'multiple_choice'
  }
]

const PRE_0006_ACCOUNT_QUIZ_BANK = JSON.stringify([
  ...ACCOUNT_QUIZ_BASE,
  {
    question: '¿Cuál es el mayor riesgo de usar una cuenta AWS sin control de costes?',
    answer: 'Que se generen cargos inesperados',
    options: [
      'Que no se puedan crear usuarios',
      'Que se generen cargos inesperados',
      'Que S3 deje de funcionar',
      'Que no se pueda usar GitHub'
    ],
    explanation: `Algunos recursos generan coste si se dejan activos (p. ej. NAT Gateway o IPv4 públicas), y el plan ${WORD_G_MASC} actual termina a los 6 meses o al agotar los créditos.`,
    type: 'multiple_choice'
  }
])

const NEW_ACCOUNT_QUIZ_BANK = JSON.stringify([
  ...ACCOUNT_QUIZ_BASE,
  {
    question: '¿Cuál es el mayor riesgo de usar una cuenta AWS sin control de costes?',
    answer: 'Que se generen cargos inesperados',
    options: [
      'Que no se puedan crear usuarios',
      'Que se generen cargos inesperados',
      'Que S3 deje de funcionar',
      'Que no se pueda usar GitHub'
    ],
    explanation: 'Algunos recursos generan coste si se dejan activos (p. ej. NAT Gateway o IPv4 públicas), y el periodo inicial de AWS Free Tier termina a los 6 meses o al agotar los créditos.',
    type: 'multiple_choice'
  }
])

const EC2_MODULE_CONTENTS = JSON.stringify([
  'Qué es EC2',
  'Tipos de instancia',
  'Tipos de instancia elegibles para AWS Free Tier (p. ej. t3.micro; comprobar la lista con aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true)',
  'AMI',
  'Pares de claves',
  'Security Groups',
  'Acceso SSH',
  'User Data básico'
])

const AI_ROADMAP_TITLE = 'Roadmap IA para SRE/DevOps - Versión 2.0'
const OLD_AI_PRINCIPLE = `Priorizar recursos oficiales, ${WORD_G_PL} y hands-on; usar Udemy Business y LinkedIn Learning como refuerzo.`
const NEW_AI_PRINCIPLE = 'Priorizar recursos oficiales y prácticos (hands-on); usar Udemy Business y LinkedIn Learning como refuerzo.'

const DEVOPS_ROADMAP_TITLE = 'Roadmap desde 0 a DevOps Junior'
const OLD_DEVOPS_METHOD = `lectura de documentación oficial o ${WORD_G_FEM}`
const NEW_DEVOPS_METHOD = 'lectura de documentación oficial y técnica'

export async function up(db: Kysely<any>): Promise<void> {
  const { count } = await db
    .selectFrom('roadmaps')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .executeTakeFirstOrThrow()
  if (Number(count) === 0) return

  const awsRoadmaps = await db
    .selectFrom('roadmaps')
    .select(['id'])
    .where('title', 'in', [LEGACY_AWS_TITLE, NEW_AWS_TITLE])
    .execute()

  for (const { id: roadmapId } of awsRoadmaps) {
    await db
      .updateTable('roadmaps')
      .set({
        title: NEW_AWS_TITLE,
        description: NEW_AWS_DESCRIPTION,
        objectives: NEW_AWS_OBJECTIVES
      })
      .where('id', '=', roadmapId)
      .execute()

    const accountModules: Array<{ id: number; quiz_bank: string | null }> = await db
      .selectFrom('modules')
      .select(['id', 'quiz_bank'])
      .where('roadmap_id', '=', roadmapId)
      .where('title', '=', ACCOUNT_MODULE_TITLE)
      .execute()

    for (const mod of accountModules) {
      const updateFields: Record<string, string> = {
        objective: ACCOUNT_MODULE_OBJECTIVE,
        contents: ACCOUNT_MODULE_CONTENTS,
        official_resources: ACCOUNT_MODULE_RESOURCES,
        evaluation: ACCOUNT_MODULE_EVALUATION
      }
      if (
        mod.quiz_bank === null ||
        mod.quiz_bank === PRE_0006_ACCOUNT_QUIZ_BANK ||
        mod.quiz_bank === NEW_ACCOUNT_QUIZ_BANK
      ) {
        updateFields.quiz_bank = NEW_ACCOUNT_QUIZ_BANK
      }
      await db.updateTable('modules').set(updateFields).where('id', '=', mod.id).execute()
    }

    await db
      .updateTable('modules')
      .set({ contents: EC2_MODULE_CONTENTS })
      .where('roadmap_id', '=', roadmapId)
      .where('title', '=', 'Amazon EC2')
      .execute()
  }

  const aiRoadmaps: Array<{ id: number; objectives: string | null; methodology: string | null }> = await db
    .selectFrom('roadmaps')
    .select(['id', 'objectives', 'methodology'])
    .where('title', '=', AI_ROADMAP_TITLE)
    .execute()

  for (const roadmap of aiRoadmaps) {
    const patch: Record<string, string> = {}
    if (roadmap.objectives?.includes(OLD_AI_PRINCIPLE)) {
      patch.objectives = roadmap.objectives.replaceAll(OLD_AI_PRINCIPLE, NEW_AI_PRINCIPLE)
    }
    if (roadmap.methodology?.includes(OLD_AI_PRINCIPLE)) {
      patch.methodology = roadmap.methodology.replaceAll(OLD_AI_PRINCIPLE, NEW_AI_PRINCIPLE)
    }
    if (Object.keys(patch).length > 0) {
      await db.updateTable('roadmaps').set(patch).where('id', '=', roadmap.id).execute()
    }
  }

  const devopsRoadmaps: Array<{ id: number; methodology: string | null }> = await db
    .selectFrom('roadmaps')
    .select(['id', 'methodology'])
    .where('title', '=', DEVOPS_ROADMAP_TITLE)
    .execute()

  for (const roadmap of devopsRoadmaps) {
    if (roadmap.methodology?.includes(OLD_DEVOPS_METHOD)) {
      await db
        .updateTable('roadmaps')
        .set({ methodology: roadmap.methodology.replaceAll(OLD_DEVOPS_METHOD, NEW_DEVOPS_METHOD) })
        .where('id', '=', roadmap.id)
        .execute()
    }
  }
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Intentionally a no-op: corporate wording normalization cannot be rolled back automatically.
}
