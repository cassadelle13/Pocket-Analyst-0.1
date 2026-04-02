import { buildExprContextForPipelineStep, getCompletions, getEditorDiagnostics, getExecutionType, resolveComputeGraph } from "../expressionEngine";
import { test } from "vitest";

type GoldenCase = {
  name: string;
  uiFormula: string;
  expect: {
    ok?: boolean;
    hasErrorContains?: string;
    expectAnyError?: boolean;
    expectErrorWithSpan?: boolean;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runGoldenCtx() {
  const semanticModelV1 = {
    models: {
      app: {
        dimensions: {
          user_id: { type: "string" },
          country: { type: "string" },
          ts: { type: "datetime" },
          order_id: { type: "string" },
          buyer_id: { type: "string" },
          visitor_id: { type: "string" },
          payer_id: { type: "string" },
          session_id: { type: "string" },
        },
        measures: {
          revenue: { type: "number" },
          cost: { type: "number" },
          discount: { type: "number" },
        },
      },
    },
  } as const;

  const steps = [
    { id: "s1", kind: "compute", outputId: "revenue_per_user" },
    { id: "s2", kind: "compute", outputId: "profit" },
    { id: "s3", kind: "compute", outputId: "gross_profit" },
    { id: "s4", kind: "transform", outputId: "t" },
  ];

  const ctx = buildExprContextForPipelineStep({
    semanticModelV1,
    sourceModel: "app",
    dialect: "postgres",
    mode: "legacy-calc-expr",
    steps,
    stepId: "s2",
  });

  return { ctx };
}

const GOLDEN: GoldenCase[] = [
  {
    name: "1. Базовая выручка",
    uiFormula: "revenue",
    expect: {
      ok: true,
    },
  },
  {
    name: "2. Количество заказов",
    uiFormula: "order_id",
    expect: {
      ok: true,
    },
  },
  {
    name: "3. Средний чек (AOV)",
    uiFormula: "revenue / NULLIF(order_id, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "4. ARPU (на пользователя)",
    uiFormula: "revenue / NULLIF(user_id, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "5. Конверсия в покупку",
    uiFormula: "buyer_id / NULLIF(visitor_id, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "6. Доля платящих пользователей",
    uiFormula: "payer_id / NULLIF(user_id, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "7. Revenue per session",
    uiFormula: "revenue / NULLIF(session_id, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "8. Средний доход на платящего (ARPPU)",
    uiFormula: "revenue / NULLIF(payer_id, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "9. Safe division (NULLIF)",
    uiFormula: "revenue / NULLIF(order_id, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "10. COALESCE fallback",
    uiFormula: "COALESCE(discount, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "11. Margin (маржа)",
    uiFormula: "revenue - cost",
    expect: {
      ok: true,
    },
  },
  {
    name: "12. Margin %",
    uiFormula: "(revenue - cost) / NULLIF(revenue, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "13. Nested DISTINCT + NULLIF",
    uiFormula: "revenue / NULLIF(user_id, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "14. Param reference (SQL, no deps)",
    uiFormula: "@gross_profit / NULLIF(revenue, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "15. Сложная формула (нагрузочная)",
    uiFormula: "(COALESCE(revenue, 0) - COALESCE(cost, 0)) / NULLIF(user_id, 0)",
    expect: {
      ok: true,
    },
  },
  {
    name: "NEG-1. Unknown field in SUM",
    uiFormula: "COALESCE(unknown_field, 0)",
    expect: {
      ok: false,
      hasErrorContains: "Unknown identifier",
    },
  },
  {
    name: "NEG-2. Tolerant parsing (missing paren)",
    uiFormula: "revenue +",
    expect: {
      ok: false,
      expectAnyError: true,
      expectErrorWithSpan: true,
    },
  },
  {
    name: "NEG-3. Recovery in the middle (double op)",
    uiFormula: "revenue + + cost",
    expect: {
      ok: false,
      expectAnyError: true,
      expectErrorWithSpan: true,
    },
  },
  {
    name: "NEG-4. Unclosed function",
    uiFormula: "COALESCE(revenue",
    expect: {
      ok: false,
      expectAnyError: true,
      expectErrorWithSpan: true,
    },
  },
  {
    name: "NEG-5. Extra closing paren",
    uiFormula: "revenue)",
    expect: {
      ok: false,
      expectAnyError: true,
      expectErrorWithSpan: true,
    },
  },
  {
    name: "NEG-6. Nested error (missing right operand inside call)",
    uiFormula: "COALESCE(revenue +, 0)",
    expect: {
      ok: false,
      expectAnyError: true,
      expectErrorWithSpan: true,
    },
  },
  {
    name: "NEG-7. Unknown identifier in expression",
    uiFormula: "revenue + unknown_field",
    expect: {
      ok: false,
      expectAnyError: true,
      expectErrorWithSpan: true,
    },
  },
];

function main() {
  const { ctx } = runGoldenCtx();
  for (const c of GOLDEN) {
    const errors = getEditorDiagnostics({ formula: c.uiFormula, ctx });
    const ok = (errors?.length ?? 0) === 0;

    if (c.expect.ok != null) {
      assert(ok === c.expect.ok, `[${c.name}] expected ok=${String(c.expect.ok)} got ok=${String(ok)}; errors=${errors.map((e) => e.message).join(" | ")}`);
    }
    if (c.expect.expectAnyError) {
      assert((errors?.length ?? 0) > 0, `[${c.name}] expected at least one error`);
    }
    if (c.expect.expectErrorWithSpan) {
      const errs = Array.isArray(errors) ? errors : [];
      for (const e of errs) {
        assert(Number(e?.line ?? 0) > 0, `[${c.name}] expected error.line > 0`);
        assert(Number(e?.column ?? 0) > 0, `[${c.name}] expected error.column > 0`);
        assert(Number(e?.endColumn ?? 0) >= Number(e?.column ?? 0), `[${c.name}] expected error.endColumn >= error.column`);
      }
    }
    if (c.expect.hasErrorContains) {
      const has = (errors ?? []).some((e) => String(e.message ?? "").includes(c.expect.hasErrorContains!));
      assert(has, `[${c.name}] expected an error containing '${c.expect.hasErrorContains}'`);
    }
  }

  // Completions adapter unit tests
  {
    const items = getCompletions({ ctx, position: 0, ast: null, formula: "" });
    assert(items.some((i) => i.kind === "function"), "[completions] expected functions at start");
    assert(items.some((i) => i.kind === "field"), "[completions] expected fields at start");
  }
  {
    const pos = "COALESCE(".length;
    const items = getCompletions({ ctx, position: pos, ast: null, formula: "COALESCE(" });
    assert(items.some((i) => i.kind === "field"), "[completions] expected fields inside call args");
    assert(!items.some((i) => i.kind === "function"), "[completions] expected no functions inside call args");
  }
  {
    const items = getCompletions({ ctx, position: 3, ast: null, formula: "rev" });
    assert(items.some((i) => String(i.label).toLowerCase().startsWith("rev")), "[completions] expected prefix filtering to include revenue");
    assert(items.every((i) => String(i.label).toLowerCase().startsWith("rev")), "[completions] expected all items to match prefix");
  }

  // Completions golden: invariants over contexts/boundaries
  {
    const formula = "revenue + ";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(items.some((i) => i.kind === "function"), "[completions] expected functions after operator");
    assert(items.some((i) => i.kind === "field"), "[completions] expected fields after operator");
  }
  {
    const formula = "revenue + SU";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(items.every((i) => i.kind === "function"), "[completions] expected only functions for prefix 'SU'");
  }
  {
    const formula = "SUM(";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(!items.some((i) => i.kind === "function"), "[completions] expected no functions inside SUM(args)");
    assert(items.some((i) => i.kind === "field"), "[completions] expected fields inside SUM(args)");
  }
  {
    const formula = "COALESCE(revenue, ";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(!items.some((i) => i.kind === "function"), "[completions] expected no functions after comma in args");
    assert(items.some((i) => i.kind === "field"), "[completions] expected fields after comma in args");
  }
  {
    const formula = "COALESCE(revenue, co";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(items.every((i) => i.kind !== "function"), "[completions] expected no functions for prefix inside args");
    assert(items.every((i) => String(i.label).toLowerCase().startsWith("co")), "[completions] expected prefix filtering (co) inside args");
  }
  {
    const formula = " ";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(items.some((i) => i.kind === "function"), "[completions] expected functions after whitespace");
  }
  {
    const formula = "COALESCE(revenue, 0";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(!items.some((i) => i.kind === "function"), "[completions] expected no functions after numeric literal in args");
  }
  {
    const formula = "COALESCE(revenue, 0, ";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(!items.some((i) => i.kind === "function"), "[completions] expected no functions after comma+space in args");
    assert(items.some((i) => i.kind === "field"), "[completions] expected fields after comma+space in args");
  }
  {
    const formula = "COALESCE(COALESCE(revenue, 0), ";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(!items.some((i) => i.kind === "function"), "[completions] expected no functions inside nested call args");
    assert(items.some((i) => i.kind === "field"), "[completions] expected fields inside nested call args");
  }
  {
    const formula = "COA";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(items.length > 0, "[completions] expected suggestions for function prefix");
    assert(items.every((i) => String(i.label).toLowerCase().startsWith("coa")), "[completions] expected prefix filtering (COA)");
    assert(items.some((i) => i.kind === "function"), "[completions] expected functions for prefix (COA)");
  }
  {
    const formula = "revenue + co";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(items.some((i) => i.kind === "function"), "[completions] expected functions for prefix (co)");
    assert(items.every((i) => String(i.label).toLowerCase().startsWith("co")), "[completions] expected prefix filtering (co) after operator");
  }
  {
    const formula = "revenue +   ";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(items.some((i) => i.kind === "function"), "[completions] expected functions after operator + spaces");
    assert(items.some((i) => i.kind === "field"), "[completions] expected fields after operator + spaces");
  }
  {
    const formula = "COALESCE((revenue + cost), ";
    const items = getCompletions({ ctx, position: formula.length, ast: null, formula });
    assert(!items.some((i) => i.kind === "function"), "[completions] expected no functions inside args with nested parens");
    assert(items.some((i) => i.kind === "field"), "[completions] expected fields inside args with nested parens");
  }

  // Execution / SQL-eligibility golden (editor badge contract)
  {
    const formula = "revenue + cost";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "sql", "[execution] expected sql for revenue + cost");
  }
  {
    const formula = "COALESCE(revenue, 0)";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "sql", "[execution] expected sql for COALESCE(revenue, 0)");
  }
  {
    const formula = "NULLIF(revenue, 0)";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "sql", "[execution] expected sql for NULLIF(revenue, 0)");
  }
  {
    const formula = "COALESCE(revenue, 0) + cost";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "sql", "[execution] expected sql for COALESCE(revenue, 0) + cost");
  }
  {
    const formula = "revenue + unknown_field";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "client", "[execution] expected client for unknown identifier");
  }
  {
    const formula = "revenue +";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "client", "[execution] expected client for parse error");
  }
  {
    const formula = "SUM(revenue)";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "sql", "[execution] expected sql for SUM(revenue)");
  }
  {
    const formula = "COUNT(order_id)";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "sql", "[execution] expected sql for COUNT(order_id)");
  }
  {
    const formula = "IF(revenue > cost AND NOT (discount > revenue), revenue, cost)";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "sql", "[execution] expected sql for IF with compare/AND/NOT");
  }
  {
    const formula = "CASE WHEN revenue > cost THEN 'profit' ELSE 'loss' END";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "sql", "[execution] expected sql for searched CASE");
  }
  {
    const formula = "CASE country WHEN 'US' THEN 1 ELSE 0 END";
    const exec = getExecutionType({ formula, ctx });
    assert(exec === "sql", "[execution] expected sql for simple CASE");
  }

  // Graph golden: stable topo and cycle detection sanity
  const computeById = {
    a: { deps: [{ type: "compute", id: "b" }] },
    b: { deps: [{ type: "compute", id: "c" }] },
    c: { deps: [] },
  } as any;
  const g1 = resolveComputeGraph({ rootIds: ["a"], computeById });
  assert(JSON.stringify(g1.order) === JSON.stringify(["c", "b", "a"]), `[graph] expected order c,b,a got ${JSON.stringify(g1.order)}`);

  const computeByIdCycle = {
    a: { deps: [{ type: "compute", id: "b" }] },
    b: { deps: [{ type: "compute", id: "a" }] },
  } as any;
  const g2 = resolveComputeGraph({ rootIds: ["a"], computeById: computeByIdCycle });
  assert(g2.issues.some((i: any) => i.type === "cycle"), `[graph] expected cycle issue`);

  // eslint-disable-next-line no-console
  console.log("expr golden suite: OK");
}

test("expr golden suite", () => {
  main();
});
