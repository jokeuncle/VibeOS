"""E2E test for the SDLC workflow engine.

Tests:
1. Phase skip events for disabled agents
2. Context passing between tasks and phases
3. Project summary emission
"""

import asyncio
import json
import os
import sys

os.environ.setdefault("WORKSPACE_SVC_URL", "http://localhost:8010")
os.environ.setdefault("WS_GATEWAY_URL", "http://localhost:8020")
os.environ.setdefault("LLM_BASE_URL", os.environ.get("LLM_BASE_URL", "http://localhost:8030"))
os.environ.setdefault("LLM_MODEL", os.environ.get("LLM_MODEL", "deepseek-v3-2-251201"))

WS_ID = "6fe32552-4326-46b7-b17f-f29817928955"


async def main():
    from pm_agent.dispatch import Dispatcher
    from pm_agent.session import SessionManager
    from pm_agent.workflow import WorkflowEngine
    from vibeos_agent.clients import WorkspaceClient, WSGatewayClient

    dispatcher = Dispatcher()
    ws_client = WorkspaceClient()
    ws_gw = WSGatewayClient()
    sm = SessionManager(ws_client, ws_gw)
    engine = WorkflowEngine(dispatcher, ws_client, ws_gw, sm)

    print("=" * 60)
    print("TEST 1: run_project with disabled agents (skip test)")
    print("=" * 60)

    events: list[str] = []
    skip_events: list[dict] = []
    phase_events: list[dict] = []
    project_events: list[dict] = []
    task_events: list[dict] = []
    summary_events: list[dict] = []

    async for event_str in engine.run_project(WS_ID, "E2E test run", start_phase="requirement"):
        events.append(event_str)
        for line in event_str.split("\n"):
            if not line.startswith("data: "):
                continue
            try:
                data = json.loads(line[6:])
            except Exception:
                continue

            # Parse event type from the SSE event line
            event_line = ""
            for el in event_str.split("\n"):
                if el.startswith("event: "):
                    event_line = el[7:]
                    break

            if "phase" in event_line and "skip" in event_line:
                skip_events.append(data)
                print(f"  SKIP: {data.get('phase', '?')} - {data.get('reason', '?')}")
            elif "phase" in event_line:
                phase_events.append(data)
                action = event_line.split(":")[1] if ":" in event_line else event_line
                print(f"  PHASE: {action} - {data.get('phase', '?')}")
            elif "project" in event_line:
                project_events.append(data)
                action = event_line.split(":")[1] if ":" in event_line else event_line
                print(f"  PROJECT: {action}")
            elif "task" in event_line:
                task_events.append(data)
                action = event_line.split(":")[1] if ":" in event_line else event_line
                task_title = data.get("task_title", data.get("task_id", "?"))
                print(f"  TASK: {action} - {task_title}")
            elif "content" in event_line and "payload" in event_line:
                block_type = data.get("blockType")
                if block_type == "project_summary":
                    summary_events.append(data)
                    print(f"  SUMMARY: success={data.get('success')} phases_completed={data.get('phases_completed')} skipped={data.get('phases_skipped')}")

    print()
    print(f"Total events: {len(events)}")
    print(f"Skip events: {len(skip_events)}")
    print(f"Phase events: {len(phase_events)}")
    print(f"Task events: {len(task_events)}")
    print(f"Project events: {len(project_events)}")
    print(f"Summary events: {len(summary_events)}")

    # Assertions
    errors = []
    if len(skip_events) < 2:
        errors.append(f"Expected >= 2 skip events (architecture + design disabled), got {len(skip_events)}")
    else:
        skipped_phases = {e.get("phase") for e in skip_events}
        if "architecture" not in skipped_phases:
            errors.append(f"Expected 'architecture' in skipped phases, got {skipped_phases}")
        if "design" not in skipped_phases:
            errors.append(f"Expected 'design' in skipped phases, got {skipped_phases}")

    if len(summary_events) == 0:
        errors.append("Expected at least 1 project_summary event")
    elif not isinstance(summary_events[0].get("phases_skipped"), list):
        errors.append("project_summary should have phases_skipped list")

    if errors:
        print("\nFAILED:")
        for e in errors:
            print(f"  ✗ {e}")
        return False
    else:
        print("\nPASSED: Skip events and project summary verified!")
        return True


if __name__ == "__main__":
    ok = asyncio.run(main())
    sys.exit(0 if ok else 1)
