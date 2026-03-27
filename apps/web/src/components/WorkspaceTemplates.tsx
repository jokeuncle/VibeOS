import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FileText, Globe, Smartphone, Server } from 'lucide-react'
import { useUIStore } from '../stores/ui'
import { useWorkspaceStore } from '../stores/workspace'
import { useT } from '../i18n'
import { WORKSPACE_COLORS, type WorkspaceColor } from '../types'

const COLOR_MAP: Record<WorkspaceColor, string> = {
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  cyan: 'bg-cyan-500',
  violet: 'bg-violet-500',
}

const COLOR_RING: Record<WorkspaceColor, string> = {
  indigo: 'ring-indigo-500',
  emerald: 'ring-emerald-500',
  rose: 'ring-rose-500',
  amber: 'ring-amber-500',
  cyan: 'ring-cyan-500',
  violet: 'ring-violet-500',
}

const TEMPLATES = [
  { id: 'blank', icon: FileText, nameKey: 'template.blank', descKey: 'template.blankDesc', defaultName: '', defaultDesc: '' },
  { id: 'webapp', icon: Globe, nameKey: 'template.webapp', descKey: 'template.webappDesc', defaultName: 'Web Application', defaultDesc: 'Full-stack web application' },
  { id: 'mobile', icon: Smartphone, nameKey: 'template.mobile', descKey: 'template.mobileDesc', defaultName: 'Mobile App', defaultDesc: 'iOS / Android application' },
  { id: 'api', icon: Server, nameKey: 'template.api', descKey: 'template.apiDesc', defaultName: 'API Service', defaultDesc: 'Backend API / microservice' },
] as const

export default function WorkspaceTemplates() {
  const t = useT()
  const { templatePickerOpen, setTemplatePickerOpen, addToast } = useUIStore()
  const { createWorkspaceFromTemplate, setActiveWorkspace } = useWorkspaceStore()

  const [selectedTemplate, setSelectedTemplate] = useState('blank')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<WorkspaceColor>('indigo')

  function selectTemplate(tpl: typeof TEMPLATES[number]) {
    setSelectedTemplate(tpl.id)
    if (!name) setName(tpl.defaultName)
    if (!description) setDescription(tpl.defaultDesc)
  }

  function handleCreate() {
    const id = createWorkspaceFromTemplate(
      name || t('workspace.untitled'),
      description,
      color,
    )
    setActiveWorkspace(id)
    addToast({ type: 'success', message: t('workspace.created') })
    handleClose()
  }

  function handleClose() {
    setTemplatePickerOpen(false)
    setSelectedTemplate('blank')
    setName('')
    setDescription('')
    setColor('indigo')
  }

  return (
    <AnimatePresence>
      {templatePickerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[80]"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-[81] rounded-2xl border border-border-default bg-surface-1 shadow-2xl shadow-black/40 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-14 border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-text-primary">{t('template.title')}</h3>
              <button onClick={handleClose} className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-3 transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Templates */}
              <div>
                <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">
                  {t('template.templates')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {TEMPLATES.map((tpl) => {
                    const Icon = tpl.icon
                    const isActive = selectedTemplate === tpl.id
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => selectTemplate(tpl)}
                        className={`p-3 rounded-xl border text-center cursor-pointer transition-all ${
                          isActive
                            ? 'border-accent/40 bg-accent/5'
                            : 'border-border-subtle bg-surface-2/50 hover:bg-surface-2'
                        }`}
                      >
                        <Icon className={`w-5 h-5 mx-auto mb-1.5 ${isActive ? 'text-accent' : 'text-text-tertiary'}`} />
                        <span className={`text-[11px] font-medium ${isActive ? 'text-accent' : 'text-text-secondary'}`}>
                          {t(tpl.nameKey as any)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 block">
                  {t('template.name')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('template.namePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-default text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40 transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 block">
                  {t('template.description')}
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('template.descPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-default text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/40 transition-colors"
                />
              </div>

              {/* Color */}
              <div>
                <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">
                  {t('template.pickColor')}
                </label>
                <div className="flex gap-2">
                  {WORKSPACE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full ${COLOR_MAP[c]} cursor-pointer transition-all ${
                        color === c ? `ring-2 ring-offset-2 ring-offset-surface-1 ${COLOR_RING[c]}` : 'opacity-60 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Create */}
              <button
                onClick={handleCreate}
                className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium cursor-pointer transition-colors"
              >
                {t('template.create')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
