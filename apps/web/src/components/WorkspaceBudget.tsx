import { useState } from 'react'
import { motion } from 'framer-motion'
import { Gauge, Cpu, TrendingUp, AlertTriangle, Settings2, DollarSign, BarChart3 } from 'lucide-react'
import { useT } from '../i18n'

interface AgentUsage {
  type: string
  label: string
  color: string
  barColor: string
  tokensToday: number
  costToday: number
  model: string
}

const AGENT_USAGE: AgentUsage[] = [
  { type: 'architecture', label: 'Architecture', color: 'text-indigo-400', barColor: 'bg-indigo-400', tokensToday: 48200, costToday: 0.87, model: 'claude-opus-4-5' },
  { type: 'development', label: 'Development', color: 'text-emerald-400', barColor: 'bg-emerald-400', tokensToday: 34500, costToday: 0.62, model: 'gemini-2.5-pro' },
  { type: 'pm', label: 'PM', color: 'text-violet-400', barColor: 'bg-violet-400', tokensToday: 22800, costToday: 0.41, model: 'claude-opus-4-5' },
  { type: 'requirement', label: 'Requirement', color: 'text-blue-400', barColor: 'bg-blue-400', tokensToday: 18400, costToday: 0.22, model: 'claude-sonnet-4-5' },
  { type: 'testing', label: 'Testing', color: 'text-yellow-400', barColor: 'bg-yellow-400', tokensToday: 12100, costToday: 0.14, model: 'claude-sonnet-4-5' },
  { type: 'design', label: 'Design', color: 'text-pink-400', barColor: 'bg-pink-400', tokensToday: 8200, costToday: 0.10, model: 'claude-sonnet-4-5' },
  { type: 'cicd', label: 'CI/CD', color: 'text-orange-400', barColor: 'bg-orange-400', tokensToday: 4300, costToday: 0.05, model: 'claude-sonnet-4-5' },
]

const DAILY_BUDGET = 10.0
const DAILY_USED = AGENT_USAGE.reduce((s, a) => s + a.costToday, 0)
const BUDGET_PERCENT = Math.round((DAILY_USED / DAILY_BUDGET) * 100)

const WEEK_HISTORY = [1.24, 3.87, 2.11, 4.52, 5.12, DAILY_USED, 0]
const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEK_MAX = Math.max(...WEEK_HISTORY, DAILY_BUDGET * 0.8)

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
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
  const [dailyLimit, setDailyLimit] = useState(DAILY_BUDGET.toFixed(2))
  const [alertPct, setAlertPct] = useState('80')

  const overBudget = DAILY_USED > DAILY_BUDGET
  const nearBudget = BUDGET_PERCENT >= Number(alertPct)

  const costStats = [
    { label: t('budget.usedToday'), value: `$${DAILY_USED.toFixed(2)}`, icon: DollarSign, color: 'text-text-primary' },
    { label: t('budget.remainingToday'), value: `$${Math.max(DAILY_BUDGET - DAILY_USED, 0).toFixed(2)}`, icon: Gauge, color: 'text-success' },
    { label: t('budget.dailyBudget'), value: `$${DAILY_BUDGET.toFixed(2)}`, icon: Settings2, color: 'text-text-tertiary' },
    { label: t('budget.tokensToday'), value: `${(AGENT_USAGE.reduce((s, a) => s + a.tokensToday, 0) / 1000).toFixed(1)}K`, icon: Cpu, color: 'text-accent' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Gauge className="w-4 h-4 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">{t('budget.title')}</h1>
        </div>
        <p className="text-[12px] text-text-tertiary">{t('budget.desc')}</p>
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
                animate={{ strokeDashoffset: 2 * Math.PI * 32 * (1 - Math.min(BUDGET_PERCENT / 100, 1)) }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-lg font-bold font-mono leading-none
                ${overBudget ? 'text-danger' : nearBudget ? 'text-warning' : 'text-text-primary'}`}
              >
                {BUDGET_PERCENT}%
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
            ${WEEK_HISTORY.reduce((s, v) => s + v, 0).toFixed(2)} {t('budget.thisWeek')}
          </span>
        </div>
        <div className="flex items-end gap-1.5 h-20">
          {WEEK_HISTORY.map((val, i) => {
            const pct = (val / WEEK_MAX) * 100
            const isToday = i === 5
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${pct}%` }}
                  transition={{ duration: 0.5, delay: i * 0.05, ease: 'easeOut' }}
                  className={`w-full rounded-t-md min-h-[2px]
                    ${isToday ? 'bg-accent' : val === 0 ? 'bg-surface-3' : 'bg-surface-4'}`}
                />
                <span className={`text-[9px] font-mono ${isToday ? 'text-accent' : 'text-text-tertiary'}`}>
                  {WEEK_LABELS[i]}
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
        <div className="space-y-3">
          {AGENT_USAGE.map(agent => (
            <div key={agent.type} className="flex items-center gap-3">
              <span className={`text-[11px] font-medium w-24 shrink-0 ${agent.color}`}>{agent.label}</span>
              <MiniBar value={agent.tokensToday} max={AGENT_USAGE[0].tokensToday} color={agent.barColor} />
              <span className="text-[10px] font-mono text-text-tertiary w-16 text-right shrink-0">
                {(agent.tokensToday / 1000).toFixed(1)}K t
              </span>
              <span className="text-[11px] font-mono font-semibold text-text-secondary w-12 text-right shrink-0">
                ${agent.costToday.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
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
      </div>
    </motion.div>
  )
}
