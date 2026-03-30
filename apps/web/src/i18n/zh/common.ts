const common = {
  'status.completed': '已完成',
  'status.in_progress': '进行中',
  'status.pending': '待开始',

  'time.justNow': '刚刚',
  'time.mAgo': '分钟前',
  'time.hAgo': '小时前',
  'time.dAgo': '天前',

  'progress.phasesComplete': '个阶段已完成',
  'progress.of': '/',
  'progress.tasks': '个任务',
  'progress.running': '运行中',

  'confirm.cancel': '取消',
  'confirm.confirm': '确认',
  'confirm.deleteTask': '删除此任务？',
  'confirm.deleteTaskMsg': '此操作无法撤销。',
  'confirm.deleteWorkspaceMsg': '该空间下的所有阶段、任务和数据将被永久删除。',

  'view.list': '列表',
  'view.board': '看板',
  'view.dashboard': '仪表盘',
  'view.agents': 'Agents',
  'view.kanban': '看板',
  'view.graph': '关系图',
  'view.requirements': '需求',

  'board.pending': '待开始',
  'board.inProgress': '进行中',
  'board.completed': '已完成',

  'empty.title': '暂无任务',
  'empty.description': '添加你的第一个任务开始吧',

  'priority.label': '优先级',
  'priority.none': '无',
  'priority.p0': '紧急',
  'priority.p1': '高',
  'priority.p2': '中',
  'priority.p3': '低',

  'label.title': '标签',
  'label.add': '切换标签',

  'dueDate.label': '截止日期',
  'dueDate.none': '无截止日期',

  'theme.label': '主题',
  'theme.dark': '深色',
  'theme.light': '浅色',

  'tabs.close': '关闭标签',

  'breadcrumb.home': '首页',

  'markdown.edit': '编辑',
  'markdown.preview': '预览',

  'layout.split': '分屏视图',
  'layout.dock': '工具栏',

  'gantt.title': '甘特图时间线',

  'session.today': '今天',
  'session.earlier': '更早',
  'session.collapsed': '条消息',

  'filter.status': '状态',
  'filter.priority': '优先级',
  'filter.sortBy': '排序',
  'filter.clear': '清除筛选',
  'filter.all': '全部',
  'filter.pending': '待办',
  'filter.inProgress': '进行中',
  'filter.completed': '已完成',
  'filter.critical': '紧急',
  'filter.high': '高',
  'filter.medium': '中',
  'filter.low': '低',
  'filter.name': '名称',

  'search.placeholder': '搜索消息…',
  'search.noResults': '没有匹配的消息',

  'shortcuts.title': '快捷键',
  'shortcuts.general': '通用',
  'shortcuts.navigation': '导航',
  'shortcuts.editing': '编辑',
  'shortcuts.commandPalette': '命令面板',
  'shortcuts.toggleSidebar': '切换侧边栏',
  'shortcuts.settings': '打开设置',
  'shortcuts.shortcuts': '显示快捷键',
  'shortcuts.close': '关闭面板',
  'shortcuts.goHome': '回到首页',

  'suggest.agents': 'Agents',
  'suggest.commands': '命令',
  'suggest.tasks': '任务',

  'cmd.createTask': '创建任务',
  'cmd.changeStatus': '更改状态',
  'cmd.assign': '分配给 Agent',
  'cmd.deploy': '部署到预发布',
  'cmd.review': '请求代码审查',
  'cmd.report': '生成报告',

  'rich.actionApproved': '部署已批准',
  'rich.actionCancelled': '操作已取消',
  'rich.actionConfirmed': '任务已确认并添加',
  'rich.actionApplied': '变更已成功应用',
  'rich.actionDismissed': '已忽略',
  'rich.actionProceeding': '正在拆解为子任务…',
  'rich.actionDetail': '正在生成详细分析…',
  'rich.taskMoved': '任务状态已更新',
  'rich.actionModify': '正在准备修改…',
  'rich.approve': '确认',
  'rich.modify': '修改',
  'rich.dismiss': '忽略',
  'rich.viewTask': '查看任务',

  'comment.title': '评论',
  'comment.placeholder': '添加评论…',
  'comment.empty': '暂无评论',
  'comment.you': '你',
  'comment.send': '发送',

  'attachment.title': '附件',
  'attachment.drop': '拖拽文件到此处或点击选择',
  'attachment.empty': '无附件',
  'attachment.remove': '移除',
  'attachment.uiOnlyHint': '文件仅保留在当前会话界面，正式上传能力接入后端后才会持久化。',
  'attachment.browseHint': '或点击选择文件',

  'feedback.approve': '有帮助',
  'feedback.reject': '没帮助',
  'feedback.thanks': '感谢您的反馈！',

  'error.llmRateLimit': 'AI 模型已达到使用限制，请稍后重试或切换到其他模型。',
  'error.llmUnavailable': 'AI 服务暂时不可用，请稍后重试。',
  'error.requestFailed': '请求失败',
  'error.timeout': '请求超时，请稍后重试。',
  'error.networkError': '网络连接异常，请检查服务是否正常运行。',
  'error.agentUnavailable': '{name} Agent 服务未启动，请先启动对应的 Agent 服务。',
  'error.agentUnavailableGeneric': 'Agent 服务未启动或无法连接，请检查服务配置。',

  'common.save': '保存',
  'common.saving': '保存中…',
  'common.cancel': '取消',
  'common.refresh': '刷新',
}

export default common
