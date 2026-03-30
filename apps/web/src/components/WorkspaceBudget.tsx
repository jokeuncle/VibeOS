import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Gauge, Cpu, TrendingUp, AlertTriangle, Settings2, DollarSign, BarChart3, RefreshCw } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspace'
import { workspaceApi } from '../lib/api'
import { useT } from '../i18n'
import type { BudgetResponse } from '../types'

const AGENT_COLORS: Record<string, { text: string; bar: string }> = {
  architecture: { text: 'text-indigo-400', bar: 'bg-indigo-400' },
  development:  { text: 'text-emerald-400', bar: 'bg-emerald-400' },
  pm:           { text: 'text-violet-400', bar: 'bg-violet-400' },
  requirement:  { text: 'text-blue-400', bar: 'bg-blue-400' },
  testing:      { text: 'text-yellow-400', bar: 'bg-yellow-400' },
  design:       { text: 'text-pink-400', bar: 'bg-pink-400' },
  cicd:         { text: 'text-orange-400', bar: 'bg-orange-400' },
  monitoring:   { text: 'text-cyan-400', bar: 'bg-cyan-400' },
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100)
  return (
    <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  )
}

export default function WorkspaceBudget() {
  const t = useT()
  const { activeWorkspaceId } = useWorkspaceStore()
  const [budget, setBudget] = useState<BudgetResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Initialise with sensible defaults so the form is never blank on API failure
  const [dailyLimit, setDailyLimit] = useState('10.00')
  const [alertPct, setAlertPct] = useState('80')

  // Ref always reflects the latest workspace to guard against stale responses
  const activeWsRef = useRef(activeWorkspaceId)
  useEffect(() => { activeWsRef.current = activeWorkspaceId }, [activeWorkspaceId])

  const fetchBudget = useCallback(async () => {
    if (!activeWorkspaceId) return
    const wsId = activeWorkspaceId
    setLoading(true)
    try {
      const data = await workspaceApi.getBudget(wsId)
      // Discard if workspace changed while request was in-flight
      if (activeWsRef.current !== wsId) return
      setBudget(data)
      setDailyLimit(data.settings.dailySpendLimitUsd.toFixed(2))
      setAlertPct(String(data.settings.alertThresholdPct))
    } catch {
      // keep existing defaults on failure
    } finally {
      if (activeWsRef.current === wsId) setLoading(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => { fetchBudget() }, [fetchBudget])

  async function handleSaveSettings() {
    if (!activeWorkspaceId) return
    setSaving(true)
    try {
      const updated = await workspaceApi.updateBudgetSettings(activeWorkspaceId, {
        dailySpendLimitUsd: parseFloat(dailyLimit) || 10,
        alertThresholdPct: parseInt(alertPct) || 80,
      })
      if (budget) {
        setBudget({ ...budget, settings: updated })
      }
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const dailyLimitVal = parseFloat(dailyLimit) || 10
  const alertPctVal = parseInt(alertPct) || 80
  const usedToday = budget?.usedTodayUsd ?? 0
  const tokensToday = budget?.tokensToday ?? 0
  const budgetPercent = Math.round((usedToday / dailyLimitVal) * 100)
  const overBudget = usedToday > dailyLimitVal
  const nearBudget = budgetPercent >= alertPctVal
  const agentUsage = budget?.agentUsage ?? []
  const weekLabels = budget?.weekLabels ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekSpend = budget?.weekSpendUsd ?? [0, 0, 0, 0, 0, 0, 0]
  // Monday=0 … Sunday=6, matching the backend's Mon-first convention
  const todayIndex = (new Date().getDay() + 6) % 7
  const weekMax = Math.max(...weekSpend, dailyLimitVal * 0.8, 0.01)
  const weekTotal = weekSpend.reduce((s, v) => s + v, 0)
  const maxAgentTokens = Math.max(...agentUsage.map(a => a.tokensTotal), 1)

  const costStats = [
    { label: t('budget.usedToday'), value: `$${usedToday.toFixed(2)}`, icon: DollarSign, color: 'text-text-primary' },
    { label: t('budget.remainingToday'), value: `$${Math.max(dailyLimitVal - usedToday, 0).toFixed(2)}`, icon: Gauge, color: 'text-success' },
    { label: t('budget.dailyBudget'), value: `$${dailyLimitVal.toFixed(2)}`, icon: Settings2, color: 'text-text-tertiary' },
    { label: t('budget.tokensToday'), value: `${(tokensToday / 1000).toFixed(1)}K`, icon: Cpu, color: 'text-accent' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-accent" />
            <h1 className="text-base font-semibold text-text-primary tracking-tight">{t('budget.title')}</h1>
          </div>
          <p className="text-[12px] text-text-tertiary">{t('budget.desc')}</p>
        </div>
        <button
          onClick={fetchBudget}
          disabled={loading}
          className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1 rounded-xl border border-border-subtle bg-surface-1/30 p-4 flex flex-col items-center justify-center">
          <div className="relative w-20 h-20 mb-3">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              <circle cx="40" cy="40" r="32" fill="none" stroke="var(--color-surface-3)" strokeWidth="8" />
              <motion.circle
                cx="40" cy="40" r="32" fill="none"
                stroke={overBudget ? 'var(--color-danger)' : nearBudget ? 'var(--color-warning)' : 'var(--color-accent)'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 32}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 32 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 32 * (1 - Math.min(budgetPercent / 100, 1)) }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-lg font-bold font-mono leading-none
                ${overBudget ? 'text-danger' : nearBudget ? 'text-warning' : 'text-text-primary'}`}
              >
                {budgetPercent}%
              </span>
            </div>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary text-center">
            {t('budget.dailyUsage')}
          </span>
          {nearBudget && (
            <div className="flex items-center gap-1 mt-2 text-[10px] text-warning">
              <AlertTriangle className="w-2.5 h-2.5" />
              {overBudget ? t('budget.overLimit') : t('budget.nearLimit')}
            </div>
          )}
        </div>

        <div className="col-span-2 rounded-xl border border-border-subtle bg-surface-1/30 p-4 space-y-3">
          {costStats.map(stat => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-3 h-3 ${stat.color}`} />
                  <span className="text-[11px] text-text-tertiary">{stat.label}</span>
                </div>
                <span className={`text-[13px] font-semibold font-mono ${stat.color}`}>{stat.value}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
            {t('budget.sevenDaySpend')}
          </span>
          <span className="ml-auto text-[11px] font-mono text-text-tertiary">
            ${weekTotal.toFixed(2)} {t('budget.thisWeek')}
          </span>
        </div>
        <div className="flex items-end gap-1.5 h-20">
          {weekLabels.map((label, i) => {
            const val = weekSpend[i] ?? 0
            const pct = (val / weekMax) * 100
            const isToday = i === todayIndex
            return (
              <div key={label} className="flex-1 flex flex-col items-center gap-1">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${pct}%` }}
                  transition={{ duration: 0.5, delay: i * 0.05, ease: 'easeOut' }}
                  className={`w-full rounded-t-md min-h-[2px]
                    ${isToday ? 'bg-accent' : val === 0 ? 'bg-surface-3' : 'bg-surface-4'}`}
                />
                <span className={`text-[9px] font-mono ${isToday ? 'text-accent' : 'text-text-tertiary'}`}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
            {t('budget.byAgent')}
          </span>
        </div>
        {agentUsage.length === 0 ? (
          <p className="text-[11px] text-text-tertiary italic">{t('budget.noUsageData')}</p>
        ) : (
          <div className="space-y-3">
            {agentUsage.map(agent => {
              const c = AGENT_COLORS[agent.agentType] ?? { text: 'text-text-tertiary', bar: 'bg-surface-4' }
              return (
                <div key={agent.agentType} className="flex items-center gap-3">
                  <span className={`text-[11px] font-medium w-24 shrink-0 capitalize ${c.text}`}>{agent.agentType}</span>
                  <MiniBar value={agent.tokensTotal} max={maxAgentTokens} color={c.bar} />
                  <span className="text-[10px] font-mono text-text-tertiary w-16 text-right shrink-0">
                    {(agent.tokensTotal / 1000).toFixed(1)}K t
                  </span>
                  <span className="text-[11px] font-mono font-semibold text-text-secondary w-12 text-right shrink-0">
                    ${agent.costUsd.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
            {t('budget.limitsAlerts')}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] text-text-tertiary mb-1.5">{t('budget.dailySpendLimit')}</label>
            <input
              type="number"
              value={dailyLimit}
              onChange={e => setDailyLimit(e.target.value)}
              min="0"
              step="1"
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border-default text-[12px] text-text-primary focus:outline-none focus:border-accent/50 transition-colors"
            />
            <p className="text-[10px] text-text-tertiary mt-1">{t('budget.dailySpendLimitHint')}</p>
          </div>
          <div>
            <label className="block text-[11px] text-text-tertiary mb-1.5">{t('budget.alertThreshold')}</label>
            <input
              type="number"
              value={alertPct}
              onChange={e => setAlertPct(e.target.value)}
              min="1"
              max="100"
              className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-border-default text-[12px] text-text-primary focus:outline-none focus:border-accent/50 transition-colors"
            />
            <p className="text-[10px] text-text-tertiary mt-1">{t('budget.alertThresholdHint')}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-accent text-[12px] font-semibold text-surface-1 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
