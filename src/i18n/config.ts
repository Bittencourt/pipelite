export const locales = ['en-US', 'pt-BR', 'es-ES'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en-US'

export const commonTimezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Madrid',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
] as const

export const commonCurrencies = ['USD', 'EUR', 'BRL', 'GBP', 'JPY'] as const
export type Currency = (typeof commonCurrencies)[number]
