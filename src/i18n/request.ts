import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { locales, defaultLocale, type Locale } from './config'

export { locales, type Locale }

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  
  const localeCookie = cookieStore.get('locale')
  const timezoneCookie = cookieStore.get('timezone')
  
  const locale: Locale = localeCookie?.value && locales.includes(localeCookie.value as Locale)
    ? (localeCookie.value as Locale)
    : defaultLocale
  
  const timezone = timezoneCookie?.value || 'America/New_York'
  
  const messages = (await import(`../messages/${locale}.json`)).default
  
  return {
    locale,
    messages,
    timeZone: timezone,
  }
})
