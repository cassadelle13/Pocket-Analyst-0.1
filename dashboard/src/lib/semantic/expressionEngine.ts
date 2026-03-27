import type { CalcAst, CalcParseError, CalcToken } from "./planner";
import { compileCalcAstToSql, parseCalcExpr, parseCalcExprWithDiagnostics, tokenizeCalcExpr } from "./planner";
import { createFullFunctionRegistry } from "./formulaRegistry";

type SqlDialect = "clickhouse" | "postgres";

// Reuse CalcAst from planner.ts as ExprAstV1.
export type ExprAstV1 = CalcAst;

export type ExprSeverity = "error" | "warning";

export type ExprError = {
  message: string;
  line: number;
  column: number;
  endColumn: number;
  severity: ExprSeverity;
};

export type FunctionDef = {
  name: string;
  kind: "agg" | "scalar" | "window" | "window_ordered";
  minArgs: number;
  maxArgs?: number;
};

export type FunctionRegistry = {
  byName: Map<string, FunctionDef>;
  list: FunctionDef[];
};

export type ExprCompletionItem = {
  kind: "field" | "compute" | "function";
  label: string;
  insertText: string;
};

export type ExprHoverInfo = {
  label: string;
  kind: "field" | "compute" | "function" | "unknown";
};

export type ExprSymbolTable = {
  fields: Array<{ name: string; type: string }>;
  computes: Array<{ id: string; type: "number" | "unknown" }>;
};

export type ExprMode = "legacy-calc-expr" | "strict";

export type ExprContext = {
  symbols: ExprSymbolTable;
  dialect: SqlDialect;
  functions: FunctionRegistry;
  mode: ExprMode;
};

export type SemanticModelV1Like = {
  models?: Record<
    string,
    {
      dimensions?: Record<string, { type?: unknown }>;
      measures?: Record<string, { type?: unknown }>;
      defaultTimeDimension?: string;
    }
  >;
};

export type ExprDependency =
  | { type: "field"; name: string }
  | { type: "compute"; id: string };

export type ExprMeta = {
  deps: ExprDependency[];
  hasAggregation: boolean;
  execution: "sql" | "client";
};

export type ExprAnalysis = {
  ast: ExprAstV1 | null;
  deps: ExprDependency[];
  meta: ExprMeta;
  canCompileToSql: boolean;
  errors: ExprError[];
  missingParams?: string[];
};

export type ExprEngineCache = {
  get: (key: string) => ExprAnalysis | undefined;
  set: (key: string, value: ExprAnalysis) => void;
  clear: () => void;
};

export type ExprSession = {
  ctx: ExprContext;
  cache: ExprEngineCache;
};

export type CompileToSqlResult =
  | { ok: true; sql: string; missingParams?: string[] }
  | { ok: false; errors: ExprError[] };

export type ComputeGraphIssue =
  | { type: "missing_compute"; id: string; referencedBy: string }
  | { type: "cycle"; cycle: string[] };

export type ComputeGraphResult = {
  // Closure of all compute ids needed for rootIds (includes roots), deterministically sorted.
  closure: string[];
  // Stable topological order of the closure (dependencies first). If cycles exist, order still returns a best-effort order.
  order: string[];
  issues: ComputeGraphIssue[];
};

export type DependencyV1 =
  | { type: "field"; name: string }
  | { type: "compute"; id: string };

export type ExprLevelV1 = "row" | "aggregate";

export type ExprMetaV1 = {
  deps: DependencyV1[];
  hasAggregation: boolean;
  level: ExprLevelV1;
  execution: "sql" | "client";
};

const AGG_FNS = (() => {
  const reg = createFullFunctionRegistry();
  const out = new Set<string>();
  for (const d of reg.list) {
    if (d.kind === "agg") out.add(String(d.name ?? "").trim().toUpperCase());
  }
  return out;
})();

const SQL_CALL_FNS = (() => {
  const reg = createFullFunctionRegistry();
  const out = new Set<string>();
  for (const d of reg.list) {
    out.add(String(d.name ?? "").trim().toUpperCase());
  }
  return out;
})();

export function normalizeIdentifier(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function createLegacyFunctionRegistry(): FunctionRegistry {
  const full = createFullFunctionRegistry();
  const defs: FunctionDef[] = full.list.map((d) => ({
    name: d.name,
    kind: d.kind,
    minArgs: d.minArgs,
    ...(d.maxArgs == null ? {} : { maxArgs: d.maxArgs }),
  }));
  const byName = new Map<string, FunctionDef>();
  for (const d of defs) byName.set(normalizeIdentifier(d.name), d);
  return { byName, list: defs.slice().sort((a, b) => a.name.localeCompare(b.name)) };
}

export function createFunctionRegistry(mode: ExprMode): FunctionRegistry {
  // For now strict == legacy. Kept as a separate API to make function set evolution explicit.
  void mode;
  return createLegacyFunctionRegistry();
}

function indexToLineColumn(input: string, index: number): { line: number; column: number } {
  const i = Math.max(0, Math.min(Number.isFinite(index) ? index : 0, input.length));
  let line = 1;
  let lastNl = -1;
  for (let p = 0; p < i; p++) {
    if (input.charCodeAt(p) === 10) {
      line++;
      lastNl = p;
    }
  }
  return { line, column: i - lastNl };
}

function parseErrorsToExprErrors(input: string, errs: CalcParseError[]): ExprError[] {
  const out: ExprError[] = [];
  for (const e of errs) {
    const start = Math.max(0, Math.min(e.span.start, input.length));
    const end = Math.max(start, Math.min(e.span.end, input.length));
    const lc = indexToLineColumn(input, start);
    out.push({
      message: String(e.message ?? "Parse error"),
      line: lc.line,
      column: lc.column,
      endColumn: lc.column + Math.max(1, end - start),
      severity: "error",
    });
  }
  return out;
}

function spanToExprError(params: {
  input: string;
  span: { start: number; end: number };
  message: string;
  severity?: ExprSeverity;
}): ExprError {
  const input = params.input;
  const start = Math.max(0, Math.min(params.span.start, input.length));
  const end = Math.max(start, Math.min(params.span.end, input.length));
  const lc = indexToLineColumn(input, start);
  return {
    message: params.message,
    line: lc.line,
    column: lc.column,
    endColumn: lc.column + Math.max(1, end - start),
    severity: params.severity ?? "error",
  };
}

function sortDepsDeterministically(deps: ExprDependency[]): ExprDependency[] {
  return deps
    .slice()
    .sort((a, b) => {
      const ak = a.type === "compute" ? `c:${normalizeIdentifier(a.id)}` : `f:${normalizeIdentifier(a.name)}`;
      const bk = b.type === "compute" ? `c:${normalizeIdentifier(b.id)}` : `f:${normalizeIdentifier(b.name)}`;
      return ak.localeCompare(bk);
    });
}

function hasAggregationInAst(ast: ExprAstV1, ctx: ExprContext): boolean {
  let has = false;
  const visit = (n: ExprAstV1) => {
    if (has) return;
    if (n.kind === "call") {
      const fnNorm = normalizeIdentifier(n.fn);
      const def = ctx.functions.byName.get(fnNorm);
      if (def?.kind === "agg") {
        has = true;
        return;
      }
      for (const a of n.args) visit(a);
      return;
    }
    if (n.kind === "bin") {
      visit(n.left);
      visit(n.right);
      return;
    }
  };
  visit(ast);
  return has;
}

function buildNormalizedSymbolIndex(symbols: ExprSymbolTable): {
  fieldByNorm: Map<string, { name: string; type: string }>;
  computeByNorm: Map<string, { id: string; type: "number" | "unknown" }>;
} {
  const fieldByNorm = new Map<string, { name: string; type: string }>();
  for (const f of Array.isArray(symbols.fields) ? symbols.fields : []) {
    const raw = String((f as any)?.name ?? "").trim();
    if (!raw) continue;
    fieldByNorm.set(normalizeIdentifier(raw), { name: raw, type: String((f as any)?.type ?? "unknown") });
  }
  const computeByNorm = new Map<string, { id: string; type: "number" | "unknown" }>();
  for (const c of Array.isArray(symbols.computes) ? symbols.computes : []) {
    const raw = String((c as any)?.id ?? "").trim();
    if (!raw) continue;
    computeByNorm.set(normalizeIdentifier(raw), { id: raw, type: (c as any)?.type === "number" ? "number" : "unknown" });
  }
  return { fieldByNorm, computeByNorm };
}

function resolveLegacyUnqualifiedFieldRef(params: {
  rawRef: string;
  fieldByNorm: Map<string, { name: string; type: string }>;
}): { ok: true; field: { name: string; type: string } } | { ok: false; kind: "none" | "ambiguous"; matches: string[] } {
  const raw = String(params.rawRef ?? "").trim();
  if (!raw || raw.includes(".")) return { ok: false, kind: "none", matches: [] };
  const want = normalizeIdentifier(raw);
  const matches: string[] = [];
  for (const f of params.fieldByNorm.values()) {
    const name = String(f.name ?? "").trim();
    const last = name.split(".").pop() ?? "";
    if (normalizeIdentifier(last) === want) matches.push(name);
  }
  matches.sort((a, b) => a.localeCompare(b));
  if (matches.length === 1) {
    const f = params.fieldByNorm.get(normalizeIdentifier(matches[0]!));
    if (f) return { ok: true, field: f };
  }
  if (matches.length > 1) return { ok: false, kind: "ambiguous", matches };
  return { ok: false, kind: "none", matches: [] };
}

function validateFunctionsAndCollectDeps(params: {
  input: string;
  ast: ExprAstV1;
  ctx: ExprContext;
}): { deps: ExprDependency[]; errors: ExprError[] } {
  const { input, ast, ctx } = params;
  const { fieldByNorm, computeByNorm } = buildNormalizedSymbolIndex(ctx.symbols);

  const deps: ExprDependency[] = [];
  const seen = new Set<string>();
  const errors: ExprError[] = [];

  const addDep = (d: ExprDependency) => {
    const key = d.type === "compute" ? `c:${normalizeIdentifier(d.id)}` : `f:${normalizeIdentifier(d.name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    deps.push(d);
  };

  const visit = (n: ExprAstV1) => {
    if (n.kind === "ref") {
      const raw = String(n.name ?? "").trim();
      const norm = normalizeIdentifier(raw);
      if (!norm) return;

      const c = computeByNorm.get(norm);
      if (c) {
        addDep({ type: "compute", id: c.id });
        return;
      }
      const f = fieldByNorm.get(norm);
      if (f) {
        addDep({ type: "field", name: f.name });
        return;
      }

      if (ctx.mode === "legacy-calc-expr") {
        const legacy = resolveLegacyUnqualifiedFieldRef({ rawRef: raw, fieldByNorm });
        if (legacy.ok) {
          addDep({ type: "field", name: legacy.field.name });
          return;
        }
        if (legacy.kind === "ambiguous") {
          errors.push(
            spanToExprError({
              input,
              span: n.span,
              message: `Ambiguous identifier: ${raw}. Matches: ${legacy.matches.join(", ")}`,
              severity: "error",
            })
          );
          return;
        }
      }

      errors.push(
        spanToExprError({
          input,
          span: n.span,
          message: `Unknown identifier: ${raw}`,
          severity: "error",
        })
      );
      return;
    }

    if (n.kind === "call") {
      const fnRaw = String(n.fn ?? "");
      const fnNorm = normalizeIdentifier(fnRaw);
      const def = ctx.functions.byName.get(fnNorm);
      if (!def) {
        errors.push(
          spanToExprError({
            input,
            span: n.span,
            message: `Unknown function: ${fnRaw}`,
            severity: "error",
          })
        );
      } else {
        const argc = Array.isArray(n.args) ? n.args.length : 0;
        const minOk = argc >= def.minArgs;
        const maxOk = def.maxArgs == null ? true : argc <= def.maxArgs;
        if (!minOk || !maxOk) {
          errors.push(
            spanToExprError({
              input,
              span: n.span,
              message:
                def.maxArgs == null
                  ? `Wrong number of arguments for ${def.name}: expected >= ${def.minArgs}, got ${argc}`
                  : `Wrong number of arguments for ${def.name}: expected ${def.minArgs}..${def.maxArgs}, got ${argc}`,
              severity: "error",
            })
          );
        }
      }
      for (const a of Array.isArray(n.args) ? n.args : []) visit(a);
      return;
    }

    if (n.kind === "bin") {
      visit(n.left);
      visit(n.right);
      return;
    }
  };

  visit(ast);
  return { deps: sortDepsDeterministically(deps), errors };
}

export function compileAstToSql(ast: ExprAstV1, ctx: ExprContext): CompileToSqlResult {
  // NOTE: During migration, we compile only via the existing SQL emitter (planner.ts).
  // That emitter expects measureAliasByName mapping. Here we use a conservative mapping:
  // - refs that are fields: map to themselves (assuming caller provides already-SQL-safe identifiers)
  // - refs that are computes: do NOT inline (closure injection happens elsewhere); fail compilation
  const measureAliasByName = new Map<string, string>();
  const { fieldByNorm, computeByNorm } = buildNormalizedSymbolIndex(ctx.symbols);
  for (const f of fieldByNorm.values()) {
    measureAliasByName.set(f.name, f.name);
  }

  const computeNorms = new Set<string>(Array.from(computeByNorm.keys()));
  const errors: ExprError[] = [];
  const visit = (n: ExprAstV1) => {
    if (n.kind === "ref") {
      const raw = String(n.name ?? "").trim();
      const norm = normalizeIdentifier(raw);
      if (computeNorms.has(norm)) {
        errors.push(
          spanToExprError({
            input: "",
            span: n.span,
            message: `Cannot compile compute reference to SQL: ${raw}`,
            severity: "error",
          })
        );
      }
      return;
    }
    if (n.kind === "call") {
      for (const a of n.args) visit(a);
      return;
    }
    if (n.kind === "bin") {
      visit(n.left);
      visit(n.right);
    }
  };

  visit(ast);
  if (errors.length) return { ok: false, errors };

  try {
    const missingParams: string[] = [];
    const sql = compileCalcAstToSql(ast, { measureAliasByName, params: undefined, dialect: ctx.dialect, missingParams });
    return { ok: true, sql, missingParams };
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : "SQL compile error";
    return {
      ok: false,
      errors: [spanToExprError({ input: "", span: { start: 0, end: 1 }, message: msg })],
    };
  }
}

export function parseUiFormulaToAst(uiFormula: string): ExprAstV1 {
  try {
    const tokens = tokenizeCalcExpr(String(uiFormula ?? ""));
    return parseCalcExpr(tokens);
  } catch {
    // Return a safe fallback AST (empty number literal) so callers never crash.
    return { kind: "number", value: "0", span: { start: 0, end: 0 } };
  }
}

export function analyzeExpression(uiFormula: string, ctx: ExprContext, opts?: { tolerant?: boolean }): ExprAnalysis {
  const input = String(uiFormula ?? "");
  const tolerant = !!opts?.tolerant;
  let tokens: CalcToken[];
  try {
    tokens = tokenizeCalcExpr(input);
  } catch (tokErr: any) {
    const msg = tokErr instanceof Error ? tokErr.message : "Tokenizer error";
    return {
      ast: null,
      deps: [],
      meta: { deps: [], hasAggregation: false, execution: "client" },
      canCompileToSql: false,
      errors: [spanToExprError({ input, span: { start: 0, end: Math.max(1, input.length) }, message: msg, severity: "error" })],
      missingParams: [],
    };
  }
  const parsed = parseCalcExprWithDiagnostics(tokens, { mode: tolerant ? "tolerant" : "strict" });
  const errors: ExprError[] = parseErrorsToExprErrors(input, parsed.errors);
  if (tolerant && parsed.recovered && parsed.errors.length === 0) {
    errors.push(
      spanToExprError({
        input,
        span: { start: Math.max(0, input.length - 1), end: Math.max(0, input.length) },
        message: "Incomplete expression",
        severity: "error",
      })
    );
  }

  const ast = parsed.ast;
  const extracted = ast
    ? validateFunctionsAndCollectDeps({ input, ast, ctx })
    : { deps: [] as ExprDependency[], errors: [] as ExprError[] };
  errors.push(...extracted.errors);

  const deps: ExprDependency[] = extracted.deps;
  const hasAggregation = ast ? hasAggregationInAst(ast, ctx) : false;

  const compiled = ast ? compileAstToSql(ast, ctx) : ({ ok: false, errors: [] } as CompileToSqlResult);
  const canCompileToSql = compiled.ok;
  if (!compiled.ok && compiled.errors.length) errors.push(...compiled.errors);
  const meta: ExprMeta = {
    deps,
    hasAggregation,
    execution: canCompileToSql ? "sql" : "client",
  };

  return {
    ast,
    deps,
    meta,
    canCompileToSql,
    errors,
    missingParams: compiled.ok ? Array.from(new Set((compiled.missingParams ?? []).map((x) => String(x ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)) : [],
  };
}

export function createExprEngineCache(opts?: { maxEntries: number }): ExprEngineCache {
  const max = Number.isFinite(opts?.maxEntries) ? Math.max(1, Number(opts!.maxEntries)) : 200;
  const map = new Map<string, ExprAnalysis>();
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
      // simple LRU-ish: delete oldest
      if (map.size > max) {
        const firstKey = map.keys().next().value as string | undefined;
        if (firstKey != null) map.delete(firstKey);
      }
    },
    clear: () => map.clear(),
  };
}

function stableCtxKey(ctx: ExprContext): string {
  const fields = (Array.isArray(ctx.symbols.fields) ? ctx.symbols.fields : [])
    .map((f) => String((f as any)?.name ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const computes = (Array.isArray(ctx.symbols.computes) ? ctx.symbols.computes : [])
    .map((c) => String((c as any)?.id ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const fns = (Array.isArray(ctx.functions.list) ? ctx.functions.list : [])
    .map((d) => String((d as any)?.name ?? "").trim().toUpperCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return [
    `dialect:${ctx.dialect}`,
    `mode:${ctx.mode}`,
    `fields:${fields.join("|")}`,
    `computes:${computes.join("|")}`,
    `fns:${fns.join("|")}`,
  ].join(";");
}

export function analyzeExpressionCached(params: {
  uiFormula: string;
  ctx: ExprContext;
  tolerant?: boolean;
  cache: ExprEngineCache;
}): ExprAnalysis {
  const formula = String(params.uiFormula ?? "");
  const tolerant = !!params.tolerant;
  const key = `${tolerant ? "t" : "s"}|${formula}|${stableCtxKey(params.ctx)}`;
  const hit = params.cache.get(key);
  if (hit) return hit;
  const res = analyzeExpression(formula, params.ctx, { tolerant });
  params.cache.set(key, res);
  return res;
}

export function createExprSession(params: { ctx: ExprContext; maxCacheEntries?: number }): ExprSession {
  return {
    ctx: params.ctx,
    cache: createExprEngineCache({ maxEntries: params.maxCacheEntries ?? 200 }),
  };
}

export function createPipelineExprSessionForStep(params: {
  semanticModelV1: SemanticModelV1Like | null | undefined;
  sourceModel: string;
  dialect: SqlDialect;
  mode: ExprMode;
  steps: Array<{ id: string; kind: string; outputId?: string }>;
  stepId: string;
  maxCacheEntries?: number;
  functions?: FunctionRegistry;
}): ExprSession {
  const ctx = buildExprContextForPipelineStep({
    semanticModelV1: params.semanticModelV1,
    sourceModel: params.sourceModel,
    dialect: params.dialect,
    mode: params.mode,
    steps: params.steps,
    stepId: params.stepId,
    functions: params.functions,
  });
  return createExprSession({ ctx, maxCacheEntries: params.maxCacheEntries });
}

export function extractDepsFromAst(ast: ExprAstV1): DependencyV1[] {
  const deps: DependencyV1[] = [];
  const seenField = new Set<string>();
  const seenCompute = new Set<string>();

  const addField = (name: string) => {
    const n = String(name ?? "").trim();
    if (!n) return;
    if (seenField.has(n)) return;
    seenField.add(n);
    deps.push({ type: "field", name: n });
  };
  const addCompute = (id: string) => {
    const n = String(id ?? "").trim();
    if (!n) return;
    if (seenCompute.has(n)) return;
    seenCompute.add(n);
    deps.push({ type: "compute", id: n });
  };

  const visit = (n: ExprAstV1) => {
    if (n.kind === "ref") {
      const raw = String(n.name ?? "").trim();
      if (!raw) return;
      // Heuristic v1:
      // - If looks like an identifier, treat as field. Compute refs are resolved later by known compute ids.
      addField(raw);
      return;
    }
    if (n.kind === "call") {
      for (const a of n.args) visit(a);
      return;
    }
    if (n.kind === "bin") {
      visit(n.left);
      visit(n.right);
      return;
    }
  };

  visit(ast);

  // NOTE: compute deps are not detectable purely from AST without a compute-id registry.
  // This will be refined by `resolveTypedDeps` once we know available compute ids.
  void addCompute;

  return deps;
}

export function resolveTypedDeps(params: {
  deps: DependencyV1[];
  availableComputeIds: Set<string>;
}): DependencyV1[] {
  const out: DependencyV1[] = [];
  const seen = new Set<string>();

  for (const d of params.deps) {
    if (d.type === "field") {
      const name = String(d.name ?? "").trim();
      if (!name) continue;
      if (params.availableComputeIds.has(name)) {
        const key = `compute:${name}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ type: "compute", id: name });
        }
      } else {
        const key = `field:${name}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ type: "field", name });
        }
      }
      continue;
    }

    const id = String((d as any).id ?? "").trim();
    if (!id) continue;
    const key = `compute:${id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ type: "compute", id });
    }
  }

  return out;
}

export function buildExprMeta(params: {
  ast: ExprAstV1;
  deps: DependencyV1[];
  canCompileToSql: boolean;
}): ExprMetaV1 {
  const hasAggregation = (() => {
    let ok = false;
    const visit = (n: ExprAstV1) => {
      if (n.kind === "call") {
        const fn = String(n.fn ?? "").trim().toUpperCase();
        if (AGG_FNS.has(fn)) ok = true;
        for (const a of n.args) visit(a);
        return;
      }
      if (n.kind === "bin") {
        visit(n.left);
        visit(n.right);
      }
    };
    visit(params.ast);
    return ok;
  })();

  const level: ExprLevelV1 = hasAggregation ? "aggregate" : "row";

  const execution: "sql" | "client" = (params.canCompileToSql && level === "aggregate") ? "sql" : (params.canCompileToSql ? "sql" : "client");

  return {
    deps: params.deps,
    hasAggregation,
    level,
    execution,
  };
}

export function canCompileAstToSql(ast: ExprAstV1, _dialect: SqlDialect): boolean {
  // Legacy guard: historically this check was structural and did not depend on symbol resolution.
  // Keep it that way until call sites migrate to analyzeExpression (with full ExprContext).
  void _dialect;
  let ok = true;
  const visit = (n: ExprAstV1) => {
    if (!ok) return;
    if (n.kind === "call") {
      const fn = String(n.fn ?? "").trim().toUpperCase();
      if (!SQL_CALL_FNS.has(fn)) {
        ok = false;
        return;
      }
      for (const a of n.args) visit(a);
      return;
    }
    if (n.kind === "bin") {
      visit(n.left);
      visit(n.right);
      return;
    }
    return;
  };
  visit(ast);
  return ok;
}

export function resolveUsedComputeClosure(params: {
  rootIds: string[];
  computeById: Record<string, { meta?: { deps?: DependencyV1[] } }>;
}): string[] {
  const visited = new Set<string>();

  const dfs = (idRaw: string) => {
    const id = String(idRaw ?? "").trim();
    if (!id) return;
    if (visited.has(id)) return;
    visited.add(id);

    const def = params.computeById[id];
    const deps = Array.isArray(def?.meta?.deps) ? def.meta!.deps! : [];
    for (const d of deps) {
      if (d && typeof d === "object" && (d as any).type === "compute") {
        dfs(String((d as any).id ?? ""));
      }
    }
  };

  for (const r of params.rootIds) dfs(r);

  return Array.from(visited);
}

export function resolveComputeGraph(params: {
  rootIds: string[];
  computeById: Record<string, { deps?: ExprDependency[] | DependencyV1[] } | undefined>;
}): ComputeGraphResult {
  const computeById = params.computeById ?? {};

  const normId = (idRaw: string) => String(idRaw ?? "").trim();

  const roots = (Array.isArray(params.rootIds) ? params.rootIds : [])
    .map(normId)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const issues: ComputeGraphIssue[] = [];
  const closureSet = new Set<string>();

  const state = new Map<string, 0 | 1 | 2>();
  // 0 = unvisited, 1 = visiting, 2 = done
  const stack: string[] = [];
  const order: string[] = [];

  const getDeps = (id: string): string[] => {
    const def = computeById[id];
    const depsRaw: any[] = Array.isArray((def as any)?.deps) ? ((def as any).deps as any[]) : [];
    const out: string[] = [];
    for (const d of depsRaw) {
      if (!d || typeof d !== "object") continue;
      if ((d as any).type !== "compute") continue;
      const depId = normId(String((d as any).id ?? ""));
      if (!depId) continue;
      out.push(depId);
    }
    out.sort((a, b) => a.localeCompare(b));
    return out;
  };

  const dfs = (id: string, referencedBy: string) => {
    const curId = normId(id);
    if (!curId) return;

    closureSet.add(curId);

    if (!computeById[curId]) {
      issues.push({ type: "missing_compute", id: curId, referencedBy });
      // Keep it in closure for transparency, but don't traverse further.
      return;
    }

    const st = state.get(curId) ?? 0;
    if (st === 2) return;
    if (st === 1) {
      const idx = stack.lastIndexOf(curId);
      const cycle = (idx >= 0 ? stack.slice(idx) : stack.slice()).concat(curId);
      issues.push({ type: "cycle", cycle });
      return;
    }

    state.set(curId, 1);
    stack.push(curId);

    for (const dep of getDeps(curId)) {
      dfs(dep, curId);
    }

    stack.pop();
    state.set(curId, 2);
    order.push(curId);
  };

  for (const r of roots) dfs(r, "<root>");

  const closure = Array.from(closureSet).sort((a, b) => a.localeCompare(b));

  // Deduplicate cycle issues deterministically.
  const issueKey = (i: ComputeGraphIssue) =>
    i.type === "missing_compute" ? `m:${i.id}:${i.referencedBy}` : `c:${i.cycle.join("->")}`;
  const uniqIssues: ComputeGraphIssue[] = [];
  const seenIssue = new Set<string>();
  for (const i of issues) {
    const k = issueKey(i);
    if (seenIssue.has(k)) continue;
    seenIssue.add(k);
    uniqIssues.push(i);
  }
  uniqIssues.sort((a, b) => issueKey(a).localeCompare(issueKey(b)));

  return { closure, order, issues: uniqIssues };
}

function semanticTypeToString(t: unknown): string {
  const s = String(t ?? "").trim();
  return s || "string";
}

export function buildFieldSymbolsFromSemanticModelV1(params: {
  semanticModelV1: SemanticModelV1Like | null | undefined;
  sourceModel: string;
}): Array<{ name: string; type: string }> {
  const model = params.semanticModelV1 && typeof params.semanticModelV1 === "object" ? params.semanticModelV1 : null;
  const src = String(params.sourceModel ?? "").trim();
  if (!model || !src) return [];
  const modelsObj = model.models && typeof model.models === "object" ? model.models : {};
  const m = (modelsObj as any)[src];
  if (!m || typeof m !== "object") return [];

  const dimsObj = m.dimensions && typeof m.dimensions === "object" ? m.dimensions : {};
  const measObj = m.measures && typeof m.measures === "object" ? m.measures : {};

  const dims = Object.keys(dimsObj).sort((a, b) => a.localeCompare(b));
  const meas = Object.keys(measObj).sort((a, b) => a.localeCompare(b));

  const out: Array<{ name: string; type: string }> = [];
  for (const d of dims) {
    out.push({ name: `${src}.${d}`, type: semanticTypeToString((dimsObj as any)[d]?.type) });
  }
  for (const y of meas) {
    out.push({ name: `${src}.${y}`, type: semanticTypeToString((measObj as any)[y]?.type) });
  }
  return out;
}

export function computeIdsAvailableBeforeStep(params: {
  steps: Array<{ id: string; kind: string; outputId?: string }>;
  beforeStepId: string;
}): Set<string> {
  const steps = Array.isArray(params.steps) ? params.steps : [];
  const beforeId = String(params.beforeStepId ?? "").trim();
  const out = new Set<string>();
  for (const s of steps) {
    if (!s || typeof s !== "object") continue;
    if (beforeId && String((s as any).id ?? "") === beforeId) break;
    if (String((s as any).kind ?? "") !== "compute") continue;
    const oid = String((s as any).outputId ?? "").trim();
    if (!oid) continue;
    out.add(oid);
  }
  return out;
}

export function buildExprContextForPipelineStep(params: {
  semanticModelV1: SemanticModelV1Like | null | undefined;
  sourceModel: string;
  dialect: SqlDialect;
  mode: ExprMode;
  functions?: FunctionRegistry;
  steps: Array<{ id: string; kind: string; outputId?: string }>;
  stepId: string;
}): ExprContext {
  const fields = buildFieldSymbolsFromSemanticModelV1({ semanticModelV1: params.semanticModelV1, sourceModel: params.sourceModel });
  const availableComputeIds = computeIdsAvailableBeforeStep({ steps: params.steps, beforeStepId: params.stepId });
  const computes = Array.from(availableComputeIds)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ id, type: "number" as const }));

  return {
    dialect: params.dialect,
    mode: params.mode,
    functions: params.functions ?? createFunctionRegistry(params.mode),
    symbols: { fields, computes },
  };
}

export function getEditorDiagnostics(params: {
  formula: string;
  ctx: ExprContext;
  cache?: ExprEngineCache;
}): ExprError[] {
  const analysis = params.cache
    ? analyzeExpressionCached({ uiFormula: params.formula, ctx: params.ctx, tolerant: true, cache: params.cache })
    : analyzeExpression(params.formula, params.ctx, { tolerant: true });
  return analysis.errors;
}

export function getExecutionType(params: {
  formula: string;
  ctx: ExprContext;
  cache?: ExprEngineCache;
}): "sql" | "client" {
  const analysis = params.cache
    ? analyzeExpressionCached({ uiFormula: params.formula, ctx: params.ctx, tolerant: true, cache: params.cache })
    : analyzeExpression(params.formula, params.ctx, { tolerant: true });
  if ((analysis.errors?.length ?? 0) > 0) return "client";
  return analysis.meta.execution;
}

export function getExpressionDiagnostics(uiFormula: string, ctx: ExprContext, cache?: ExprEngineCache): ExprError[] {
  const analysis = cache
    ? analyzeExpressionCached({ uiFormula, ctx, tolerant: true, cache })
    : analyzeExpression(uiFormula, ctx, { tolerant: true });
  return analysis.errors;
}

function nodeContainsOffset(n: ExprAstV1, offset: number): boolean {
  const off = Number.isFinite(offset) ? offset : 0;
  const start = Number((n as any)?.span?.start ?? -1);
  const end = Number((n as any)?.span?.end ?? -1);
  if (start < 0 || end < 0) return false;
  return off >= start && off <= end;
}

function getCompletionPrefixAt(input: string, offset: number): string {
  const s = String(input ?? "");
  const off = Math.max(0, Math.min(Number.isFinite(offset) ? offset : 0, s.length));
  const isIdentChar = (ch: string) => /^[a-zA-Z0-9_]$/.test(ch);
  let i = off - 1;
  while (i >= 0 && isIdentChar(s[i]!)) i--;
  return s.slice(i + 1, off);
}

function isOffsetInsideCallArgsHeuristic(input: string, offset: number): boolean {
  const s = String(input ?? "");
  const off = Math.max(0, Math.min(Number.isFinite(offset) ? offset : 0, s.length));

  // Find the nearest unmatched '('. If it is preceded by an identifier, treat as call-args context.
  const stack: number[] = [];
  for (let i = 0; i < off; i++) {
    const ch = s[i]!;
    if (ch === "(") stack.push(i);
    else if (ch === ")") stack.pop();
  }
  const lparen = stack.length ? stack[stack.length - 1]! : -1;
  if (lparen < 0) return false;

  // Skip whitespace before '('
  let j = lparen - 1;
  while (j >= 0 && /\s/.test(s[j]!)) j--;
  const isIdentChar = (ch: string) => /^[a-zA-Z0-9_]$/.test(ch);
  let end = j + 1;
  while (j >= 0 && isIdentChar(s[j]!)) j--;
  const start = j + 1;
  const ident = s.slice(start, end);
  return ident.length > 0;
}

function isOffsetInsideCallArgs(ast: ExprAstV1 | null, offset: number): boolean {
  if (!ast) return false;
  const off = Number.isFinite(offset) ? offset : 0;
  let inside = false;
  const visit = (n: ExprAstV1) => {
    if (!n || !nodeContainsOffset(n, off)) return;
    if (n.kind === "call") {
      // We consider "inside args" when cursor is not over the function identifier token.
      // With our spans, the call span covers fn + '(' + args + ')'.
      // If cursor is within any arg span, we treat it as args-context.
      for (const a of n.args) {
        if (a && nodeContainsOffset(a, off)) {
          inside = true;
          return;
        }
      }
      // Also treat it as args-context if cursor is after '(' and before ')'.
      // Best-effort (we don't track paren token spans here), so fallback to call-span minus fn ident span.
      const fnLen = String(n.fn ?? "").length;
      if (Number.isFinite(n.span?.start) && off >= (n.span.start + fnLen)) {
        inside = true;
        return;
      }
    }
    if (n.kind === "bin") {
      visit(n.left);
      visit(n.right);
      return;
    }
    if (n.kind === "call") {
      for (const a of n.args) visit(a);
    }
  };
  visit(ast);
  return inside;
}

export function getCompletions(params: {
  ctx: ExprContext;
  position: number;
  ast: ExprAstV1 | null;
  formula: string;
}): ExprCompletionItem[] {
  const prefix = getCompletionPrefixAt(params.formula, params.position);
  const pfx = normalizeIdentifier(prefix);
  const inArgs = params.ast
    ? isOffsetInsideCallArgs(params.ast, params.position)
    : isOffsetInsideCallArgsHeuristic(params.formula, params.position);

  const all = getExpressionCompletions(params.ctx);
  const filteredByContext = all.filter((it) => {
    if (inArgs) return it.kind === "field" || it.kind === "compute";
    return true;
  });

  const filtered = filteredByContext.filter((it) => {
    if (!pfx) return true;
    return normalizeIdentifier(String(it.label ?? "")).startsWith(pfx);
  });

  return filtered;
}

export function getExpressionCompletions(ctx: ExprContext, _cache?: ExprEngineCache): ExprCompletionItem[] {
  void _cache;
  const items: ExprCompletionItem[] = [];

  for (const f of Array.isArray(ctx.symbols.fields) ? ctx.symbols.fields : []) {
    const name = String((f as any)?.name ?? "").trim();
    if (!name) continue;
    items.push({ kind: "field", label: name, insertText: name });
  }
  for (const c of Array.isArray(ctx.symbols.computes) ? ctx.symbols.computes : []) {
    const id = String((c as any)?.id ?? "").trim();
    if (!id) continue;
    // Variant A: compute references are plain identifiers.
    items.push({ kind: "compute", label: id, insertText: id });
  }
  for (const fn of Array.isArray(ctx.functions.list) ? ctx.functions.list : []) {
    const name = String((fn as any)?.name ?? "").trim();
    if (!name) continue;
    items.push({ kind: "function", label: name, insertText: `${name}(` });
  }

  const key = (i: ExprCompletionItem) => `${i.kind}:${i.label}`;
  const uniq: ExprCompletionItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(it);
  }
  uniq.sort((a, b) => key(a).localeCompare(key(b)));
  return uniq;
}

function readIdentifierPrefixAt(input: string, offset: number): { prefix: string; modelQualifier: string | null } {
  const s = String(input ?? "");
  const off = Math.max(0, Math.min(Number.isFinite(offset) ? offset : 0, s.length));
  const isIdentChar = (ch: string) => /^[a-zA-Z0-9_]$/.test(ch);

  let i = off - 1;
  while (i >= 0 && isIdentChar(s[i]!)) i--;
  const start = i + 1;
  const prefix = s.slice(start, off);

  // model qualifier if immediately preceded by '.' and a model identifier
  let modelQualifier: string | null = null;
  if (i >= 0 && s[i] === ".") {
    let j = i - 1;
    while (j >= 0 && isIdentChar(s[j]!)) j--;
    const model = s.slice(j + 1, i);
    if (model) modelQualifier = model;
  }

  return { prefix, modelQualifier };
}

export function getExpressionCompletionsAt(params: {
  uiFormula: string;
  ctx: ExprContext;
  offset: number;
  cache?: ExprEngineCache;
}): ExprCompletionItem[] {
  const { prefix, modelQualifier } = readIdentifierPrefixAt(params.uiFormula, params.offset);
  const all = getExpressionCompletions(params.ctx, params.cache);
  const pfx = normalizeIdentifier(prefix);

  const filtered = all.filter((it) => {
    const label = String(it.label ?? "");
    const labelNorm = normalizeIdentifier(label);
    if (modelQualifier) {
      if (it.kind !== "field") return false;
      const [m] = label.split(".");
      if (normalizeIdentifier(m ?? "") !== normalizeIdentifier(modelQualifier)) return false;
      const last = label.split(".").pop() ?? "";
      return !pfx || normalizeIdentifier(last).startsWith(pfx);
    }
    return !pfx || labelNorm.startsWith(pfx);
  });

  return filtered;
}

function findNodeAtOffset(ast: ExprAstV1, offset: number): ExprAstV1 | null {
  const off = Number.isFinite(offset) ? offset : 0;
  let best: ExprAstV1 | null = null;
  const visit = (n: ExprAstV1) => {
    if (!n || !n.span) return;
    if (off < n.span.start || off > n.span.end) return;
    if (!best) {
      best = n;
    } else {
      const bestLen = best.span.end - best.span.start;
      const curLen = n.span.end - n.span.start;
      if (curLen <= bestLen) best = n;
    }
    if (n.kind === "call") {
      for (const a of n.args) visit(a);
      return;
    }
    if (n.kind === "bin") {
      visit(n.left);
      visit(n.right);
    }
  };
  visit(ast);
  return best;
}

export function getExpressionHover(params: {
  uiFormula: string;
  ctx: ExprContext;
  offset: number;
  cache?: ExprEngineCache;
}): ExprHoverInfo | null {
  const analysis = params.cache
    ? analyzeExpressionCached({ uiFormula: params.uiFormula, ctx: params.ctx, tolerant: true, cache: params.cache })
    : analyzeExpression(params.uiFormula, params.ctx, { tolerant: true });
  if (!analysis.ast) return null;
  const n = findNodeAtOffset(analysis.ast, params.offset);
  if (!n) return null;

  if (n.kind === "ref") {
    const raw = String(n.name ?? "").trim();
    const norm = normalizeIdentifier(raw);
    const { fieldByNorm, computeByNorm } = buildNormalizedSymbolIndex(params.ctx.symbols);
    const c = computeByNorm.get(norm);
    if (c) return { kind: "compute", label: `Compute: ${c.id}` };
    const f = fieldByNorm.get(norm);
    if (f) return { kind: "field", label: `Field: ${f.name} (${f.type})` };
    if (params.ctx.mode === "legacy-calc-expr") {
      const legacy = resolveLegacyUnqualifiedFieldRef({ rawRef: raw, fieldByNorm });
      if (legacy.ok) return { kind: "field", label: `Field: ${legacy.field.name} (${legacy.field.type})` };
      if (legacy.kind === "ambiguous") return { kind: "unknown", label: `Ambiguous: ${raw}` };
    }
    return { kind: "unknown", label: raw };
  }

  if (n.kind === "call") {
    const fnRaw = String(n.fn ?? "").trim();
    const def = params.ctx.functions.byName.get(normalizeIdentifier(fnRaw));
    if (def) return { kind: "function", label: `Function: ${def.name}` };
    return { kind: "unknown", label: `Function: ${fnRaw}` };
  }

  return null;
}
