const common = {
  'status.completed': 'Completed',
  'status.in_progress': 'In Progress',
  'status.pending': 'Pending',

  'time.justNow': 'just now',
  'time.mAgo': 'm ago',
  'time.hAgo': 'h ago',
  'time.dAgo': 'd ago',

  'progress.phasesComplete': 'phases complete',
  'progress.of': 'of',
  'progress.tasks': 'tasks',
  'progress.running': 'running',

  'confirm.cancel': 'Cancel',
  'confirm.confirm': 'Confirm',
  'confirm.deleteTask': 'Delete this task?',
  'confirm.deleteTaskMsg': 'This action cannot be undone.',
  'confirm.deleteWorkspaceMsg': 'All phases, tasks, and data in this workspace will be permanently removed.',

  'view.list': 'List',
  'view.board': 'Board',
  'view.dashboard': 'Dashboard',
  'view.agents': 'Agents',
  'view.kanban': 'Kanban',
  'view.graph': 'Graph',
  'view.requirements': 'Requirements',

  'board.pending': 'Pending',
  'board.inProgress': 'In Progress',
  'board.completed': 'Completed',

  'empty.title': 'No tasks yet',
  'empty.description': 'Add your first task to get started',

  'priority.label': 'Priority',
  'priority.none': 'None',
  'priority.p0': 'Critical',
  'priority.p1': 'High',
  'priority.p2': 'Medium',
  'priority.p3': 'Low',

  'label.title': 'Labels',
  'label.add': 'Toggle labels',

  'dueDate.label': 'Due date',
  'dueDate.none': 'No due date',

  'theme.label': 'Theme',
  'theme.dark': 'Dark',
  'theme.light': 'Light',

  'tabs.close': 'Close tab',

  'breadcrumb.home': 'Home',

  'markdown.edit': 'Edit',
  'markdown.preview': 'Preview',

  'layout.split': 'Split View',
  'layout.dock': 'Dock',

  'gantt.title': 'Gantt Timeline',

  'session.today': 'Today',
  'session.earlier': 'Earlier',
  'session.collapsed': 'messages',

  'filter.status': 'Status',
  'filter.priority': 'Priority',
  'filter.sortBy': 'Sort',
  'filter.clear': 'Clear filters',
  'filter.all': 'All',
  'filter.pending': 'Pending',
  'filter.inProgress': 'In Progress',
  'filter.completed': 'Completed',
  'filter.critical': 'Critical',
  'filter.high': 'High',
  'filter.medium': 'Medium',
  'filter.low': 'Low',
  'filter.name': 'Name',

  'search.placeholder': 'Search messages…',
  'search.noResults': 'No messages match your search',

  'shortcuts.title': 'Keyboard Shortcuts',
  'shortcuts.general': 'General',
  'shortcuts.navigation': 'Navigation',
  'shortcuts.editing': 'Editing',
  'shortcuts.commandPalette': 'Command palette',
  'shortcuts.toggleSidebar': 'Toggle sidebar',
  'shortcuts.settings': 'Open settings',
  'shortcuts.shortcuts': 'Show shortcuts',
  'shortcuts.close': 'Close panel',
  'shortcuts.goHome': 'Go home',

  'suggest.agents': 'Agents',
  'suggest.commands': 'Commands',
  'suggest.tasks': 'Tasks',

  'cmd.createTask': 'Create task',
  'cmd.changeStatus': 'Change status',
  'cmd.assign': 'Assign to agent',
  'cmd.deploy': 'Deploy to staging',
  'cmd.review': 'Request code review',
  'cmd.report': 'Generate report',

  'rich.actionApproved': 'Deployment approved',
  'rich.actionCancelled': 'Operation cancelled',
  'rich.actionConfirmed': 'Task confirmed and added',
  'rich.actionApplied': 'Changes applied successfully',
  'rich.actionDismissed': 'Dismissed',
  'rich.actionProceeding': 'Breaking down into tasks…',
  'rich.actionDetail': 'Generating detailed analysis…',
  'rich.taskMoved': 'Task status updated',
  'rich.actionModify': 'Preparing modifications…',
  'rich.approve': 'Approve',
  'rich.modify': 'Modify',
  'rich.dismiss': 'Dismiss',
  'rich.viewTask': 'View task',

  'comment.title': 'Comments',
  'comment.placeholder': 'Add a comment…',
  'comment.empty': 'No comments yet',
  'comment.you': 'You',
  'comment.send': 'Send',

  'attachment.title': 'Attachments',
  'attachment.drop': 'Drop files here or click to browse',
  'attachment.empty': 'No attachments',
  'attachment.remove': 'Remove',
  'attachment.uiOnlyHint': 'Files stay in this session only until we add upload API.',
  'attachment.browseHint': 'or click to choose files',

  'feedback.approve': 'Helpful',
  'feedback.reject': 'Not helpful',
  'feedback.edit': 'Suggest correction',
  'feedback.thanks': 'Thanks for your feedback!',

  'error.llmRateLimit': 'The AI model has reached its usage limit. Please try again later or switch to another model.',
  'error.llmUnavailable': 'The AI service is temporarily unavailable. Please try again shortly.',
  'error.requestFailed': 'Request failed',
  'error.timeout': 'Request timed out. Please try again later.',
  'error.networkError': 'Network error — check that services are running.',
  'error.agentUnavailable': '{name} Agent is not running. Please start the Agent service first.',
  'error.agentUnavailableGeneric': 'Agent service is not running or unreachable. Check your service configuration.',

  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.cancel': 'Cancel',
  'common.approve': 'Approve',
  'common.reject': 'Reject',
  'common.refresh': 'Refresh',
} as const

export default common
