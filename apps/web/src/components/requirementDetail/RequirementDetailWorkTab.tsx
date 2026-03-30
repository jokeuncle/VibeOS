import { motion, AnimatePresence } from 'framer-motion'
import { Layers } from 'lucide-react'
import type { Artifact, PhaseType, Task } from '../../types'
import { PHASE_ORDER, PHASE_META } from './phaseMeta'
import { PhaseMatrixCard } from './PhaseMatrixCard'
import { PhaseTaskRow } from './PhaseTaskRow'
import { SuggestedTasksEmpty } from './SuggestedTasksEmpty'

type TFn = (k: any) => string

export function RequirementDetailWorkTab({
  reqTitle,
  reqCurrentPhase,
  iteration,
  selectedPhase,
  setSelectedPhase,
  setDrawerTask,
  getTasksForPhase,
  getArtsForPhase,
  selectedPhaseTasks,
  phaseDone,
  sendNLPMessageStream,
  t,
}: {
  reqTitle: string
  reqCurrentPhase: PhaseType
  iteration: number
  selectedPhase: PhaseType
  setSelectedPhase: (p: PhaseType) => void
  setDrawerTask: (task: Task | null) => void
  getTasksForPhase: (ph: PhaseType) => Task[]
  getArtsForPhase: (ph: PhaseType) => Artifact[]
  selectedPhaseTasks: Task[]
  phaseDone: number
  sendNLPMessageStream: (msg: string) => void
  t: TFn
}) {
  const meta = PHASE_META[selectedPhase]

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="rounded-xl border border-border-subtle bg-surface-1/30 p-5"
      >
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          {t('phase.title')}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1.5">
          {PHASE_ORDER.map((ph) => (
            <PhaseMatrixCard
              key={ph}
              phaseType={ph}
              tasks={getTasksForPhase(ph)}
              artifacts={getArtsForPhase(ph)}
              currentPhase={reqCurrentPhase}
              iteration={iteration}
              isSelected={selectedPhase === ph}
              onClick={() => {
                setSelectedPhase(ph)
                setDrawerTask(null)
              }}
              t={t}
            />
          ))}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={selectedPhase}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-border-subtle bg-surface-1/30 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
            <span
              className={`inline-flex text-text-tertiary [&_svg]:w-3.5 [&_svg]:h-3.5 shrink-0 ${
                selectedPhase === reqCurrentPhase ? '[&_svg]:text-accent text-accent' : ''
              }`}
            >
              {meta.icon}
            </span>
            <span className="text-xs font-medium text-text-secondary">{t(meta.labelKey)}</span>
            {selectedPhase === reqCurrentPhase && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-accent/10 text-accent border border-accent/20">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
                {t('phase.status.active')}
              </span>
            )}
            <div className="flex-1" />
            {selectedPhaseTasks.length > 0 && (
              <span className="text-[10px] font-mono text-text-tertiary tabular-nums">
                {phaseDone}/{selectedPhaseTasks.length}
              </span>
            )}
          </div>

          <div className="p-4 space-y-1">
            {selectedPhaseTasks.length === 0 ? (
              <SuggestedTasksEmpty phase={selectedPhase} reqTitle={reqTitle} sendNLP={sendNLPMessageStream} t={t} />
            ) : (
              selectedPhaseTasks.map((task) => (
                <PhaseTaskRow key={task.id} task={task} phase={selectedPhase} onClick={() => setDrawerTask(task)} t={t} />
              ))
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}
