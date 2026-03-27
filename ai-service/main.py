import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

import clickhouse_connect
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from litellm import completion
from openai import OpenAI
from pydantic import BaseModel

# Load environment variables from .env file
load_dotenv()

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "storage")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")
CLICKHOUSE_DATABASE = os.getenv("CLICKHOUSE_DATABASE", "analytics")

CLICKHOUSE_EVENTS_TABLE = os.getenv("CLICKHOUSE_EVENTS_TABLE", "events")

LITELLM_MODEL = os.getenv("LITELLM_MODEL", "deepseek-chat")
SEMANTIC_QUERY_URL = os.getenv("SEMANTIC_QUERY_URL", "http://dashboard:3000/api/semantic/query")

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "turbo")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pocketanalyst.ai-service")

app = FastAPI(title="PocketAnalyst AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ch_client: clickhouse_connect.driver.client.Client | None = None
openai_client: OpenAI | None = None


class InsightRequest(BaseModel):
    question: str | None = None
    metric: str | None = None
    project_id: str | None = None


class InsightResponse(BaseModel):
    question: str
    metric: str | None = None
    sql: str
    summary: Dict[str, Any]
    insight: str


METRIC_QUERIES: Dict[str, str] = {
    "retention": """
        SELECT toDate(timestamp) AS event_date,
               uniqExact(user_id) AS active_users
        FROM {events_table}
        GROUP BY event_date
        ORDER BY event_date DESC
        LIMIT 14
    """,
    "events": """
        SELECT event_name,
               count() AS event_count
        FROM {events_table}
        GROUP BY event_name
        ORDER BY event_count DESC
        LIMIT 10
    """,
    "activity": """
        SELECT toStartOfInterval(timestamp, INTERVAL 1 HOUR) AS bucket,
               count() AS events
        FROM {events_table}
        WHERE timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY bucket
        ORDER BY bucket
    """,
}

METRIC_QUERIES = {k: v.format(events_table=CLICKHOUSE_EVENTS_TABLE) for k, v in METRIC_QUERIES.items()}

DEFAULT_METRIC = "events"


class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    temperature: float | None = None
    max_tokens: int | None = None


class AgentPlanToolCall(BaseModel):
    tool: str
    args: Dict[str, Any]
    requiresConfirmation: bool | None = None
    confirmationMessage: str | None = None


class AgentPlanRequest(BaseModel):
    text: str
    context: Dict[str, Any] | None = None


class AgentPlanResponse(BaseModel):
    ok: bool
    explanation: str | None = None
    toolCalls: List[AgentPlanToolCall] | None = None
    warnings: List[str] | None = None
    error: str | None = None


class SpeechToTextResponse(BaseModel):
    ok: bool
    text: str | None = None
    error: str | None = None


def _safe_query(sql: str) -> List[Dict[str, Any]]:
    if ch_client is None:
        raise HTTPException(status_code=500, detail="ClickHouse client unavailable")

    try:
        result = ch_client.query(sql)
        columns = result.column_names
        data: List[Dict[str, Any]] = []
        for row in result.result_rows:
            data.append({columns[idx]: row[idx] for idx in range(len(columns))})
        return data
    except Exception as exc:  # noqa: BLE001
        logger.exception("ClickHouse query failed")
        raise HTTPException(status_code=500, detail="Failed to query ClickHouse") from exc


def _has_llm_credentials() -> bool:
    return any(
        env in os.environ
        for env in ("OPENAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "AZURE_API_KEY", "GROQ_API_KEY")
    )


async def _call_litellm(
    messages: List[Dict[str, str]],
    *,
    temperature: float = 0.2,
    max_tokens: int = 512,
) -> str:
    try:
        response = await asyncio.to_thread(
            completion,
            model=LITELLM_MODEL,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response["choices"][0]["message"]["content"].strip()
    except Exception as exc:  # noqa: BLE001
        logger.exception("LiteLLM call failed")
        raise HTTPException(status_code=500, detail="LLM generation failed") from exc


def _extract_sql(raw_sql: str) -> str:
    cleaned = raw_sql.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if "\n" in cleaned:
            language, _, body = cleaned.partition("\n")
            if language.lower().startswith("sql"):
                cleaned = body
        if "```" in cleaned:
            cleaned = cleaned.split("```", 1)[0]
    cleaned = cleaned.strip()
    if cleaned.endswith(";"):
        cleaned = cleaned[:-1]
    lowered = cleaned.lower()
    if not lowered.startswith("select") and not lowered.startswith("with"):
        raise HTTPException(status_code=400, detail="Generated SQL must start with SELECT or WITH")
    forbidden = ("insert", "update", "delete", "alter", "drop", "truncate", "create", "system")
    if any(token in lowered for token in forbidden):
        raise HTTPException(status_code=400, detail="Generated SQL contains forbidden keywords")
    return cleaned


def _extract_json_object(raw_json: str) -> Dict[str, Any]:
    cleaned = str(raw_json or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if "\n" in cleaned:
            language, _, body = cleaned.partition("\n")
            if language.lower().startswith("json"):
                cleaned = body
        if "```" in cleaned:
            cleaned = cleaned.split("```", 1)[0]
    cleaned = cleaned.strip()
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Generated LogicalQuery must be a JSON object")
    return parsed


async def _run_semantic_query(*, project_id: str, query: Dict[str, Any], role: str = "admin") -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            SEMANTIC_QUERY_URL,
            json={
                "projectId": project_id,
                "query": query,
                "role": role,
                "maxRows": 500,
            },
        )
        payload = response.json() if response.content else {}
        if response.status_code >= 400:
            raise HTTPException(status_code=400, detail=payload.get("error") or "Semantic query failed")
        data = payload.get("data") if isinstance(payload, dict) else {}
        if not isinstance(data, dict):
            return {"columns": [], "rows": [], "rowCount": 0, "sql": ""}
        debug = payload.get("debug") if isinstance(payload, dict) else {}
        sql_debug = ""
        if isinstance(debug, dict):
            sql_debug = str(debug.get("sql") or "")
        if not sql_debug and isinstance(data.get("debug"), dict):
            sql_debug = str(data["debug"].get("sql") or "")
        return {
            "columns": data.get("columns", []) if isinstance(data.get("columns"), list) else [],
            "rows": data.get("rows", []) if isinstance(data.get("rows"), list) else [],
            "rowCount": int(data.get("rowCount") or 0),
            "sql": sql_debug,
        }


def _format_summary(
    *,
    schema: List[Dict[str, Any]],
    sql: str,
    rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "schema": schema,
        "query": sql,
        "row_count": len(rows),
        "data": rows,
    }


def _get_single_int(row: Dict[str, Any], *, fallback: int = 0) -> int:
    for value in row.values():
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return fallback


def _safe_ratio(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


@app.on_event("startup")
def startup_event() -> None:
    global ch_client  # noqa: PLW0603
    global openai_client  # noqa: PLW0603
    
    try:
        ch_client = clickhouse_connect.get_client(
            host=CLICKHOUSE_HOST,
            port=CLICKHOUSE_PORT,
            username=CLICKHOUSE_USER,
            password=CLICKHOUSE_PASSWORD,
            database=CLICKHOUSE_DATABASE,
            secure=False,
        )
        logger.info("Connected to ClickHouse at %s:%s", CLICKHOUSE_HOST, CLICKHOUSE_PORT)
    except Exception as exc:
        ch_client = None
        logger.warning("ClickHouse connection failed (not critical for agent endpoints): %s", exc)

    try:
        # Will use OPENAI_API_KEY from environment.
        openai_client = OpenAI()
        logger.info("OpenAI client initialized")
    except Exception:
        openai_client = None
        logger.warning("OpenAI client not initialized (missing OPENAI_API_KEY?)")


@app.on_event("shutdown")
def shutdown_event() -> None:
    if ch_client is not None:
        ch_client.close()
        logger.info("Closed ClickHouse connection")


def _require_openai() -> OpenAI:
    if openai_client is None:
        raise HTTPException(status_code=500, detail="OpenAI client unavailable (missing OPENAI_API_KEY?)")
    return openai_client


@app.post("/chat")
def chat(payload: ChatRequest) -> Any:
    """Back-compat endpoint for Next.js `/api/commands/parse`.

    It expects an OpenAI-like response shape: `choices[0].message.content`.
    """
    client = _require_openai()
    try:
        temperature = float(payload.temperature) if payload.temperature is not None else 0.1
    except Exception:
        temperature = 0.1

    max_tokens = int(payload.max_tokens) if payload.max_tokens is not None else 512

    try:
        res = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": str(m.get("role", "user")), "content": str(m.get("content", ""))}
                for m in (payload.messages or [])
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        # Return a dict-like object compatible with current Next.js parser.
        return JSONResponse(content=json.loads(res.model_dump_json()))
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("/chat failed")
        raise HTTPException(status_code=500, detail="OpenAI chat failed") from exc


def _tool_schema() -> List[Dict[str, Any]]:
    """Minimal tool schema for MVP planning.

    Keep this small at first; we can add more tools later.
    """
    return [
        {
            "type": "function",
            "function": {
                "name": "chart_create",
                "description": "Create a new chart node on the dashboard canvas.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "chartName": {"type": "string", "description": "Display name of the chart"},
                        "vizType": {"type": "string", "description": "Visualization type (line, bar, table, pie, etc.)"},
                    },
                    "required": ["chartName", "vizType"],
                    "additionalProperties": True,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "chart_set_query",
                "description": "Configure semantic logicalQuery for a chart (source model + dimensions + measures).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "chartId": {"type": "string"},
                        "sourceModel": {"type": "string"},
                        "dimensions": {"type": "array", "items": {"type": "string"}},
                        "measures": {"type": "array", "items": {"type": "string"}},
                        "limit": {"type": "integer"},
                    },
                    "required": ["chartId", "sourceModel"],
                    "additionalProperties": True,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "chart_add_dimension_measure",
                "description": "Add one semantic dimension and/or measure to chart logicalQuery without replacing existing fields.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "chartId": {"type": "string"},
                        "sourceModel": {"type": "string"},
                        "dimension": {"type": "string"},
                        "measure": {"type": "string"},
                    },
                    "required": ["chartId"],
                    "additionalProperties": True,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "viz_set_type",
                "description": "Set visualization type for an existing chart.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "chartId": {"type": "string"},
                        "vizType": {"type": "string"},
                    },
                    "required": ["chartId", "vizType"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "filters_add",
                "description": "Add a BI filter (report/page/visual scope).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string"},
                        "op": {"type": "string"},
                        "values": {"type": "array", "items": {"type": "string"}},
                        "scope": {"type": "string"},
                        "pageKey": {"type": "string"},
                        "sourceChartId": {"type": "string"},
                    },
                    "required": ["field", "op", "values", "scope"],
                    "additionalProperties": True,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "dashboard_delete_node",
                "description": "Delete a node from canvas. Destructive: requires confirmation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "chartId": {"type": "string"},
                    },
                    "required": ["chartId"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "slicer_create",
                "description": "Create a new slicer (interactive filter control) from an existing chart.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "sourceChartId": {"type": "string", "description": "ID of chart to create slicer from"},
                    },
                    "required": ["sourceChartId"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "slicer_set_field",
                "description": "Set which field/column a slicer should filter by.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "slicerId": {"type": "string", "description": "ID of the slicer node"},
                        "fieldRef": {"type": "string", "description": "Field reference (e.g., 'table.column' or 'region')"},
                    },
                    "required": ["slicerId", "fieldRef"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "slicer_select_values",
                "description": "Select specific values in a slicer to filter data.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "slicerId": {"type": "string", "description": "ID of the slicer node"},
                        "values": {"type": "array", "items": {"type": "string"}, "description": "Values to select"},
                    },
                    "required": ["slicerId", "values"],
                    "additionalProperties": False,
                },
            },
        },
    ]


@app.post("/agent/plan", response_model=AgentPlanResponse)
def agent_plan(payload: AgentPlanRequest) -> AgentPlanResponse:
    client = _require_openai()
    text = str(payload.text or "").strip()
    if not text:
        return AgentPlanResponse(ok=False, error="text is required")

    ctx = payload.context if isinstance(payload.context, dict) else {}
    active_chart_id = str(ctx.get("activeChartId") or "").strip()
    effective_page_key = str(ctx.get("effectivePageKey") or "").strip()

    system = (
        "You are an expert dashboard control agent for PocketAnalyst BI platform.\n"
        "Your role: interpret user commands and return precise tool calls to control the dashboard UI.\n\n"
        
        "=== DASHBOARD ARCHITECTURE ===\n"
        "The dashboard is a canvas-based BI tool where users create interactive reports:\n"
        "- Canvas: infinite 2D workspace containing chart nodes and slicer nodes\n"
        "- Charts: visualizations (bar, line, pie, table, etc.) connected to data sources\n"
        "- Slicers: interactive filter controls that affect other visuals\n"
        "- Pages/Tabs: organize multiple canvas views in one report\n"
        "- BI Filters: cross-visual filtering system with 3 scopes (report/page/visual)\n\n"
        
        "=== AVAILABLE TOOLS ===\n\n"
        
        "0. chart_create(chartName, vizType)\n"
        "   Purpose: Create a new chart node on canvas\n"
        "   Parameters:\n"
        "   - chartName (required): title\n"
        "   - vizType (required): visualization type\n"
        "\n"
        
        "0.1 chart_set_query(chartId, sourceModel, [dimensions], [measures], [limit])\n"
        "   Purpose: Configure semantic query for an existing chart\n"
        "   Parameters:\n"
        "   - chartId (required): target chart\n"
        "   - sourceModel (required): semantic model name\n"
        "   - dimensions/measures: arrays of field refs\n"
        "\n"

        "0.2 chart_add_dimension_measure(chartId, [sourceModel], [dimension], [measure])\n"
        "   Purpose: Incrementally add fields into existing semantic query (append + dedupe)\n"
        "   Parameters:\n"
        "   - chartId (required): target chart\n"
        "   - sourceModel (optional): use if chart has no sourceModel yet\n"
        "   - dimension (optional): one dimension field ref to add\n"
        "   - measure (optional): one measure field ref to add\n"
        "\n"
        
        "1. viz_set_type(chartId, vizType)\n"
        "   Purpose: Change visualization type of an existing chart\n"
        "   Parameters:\n"
        "   - chartId (required): ID of target chart. Use activeChartId from context if user says 'this chart', 'current chart', or doesn't specify.\n"
        "   - vizType (required): One of: 'bar', 'line', 'pie', 'area', 'scatter', 'table', 'metric', 'funnel', 'cohort', 'retention', 'userflow'\n"
        "   Examples:\n"
        "   - 'сделай график bar' → viz_set_type(activeChartId, 'bar')\n"
        "   - 'change to line chart' → viz_set_type(activeChartId, 'line')\n"
        "   - 'make it a table' → viz_set_type(activeChartId, 'table')\n\n"
        
        "2. filters_add(field, op, values, scope, [pageKey], [sourceChartId])\n"
        "   Purpose: Add BI filter to control what data is displayed\n"
        "   Parameters:\n"
        "   - field (required): Column/field name to filter (e.g., 'region', 'date', 'product_name')\n"
        "   - op (required): Operator - 'eq' (equals), 'neq' (not equals), 'gt' (greater than), 'lt' (less than), 'gte', 'lte', 'contains', 'in'\n"
        "   - values (required): Array of values to filter by, e.g., ['Europe', 'Asia'] or ['2024-01-01']\n"
        "   - scope (required): Filter scope:\n"
        "     * 'report' - affects ALL charts in entire report (cross-page)\n"
        "     * 'page' - affects all charts on current page/tab only (requires pageKey)\n"
        "     * 'visual' - affects only charts connected to this source (requires sourceChartId)\n"
        "   - pageKey (optional): Required if scope='page'. Use effectivePageKey from context.\n"
        "   - sourceChartId (optional): Required if scope='visual'. Use activeChartId from context.\n"
        "   Examples:\n"
        "   - 'filter by region Europe' → filters_add('region', 'eq', ['Europe'], 'visual', sourceChartId=activeChartId)\n"
        "   - 'show only 2024 data for all charts' → filters_add('year', 'eq', ['2024'], 'report')\n"
        "   - 'exclude cancelled orders on this page' → filters_add('status', 'neq', ['cancelled'], 'page', pageKey=effectivePageKey)\n\n"
        
        "3. dashboard_delete_node(chartId)\n"
        "   Purpose: Delete a chart or slicer from canvas (DESTRUCTIVE)\n"
        "   Parameters:\n"
        "   - chartId (required): ID of node to delete. Use activeChartId from context if user says 'this', 'current'.\n"
        "   CRITICAL: ALWAYS set requiresConfirmation=true and provide clear confirmationMessage\n"
        "   Examples:\n"
        "   - 'delete this chart' → dashboard_delete_node(activeChartId) + confirmation\n"
        "   - 'remove current visual' → dashboard_delete_node(activeChartId) + confirmation\n\n"
        
        "4. slicer_create(sourceChartId)\n"
        "   Purpose: Create a new slicer (interactive filter control) from an existing chart\n"
        "   Parameters:\n"
        "   - sourceChartId (required): ID of chart to create slicer from. Use activeChartId if user says 'this chart'.\n"
        "   What it does: Creates a slicer node next to the source chart. Slicer will filter data for connected visuals.\n"
        "   Examples:\n"
        "   - 'создай срез для этого графика' → slicer_create(activeChartId)\n"
        "   - 'add a slicer for this chart' → slicer_create(activeChartId)\n"
        "   - 'make a filter control' → slicer_create(activeChartId)\n\n"
        
        "5. slicer_set_field(slicerId, fieldRef)\n"
        "   Purpose: Configure which field/column a slicer should filter by\n"
        "   Parameters:\n"
        "   - slicerId (required): ID of the slicer node. Use activeChartId if current node is a slicer.\n"
        "   - fieldRef (required): Field reference in format 'table.column' or just 'column_name'\n"
        "   Examples:\n"
        "   - 'настрой срез по региону' → slicer_set_field(activeChartId, 'region')\n"
        "   - 'set slicer field to category' → slicer_set_field(activeChartId, 'category')\n"
        "   - 'filter by product_name' → slicer_set_field(activeChartId, 'product_name')\n\n"
        
        "6. slicer_select_values(slicerId, values)\n"
        "   Purpose: Select specific values in a slicer to apply filtering\n"
        "   Parameters:\n"
        "   - slicerId (required): ID of the slicer node. Use activeChartId if current node is a slicer.\n"
        "   - values (required): Array of values to select, e.g., ['Europe', 'Asia'] or ['2024']\n"
        "   What it does: Selects values in slicer UI and applies BI filter to connected charts\n"
        "   Examples:\n"
        "   - 'выбери Европа и Азия' → slicer_select_values(activeChartId, ['Европа', 'Азия'])\n"
        "   - 'select only Premium category' → slicer_select_values(activeChartId, ['Premium'])\n"
        "   - 'filter to 2024 and 2023' → slicer_select_values(activeChartId, ['2024', '2023'])\n\n"
        
        "=== CRITICAL RULES ===\n"
        "1. NEVER invent IDs - always use activeChartId/effectivePageKey from context\n"
        "2. If user doesn't specify which chart → use activeChartId (the currently selected chart)\n"
        "3. For destructive actions (delete) → MUST set requiresConfirmation=true + clear message\n"
        "4. Filter scope selection:\n"
        "   - User says 'for this chart/visual' → scope='visual', sourceChartId=activeChartId\n"
        "   - User says 'for this page/tab' → scope='page', pageKey=effectivePageKey\n"
        "   - User says 'for all/entire report' → scope='report'\n"
        "   - Default if unclear → scope='visual' (safest, affects least)\n"
        "5. Multi-value filters: values is ALWAYS an array, even for single value: ['Europe'] not 'Europe'\n"
        "6. Field names: use exact names from user input, preserve case/underscores\n"
        "7. If command is ambiguous → prefer safest interpretation (visual scope over report scope)\n\n"

        "8. Query edit strategy (IMPORTANT):\n"
        "   - If user says add/also/include one more field/metric/dimension → use chart_add_dimension_measure\n"
        "   - If user says set/replace/rebuild query fields → use chart_set_query\n"
        "   - If user asks to create a new chart from scratch with fields → usually chain: chart_create → chart_set_query → optional viz_set_type\n"
        "9. Keep changes minimal: for incremental edits prefer append tool over full replacement\n"
        "10. Return ONLY tool calls, never plain-text JSON\n\n"

        "=== TOOL SELECTION EXAMPLES (RU/EN) ===\n"
        "- 'добавь метрику revenue к текущему графику' → chart_add_dimension_measure(chartId=activeChartId, measure='revenue')\n"
        "- 'добавь измерение country' → chart_add_dimension_measure(chartId=activeChartId, dimension='country')\n"
        "- 'замени поля: x=date, y=orders' → chart_set_query(chartId=activeChartId, sourceModel=..., dimensions=['...date'], measures=['...orders'])\n"
        "- 'create a new bar chart by region and sales' → chart_create('Sales by Region','bar') + chart_set_query(newChartId, sourceModel, ['...region'], ['...sales'])\n"
        "- 'also include profit' → chart_add_dimension_measure(chartId=activeChartId, measure='profit')\n\n"
        
        "=== CONTEXT (Current State) ===\n"
        + json.dumps(
            {
                "activeChartId": active_chart_id or None,
                "effectivePageKey": effective_page_key or None,
                "biFiltersVersion": ctx.get("biFiltersVersion"),
                "pageScopeMode": ctx.get("pageScopeMode"),
                "note": "activeChartId is the currently selected/focused chart. Use it when user says 'this chart', 'current', or doesn't specify."
            },
            ensure_ascii=False,
            indent=2
        ) + "\n\n"
        
        "=== RESPONSE INSTRUCTIONS ===\n"
        "CRITICAL: You MUST use function calling (tool_calls), NOT text responses.\n"
        "- Call the appropriate tool with correct parameters\n"
        "- For destructive actions (delete), the backend will automatically add confirmation\n"
        "- Do NOT return JSON in text - use the tool calling mechanism\n\n"
        
        "Think step-by-step:\n"
        "1. Parse user intent (what action? which target?)\n"
        "2. Map to appropriate tool function\n"
        "3. Extract/infer parameters from context\n"
        "4. Validate all required fields are present\n"
        "5. Call the tool with precise arguments"
    )

    user = f"User command: {text}"

    try:
        res = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            tools=_tool_schema(),
            tool_choice="auto",
            temperature=0.2,
            max_tokens=800,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("/agent/plan failed")
        return AgentPlanResponse(ok=False, error="planning failed")

    msg = res.choices[0].message
    tool_calls = []
    for tc in (msg.tool_calls or []):
        name = str(tc.function.name)
        try:
            args = json.loads(tc.function.arguments or "{}")
        except Exception:
            args = {}
        if not isinstance(args, dict):
            args = {}

        # Best-effort normalization for noisy voice commands / partial tool args.
        if name in ("viz_set_type", "chart_set_query", "chart_add_dimension_measure", "dashboard_delete_node"):
            chart_id = str(args.get("chartId") or "").strip()
            if not chart_id and active_chart_id:
                args["chartId"] = active_chart_id

        if name == "slicer_create":
            src = str(args.get("sourceChartId") or "").strip()
            if not src and active_chart_id:
                args["sourceChartId"] = active_chart_id

        if name in ("slicer_set_field", "slicer_select_values"):
            sid = str(args.get("slicerId") or "").strip()
            if not sid and active_chart_id:
                args["slicerId"] = active_chart_id

        if name == "filters_add":
            vals = args.get("values")
            if vals is None:
                args["values"] = []
            elif not isinstance(vals, list):
                args["values"] = [vals]

            scope = str(args.get("scope") or "").strip().lower()
            if scope == "page":
                pk = str(args.get("pageKey") or "").strip()
                if not pk and effective_page_key:
                    args["pageKey"] = effective_page_key
            if scope == "visual":
                src = str(args.get("sourceChartId") or "").strip()
                if not src and active_chart_id:
                    args["sourceChartId"] = active_chart_id

        requires = False
        confirm_msg: str | None = None
        if name in ("dashboard_delete_node",):
            requires = True
            confirm_msg = f"Delete node {args.get('chartId', '')}?"

        tool_calls.append(
            AgentPlanToolCall(
                tool=name,
                args=args if isinstance(args, dict) else {},
                requiresConfirmation=requires or None,
                confirmationMessage=confirm_msg,
            )
        )

    explanation = msg.content.strip() if isinstance(msg.content, str) else None
    if not tool_calls:
        return AgentPlanResponse(ok=False, error="No tool calls produced", explanation=explanation)

    return AgentPlanResponse(ok=True, explanation=explanation, toolCalls=tool_calls, warnings=[])


@app.post("/agent/speech-to-text", response_model=SpeechToTextResponse)
async def agent_speech_to_text(audio: UploadFile = File(...)) -> SpeechToTextResponse:
    """Speech-to-text via Whisper.

    Expects multipart form-data with a single file field named `audio`.
    """
    try:
        import tempfile
        import whisper  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return SpeechToTextResponse(
            ok=False,
            error=(
                "Whisper is not installed in ai-service environment. "
                "Install openai-whisper and ensure ffmpeg is available on PATH."
            ),
        )

    try:
        suffix = os.path.splitext(audio.filename or "audio")[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            content = await audio.read()
            tmp.write(content)

        model_name = str(WHISPER_MODEL or "turbo").strip() or "turbo"
        model = whisper.load_model(model_name)
        result = model.transcribe(tmp_path)
        text = str(result.get("text") or "").strip()
        return SpeechToTextResponse(ok=True, text=text)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Whisper transcription failed")
        return SpeechToTextResponse(
            ok=False,
            error="Speech-to-text failed (check ffmpeg installation and audio format)",
        )
    finally:
        try:
            if 'tmp_path' in locals() and tmp_path:
                os.unlink(tmp_path)
        except Exception:
            pass


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/insight", response_model=InsightResponse)
async def create_insight(payload: InsightRequest) -> InsightResponse:
    metric = (payload.metric or DEFAULT_METRIC).lower().strip()
    question = (payload.question or f"Дай последнее обновление по метрике {metric}").strip()
    project_context: Optional[str] = payload.project_id

    if not _has_llm_credentials():
        logger.warning("LiteLLM credentials missing; serving fallback insight")
        sql = METRIC_QUERIES.get(metric, METRIC_QUERIES[DEFAULT_METRIC])
        rows = _safe_query(sql)
        if metric == "retention":
            summary = {"schema": [], "query": sql, "row_count": len(rows), "data": rows}
        elif metric == "activity":
            summary = {"schema": [], "query": sql, "row_count": len(rows), "data": rows}
        else:
            summary = {"schema": [], "query": sql, "row_count": len(rows), "data": rows}
        insight_text = (
            "Configure LiteLLM credentials to enable live AI insights. Currently returning fallback analysis."
        )
        return InsightResponse(
            question=question,
            metric=metric,
            sql=sql,
            summary=summary,
            insight=insight_text,
        )

    schema_rows = _safe_query(
        """
        SELECT name, type
        FROM system.columns
        WHERE database = currentDatabase()
          AND table = 'events'
        ORDER BY position
        """
    )

    schema_text = "\n".join(f"- {row['name']}: {row['type']}" for row in schema_rows) or "(схема недоступна)"

    sql_query = ""
    rows: List[Dict[str, Any]] = []
    semantic_used = False

    if project_context:
        logical_query_messages = [
            {
                "role": "system",
                "content": (
                    "Ты — архитектор BI Query Engine. Сгенерируй ТОЛЬКО JSON-объект LogicalQuery.\n"
                    "Формат JSON:\n"
                    "{\n"
                    "  \"sourceModel\": \"events\",\n"
                    "  \"dimensions\": [\"events.event_name\"],\n"
                    "  \"measures\": [\"events.event_count\"],\n"
                    "  \"filters\": [{\"field\": \"events.timestamp\", \"op\": \"gte\", \"values\": [\"2026-01-01\"]}],\n"
                    "  \"limit\": 100\n"
                    "}\n"
                    "Правила:\n"
                    "- Только валидный JSON, без markdown.\n"
                    "- Используй refs в формате Model.field.\n"
                    "- Не генерируй SQL.\n"
                ),
            },
            {
                "role": "user",
                "content": f"Сформируй LogicalQuery для вопроса: {question}",
            },
        ]
        try:
            logical_query_raw = await _call_litellm(logical_query_messages, temperature=0.0, max_tokens=320)
            logical_query = _extract_json_object(logical_query_raw)
            semantic_result = await _run_semantic_query(project_id=project_context, query=logical_query, role="admin")
            cols = [str(c) for c in semantic_result.get("columns", [])]
            semantic_rows = semantic_result.get("rows", [])
            rows = []
            if isinstance(semantic_rows, list):
                for row in semantic_rows:
                    if not isinstance(row, list):
                        continue
                    obj: Dict[str, Any] = {}
                    for idx, col in enumerate(cols):
                        obj[col] = row[idx] if idx < len(row) else None
                    rows.append(obj)
            sql_query = str(semantic_result.get("sql") or json.dumps(logical_query, ensure_ascii=False))
            semantic_used = True
        except Exception as semantic_exc:  # noqa: BLE001
            logger.warning("Semantic insight query failed, fallback to SQL path: %s", semantic_exc)

    if not semantic_used:
        sql_messages = [
            {
                "role": "system",
                "content": (
                    "Ты — эксперт по ClickHouse. На основе вопроса пользователя и схемы таблицы сгенерируй ТОЛЬКО SQL-запрос.\n"
                    "Схема таблицы events:\n"
                    f"{schema_text}\n"
                    "Правила:\n"
                    "- Возвращай только SQL без пояснений и форматирования.\n"
                    "- Работай только с таблицей events.\n"
                    "- Используй только перечисленные столбцы."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Вопрос пользователя: {question}"
                    + (f"\nКонтекст: project_id = {project_context}" if project_context else "")
                ),
            },
        ]

        sql_raw = await _call_litellm(sql_messages, temperature=0.0, max_tokens=256)
        sql_query = _extract_sql(sql_raw)
        rows = _safe_query(sql_query)

    funnel_sql = """
        SELECT
          countIf(event_name = 'signup') AS signup,
          countIf(event_name = 'upgrade_click') AS upgrade_click,
          countIf(event_name = 'purchase') AS purchase
        FROM events
        WHERE timestamp >= now() - INTERVAL 30 DAY
    """
    funnel_rows = _safe_query(funnel_sql)
    funnel = funnel_rows[0] if funnel_rows else {"signup": 0, "upgrade_click": 0, "purchase": 0}
    funnel_signup = int(funnel.get("signup", 0))
    funnel_upgrade = int(funnel.get("upgrade_click", 0))
    funnel_purchase = int(funnel.get("purchase", 0))

    conversions = {
        "purchase_per_signup": _safe_ratio(funnel_purchase, funnel_signup),
        "purchase_per_upgrade_click": _safe_ratio(funnel_purchase, funnel_upgrade),
    }

    analysis_payload = {
        "question": question,
        "schema": schema_rows,
        "generated_sql": sql_query,
        "result_rows": rows,
        "funnel_30d": {
            "signup": funnel_signup,
            "upgrade_click": funnel_upgrade,
            "purchase": funnel_purchase,
            "conversions": conversions,
        },
    }

    insight_messages = [
        {
            "role": "system",
            "content": (
                "Ты — Senior Data Analyst. Работай строго по данным, без домыслов.\n"
                "Если делаешь предположения — явно помечай их как ГИПОТЕЗЫ.\n"
                "Формат ответа строго в 3 блоках (с заголовками):\n"
                "1) Факты из данных\n"
                "2) Гипотезы\n"
                "3) Следующий SQL для проверки\n"
                "Схема таблицы events:\n"
                f"{schema_text}\n"
                "Если данных в таблице нет, честно скажи: 'Я готов к работе, жду первого импульса данных от Vector'."
            ),
        },
        {
            "role": "user",
            "content": (
                "Контекст для анализа (JSON):\n"
                f"{json.dumps(analysis_payload, ensure_ascii=False)}"
            ),
        },
    ]

    insight_text = await _call_litellm(
        insight_messages,
        temperature=float(os.getenv("LITELLM_TEMPERATURE", "0.15")),
        max_tokens=int(os.getenv("LITELLM_MAX_TOKENS", "384")),
    )

    summary = _format_summary(schema=schema_rows, sql=sql_query, rows=rows)

    return InsightResponse(
        question=question,
        metric=metric,
        sql=sql_query,
        summary=summary,
        insight=insight_text,
    )
