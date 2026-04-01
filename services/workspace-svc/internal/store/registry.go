package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

// ---------------------------------------------------------------------------
// Intent Registry
// ---------------------------------------------------------------------------

func (s *PostgresStore) ListIntents(ctx context.Context, enabledOnly bool) ([]models.IntentRegistryEntry, error) {
	q := `SELECT id, name, label_zh, label_en, hint, slots_schema,
	             context_scopes, priority, enabled, source, created_at, updated_at
	      FROM intent_registry`
	if enabledOnly {
		q += ` WHERE enabled = true`
	}
	q += ` ORDER BY priority DESC, name`

	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list intents: %w", err)
	}
	defer rows.Close()

	var out []models.IntentRegistryEntry
	for rows.Next() {
		e, err := scanIntent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func (s *PostgresStore) GetIntent(ctx context.Context, name string) (*models.IntentRegistryEntry, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, name, label_zh, label_en, hint, slots_schema,
		        context_scopes, priority, enabled, source, created_at, updated_at
		 FROM intent_registry WHERE name = $1`, name)
	return scanIntent(row)
}

func (s *PostgresStore) UpsertIntent(ctx context.Context, req models.CreateIntentReq) (*models.IntentRegistryEntry, error) {
	now := models.TimeNow()
	schema := req.SlotsSchema
	if schema == nil {
		schema = []byte("{}")
	}
	scopes := req.ContextScopes
	if scopes == nil {
		scopes = []string{}
	}
	priority := 0
	if req.Priority != nil {
		priority = *req.Priority
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	source := req.Source
	if source == "" {
		source = "system"
	}

	row := s.pool.QueryRow(ctx,
		`INSERT INTO intent_registry (name, label_zh, label_en, hint, slots_schema, context_scopes, priority, enabled, source, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
		 ON CONFLICT (name) DO UPDATE SET
		   label_zh=EXCLUDED.label_zh, label_en=EXCLUDED.label_en, hint=EXCLUDED.hint,
		   slots_schema=EXCLUDED.slots_schema, context_scopes=EXCLUDED.context_scopes,
		   priority=EXCLUDED.priority, enabled=EXCLUDED.enabled, source=EXCLUDED.source,
		   updated_at=EXCLUDED.updated_at
		 RETURNING id, name, label_zh, label_en, hint, slots_schema, context_scopes, priority, enabled, source, created_at, updated_at`,
		req.Name, req.LabelZh, req.LabelEn, req.Hint, schema, scopes,
		priority, enabled, source, now)
	return scanIntent(row)
}

func (s *PostgresStore) DeleteIntent(ctx context.Context, name string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM intent_registry WHERE name = $1`, name)
	if err != nil {
		return fmt.Errorf("delete intent: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Task Template Registry
// ---------------------------------------------------------------------------

func (s *PostgresStore) ListTaskTemplates(ctx context.Context, enabledOnly bool) ([]models.TaskTemplateEntry, error) {
	q := `SELECT id, intent_pattern, context, task_type, required_capabilities,
	             params_mapping, handler_type, handler_ref, graph_def, state_schema,
	             priority, enabled, source, created_at, updated_at
	      FROM task_template_registry`
	if enabledOnly {
		q += ` WHERE enabled = true`
	}
	q += ` ORDER BY priority DESC, intent_pattern`

	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list task templates: %w", err)
	}
	defer rows.Close()

	var out []models.TaskTemplateEntry
	for rows.Next() {
		e, err := scanTaskTemplate(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func (s *PostgresStore) ResolveTaskTemplate(ctx context.Context, intentName, ctxScope string) (*models.TaskTemplateEntry, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, intent_pattern, context, task_type, required_capabilities,
		        params_mapping, handler_type, handler_ref, graph_def, state_schema,
		        priority, enabled, source, created_at, updated_at
		 FROM task_template_registry
		 WHERE enabled = true
		   AND (intent_pattern = $1 OR $1 LIKE REPLACE(REPLACE(intent_pattern,'*','%'),'?','_'))
		   AND (context = '*' OR context = $2)
		 ORDER BY
		   CASE WHEN intent_pattern = $1 THEN 0 ELSE 1 END,
		   CASE WHEN context = $2 THEN 0 ELSE 1 END,
		   priority DESC
		 LIMIT 1`, intentName, ctxScope)
	return scanTaskTemplate(row)
}

func (s *PostgresStore) UpsertTaskTemplate(ctx context.Context, req models.CreateTaskTemplateReq) (*models.TaskTemplateEntry, error) {
	now := models.TimeNow()
	ctxVal := req.Context
	if ctxVal == "" {
		ctxVal = "*"
	}
	taskType := req.TaskType
	if taskType == "" {
		taskType = "atomic"
	}
	caps := req.RequiredCapabilities
	if caps == nil {
		caps = []string{}
	}
	mapping := req.ParamsMapping
	if mapping == nil {
		mapping = []byte("{}")
	}
	hType := req.HandlerType
	if hType == "" {
		hType = "capability"
	}
	graphDef := req.GraphDef
	if graphDef == nil {
		graphDef = []byte("{}")
	}
	stateSchema := req.StateSchema
	if stateSchema == nil {
		stateSchema = []byte("{}")
	}
	priority := 0
	if req.Priority != nil {
		priority = *req.Priority
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	source := req.Source
	if source == "" {
		source = "system"
	}

	row := s.pool.QueryRow(ctx,
		`INSERT INTO task_template_registry
		   (intent_pattern, context, task_type, required_capabilities, params_mapping,
		    handler_type, handler_ref, graph_def, state_schema, priority, enabled, source, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
		 ON CONFLICT (intent_pattern, context) DO UPDATE SET
		   task_type=EXCLUDED.task_type, required_capabilities=EXCLUDED.required_capabilities,
		   params_mapping=EXCLUDED.params_mapping, handler_type=EXCLUDED.handler_type,
		   handler_ref=EXCLUDED.handler_ref, graph_def=EXCLUDED.graph_def,
		   state_schema=EXCLUDED.state_schema, priority=EXCLUDED.priority,
		   enabled=EXCLUDED.enabled, source=EXCLUDED.source, updated_at=EXCLUDED.updated_at
		 RETURNING id, intent_pattern, context, task_type, required_capabilities, params_mapping,
		           handler_type, handler_ref, graph_def, state_schema, priority, enabled, source, created_at, updated_at`,
		req.IntentPattern, ctxVal, taskType, caps, mapping,
		hType, req.HandlerRef, graphDef, stateSchema, priority, enabled, source, now)
	return scanTaskTemplate(row)
}

func (s *PostgresStore) DeleteTaskTemplate(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM task_template_registry WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete task template: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Capability Registry
// ---------------------------------------------------------------------------

func (s *PostgresStore) ListCapabilities(ctx context.Context, enabledOnly bool) ([]models.CapabilityEntry, error) {
	q := `SELECT id, name, description, provider, endpoint,
	             input_schema, output_schema, constraints,
	             version, health, last_heartbeat,
	             node_config_schema, supports_streaming,
	             enabled, source, created_at, updated_at
	      FROM capability_registry`
	if enabledOnly {
		q += ` WHERE enabled = true`
	}
	q += ` ORDER BY provider, name`

	rows, err := s.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list capabilities: %w", err)
	}
	defer rows.Close()

	var out []models.CapabilityEntry
	for rows.Next() {
		e, err := scanCapability(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func (s *PostgresStore) ListCapabilitiesByProvider(ctx context.Context, provider string) ([]models.CapabilityEntry, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, description, provider, endpoint,
		        input_schema, output_schema, constraints,
		        version, health, last_heartbeat,
		        node_config_schema, supports_streaming,
		        enabled, source, created_at, updated_at
		 FROM capability_registry
		 WHERE provider = $1 AND enabled = true
		 ORDER BY name`, provider)
	if err != nil {
		return nil, fmt.Errorf("list capabilities by provider: %w", err)
	}
	defer rows.Close()

	var out []models.CapabilityEntry
	for rows.Next() {
		e, err := scanCapability(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func (s *PostgresStore) FindCapabilityProviders(ctx context.Context, capabilityName string) ([]models.CapabilityEntry, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, description, provider, endpoint,
		        input_schema, output_schema, constraints,
		        version, health, last_heartbeat,
		        node_config_schema, supports_streaming,
		        enabled, source, created_at, updated_at
		 FROM capability_registry
		 WHERE name = $1 AND enabled = true AND health = 'healthy'
		 ORDER BY priority_score(version) DESC, created_at`, capabilityName)
	if err != nil {
		if strings.Contains(err.Error(), "priority_score") {
			rows, err = s.pool.Query(ctx,
				`SELECT id, name, description, provider, endpoint,
				        input_schema, output_schema, constraints,
				        version, health, last_heartbeat,
				        node_config_schema, supports_streaming,
				        enabled, source, created_at, updated_at
				 FROM capability_registry
				 WHERE name = $1 AND enabled = true AND health = 'healthy'
				 ORDER BY created_at`, capabilityName)
			if err != nil {
				return nil, fmt.Errorf("find capability providers: %w", err)
			}
		} else {
			return nil, fmt.Errorf("find capability providers: %w", err)
		}
	}
	defer rows.Close()

	var out []models.CapabilityEntry
	for rows.Next() {
		e, err := scanCapability(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func (s *PostgresStore) UpsertCapability(ctx context.Context, req models.CreateCapabilityReq) (*models.CapabilityEntry, error) {
	now := models.TimeNow()
	iSchema := req.InputSchema
	if iSchema == nil {
		iSchema = []byte("{}")
	}
	oSchema := req.OutputSchema
	if oSchema == nil {
		oSchema = []byte("{}")
	}
	cons := req.Constraints
	if cons == nil {
		cons = []byte("{}")
	}
	ver := req.Version
	if ver == "" {
		ver = "1.0.0"
	}
	nodeConf := req.NodeConfigSchema
	if nodeConf == nil {
		nodeConf = []byte("{}")
	}
	streaming := false
	if req.SupportsStreaming != nil {
		streaming = *req.SupportsStreaming
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	source := req.Source
	if source == "" {
		source = "system"
	}

	row := s.pool.QueryRow(ctx,
		`INSERT INTO capability_registry
		   (name, description, provider, endpoint, input_schema, output_schema,
		    constraints, version, health, last_heartbeat,
		    node_config_schema, supports_streaming,
		    enabled, source, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'healthy',$9,$10,$11,$12,$13,$9,$9)
		 ON CONFLICT (name, provider) DO UPDATE SET
		   description=EXCLUDED.description, endpoint=EXCLUDED.endpoint,
		   input_schema=EXCLUDED.input_schema, output_schema=EXCLUDED.output_schema,
		   constraints=EXCLUDED.constraints, version=EXCLUDED.version,
		   health='healthy', last_heartbeat=EXCLUDED.last_heartbeat,
		   node_config_schema=EXCLUDED.node_config_schema,
		   supports_streaming=EXCLUDED.supports_streaming,
		   enabled=EXCLUDED.enabled, source=EXCLUDED.source, updated_at=EXCLUDED.updated_at
		 RETURNING id, name, description, provider, endpoint,
		           input_schema, output_schema, constraints,
		           version, health, last_heartbeat,
		           node_config_schema, supports_streaming,
		           enabled, source, created_at, updated_at`,
		req.Name, req.Description, req.Provider, req.Endpoint,
		iSchema, oSchema, cons, ver, now, nodeConf, streaming, enabled, source)
	return scanCapability(row)
}

func (s *PostgresStore) UpdateCapabilityHealth(ctx context.Context, name, provider, health string) error {
	now := time.Now().UTC()
	tag, err := s.pool.Exec(ctx,
		`UPDATE capability_registry SET health=$1, last_heartbeat=$2, updated_at=$2
		 WHERE name=$3 AND provider=$4`,
		health, now, name, provider)
	if err != nil {
		return fmt.Errorf("update capability health: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) DeleteCapability(ctx context.Context, name, provider string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM capability_registry WHERE name=$1 AND provider=$2`, name, provider)
	if err != nil {
		return fmt.Errorf("delete capability: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Scanners
// ---------------------------------------------------------------------------

func scanIntent(s rowScanner) (*models.IntentRegistryEntry, error) {
	var e models.IntentRegistryEntry
	err := s.Scan(&e.ID, &e.Name, &e.LabelZh, &e.LabelEn, &e.Hint,
		&e.SlotsSchema, &e.ContextScopes, &e.Priority, &e.Enabled,
		&e.Source, &e.CreatedAt, &e.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &e, err
}

func scanTaskTemplate(s rowScanner) (*models.TaskTemplateEntry, error) {
	var e models.TaskTemplateEntry
	err := s.Scan(&e.ID, &e.IntentPattern, &e.Context, &e.TaskType,
		&e.RequiredCapabilities, &e.ParamsMapping, &e.HandlerType, &e.HandlerRef,
		&e.GraphDef, &e.StateSchema,
		&e.Priority, &e.Enabled, &e.Source, &e.CreatedAt, &e.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &e, err
}

func scanCapability(s rowScanner) (*models.CapabilityEntry, error) {
	var e models.CapabilityEntry
	err := s.Scan(&e.ID, &e.Name, &e.Description, &e.Provider, &e.Endpoint,
		&e.InputSchema, &e.OutputSchema, &e.Constraints,
		&e.Version, &e.Health, &e.LastHeartbeat,
		&e.NodeConfigSchema, &e.SupportsStreaming,
		&e.Enabled, &e.Source, &e.CreatedAt, &e.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &e, err
}
