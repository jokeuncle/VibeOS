import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { useAuthStore } from '../stores/auth'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

export default function LoginPage() {
  const t = useT()
  const { login, register, loading, error } = useAuthStore()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isRegister) {
      await register(email, password, name)
    } else {
      await login(email, password)
    }
  }

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

          <form onSubmit={handleSubmit} className="space-y-3">
            {isRegister && (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('auth.namePlaceholder' as TranslationKey)}
                className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder' as TranslationKey)}
              required
              className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder' as TranslationKey)}
              required
              className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40"
            />

            {error && (
              <p className="text-xs text-danger">{error}</p>
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
              onClick={() => setIsRegister(!isRegister)}
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
