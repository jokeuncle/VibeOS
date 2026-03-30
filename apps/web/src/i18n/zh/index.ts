import type { TranslationKey } from '../en'
import common from './common'
import workspace from './workspace'
import agent from './agent'
import phase from './phase'
import task from './task'
import requirement from './requirement'
import settings from './settings'
import intelligence from './intelligence'

const zh: Record<TranslationKey, string> = {
  ...common,
  ...workspace,
  ...agent,
  ...phase,
  ...task,
  ...requirement,
  ...settings,
  ...intelligence,
}

export default zh
