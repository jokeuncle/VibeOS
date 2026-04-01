-- 015_registry_seed.sql
-- Seed default intents, capabilities, and task templates so the registry
-- is populated even when PM agent is not running.
-- Uses ON CONFLICT DO NOTHING to avoid overwriting runtime data.

-- ===================================================================
-- Default Intents
-- ===================================================================

INSERT INTO intent_registry (name, label_zh, label_en, hint, source) VALUES
  ('create_workspace',   '创建工作空间', 'Create Workspace',      'user wants a new empty workspace or project shell',          'system'),
  ('create_task',        '创建任务',     'Create Task',            'user wants to create a single task',                         'system'),
  ('create_requirement', '创建需求',     'Create Requirement',     'user wants a new requirement or feature request',            'system'),
  ('bind_workspace_repo','绑定仓库',     'Bind Repository',        'user wants to link this workspace to an existing GitLab project','system'),
  ('query_progress',     '查询进度',     'Query Progress',         'user wants project/task status',                             'system'),
  ('execute_task',       '执行任务',     'Execute Task',           'user wants to run a specific task',                          'system'),
  ('execute_phase',      '执行阶段',     'Execute Phase',          'user wants to run a phase',                                  'system'),
  ('run_project',        '运行项目',     'Run Project',            'user wants full lifecycle',                                  'system'),
  ('trigger_build',      '触发构建',     'Trigger Build',          'trigger a CI/CD pipeline build for a project or branch',     'system'),
  ('view_build_log',     '查看构建日志', 'View Build Log',         'view build logs, check pipeline status',                     'system'),
  ('deploy',             '部署',         'Deploy',                 'deploy to an environment, CI/CD release',                    'system'),
  ('rollback',           '回滚版本',     'Rollback',               'rollback a deployment to a previous version',                'system'),
  ('general_chat',       '自由对话',     'General Chat',           'greetings, product help, chit-chat',                         'system'),
  ('requirement_to_code','需求转代码',   'Requirement to Code',    'full pipeline: analyze→design→review→implement→test',        'system'),
  ('design_system',      '系统架构设计', 'System Design',          'system-level architecture design',                           'system'),
  ('architecture_design','架构设计',     'Architecture Design',    'technical architecture',                                     'system'),
  ('ui_design',          'UI 设计',      'UI Design',              'UI/UX, wireframes, mockups',                                 'system'),
  ('generate_code',      '生成代码',     'Generate Code',          'implement features / code',                                  'system'),
  ('run_tests',          '运行测试',     'Run Tests',              'tests, QA',                                                  'system'),
  ('analyze_requirements','分析需求',    'Analyze Requirements',   'analyze or refine requirements',                             'system'),
  ('setup_monitoring',   '配置监控',     'Setup Monitoring',       'monitoring, alerts',                                         'system'),
  ('design_observability','可观测性设计','Observability Design',   'SRE, SLOs, incidents',                                       'system')
ON CONFLICT (name) DO NOTHING;


-- ===================================================================
-- Default Capabilities (domain agents + PM)
-- ===================================================================

INSERT INTO capability_registry (name, provider, description, endpoint, supports_streaming, source) VALUES
  -- PM capabilities
  ('pm.create_task',       'pm', 'Create tasks within a workspace phase',               '', false, 'system'),
  ('pm.create_requirement','pm', 'Create or discover requirements',                     '', false, 'system'),
  ('pm.bind_workspace_repo','pm','Bind a GitLab repository to a workspace',             '', false, 'system'),
  ('pm.query_progress',    'pm', 'Query project/task status',                           '', false, 'system'),
  ('pm.execute_task',      'pm', 'Execute a specific task via agent dispatch',           '', true,  'system'),
  ('pm.workflow',          'pm', 'Run phase/project lifecycle workflows',                '', true,  'system'),
  ('pm.pipeline',          'pm', 'Trigger CI/CD pipeline operations',                    '', true,  'system'),
  ('pm.create_workspace',  'pm', 'Create a new workspace',                              '', false, 'system'),
  ('llm.chat',             'pm', 'General LLM chat completion',                          '', true,  'system'),

  -- Domain agent capabilities (with endpoints for GraphExecutor resolution)
  ('requirement.analyze',   'requirement',  'Analyze and refine requirements, produce user stories and PRDs',    'http://requirement-agent:8042/api/execute',  true, 'system'),
  ('architecture.design',   'architecture', 'Architecture design, schema modeling, API design, and ADRs',        'http://architecture-agent:8041/api/execute', true, 'system'),
  ('design.ui',             'design',       'UI/UX design, wireframes, component hierarchies, and style guides', 'http://design-agent:8043/api/execute',       true, 'system'),
  ('development.code_gen',  'development',  'Code generation, implementation plans, and dependency management',  'http://dev-agent:8044/api/execute',          true, 'system'),
  ('testing.run',           'testing',      'Test planning, test case generation, and coverage analysis',         'http://test-agent:8045/api/execute',         true, 'system'),
  ('cicd.pipeline',         'cicd',         'CI/CD pipeline design, deployment strategies, and infrastructure',  'http://cicd-agent:8046/api/execute',         true, 'system'),
  ('monitoring.setup',      'monitoring',   'Monitoring plans, alert rules, dashboards, and runbooks',           'http://monitoring-agent:8047/api/execute',   true, 'system'),
  ('monitoring.observability','monitoring', 'Observability design, SLOs, SLIs, and incident response',           'http://monitoring-agent:8047/api/execute',   true, 'system'),
  ('coding.execute',        'coding',      'Agentic coding with full repo access via OpenHands runtime',         'http://coding-agent:8048/api/execute',       true, 'system')
ON CONFLICT (name, provider) DO NOTHING;


-- ===================================================================
-- Default Task Templates
-- ===================================================================

INSERT INTO task_template_registry (intent_pattern, context, handler_type, handler_ref, task_type, required_capabilities, source) VALUES
  -- PM-handled internal templates
  ('create_task',        'workspace', 'internal', 'create_task',        'atomic',    '{pm.create_task,llm.chat}',      'system'),
  ('create_requirement', 'workspace', 'internal', 'create_requirement', 'atomic',    '{pm.create_requirement,llm.chat}','system'),
  ('bind_workspace_repo','workspace', 'internal', 'bind_workspace_repo','atomic',    '{pm.bind_workspace_repo}',       'system'),
  ('query_progress',     'workspace', 'internal', 'query_progress',     'atomic',    '{pm.query_progress}',            'system'),
  ('execute_task',       'workspace', 'internal', 'execute_task',       'atomic',    '{pm.execute_task}',              'system'),
  ('execute_phase',      'workspace', 'internal', 'execute_phase',      'atomic',    '{pm.workflow}',                  'system'),
  ('run_project',        'workspace', 'internal', 'run_project',        'composite', '{pm.workflow}',                  'system'),
  ('trigger_build',      'workspace', 'internal', 'trigger_build',      'atomic',    '{pm.pipeline}',                  'system'),
  ('view_build_log',     'workspace', 'internal', 'view_build_log',     'atomic',    '{pm.pipeline}',                  'system'),
  ('deploy',             'workspace', 'internal', 'deploy',             'atomic',    '{pm.pipeline}',                  'system'),
  ('rollback',           'workspace', 'internal', 'rollback',           'atomic',    '{pm.pipeline}',                  'system'),
  ('general_chat',       '*',         'internal', 'general_chat',       'atomic',    '{llm.chat}',                     'system'),
  ('create_workspace',   'home',      'internal', 'create_workspace',   'atomic',    '{pm.create_workspace}',          'system'),

  -- Domain agent templates (PM routes to remote agents)
  ('design_system',       'workspace', 'agent', 'architecture', 'atomic', '{architecture.design}',    'system'),
  ('architecture_design', 'workspace', 'agent', 'architecture', 'atomic', '{architecture.design}',    'system'),
  ('ui_design',           'workspace', 'agent', 'design',       'atomic', '{design.ui}',              'system'),
  ('generate_code',       'workspace', 'agent', 'development',  'atomic', '{development.code_gen}',   'system'),
  ('run_tests',           'workspace', 'agent', 'testing',      'atomic', '{testing.run}',            'system'),
  ('analyze_requirements','workspace', 'agent', 'requirement',  'atomic', '{requirement.analyze}',    'system'),
  ('setup_monitoring',    'workspace', 'agent', 'monitoring',   'atomic', '{monitoring.setup}',       'system'),
  ('design_observability','workspace', 'agent', 'monitoring',   'atomic', '{monitoring.observability}','system')
ON CONFLICT DO NOTHING;
