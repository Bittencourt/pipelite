import { createTranslator, type AbstractIntlMessages } from 'use-intl/core'
import { defaultLocale } from '@/i18n/config'

const messagesByLocale: Record<string, () => Promise<{ default: AbstractIntlMessages }>> = {
  'en-US': () => import('@/messages/en-US.json') as Promise<{ default: AbstractIntlMessages }>,
  'pt-BR': () => import('@/messages/pt-BR.json') as Promise<{ default: AbstractIntlMessages }>,
  'es-ES': () => import('@/messages/es-ES.json') as Promise<{ default: AbstractIntlMessages }>,
}

/**
 * Get a translator scoped to a namespace for use in email templates.
 * Returns a function `t(key, values?)` that resolves translations.
 */
export async function getEmailTranslator(locale: string, namespace: string) {
  const validLocale = locale in messagesByLocale ? locale : defaultLocale
  const loader = messagesByLocale[validLocale]!
  const messages = (await loader()).default
  return createTranslator({ locale: validLocale, messages, namespace }) as (key: string, values?: Record<string, unknown>) => string
}
