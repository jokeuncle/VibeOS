import { useState } from 'react'
import { motion } from 'framer-motion'
import { Layers, Brain, Library, Share2, GraduationCap } from 'lucide-react'
import WorkspaceProjectMemory from './WorkspaceProjectMemory'
import WorkspaceKnowledgeBase from './WorkspaceKnowledgeBase'
import WorkspaceTechKnowledge from './WorkspaceTechKnowledge'
import WorkspaceLearning from './WorkspaceLearning'
import { useT } from '../i18n'
import type { TranslationKey } from '../i18n/en'

type Tab = 'memory' | 'knowledge' | 'tech' | 'learning'

const TABS: { key: Tab; labelKey: TranslationKey; icon: typeof Brain; descKey: TranslationKey }[] = [
  {
    key: 'memory',
    labelKey: 'context.tab.memory',
    icon: Brain,
    descKey: 'context.tab.memory.desc',
  },
  {
    key: 'knowledge',
    labelKey: 'context.tab.knowledge',
    icon: Library,
    descKey: 'context.tab.knowledge.desc',
  },
  {
    key: 'tech',
    labelKey: 'context.tab.tech',
    icon: Share2,
    descKey: 'context.tab.tech.desc',
  },
  {
    key: 'learning',
    labelKey: 'context.tab.learning',
    icon: GraduationCap,
    descKey: 'context.tab.learning.desc',
  },
]

export default function WorkspaceContext() {
  const t = useT()
  const [activeTab, setActiveTab] = useState<Tab>('memory')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-accent" />
          <h1 className="text-base font-semibold text-text-primary tracking-tight">{t('context.title')}</h1>
        </div>
        <p className="text-[12px] text-text-tertiary">{t('context.desc')}</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-col items-start gap-2 px-4 py-3.5 rounded-xl border text-left cursor-pointer transition-all
                ${isActive
                  ? 'bg-accent/8 border-accent/25 ring-1 ring-accent/15'
                  : 'bg-surface-1/30 border-border-subtle hover:bg-surface-2/50 hover:border-border-default'
                }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-text-tertiary'}`} />
              <div>
                <div className={`text-[12px] font-semibold mb-0.5 ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>
                  {t(tab.labelKey)}
                </div>
                <div className="text-[10px] text-text-tertiary leading-snug">{t(tab.descKey)}</div>
              </div>
            </button>
          )
        })}
      </div>

      <div>
        {activeTab === 'memory' && <WorkspaceProjectMemory />}
        {activeTab === 'knowledge' && <WorkspaceKnowledgeBase />}
        {activeTab === 'tech' && <WorkspaceTechKnowledge />}
        {activeTab === 'learning' && <WorkspaceLearning />}
      </div>
    </motion.div>
  )
}
