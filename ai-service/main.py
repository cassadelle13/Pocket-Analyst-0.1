import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

import clickhouse_connect
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from litellm import completion
from pydantic import BaseModel

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "storage")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")
CLICKHOUSE_DATABASE = os.getenv("CLICKHOUSE_DATABASE", "analytics")

LITELLM_MODEL = os.getenv("LITELLM_MODEL", "deepseek-chat")

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
        FROM events
        GROUP BY event_date
        ORDER BY event_date DESC
        LIMIT 14
    """,
    "events": """
        SELECT event_name,
               count() AS event_count
        FROM events
        GROUP BY event_name
        ORDER BY event_count DESC
        LIMIT 10
    """,
    "activity": """
        SELECT toStartOfInterval(timestamp, INTERVAL 1 HOUR) AS bucket,
               count() AS events
        FROM events
        WHERE timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY bucket
        ORDER BY bucket
    """,
}

DEFAULT_METRIC = "events"


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
    ch_client = clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST,
        port=CLICKHOUSE_PORT,
        username=CLICKHOUSE_USER,
        password=CLICKHOUSE_PASSWORD,
        database=CLICKHOUSE_DATABASE,
        secure=False,
    )
    logger.info("Connected to ClickHouse at %s:%s", CLICKHOUSE_HOST, CLICKHOUSE_PORT)


@app.on_event("shutdown")
def shutdown_event() -> None:
    if ch_client is not None:
        ch_client.close()
        logger.info("Closed ClickHouse connection")


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
