import { Link2, AlertTriangle, X, Plus, Check } from 'lucide-react'
import FormSelect from '../ui/FormSelect'
import type { Requirement, RequirementRelation, RelationType } from '../../types'
import type { TranslationKey } from '../../i18n/en'
import { RELATION_TYPES } from './uiConstants'

type TFn = (k: any) => string

export function RequirementDetailRelationsTab({
  relations,
  otherReqs,
  addingRelation,
  setAddingRelation,
  newRelType,
  setNewRelType,
  newRelTarget,
  setNewRelTarget,
  handleAddRelation,
  handleRemoveRelation,
  t,
}: {
  relations: RequirementRelation[]
  otherReqs: Requirement[]
  addingRelation: boolean
  setAddingRelation: (v: boolean) => void
  newRelType: RelationType
  setNewRelType: (v: RelationType) => void
  newRelTarget: string
  setNewRelTarget: (v: string) => void
  handleAddRelation: () => void
  handleRemoveRelation: (rel: RequirementRelation) => void
  t: TFn
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1/30 p-5 space-y-3">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2 [&_svg]:w-3.5 [&_svg]:h-3.5">
        <Link2 className="text-text-tertiary shrink-0" />
        {t('phase.tab.relations')}
        {relations.length > 0 && (
          <span className="text-[10px] font-mono text-text-tertiary/60 font-normal normal-case">({relations.length})</span>
        )}
      </h4>
      {relations.length === 0 && !addingRelation && (
        <div className="py-4 text-center">
          <Link2 className="w-6 h-6 mx-auto mb-2 text-text-tertiary/30" />
          <p className="text-xs text-text-tertiary">{t('requirement.relation.empty' as any)}</p>
        </div>
      )}
      {relations.map((rel) => (
        <div key={rel.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-2/35 transition-colors group -mx-1">
          <span className="text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded">{t(`requirement.relation.${rel.relationType}` as any)}</span>
          <span className="text-xs text-text-primary flex-1 truncate">{rel.targetTitle}</span>
          {rel.relationType === 'depends_on' && <AlertTriangle className="w-3 h-3 text-warning shrink-0" />}
          <button type="button" onClick={() => handleRemoveRelation(rel)} className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-danger cursor-pointer transition-opacity"><X className="w-3 h-3" /></button>
        </div>
      ))}
      {addingRelation ? (
        <div className="space-y-2 p-3 rounded-lg bg-surface-2/40 border border-accent/25">
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">{t('requirement.relation.type')}</p>
          <FormSelect
            size="sm"
            value={newRelType}
            options={RELATION_TYPES.map((rt) => ({
              value: rt.value,
              label: t(rt.labelKey as TranslationKey),
            }))}
            onChange={(v) => setNewRelType(v as RelationType)}
          />
          <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide mt-2">{t('view.requirements')}</p>
          {otherReqs.length === 0 ? (
            <div className="px-3 py-2 rounded-lg bg-surface-3 text-xs text-text-tertiary">{t('requirement.relation.noOther' as any)}</div>
          ) : (
            <FormSelect
              size="sm"
              value={newRelTarget}
              placeholder={t('requirement.relation.select')}
              options={otherReqs.map((r) => ({ value: r.id, label: r.title }))}
              onChange={setNewRelTarget}
            />
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleAddRelation} disabled={!newRelTarget || otherReqs.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-40 cursor-pointer transition-colors">
              <Check className="w-3 h-3" />{t('requirement.relation.add')}
            </button>
            <button type="button" onClick={() => setAddingRelation(false)} className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary bg-surface-3 rounded-lg cursor-pointer transition-colors">
              {t('task.cancel' as any)}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAddingRelation(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-tertiary hover:text-text-primary bg-surface-2/25 hover:bg-surface-2/40 border border-dashed border-border-subtle rounded-lg w-full transition-colors cursor-pointer">
          <Plus className="w-3.5 h-3.5" />{t('requirement.relation.add')}
        </button>
      )}
    </div>
  )
}
