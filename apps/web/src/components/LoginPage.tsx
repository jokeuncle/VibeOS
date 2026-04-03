import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

const emailLooksValid = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

export default function LoginPage() {
  const t = useT()
  const { login, register, loading, error } = useAuthStore()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)

  function clearErrors() {
    setClientError(null)
    useAuthStore.setState({ error: null })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    clearErrors()
    if (isRegister && !name.trim()) {
      setClientError(t('auth.validationNameRequired' as TranslationKey))
      return
    }
    if (!email.trim()) {
      setClientError(t('auth.validationEmailRequired' as TranslationKey))
      return
    }
    if (!emailLooksValid(email)) {
      setClientError(t('auth.validationEmailInvalid' as TranslationKey))
      return
    }
    if (!password) {
      setClientError(t('auth.validationPasswordRequired' as TranslationKey))
      return
    }
    if (isRegister) {
      await register(email, password, name)
    } else {
      await login(email, password)
    }
  }

  const formError = clientError || error

  return (
    <div className="h-screen flex items-center justify-center bg-surface-0">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm mx-4"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/10 mb-4">
            <Zap className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">VibeOS</h1>
          <p className="text-xs text-text-tertiary mt-1">{t('app.subtitle' as TranslationKey)}</p>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-1 p-6">
          <h2 className="text-sm font-medium text-text-primary mb-4">
            {isRegister ? t('auth.register' as TranslationKey) : t('auth.login' as TranslationKey)}
          </h2>

          <form noValidate onSubmit={handleSubmit} className="space-y-3">
            {isRegister && (
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); clearErrors() }}
                placeholder={t('auth.namePlaceholder' as TranslationKey)}
                autoComplete="name"
                className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
              />
            )}
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearErrors() }}
              placeholder={t('auth.emailPlaceholder' as TranslationKey)}
              className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
            />
            <input
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearErrors() }}
              placeholder={t('auth.passwordPlaceholder' as TranslationKey)}
              className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
            />

            {formError && (
              <p className="text-xs text-danger leading-relaxed" role="alert">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-lg bg-accent text-white text-sm font-medium cursor-pointer hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {loading
                ? t('auth.loading' as TranslationKey)
                : isRegister
                  ? t('auth.register' as TranslationKey)
                  : t('auth.login' as TranslationKey)}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister)
                clearErrors()
              }}
              className="text-xs text-text-tertiary hover:text-accent cursor-pointer transition-colors"
            >
              {isRegister ? t('auth.haveAccount' as TranslationKey) : t('auth.noAccount' as TranslationKey)}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
