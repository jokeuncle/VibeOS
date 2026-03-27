import { create } from 'zustand'
import en, { type TranslationKey } from './en'
import zh from './zh'

export type Locale = 'en' | 'zh'

const messages: Record<Locale, Record<TranslationKey, string>> = { en, zh }

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
}

function detectLocale(): Locale {
  const stored = localStorage.getItem('VibeOS-locale') as Locale | null
  if (stored && (stored === 'en' || stored === 'zh')) return stored
  const nav = navigator.language.toLowerCase()
  return nav.startsWith('zh') ? 'zh' : 'en'
}

export const useI18nStore = create<I18nState>((set) => ({
  locale: detectLocale(),

  setLocale: (locale) => {
    localStorage.setItem('VibeOS-locale', locale)
    set({ locale })
  },

  toggleLocale: () =>
    set((s) => {
      const next = s.locale === 'en' ? 'zh' : 'en'
      localStorage.setItem('VibeOS-locale', next)
      return { locale: next }
    }),
}))

export function useT() {
  const locale = useI18nStore((s) => s.locale)
  return (key: TranslationKey): string => messages[locale][key] ?? key
}
