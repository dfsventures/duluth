// Part 45 test helper: a tiny in-memory stand-in for the parts of Prisma that the founder-update actions
// use, with real transaction rollback (snapshot and restore). Synthetic data only. Not a test file.
type Row = Record<string, any>;

export interface FakeState {
  users: Row[];
  company: Row[];
  portfolioCompany: Row[];
  update: Row[];
  metricDefinition: Row[];
  metricValue: Row[];
  auditLog: Row[];
  membership: Row[];
  contact: Row[]; // portfolio-company contacts: { portfolioCompanyId, email }
}

export function emptyState(): FakeState {
  return { users: [], company: [], portfolioCompany: [], update: [], metricDefinition: [], metricValue: [], auditLog: [], membership: [], contact: [] };
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    if (k === "OR") return (cond as Row[]).some((w) => matches(row, w));
    if (k === "AND") return (cond as Row[]).every((w) => matches(row, w));
    const v = row[k];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const str = (x: unknown) => String(x ?? "").toLowerCase();
      return Object.entries(cond).every(([op, arg]) => {
        if (op === "mode") return true;
        if (op === "in") return (arg as unknown[]).includes(v);
        if (op === "gt") return v != null && v > (arg as any);
        if (op === "gte") return v != null && v >= (arg as any);
        if (op === "lt") return v != null && v < (arg as any);
        if (op === "lte") return v != null && v <= (arg as any);
        if (op === "not") return v !== arg;
        if (op === "equals") return str(v) === str(arg);
        if (op === "contains") return str(v).includes(str(arg));
        return false;
      });
    }
    return v === cond;
  });
}

export function makeFakeDb(state: FakeState) {
  let seq = 0;
  const nid = (p: string) => `${p}_${++seq}`;
  const counts: Record<string, number> = {};
  const bump = (name: string) => {
    counts[name] = (counts[name] ?? 0) + 1;
  };

  const withRelations = (table: keyof FakeState, r: Row): Row => {
    if (table === "company") {
      return {
        ...r,
        portfolioCompany: state.portfolioCompany.find((p) => p.companyId === r.id) ?? null,
        createdBy: state.users.find((u) => u.id === r.createdById) ?? { status: "APPROVED", approvalToken: null, roles: ["ADMIN"] },
        memberships: state.membership.filter((m) => m.companyId === r.id).map((m) => ({ ...m, user: state.users.find((u) => u.id === m.userId) ?? { roles: [] } })),
      };
    }
    if (table === "metricDefinition") {
      const values = state.metricValue.filter((v) => v.metricDefinitionId === r.id).sort((a, b) => +b.date - +a.date);
      return { ...r, values: values.map((v) => withRelations("metricValue", v)) };
    }
    if (table === "portfolioCompany") {
      return { ...r, company: r.companyId ? state.company.find((c) => c.id === r.companyId) ?? null : null, contacts: (state.contact ?? []).filter((c) => c.portfolioCompanyId === r.id) };
    }
    if (table === "metricValue") {
      const u = r.updateId ? state.update.find((x) => x.id === r.updateId) : null;
      const author = u ? state.users.find((x) => x.id === u.createdById) : null;
      return { ...r, update: u ? { ...u, createdBy: author ?? { roles: [], name: null } } : null };
    }
    if (table === "update") {
      const author = state.users.find((x) => x.id === r.createdById);
      return { ...r, createdBy: author ?? { roles: [], name: null }, _count: { metricValues: state.metricValue.filter((v) => v.updateId === r.id).length } };
    }
    return r;
  };

  const model = (table: keyof FakeState, defaults: () => Row = () => ({})) => ({
    findMany: async (args: Row = {}) => {
      bump(`${table}.findMany`);
      let rows = state[table].filter((r) => matches(r, args.where));
      if (args.orderBy?.createdAt === "desc") rows = [...rows].sort((a, b) => +b.createdAt - +a.createdAt);
      if (args.take) rows = rows.slice(0, args.take);
      const out = rows.map((r) => withRelations(table, r));
      const take = args.select?.values?.take;
      if (table === "metricDefinition" && typeof take === "number") out.forEach((d) => (d.values = d.values.slice(0, take)));
      return out;
    },
    findFirst: async (args: Row = {}) => {
      bump(`${table}.findFirst`);
      const r = state[table].find((x) => matches(x, args.where));
      return r ? withRelations(table, r) : null;
    },
    findUnique: async (args: Row) => {
      bump(`${table}.findUnique`);
      const r = state[table].find((x) => matches(x, args.where));
      return r ? withRelations(table, r) : null;
    },
    count: async (args: Row = {}) => state[table].filter((r) => matches(r, args.where)).length,
    create: async (args: Row) => {
      bump(`${table}.create`);
      if (table === "company" && args.data.createKey && state.company.some((c) => c.createKey === args.data.createKey)) throw new Error("unique createKey");
      if (table === "update") {
        for (const k of ["sourceKey", "createKey"]) {
          if (args.data[k] && state.update.some((u) => u[k] === args.data[k])) throw new Error(`unique ${k}`);
        }
      }
      const row = { id: nid(table), createdAt: new Date(), ...defaults(), ...args.data };
      state[table].push(row);
      return withRelations(table, row);
    },
    update: async (args: Row) => {
      bump(`${table}.update`);
      const r = state[table].find((x) => matches(x, args.where));
      if (!r) throw new Error("not found");
      Object.assign(r, args.data);
      return withRelations(table, r);
    },
    updateMany: async (args: Row) => {
      bump(`${table}.updateMany`);
      const rows = state[table].filter((r) => matches(r, args.where));
      rows.forEach((r) => Object.assign(r, args.data));
      return { count: rows.length };
    },
    delete: async (args: Row) => {
      bump(`${table}.delete`);
      const i = state[table].findIndex((x) => matches(x, args.where));
      if (i < 0) throw new Error("not found");
      const [gone] = state[table].splice(i, 1);
      if (table === "update") state.metricValue.forEach((v) => v.updateId === gone.id && (v.updateId = null));
      return gone;
    },
    deleteMany: async (args: Row) => {
      bump(`${table}.deleteMany`);
      const keep = state[table].filter((r) => !matches(r, args.where));
      const count = state[table].length - keep.length;
      state[table].splice(0, state[table].length, ...keep);
      return { count };
    },
  });

  const tables = {
    company: model("company", () => ({ aliases: [], website: null, stage: "ACTIVE", createdVia: null, createKey: null, geography: null })),
    portfolioCompany: model("portfolioCompany", () => ({ companyId: null, country: null })),
    update: model("update", () => ({ source: "FOUNDER", sourceKey: null, createKey: null, filedAt: null, sentAt: null })),
    metricDefinition: model("metricDefinition", () => ({ unit: null })),
    metricValue: model("metricValue", () => ({ via: null, quote: null, enteredById: null, updateId: null })),
    auditLog: model("auditLog"),
  };

  const client: Record<string, any> = {
    ...tables,
    $executeRaw: async () => 1,
    $transaction: async (fn: (tx: any) => Promise<unknown>) => {
      const snap = JSON.stringify(state, (_k, v) => v);
      const dates = new Map<string, true>();
      void dates;
      try {
        return await fn(client);
      } catch (e) {
        const restored = reviveDates(JSON.parse(snap));
        for (const k of Object.keys(state) as (keyof FakeState)[]) state[k].splice(0, state[k].length, ...restored[k]);
        throw e;
      }
    },
  };
  return { db: client, counts };
}

function reviveDates(o: any): any {
  if (typeof o === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(o)) return new Date(o);
  if (Array.isArray(o)) return o.map(reviveDates);
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, reviveDates(v)]));
  return o;
}
