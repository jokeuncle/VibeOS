# 本地逐个启动服务（无 Docker 全栈）

假设 **PostgreSQL、Redis、Qdrant** 已在本机运行。也可只起基础组件：

```bash
cd deploy && docker compose up -d postgres redis qdrant
```

下文命令默认在**仓库根目录**执行。

---

## 0. 初始化数据库（仅首次）

```bash
psql -U vibeos -d vibeos -f deploy/init.sql
psql -U vibeos -d vibeos -f deploy/migrations/002_auth_and_membership.sql
```

---

## 1. 环境变量

```bash
cp deploy/local-env.example.sh deploy/.env
# 编辑 deploy/.env，填入 ARK_API_KEY、GITLAB_TOKEN 等

set -a && source deploy/.env && set +a
```

---

## 2. Python 依赖（仅首次，建议 venv）

```bash
pip install -e agents/shared
pip install -e agents/pm-agent
pip install -e agents/architecture-agent
pip install -e agents/requirement-agent
pip install -e agents/design-agent
pip install -e agents/dev-agent
pip install -e agents/test-agent
pip install -e agents/cicd-agent
pip install -e agents/monitoring-agent
pip install -e platform/llm-gateway
pip install -e platform/memory-service
pip install -e platform/rag-pipeline
pip install -e platform/knowledge-service
pip install sentence-transformers
```

---

## 3. 按顺序启动（**每个进程单独开一个终端**）

公共 URL（本地）：

- `WORKSPACE_SVC_URL=http://localhost:8010`
- `WS_GATEWAY_URL=http://localhost:8020`
- `LLM_GATEWAY_URL=http://localhost:8030`
- `MEMORY_SVC_URL=http://localhost:8050`
- `RAG_SVC_URL=http://localhost:8060`
- `KNOWLEDGE_SVC_URL=http://localhost:8070`

### ① workspace-svc — **8010**

```bash
cd services/workspace-svc
DATABASE_URL="$DATABASE_URL" REDIS_URL="redis://localhost:6379/0" PORT=8010 go run ./cmd
```

### ② ws-gateway — **8020**

```bash
cd services/ws-gateway
REDIS_URL="redis://localhost:6379/0" PORT=8020 go run ./cmd
```

### ③ llm-gateway — **8030**

```bash
ARK_API_KEY="$ARK_API_KEY" LLM_MODEL="$LLM_MODEL" \
REDIS_URL="redis://localhost:6379/1" PORT=8030 \
python -m uvicorn llm_gateway.main:app --host 0.0.0.0 --port 8030 --app-dir platform/llm-gateway
```

### ④ memory-service — **8050**

（示例：本地向量模型；若改用豆包向量，参见 README「Memory & Embedding」调 `EMBEDDING_MODEL` / `EMBEDDING_DIM`。）

```bash
HF_ENDPOINT="$HF_ENDPOINT" ARK_API_KEY="$ARK_API_KEY" VOLCENGINE_LLM_MODEL="$VOLCENGINE_LLM_MODEL" \
EMBEDDING_MODEL="local/all-MiniLM-L6-v2" EMBEDDING_DIM=384 \
QDRANT_URL="http://localhost:6333" REDIS_URL="redis://localhost:6379/3" \
LLM_GATEWAY_URL="http://localhost:8030" PORT=8050 \
python -m uvicorn memory_service.main:app --host 0.0.0.0 --port 8050 --app-dir platform/memory-service
```

### ⑤ rag-pipeline — **8060**

```bash
EMBEDDING_API_KEY="$ARK_API_KEY" EMBEDDING_BASE_URL="$LLM_BASE_URL" \
QDRANT_URL="http://localhost:6333" LLM_GATEWAY_URL="http://localhost:8030" \
REDIS_URL="redis://localhost:6379/4" PORT=8060 \
python -m uvicorn rag_pipeline.main:app --host 0.0.0.0 --port 8060 --app-dir platform/rag-pipeline
```

### ⑥ knowledge-service — **8070**

```bash
DATABASE_URL="$DATABASE_URL" LLM_GATEWAY_URL="http://localhost:8030" \
WORKSPACE_SVC_URL="http://localhost:8010" REDIS_URL="redis://localhost:6379/5" PORT=8070 \
python -m uvicorn knowledge_service.main:app --host 0.0.0.0 --port 8070 --app-dir platform/knowledge-service
```

### ⑦ 领域 Agent（按需启动；端口与 project-overview 一致）

以下每条里 `REDIS_URL` 可按需改成 `6379/6` 等，避免与 pm-agent 的 `/2` 冲突；单机调试常用 `/0` 也可。

**architecture — 8041**

```bash
PORT=8041 REDIS_URL="redis://localhost:6379/6" \
WORKSPACE_SVC_URL=http://localhost:8010 LLM_GATEWAY_URL=http://localhost:8030 \
WS_GATEWAY_URL=http://localhost:8020 MEMORY_SVC_URL=http://localhost:8050 \
RAG_SVC_URL=http://localhost:8060 KNOWLEDGE_SVC_URL=http://localhost:8070 \
python -m uvicorn arch_agent.main:app --host 0.0.0.0 --port 8041 --app-dir agents/architecture-agent
```

**requirement — 8042**

```bash
PORT=8042 REDIS_URL="redis://localhost:6379/0" \
WORKSPACE_SVC_URL=http://localhost:8010 LLM_GATEWAY_URL=http://localhost:8030 \
WS_GATEWAY_URL=http://localhost:8020 MEMORY_SVC_URL=http://localhost:8050 \
RAG_SVC_URL=http://localhost:8060 KNOWLEDGE_SVC_URL=http://localhost:8070 \
python -m uvicorn req_agent.main:app --host 0.0.0.0 --port 8042 --app-dir agents/requirement-agent
```

**design — 8043**

```bash
PORT=8043 REDIS_URL="redis://localhost:6379/0" \
WORKSPACE_SVC_URL=http://localhost:8010 LLM_GATEWAY_URL=http://localhost:8030 \
WS_GATEWAY_URL=http://localhost:8020 MEMORY_SVC_URL=http://localhost:8050 \
RAG_SVC_URL=http://localhost:8060 KNOWLEDGE_SVC_URL=http://localhost:8070 \
python -m uvicorn design_agent.main:app --host 0.0.0.0 --port 8043 --app-dir agents/design-agent
```

**dev — 8044**（需 GitLab 时带上 `GITLAB_*`）

```bash
PORT=8044 REDIS_URL="redis://localhost:6379/0" \
WORKSPACE_SVC_URL=http://localhost:8010 LLM_GATEWAY_URL=http://localhost:8030 \
WS_GATEWAY_URL=http://localhost:8020 MEMORY_SVC_URL=http://localhost:8050 \
RAG_SVC_URL=http://localhost:8060 KNOWLEDGE_SVC_URL=http://localhost:8070 \
GITLAB_URL="$GITLAB_URL" GITLAB_TOKEN="$GITLAB_TOKEN" \
python -m uvicorn dev_agent.main:app --host 0.0.0.0 --port 8044 --app-dir agents/dev-agent
```

**test — 8045**

```bash
PORT=8045 REDIS_URL="redis://localhost:6379/0" \
WORKSPACE_SVC_URL=http://localhost:8010 LLM_GATEWAY_URL=http://localhost:8030 \
WS_GATEWAY_URL=http://localhost:8020 MEMORY_SVC_URL=http://localhost:8050 \
RAG_SVC_URL=http://localhost:8060 KNOWLEDGE_SVC_URL=http://localhost:8070 \
python -m uvicorn test_agent.main:app --host 0.0.0.0 --port 8045 --app-dir agents/test-agent
```

**cicd — 8046**

```bash
PORT=8046 REDIS_URL="redis://localhost:6379/0" \
WORKSPACE_SVC_URL=http://localhost:8010 LLM_GATEWAY_URL=http://localhost:8030 \
WS_GATEWAY_URL=http://localhost:8020 MEMORY_SVC_URL=http://localhost:8050 \
RAG_SVC_URL=http://localhost:8060 KNOWLEDGE_SVC_URL=http://localhost:8070 \
python -m uvicorn cicd_agent.main:app --host 0.0.0.0 --port 8046 --app-dir agents/cicd-agent
```

**monitoring — 8047**

```bash
PORT=8047 REDIS_URL="redis://localhost:6379/0" \
WORKSPACE_SVC_URL=http://localhost:8010 LLM_GATEWAY_URL=http://localhost:8030 \
WS_GATEWAY_URL=http://localhost:8020 MEMORY_SVC_URL=http://localhost:8050 \
RAG_SVC_URL=http://localhost:8060 KNOWLEDGE_SVC_URL=http://localhost:8070 \
python -m uvicorn mon_agent.main:app --host 0.0.0.0 --port 8047 --app-dir agents/monitoring-agent
```

### ⑧ pm-agent（编排 / NLP）— **8040**

须在 memory、rag、knowledge 已就绪后启动。

```bash
WORKSPACE_SVC_URL=http://localhost:8010 LLM_GATEWAY_URL=http://localhost:8030 \
WS_GATEWAY_URL=http://localhost:8020 MEMORY_SVC_URL=http://localhost:8050 \
RAG_SVC_URL=http://localhost:8060 KNOWLEDGE_SVC_URL=http://localhost:8070 \
REDIS_URL="redis://localhost:6379/2" PORT=8040 \
GITLAB_URL="$GITLAB_URL" GITLAB_BASE_URL="${GITLAB_BASE_URL:-$GITLAB_URL}" GITLAB_TOKEN="$GITLAB_TOKEN" \
python -m uvicorn pm_agent.main:app --host 0.0.0.0 --port 8040 --app-dir agents/pm-agent
```

---

## 4. 前端 — **3000**

```bash
pnpm install
pnpm --filter web dev
```

---

## 5. 健康检查

```bash
curl -s http://localhost:8010/health
curl -s http://localhost:8020/health
curl -s http://localhost:8030/health
curl -s http://localhost:8040/health
curl -s http://localhost:8050/health
curl -s http://localhost:8060/health
curl -s http://localhost:8070/health
```

---

## 依赖关系小结

```
PostgreSQL → Redis → Qdrant
     ↓
workspace-svc (8010)    ws-gateway (8020)    llm-gateway (8030)
     ↓                                              ↓
knowledge (8070)                         memory (8050) + rag (8060)
     ↓
各 domain agent (8041–8047，按需要)
     ↓
pm-agent (8040)
     ↓
前端 (3000)
```

更多变量说明见根目录 `README.md` 的 **Environment Variables**。
