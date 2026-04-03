#!/usr/bin/env python3
"""End-to-end smoke test for the improved CodingAgent + OpenHands SDK.

Usage:
    cd agents/coding-agent
    python test_e2e.py

Exercises: system prompt injection, event callbacks, condenser,
stuck detection, hook guard script, correct event extraction.
"""

import asyncio
import logging
import os
import sys
import time

os.environ.setdefault("CODING_LLM_MODEL", "deepseek/deepseek-chat")
os.environ.setdefault("CODING_LLM_API_KEY", "your-api-key-here")
os.environ.setdefault("CODING_LLM_BASE_URL", "https://api.deepseek.com/v1")
os.environ.setdefault("GITLAB_URL", "https://gitlab.example.com")
os.environ.setdefault("GITLAB_TOKEN", "glpat-xxxxxxxxxxxxxxxxxxxx")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("test_e2e")

WS_PATH = "/tmp/vibeos-workspaces/test-workspace"
WORKSPACE_ID = "e2e-test-workspace"

TASK_PROMPT = (
    "Analyze this React + Vite project's codebase structure. Then:\n"
    "1. Create an ARCHITECTURE.md documenting the project layout, tech stack, "
    "and key source files.\n"
    "2. Add a new file src/utils/helpers.ts with at least 2 useful utility "
    "functions (e.g. formatDate, capitalizeWords).\n"
    "3. Add a test file src/utils/helpers.test.ts with unit tests for those "
    "functions using vitest.\n"
    "4. Update package.json to add vitest as a dev dependency and a 'test' "
    "script, then install dependencies and run the tests.\n"
)


async def main() -> None:
    from coding_agent.agent import CodingAgent

    agent = CodingAgent()

    logger.info("=== Starting E2E test ===")
    logger.info("Workspace: %s", WS_PATH)
    logger.info("Model: %s", os.environ["CODING_LLM_MODEL"])
    logger.info("Task:\n%s", TASK_PROMPT)

    t0 = time.time()
    try:
        result = await agent._run_openhands(
            ws_path=WS_PATH,
            prompt=TASK_PROMPT,
            workspace_id=WORKSPACE_ID,
        )
    except Exception:
        logger.exception("_run_openhands raised an exception")
        sys.exit(1)

    elapsed = time.time() - t0
    logger.info("=== Completed in %.1fs ===", elapsed)
    logger.info("Final result (%d chars):\n%s", len(result), result)

    guard = os.path.join(WS_PATH, ".openhands", "hooks", "guard.sh")
    logger.info("Guard hook exists: %s", os.path.isfile(guard))

    arch = os.path.join(WS_PATH, "ARCHITECTURE.md")
    logger.info("ARCHITECTURE.md created: %s", os.path.isfile(arch))

    helpers = os.path.join(WS_PATH, "src", "utils", "helpers.ts")
    logger.info("helpers.ts created: %s", os.path.isfile(helpers))

    if result and result != "Coding task completed.":
        logger.info("PASS: got a real result (not the fallback)")
    else:
        logger.warning("WARN: got fallback result — event extraction may still be broken")


if __name__ == "__main__":
    asyncio.run(main())
