import type { ComponentType } from 'react'
import {
  FolderSearch, FolderPlus, BarChart3, Play, Workflow, Bot,
  ListChecks, FilePlus, RefreshCw, Code2, GitBranch,
  Send, ClipboardList, Upload, Search,
  Rocket, XCircle, FileText, Wrench,
} from 'lucide-react'

export interface ToolDisplay {
  label: string
  icon: ComponentType<{ className?: string }>
}

const ICON_HINTS: Record<string, ComponentType<{ className?: string }>> = {
  search: FolderSearch, list: FolderSearch, query: BarChart3,
  create: FolderPlus,   run: Play,         execute: Play,
  graph: Workflow,       delegate: Bot,     code: Code2,
  git: GitBranch,        pipeline: Rocket,  send: Send,
  upload: Upload,        task: ClipboardList, phase: ListChecks,
  artifact: FilePlus,    update: RefreshCw, cancel: XCircle,
  log: FileText,         find: Search,
}

const REGISTRY = new Map<string, ToolDisplay>([
  ['list_workspaces',            { label: '查询工作区',    icon: FolderSearch }],
  ['create_workspace',           { label: '创建工作区',    icon: FolderPlus }],
  ['query_progress',             { label: '查询进度',      icon: BarChart3 }],
  ['run_phase',                  { label: '执行阶段',      icon: Play }],
  ['run_task',                   { label: '执行任务',      icon: Play }],
  ['run_project',                { label: '执行项目',      icon: Rocket }],
  ['run_graph',                  { label: '执行图谱',      icon: Workflow }],
  ['delegate_to_agent',          { label: '委派代理',      icon: Bot }],
  ['workspace_create_task',      { label: '创建任务',      icon: ClipboardList }],
  ['workspace_update_task_status', { label: '更新任务状态', icon: RefreshCw }],
  ['workspace_create_artifact',  { label: '创建工件',      icon: FilePlus }],
  ['workspace_query_phases',     { label: '查询阶段',      icon: ListChecks }],
  ['trigger_pipeline',           { label: '触发流水线',    icon: Rocket }],
  ['get_pipeline_status',        { label: '查询流水线',    icon: Search }],
  ['get_pipeline_logs',          { label: '查看日志',      icon: FileText }],
  ['cancel_pipeline',            { label: '取消流水线',    icon: XCircle }],
  ['generate_code',              { label: '生成代码',      icon: Code2 }],
  ['review_code',                { label: '审查代码',      icon: Code2 }],
  ['plan_implementation',        { label: '规划实现',      icon: ListChecks }],
  ['gitlab_create_issue',        { label: '创建 Issue',    icon: ClipboardList }],
  ['gitlab_create_mr',           { label: '创建 MR',       icon: GitBranch }],
  ['gitlab_list_pipelines',      { label: '列出流水线',    icon: ListChecks }],
  ['gitlab_push_file',           { label: '推送文件',      icon: Upload }],
  ['feishu_send_message',        { label: '发送飞书消息',  icon: Send }],
  ['feishu_create_task',         { label: '创建飞书任务',  icon: ClipboardList }],
  ['feishu_upload_doc',          { label: '上传飞书文档',  icon: Upload }],
])

const FALLBACK: ToolDisplay = { label: '', icon: Wrench }

function inferIcon(toolName: string): ComponentType<{ className?: string }> {
  for (const [hint, icon] of Object.entries(ICON_HINTS)) {
    if (toolName.includes(hint)) return icon
  }
  return Wrench
}

export function getToolDisplay(toolName: string): ToolDisplay {
  return REGISTRY.get(toolName) || { ...FALLBACK, label: toolName, icon: inferIcon(toolName) }
}

export function registerToolDisplay(toolName: string, display: ToolDisplay) {
  REGISTRY.set(toolName, display)
}

let _bootstrapped = false

export async function bootstrapToolRegistry(): Promise<void> {
  if (_bootstrapped) return
  _bootstrapped = true
  try {
    const resp = await fetch('/api/conversation/tools')
    if (!resp.ok) return
    const json = await resp.json()
    const tools: { name: string; displayName?: string; description?: string }[] = json.data || []
    for (const t of tools) {
      if (!REGISTRY.has(t.name)) {
        REGISTRY.set(t.name, {
          label: t.displayName || t.name,
          icon: inferIcon(t.name),
        })
      }
    }
  } catch {
    _bootstrapped = false
  }
}
