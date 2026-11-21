import { getTableColumns, getTableName, is, SQL, Table } from 'drizzle-orm';
import { PgColumn, PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();

type Row = Record<string, any>;

interface TableMeta {
  name: string;
  columns: Record<string, PgColumn>;
  sqlToJs: Map<string, string>;
  uniqueJsKeys: string[];
}

const tableMetaCache = new WeakMap<Table, TableMeta>();

function getMeta(table: Table): TableMeta {
  const cached = tableMetaCache.get(table);
  if (cached) return cached;
  const name = getTableName(table);
  const columns = getTableColumns(table) as Record<string, PgColumn>;
  const sqlToJs = new Map<string, string>();
  const uniqueJsKeys: string[] = [];
  for (const [jsKey, col] of Object.entries(columns)) {
    sqlToJs.set(col.name, jsKey);
    if ((col as any).isUnique || (col as any).primary) {
      uniqueJsKeys.push(jsKey);
    }
  }
  const meta: TableMeta = { name, columns, sqlToJs, uniqueJsKeys };
  tableMetaCache.set(table, meta);
  return meta;
}

function cloneValue<T>(val: T): T {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return new Date(val.getTime()) as unknown as T;
  if (Array.isArray(val)) return val.map((v) => cloneValue(v)) as unknown as T;
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, any>)) {
      out[k] = cloneValue(v);
    }
    return out as T;
  }
  return val;
}

// --- Lightweight SQL Expression Tokenizer & Evaluator ---

type TokenType =
  | 'ident'
  | 'param'
  | 'string'
  | 'number'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'dot'
  | 'eof';

interface Token {
  type: TokenType;
  value: string;
}

function tokenizeSql(sqlStr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = sqlStr.length;

  while (i < len) {
    const ch = sqlStr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',' });
      i++;
      continue;
    }
    if (ch === '.') {
      tokens.push({ type: 'dot', value: '.' });
      i++;
      continue;
    }
    if (ch === '"') {
      i++;
      let ident = '';
      while (i < len) {
        if (sqlStr[i] === '"' && sqlStr[i + 1] === '"') {
          ident += '"';
          i += 2;
        } else if (sqlStr[i] === '"') {
          i++;
          break;
        } else {
          ident += sqlStr[i++];
        }
      }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }
    if (ch === "'") {
      i++;
      let str = '';
      while (i < len) {
        if (sqlStr[i] === "'" && sqlStr[i + 1] === "'") {
          str += "'";
          i += 2;
        } else if (sqlStr[i] === "'") {
          i++;
          break;
        } else {
          str += sqlStr[i++];
        }
      }
      tokens.push({ type: 'string', value: str });
      continue;
    }
    if (ch === '$' && /\d/.test(sqlStr[i + 1] || '')) {
      i++;
      let num = '';
      while (i < len && /\d/.test(sqlStr[i])) {
        num += sqlStr[i++];
      }
      tokens.push({ type: 'param', value: num });
      continue;
    }
    if (/\d/.test(ch) || (ch === '-' && /\d/.test(sqlStr[i + 1] || '') && (tokens.length === 0 || ['op', 'lparen', 'comma'].includes(tokens[tokens.length - 1].type)))) {
      let num = ch;
      i++;
      while (i < len && /[\d.]/.test(sqlStr[i])) {
        num += sqlStr[i++];
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }
    if ('=<>!+-*/'.includes(ch)) {
      const two = sqlStr.slice(i, i + 2);
      if (['<>', '!=', '<=', '>='].includes(two)) {
        tokens.push({ type: 'op', value: two });
        i += 2;
      } else {
        tokens.push({ type: 'op', value: ch });
        i++;
      }
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let word = '';
      while (i < len && /[a-zA-Z0-9_]/.test(sqlStr[i])) {
        word += sqlStr[i++];
      }
      tokens.push({ type: 'ident', value: word });
      continue;
    }
    i++;
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

interface EvalContext {
  tables: Record<string, { meta: TableMeta; row: Row }>;
  defaultTable?: string;
}

function resolveColumnValue(ctx: EvalContext, tableName: string | null, colSqlName: string): any {
  const targetName = tableName || ctx.defaultTable;
  if (targetName && ctx.tables[targetName]) {
    const { meta, row } = ctx.tables[targetName];
    const jsKey = meta.sqlToJs.get(colSqlName) || colSqlName;
    return row[jsKey];
  }
  for (const { meta, row } of Object.values(ctx.tables)) {
    const jsKey = meta.sqlToJs.get(colSqlName);
    if (jsKey && jsKey in row) return row[jsKey];
  }
  return undefined;
}

function toComparable(val: any): any {
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return val;
}

function matchLike(value: any, pattern: any, caseInsensitive: boolean): boolean {
  if (value === null || value === undefined) return false;
  let str = String(value);
  let pat = String(pattern ?? '');
  if (caseInsensitive) {
    str = str.toLowerCase();
    pat = pat.toLowerCase();
  }
  const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/%/g, '.*').replace(/_/g, '.') + '$';
  return new RegExp(regexStr, 's').test(str);
}

function evalSqlExpression(expr: SQL, ctx: EvalContext): any {
  const { sql: sqlStr, params } = dialect.sqlToQuery(expr);
  if (!sqlStr.trim()) return true;
  const tokens = tokenizeSql(sqlStr);
  let pos = 0;

  const peek = () => tokens[pos] || { type: 'eof', value: '' };
  const consume = () => tokens[pos++] || { type: 'eof', value: '' };
  const isKeyword = (tok: Token, kw: string) =>
    tok.type === 'ident' && tok.value.toUpperCase() === kw;

  function parseOr(): any {
    let left = parseAnd();
    while (isKeyword(peek(), 'OR')) {
      consume();
      const right = parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  function parseAnd(): any {
    let left = parseNot();
    while (isKeyword(peek(), 'AND')) {
      consume();
      const right = parseNot();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  function parseNot(): any {
    if (isKeyword(peek(), 'NOT')) {
      consume();
      return !parseNot();
    }
    return parseComparison();
  }

  function parseComparison(): any {
    let left = parseAdditive();

    // IS [NOT] NULL
    if (isKeyword(peek(), 'IS')) {
      consume();
      let negate = false;
      if (isKeyword(peek(), 'NOT')) {
        consume();
        negate = true;
      }
      if (isKeyword(peek(), 'NULL')) {
        consume();
        const isNull = left === null || left === undefined;
        return negate ? !isNull : isNull;
      }
    }

    // [NOT] IN (...)
    let notPrefix = false;
    if (isKeyword(peek(), 'NOT') && isKeyword(tokens[pos + 1] || { type: 'eof', value: '' }, 'IN')) {
      consume();
      notPrefix = true;
    }
    if (isKeyword(peek(), 'IN')) {
      consume();
      if (peek().type === 'lparen') consume();
      const items: any[] = [];
      while (peek().type !== 'rparen' && peek().type !== 'eof') {
        items.push(parseAdditive());
        if (peek().type === 'comma') consume();
      }
      if (peek().type === 'rparen') consume();
      const cmpLeft = toComparable(left);
      const matched = items.some((it) => toComparable(it) === cmpLeft);
      return notPrefix ? !matched : matched;
    }

    // [NOT] ILIKE / LIKE
    if (isKeyword(peek(), 'ILIKE') || isKeyword(peek(), 'LIKE')) {
      const ci = isKeyword(peek(), 'ILIKE');
      consume();
      const right = parseAdditive();
      return matchLike(left, right, ci);
    }

    if (peek().type === 'op' && ['=', '<>', '!=', '<', '<=', '>', '>='].includes(peek().value)) {
      const op = consume().value;
      const right = parseAdditive();
      const a = toComparable(left);
      const b = toComparable(right);
      if (op === '=') return a === b;
      if (op === '<>' || op === '!=') return a !== b;
      if (a === null || a === undefined || b === null || b === undefined) return false;
      if (op === '<') return a < b;
      if (op === '<=') return a <= b;
      if (op === '>') return a > b;
      if (op === '>=') return a >= b;
    }

    return left;
  }

  function parseAdditive(): any {
    let left = parsePrimary();
    while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = parsePrimary();
      if (op === '+') left = Number(left ?? 0) + Number(right ?? 0);
      else left = Number(left ?? 0) - Number(right ?? 0);
    }
    return left;
  }

  function parsePrimary(): any {
    const tok = peek();
    if (tok.type === 'lparen') {
      consume();
      const val = parseOr();
      if (peek().type === 'rparen') consume();
      return val;
    }
    if (tok.type === 'param') {
      consume();
      const idx = Number(tok.value) - 1;
      return params[idx];
    }
    if (tok.type === 'string') {
      consume();
      return tok.value;
    }
    if (tok.type === 'number') {
      consume();
      return Number(tok.value);
    }
    if (tok.type === 'ident') {
      const upper = tok.value.toUpperCase();
      if (upper === 'TRUE') {
        consume();
        return true;
      }
      if (upper === 'FALSE') {
        consume();
        return false;
      }
      if (upper === 'NULL') {
        consume();
        return null;
      }
      if (upper === 'LOWER' && tokens[pos + 1]?.type === 'lparen') {
        consume();
        consume(); // (
        const inner = parseOr();
        if (peek().type === 'rparen') consume();
        return inner === null || inner === undefined ? '' : String(inner).toLowerCase();
      }
      if (upper === 'UPPER' && tokens[pos + 1]?.type === 'lparen') {
        consume();
        consume(); // (
        const inner = parseOr();
        if (peek().type === 'rparen') consume();
        return inner === null || inner === undefined ? '' : String(inner).toUpperCase();
      }
      consume();
      if (peek().type === 'dot') {
        consume();
        const secondTok = consume();
        if (peek().type === 'dot') {
          consume();
          const thirdTok = consume();
          return resolveColumnValue(ctx, secondTok.value, thirdTok.value);
        }
        return resolveColumnValue(ctx, tok.value, secondTok.value);
      }
      return resolveColumnValue(ctx, null, tok.value);
    }
    consume();
    return undefined;
  }

  return parseOr();
}

function compareValues(a: any, b: any): number {
  const va = toComparable(a);
  const vb = toComparable(b);
  if (va === vb) return 0;
  if (va === null || va === undefined) return 1;
  if (vb === null || vb === undefined) return -1;
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  if (typeof va === 'boolean' && typeof vb === 'boolean') return Number(va) - Number(vb);
  return String(va).localeCompare(String(vb));
}

function isPgColumn(val: any): val is PgColumn {
  return Boolean(val && typeof val === 'object' && 'table' in val && 'name' in val && 'dataType' in val);
}

function isDrizzleTable(val: any): val is Table {
  if (!val || typeof val !== 'object') return false;
  try {
    return is(val, Table);
  } catch {
    return false;
  }
}

export function createMockDb() {
  const store = new Map<string, Row[]>();
  const sequences = new Map<string, number>();

  function getRows(tableName: string): Row[] {
    let rows = store.get(tableName);
    if (!rows) {
      rows = [];
      store.set(tableName, rows);
    }
    return rows;
  }

  function nextId(tableName: string): number {
    const next = (sequences.get(tableName) || 0) + 1;
    sequences.set(tableName, next);
    return next;
  }

  function applyDefaults(meta: TableMeta, input: Row): Row {
    const row: Row = {};
    for (const [jsKey, col] of Object.entries(meta.columns)) {
      if (input[jsKey] !== undefined) {
        row[jsKey] = cloneValue(input[jsKey]);
      } else if (jsKey === 'id' && col.dataType === 'number') {
        row[jsKey] = nextId(meta.name);
      } else if ((col as any).hasDefault) {
        const def = (col as any).default;
        if (def instanceof SQL || (def && typeof def === 'object' && 'queryChunks' in def)) {
          row[jsKey] = col.dataType === 'date' ? new Date() : null;
        } else if (def !== undefined) {
          row[jsKey] = cloneValue(def);
        } else if (col.dataType === 'date') {
          row[jsKey] = new Date();
        } else {
          row[jsKey] = null;
        }
      } else {
        row[jsKey] = null;
      }
    }
    if (typeof row.id === 'number') {
      const curSeq = sequences.get(meta.name) || 0;
      if (row.id > curSeq) sequences.set(meta.name, row.id);
    }
    const advanceCustomerSeq = (val: unknown) => {
      const m = typeof val === 'string' ? val.trim().match(/^NTF-CUST-(\d+)$/i) : null;
      if (m) {
        const num = Number(m[1]);
        const curSeq = sequences.get('customers_code_seq') || 0;
        if (Number.isFinite(num) && num > curSeq) {
          sequences.set('customers_code_seq', num);
        }
      }
    };

    if (meta.name === 'customers') {
      if (!row.customerId) {
        const codeNum = nextId('customers_code_seq');
        row.customerId = `NTF-CUST-${String(codeNum).padStart(6, '0')}`;
      } else {
        advanceCustomerSeq(row.customerId);
      }
    } else if (meta.name === 'users') {
      advanceCustomerSeq(row.uid);
    } else if (meta.name === 'customer_id_history') {
      advanceCustomerSeq(row.previousCustomerId);
      advanceCustomerSeq(row.newCustomerId);
    } else if (meta.name === 'customer_deletion_audit_logs') {
      advanceCustomerSeq(row.customerCode);
    }
    return row;
  }

  function projectRow(
    fields: Record<string, any> | undefined,
    ctx: EvalContext,
    mainTableName: string
  ): Row {
    if (!fields) {
      return cloneValue(ctx.tables[mainTableName].row);
    }
    const out: Row = {};
    for (const [key, sel] of Object.entries(fields)) {
      if (isDrizzleTable(sel)) {
        const tName = getTableName(sel);
        out[key] = ctx.tables[tName] ? cloneValue(ctx.tables[tName].row) : null;
      } else if (isPgColumn(sel)) {
        const tName = getTableName(sel.table);
        const meta = ctx.tables[tName]?.meta || getMeta(sel.table);
        const jsKey = meta.sqlToJs.get(sel.name) || sel.name;
        out[key] = cloneValue(ctx.tables[tName]?.row?.[jsKey]);
      } else if (sel instanceof SQL) {
        out[key] = evalSqlExpression(sel, ctx);
      } else {
        out[key] = sel;
      }
    }
    return out;
  }

  function isCountSelect(fields?: Record<string, any>): string | null {
    if (!fields) return null;
    for (const [key, val] of Object.entries(fields)) {
      const sqlObj = val instanceof SQL ? val : (val as any)?.sql instanceof SQL ? (val as any).sql : null;
      if (sqlObj) {
        const q = dialect.sqlToQuery(sqlObj);
        if (/count\s*\(/i.test(q.sql)) {
          return key;
        }
      }
    }
    return null;
  }

  function selectBuilder(fields?: Record<string, any>) {
    let mainTable: Table | null = null;
    const joins: Array<{ table: Table; on: SQL }> = [];
    let whereExpr: SQL | undefined;
    let orderExprs: Array<SQL | PgColumn> = [];
    let limitVal: number | undefined;
    let offsetVal: number | undefined;

    const execute = async (): Promise<Row[]> => {
      if (!mainTable) return [];
      const mainMeta = getMeta(mainTable);
      const mainRows = getRows(mainMeta.name);

      let contexts: EvalContext[] = mainRows.map((row) => ({
        defaultTable: mainMeta.name,
        tables: { [mainMeta.name]: { meta: mainMeta, row } },
      }));

      for (const j of joins) {
        const jMeta = getMeta(j.table);
        const jRows = getRows(jMeta.name);
        const nextContexts: EvalContext[] = [];
        for (const ctx of contexts) {
          for (const jRow of jRows) {
            const merged: EvalContext = {
              defaultTable: mainMeta.name,
              tables: {
                ...ctx.tables,
                [jMeta.name]: { meta: jMeta, row: jRow },
              },
            };
            if (evalSqlExpression(j.on, merged)) {
              nextContexts.push(merged);
            }
          }
        }
        contexts = nextContexts;
      }

      if (whereExpr) {
        contexts = contexts.filter((ctx) => Boolean(evalSqlExpression(whereExpr!, ctx)));
      }

      const countKey = isCountSelect(fields);
      if (countKey) {
        return [{ [countKey]: contexts.length }];
      }

      if (orderExprs.length > 0) {
        const specs = orderExprs.map((o) => {
          if (isPgColumn(o)) {
            return { table: getTableName(o.table), col: o.name, dir: 'asc' as const };
          }
          const { sql: s } = dialect.sqlToQuery(o);
          const m = s.match(/^(?:"[^"]+"\.)?(?:"([^"]+)"\.)?"([^"]+)"\s*(asc|desc)?$/i);
          if (m) {
            return {
              table: m[1] || mainMeta.name,
              col: m[2],
              dir: (m[3]?.toLowerCase() === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
            };
          }
          return null;
        });

        contexts.sort((a, b) => {
          for (const sp of specs) {
            if (!sp) continue;
            const va = resolveColumnValue(a, sp.table, sp.col);
            const vb = resolveColumnValue(b, sp.table, sp.col);
            const cmp = compareValues(va, vb);
            if (cmp !== 0) return sp.dir === 'desc' ? -cmp : cmp;
          }
          return 0;
        });
      }

      if (offsetVal !== undefined && offsetVal > 0) {
        contexts = contexts.slice(offsetVal);
      }
      if (limitVal !== undefined && limitVal >= 0) {
        contexts = contexts.slice(0, limitVal);
      }

      return contexts.map((ctx) => projectRow(fields, ctx, mainMeta.name));
    };

    const builder: any = {
      from(table: Table) {
        mainTable = table;
        return builder;
      },
      innerJoin(table: Table, on: SQL) {
        joins.push({ table, on });
        return builder;
      },
      leftJoin(table: Table, on: SQL) {
        joins.push({ table, on });
        return builder;
      },
      where(cond: SQL | undefined) {
        if (cond) whereExpr = cond;
        return builder;
      },
      orderBy(...exprs: Array<SQL | PgColumn>) {
        orderExprs = exprs.filter(Boolean);
        return builder;
      },
      limit(n: number) {
        limitVal = n;
        return builder;
      },
      offset(n: number) {
        offsetVal = n;
        return builder;
      },
      then(onFulfilled: any, onRejected: any) {
        return execute().then(onFulfilled, onRejected);
      },
      catch(onRejected: any) {
        return execute().catch(onRejected);
      },
    };

    return builder;
  }

  function insertBuilder(table: Table) {
    const meta = getMeta(table);
    let inputRows: Row[] = [];
    let conflictMode: 'none' | 'ignore' | 'update' = 'none';
    let conflictTargets: string[] = [];
    let conflictSet: Record<string, any> = {};
    let wantsReturn = false;

    function resolveTargetKeys(target: any): string[] {
      if (!target) return meta.uniqueJsKeys;
      const arr = Array.isArray(target) ? target : [target];
      return arr.map((col) => (isPgColumn(col) ? meta.sqlToJs.get(col.name) || col.name : String(col)));
    }

    const execute = async (): Promise<Row[]> => {
      const tableRows = getRows(meta.name);
      const affected: Row[] = [];

      for (const raw of inputRows) {
        const prepared = applyDefaults(meta, raw);
        const checkKeys = conflictMode === 'none' ? [] : (conflictTargets.length > 0 ? conflictTargets : meta.uniqueJsKeys);
        const existingIdx =
          checkKeys.length > 0
            ? tableRows.findIndex((existing) =>
                checkKeys.every((k) => existing[k] !== null && existing[k] !== undefined && existing[k] === prepared[k])
              )
            : -1;

        if (existingIdx >= 0) {
          if (conflictMode === 'ignore') {
            continue;
          }
          if (conflictMode === 'update') {
            const targetRow = tableRows[existingIdx];
            const ctx: EvalContext = {
              defaultTable: meta.name,
              tables: { [meta.name]: { meta, row: targetRow } },
            };
            for (const [k, v] of Object.entries(conflictSet)) {
              targetRow[k] = v instanceof SQL ? evalSqlExpression(v, ctx) : cloneValue(v);
            }
            affected.push(cloneValue(targetRow));
            continue;
          }
        }

        tableRows.push(prepared);
        affected.push(cloneValue(prepared));
      }

      return wantsReturn ? affected : [];
    };

    const builder: any = {
      values(vals: Row | Row[]) {
        inputRows = Array.isArray(vals) ? vals : [vals];
        return builder;
      },
      onConflictDoNothing(opts?: { target?: any }) {
        conflictMode = 'ignore';
        conflictTargets = resolveTargetKeys(opts?.target);
        return builder;
      },
      onConflictDoUpdate(opts: { target: any; set: Record<string, any> }) {
        conflictMode = 'update';
        conflictTargets = resolveTargetKeys(opts.target);
        conflictSet = opts.set || {};
        return builder;
      },
      returning() {
        wantsReturn = true;
        return builder;
      },
      then(onFulfilled: any, onRejected: any) {
        return execute().then(onFulfilled, onRejected);
      },
      catch(onRejected: any) {
        return execute().catch(onRejected);
      },
    };

    return builder;
  }

  function updateBuilder(table: Table) {
    const meta = getMeta(table);
    let patch: Record<string, any> = {};
    let whereExpr: SQL | undefined;
    let wantsReturn = false;

    const execute = async (): Promise<Row[]> => {
      const tableRows = getRows(meta.name);
      const updated: Row[] = [];

      for (const row of tableRows) {
        const ctx: EvalContext = {
          defaultTable: meta.name,
          tables: { [meta.name]: { meta, row } },
        };
        if (!whereExpr || evalSqlExpression(whereExpr, ctx)) {
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) continue;
            row[k] = v instanceof SQL ? evalSqlExpression(v, ctx) : cloneValue(v);
          }
          updated.push(cloneValue(row));
        }
      }

      return wantsReturn ? updated : [];
    };

    const builder: any = {
      set(vals: Record<string, any>) {
        patch = vals || {};
        return builder;
      },
      where(cond: SQL | undefined) {
        whereExpr = cond;
        return builder;
      },
      returning() {
        wantsReturn = true;
        return builder;
      },
      then(onFulfilled: any, onRejected: any) {
        return execute().then(onFulfilled, onRejected);
      },
      catch(onRejected: any) {
        return execute().catch(onRejected);
      },
    };

    return builder;
  }

  function deleteBuilder(table: Table) {
    const meta = getMeta(table);
    let whereExpr: SQL | undefined;
    let wantsReturn = false;

    const execute = async (): Promise<Row[]> => {
      const tableRows = getRows(meta.name);
      const remaining: Row[] = [];
      const deleted: Row[] = [];

      for (const row of tableRows) {
        const ctx: EvalContext = {
          defaultTable: meta.name,
          tables: { [meta.name]: { meta, row } },
        };
        if (!whereExpr || evalSqlExpression(whereExpr, ctx)) {
          deleted.push(cloneValue(row));
        } else {
          remaining.push(row);
        }
      }

      store.set(meta.name, remaining);
      return wantsReturn ? deleted : [];
    };

    const builder: any = {
      where(cond: SQL | undefined) {
        whereExpr = cond;
        return builder;
      },
      returning() {
        wantsReturn = true;
        return builder;
      },
      then(onFulfilled: any, onRejected: any) {
        return execute().then(onFulfilled, onRejected);
      },
      catch(onRejected: any) {
        return execute().catch(onRejected);
      },
    };

    return builder;
  }

  const mockDb: any = {
    select: (fields?: Record<string, any>) => selectBuilder(fields),
    insert: (table: Table) => insertBuilder(table),
    update: (table: Table) => updateBuilder(table),
    delete: (table: Table) => deleteBuilder(table),
    execute: async () => ({ rows: [{ '?column?': 1 }] }),
    nextCustomerCode(): string {
      const codeNum = nextId('customers_code_seq');
      return `NTF-CUST-${String(codeNum).padStart(6, '0')}`;
    },
    async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      const snapshotStore = new Map<string, Row[]>();
      for (const [k, v] of store.entries()) {
        snapshotStore.set(k, v.map((r) => cloneValue(r)));
      }
      const snapshotSeq = new Map(sequences);
      try {
        return await fn(mockDb);
      } catch (err) {
        store.clear();
        for (const [k, v] of snapshotStore.entries()) {
          store.set(k, v);
        }
        sequences.clear();
        for (const [k, v] of snapshotSeq.entries()) {
          sequences.set(k, v);
        }
        throw err;
      }
    },
  };

  return mockDb;
}
