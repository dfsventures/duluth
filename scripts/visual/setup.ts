// Local visual-check toolkit, step 1: create the schema in molly_local and fill it with
// placeholder data. Run: npx tsx scripts/visual/setup.ts
//
// Safe to re-run: it wipes every table first. Placeholder names only (the repo is public).
import { spawnSync } from "node:child_process";
import { applyLocalEnv, assertLocalDatabase } from "./env";

applyLocalEnv(); // puts the local env (DATABASE_URL included) in process.env, then enforces the molly_local guard

const REPO = process.cwd(); // run from the repo root (npx tsx scripts/visual/setup.ts)
const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY);
const ahead = (days: number) => new Date(NOW + days * DAY);
const dateOnly = (days: number) => {
  const d = ago(days);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

async function main() {
  // (b) Create/upgrade the tables. --accept-data-loss is acceptable ONLY because the guard above
  // has proven this is the throwaway local database "molly_local" (nothing real can be lost).
  console.log("Pushing the schema to molly_local ...");
  const push = spawnSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: REPO,
    env: process.env,
    stdio: "inherit",
  });
  if (push.status !== 0) {
    console.error("prisma db push failed; stopping.");
    process.exit(push.status ?? 1);
  }

  assertLocalDatabase(process.env.DATABASE_URL); // once more, right before any write
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ log: ["error"] });

  try {
    // (c) Wipe every table (guarded above), keeping Prisma's own bookkeeping.
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_prisma%'`;
    if (tables.length > 0) {
      const list = tables.map((t) => `"${t.tablename}"`).join(", ");
      await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }

    // ── Users ────────────────────────────────────────────
    const sam = await db.user.create({
      data: {
        email: "sam@example.com",
        name: "Sam Admin",
        roles: ["ADMIN"],
        status: "APPROVED",
        googleId: "local-google-sam",
        createdAt: ago(600),
      },
    });
    const riley = await db.user.create({
      data: {
        email: "riley@example.com",
        name: "Riley Admin",
        roles: ["ADMIN"],
        status: "APPROVED",
        googleId: "local-google-riley",
        createdAt: ago(420),
      },
    });

    const NOT_A_HASH = "not-a-real-password-hash"; // founders count as "set up"; nobody can sign in with this
    const mkFounder = (name: string, email: string, createdDaysAgo: number) =>
      db.user.create({
        data: { name, email, roles: ["FOUNDER"], status: "APPROVED", passwordHash: NOT_A_HASH, createdAt: ago(createdDaysAgo) },
      });

    const jane = await mkFounder("Jane Founder", "jane@acme-robotics.example.com", 400);
    const omar = await mkFounder("Omar Okafor", "omar@globex-energy.example.com", 395);
    const priya = await mkFounder("Priya Shah", "priya@initech-systems.example.com", 380);
    const tomas = await mkFounder("Tomas Reyes", "tomas@example-co.example.com", 300);
    const lena = await mkFounder("Lena Vogel", "lena@soylent-foods.example.com", 250);
    const kwame = await mkFounder("Kwame Mensah", "kwame@northwind.example.com", 240);
    const amara = await mkFounder("Amara Diallo", "amara@piedpiper-cloud.example.com", 200);
    const sofia = await mkFounder("Sofia Marin", "sofia@cyberdyne-bio.example.com", 180);
    const ivan = await mkFounder("Ivan Petrov", "ivan@tyrell-materials.example.com", 20);
    const nora = await mkFounder("Nora Haddad", "nora@vandelay.example.com", 160);
    const ben = await mkFounder("Ben Carter", "ben@vandelay.example.com", 150);
    const zainab = await mkFounder("Zainab Bello", "zainab@gringotts-savings.example.com", 140);

    // ── Companies ────────────────────────────────────────
    type Cadence = {
      name: string;
      sector: string;
      geography: string;
      fundingStage: string;
      createdDaysAgo: number;
      updateDaysAgo: number[]; // published update ages in days, any order
      founders?: { user: { id: string }; role: "OWNER" | "MEMBER" | "VIEWER" }[];
      marge?: boolean;
      stage?: string;
      aliases?: string[];
      website?: string;
      brandColor?: string;
      description?: string;
    };

    const LONG_LOCATION =
      "Greater Nairobi Metropolitan Area, Kenya, with regional offices across Northern Tanzania and Eastern Uganda";
    const LONG_NAME = "Northwind Traders International Agricultural Technology and Supply Chain Holdings Limited";

    const specs: Cadence[] = [
      // CURRENT: monthly updates, latest 10 days ago.
      { name: "Acme Robotics", sector: "Industrial Tech", geography: "Nigeria", fundingStage: "Series A", createdDaysAgo: 400,
        updateDaysAgo: [10, 40, 70, 100, 130], founders: [{ user: jane, role: "OWNER" }], website: "https://acme-robotics.example.com",
        brandColor: "#2563eb", description: "Warehouse robots for mid-sized distributors." },
      // AGING: monthly cadence, latest 25 days ago (past two thirds of the gap, not yet behind).
      { name: "Globex Energy", sector: "Climate", geography: "Kenya", fundingStage: "Seed", createdDaysAgo: 400,
        updateDaysAgo: [25, 55, 85, 115, 145], founders: [{ user: omar, role: "OWNER" }], website: "https://globex-energy.example.com",
        brandColor: "#16a34a" },
      // BEHIND: monthly cadence, latest 75 days ago.
      { name: "Initech Systems", sector: "SaaS", geography: "South Africa", fundingStage: "Series A", createdDaysAgo: 500,
        updateDaysAgo: [75, 105, 135, 165], founders: [{ user: priya, role: "OWNER" }], website: "https://initech-systems.example.com" },
      // BEHIND: only one old update (fewer than three).
      { name: "Example Co", sector: "Fintech", geography: "Ghana", fundingStage: "Pre-seed", createdDaysAgo: 300,
        updateDaysAgo: [120], founders: [{ user: tomas, role: "OWNER" }], aliases: ["Example Company"] },
      // NO UPDATES YET: young, no founder, filed through Marge.
      { name: "Umbrella Health", sector: "Healthtech", geography: "Rwanda", fundingStage: "Seed", createdDaysAgo: 10,
        updateDaysAgo: [], marge: true, aliases: ["Umbrella Health Inc"], website: "https://umbrella-health.example.com" },
      // Young company with only old updates (backdated by Marge), no founder.
      { name: "Hooli Mobility", sector: "Logistics", geography: "Egypt", fundingStage: "Seed", createdDaysAgo: 15,
        updateDaysAgo: [90], marge: true },
      // CURRENT with a long location string.
      { name: "Soylent Foods", sector: "Agritech", geography: LONG_LOCATION, fundingStage: "Series B", createdDaysAgo: 250,
        updateDaysAgo: [6, 36, 66, 96, 126], founders: [{ user: lena, role: "OWNER" }] },
      // AGING with a very long company name.
      { name: LONG_NAME, sector: "Agritech", geography: "Tanzania", fundingStage: "Series A", createdDaysAgo: 240,
        updateDaysAgo: [22, 50, 78, 106], founders: [{ user: kwame, role: "OWNER" }] },
      // Diligence-stage company, current.
      { name: "Pied Piper Cloud", sector: "SaaS", geography: "Ghana", fundingStage: "Seed", createdDaysAgo: 200,
        updateDaysAgo: [12, 42, 72], founders: [{ user: amara, role: "OWNER" }], stage: "DILIGENCE" },
      // BEHIND, no founder, Marge-filed with backdated updates.
      { name: "Wonka Payments", sector: "Fintech", geography: "Nigeria", fundingStage: "Series A", createdDaysAgo: 220,
        updateDaysAgo: [95, 125, 155, 185], marge: true },
      { name: "Cyberdyne Bio", sector: "Healthtech", geography: "South Africa", fundingStage: "Series A", createdDaysAgo: 180,
        updateDaysAgo: [8, 38, 68, 98], founders: [{ user: sofia, role: "OWNER" }] },
      // NO UPDATES YET: 20 days old, has a founder.
      { name: "Tyrell Materials", sector: "Climate", geography: "Kenya", fundingStage: "Pre-seed", createdDaysAgo: 20,
        updateDaysAgo: [], founders: [{ user: ivan, role: "OWNER" }] },
      // CURRENT with two founders.
      { name: "Vandelay Imports", sector: "Logistics", geography: "Egypt", fundingStage: "Seed", createdDaysAgo: 160,
        updateDaysAgo: [5, 35, 65], founders: [{ user: nora, role: "OWNER" }, { user: ben, role: "MEMBER" }] },
      // BEHIND.
      { name: "Gringotts Savings", sector: "Fintech", geography: "Rwanda", fundingStage: "Seed", createdDaysAgo: 140,
        updateDaysAgo: [60, 90, 120], founders: [{ user: zainab, role: "OWNER" }] },
    ];

    const companyIds: Record<string, string> = {};
    const updateIds: Record<string, string[]> = {}; // newest first, per company name
    let margeKeyCounter = 0;

    for (const s of specs) {
      const owner = s.founders?.[0]?.user ?? sam;
      const company = await db.company.create({
        data: {
          name: s.name,
          sector: s.sector,
          geography: s.geography,
          fundingStage: s.fundingStage,
          stage: s.stage ?? "ACTIVE",
          aliases: s.aliases ?? [],
          website: s.website ?? null,
          brandColor: s.brandColor ?? null,
          description: s.description ?? null,
          createdById: sam.id,
          createdVia: s.marge ? "marge" : null,
          createdAt: ago(s.createdDaysAgo),
          memberships: s.founders
            ? { create: s.founders.map((f) => ({ userId: f.user.id, role: f.role })) }
            : undefined,
        },
      });
      companyIds[s.name] = company.id;
      updateIds[s.name] = [];

      const sorted = [...s.updateDaysAgo].sort((a, b) => a - b);
      for (const [i, days] of sorted.entries()) {
        const d = ago(days);
        const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const viaMarge = Boolean(s.marge);
        const u = await db.update.create({
          data: {
            companyId: company.id,
            createdById: owner.id,
            period,
            title: `${s.name.length > 40 ? "Northwind" : s.name} update, ${period}`,
            body:
              `<p>Placeholder update for ${period}. Revenue grew and the team hired two engineers.</p>` +
              `<ul><li>Closed three pilot customers</li><li>Shipped the new onboarding flow</li></ul>` +
              (i === 0 ? "<p>Ask: introductions to regional distributors.</p>" : ""),
            status: "SENT",
            sentAt: d,
            createdAt: d,
            source: viaMarge ? "EMAIL_VIA_MARGE" : "FOUNDER",
            sourceKey: viaMarge ? `slack:LOCALCHAN:${++margeKeyCounter}.000100` : null,
            sourceRef: viaMarge
              ? { kind: "slack_email", channelId: "LOCALCHAN", messageTs: `${margeKeyCounter}.000100`, subject: "Monthly update", fromName: "Placeholder Sender", fromDomain: "example.com", forwardedBy: "sam" }
              : undefined,
            filedAt: viaMarge ? ago(Math.max(0, days - 1)) : null,
          },
        });
        updateIds[s.name].push(u.id);
      }
    }

    // A draft and a scheduled update, so the Updates list has non-published rows.
    await db.update.create({
      data: {
        companyId: companyIds["Acme Robotics"], createdById: jane.id, period: "2026-11", title: "Acme Robotics draft for November",
        body: "<p>Draft in progress.</p>", status: "DRAFT",
      },
    });
    await db.update.create({
      data: {
        companyId: companyIds["Cyberdyne Bio"], createdById: sofia.id, period: "2026-11", title: "Cyberdyne Bio scheduled update",
        body: "<p>Scheduled for later this week.</p>", status: "DRAFT", scheduledFor: ahead(3),
      },
    });

    // ── Figures on updates ───────────────────────────────
    const addMetrics = async (
      company: string,
      metric: { name: string; unit: string },
      values: number[], // newest first, aligned with the company's updates
      marge?: { quote: string; origin: "email" | "attachment" }
    ) => {
      const def = await db.metricDefinition.create({
        data: { companyId: companyIds[company], name: metric.name, unit: metric.unit },
      });
      const spec = specs.find((x) => x.name === company)!;
      const days = [...spec.updateDaysAgo].sort((a, b) => a - b);
      for (const [i, v] of values.entries()) {
        await db.metricValue.create({
          data: {
            metricDefinitionId: def.id,
            value: v,
            date: ago(days[i]),
            updateId: updateIds[company][i],
            createdAt: ago(days[i]),
            via: marge ? "marge" : null,
            quote: marge ? marge.quote : null,
            origin: marge ? marge.origin : null,
            enteredById: marge ? sam.id : null,
          },
        });
      }
      return def;
    };

    await addMetrics("Acme Robotics", { name: "MRR", unit: "USD" }, [84000, 79000, 71000, 66000, 60000]);
    await addMetrics("Acme Robotics", { name: "Customers", unit: "count" }, [41, 38, 35, 31, 28]);
    const globexMrr = await addMetrics("Globex Energy", { name: "MRR", unit: "USD" }, [31000, 30500, 29000, 27500, 26000]);
    const initechMrr = await addMetrics("Initech Systems", { name: "MRR", unit: "USD" }, [7900, 12000, 11800, 11500]);
    await addMetrics("Soylent Foods", { name: "Revenue", unit: "USD" }, [220000, 205000, 190000, 180000, 170000]);
    await addMetrics("Wonka Payments", { name: "Monthly volume", unit: "USD" }, [1500000, 1400000, 1250000, 1100000], {
      quote: "We processed about 1.5M in volume last month.",
      origin: "email",
    });
    await addMetrics("Hooli Mobility", { name: "Active drivers", unit: "count" }, [320], {
      quote: "Roughly 320 active drivers across the city.",
      origin: "attachment",
    });

    // ── Metric alerts ────────────────────────────────────
    await db.metricAlert.create({
      data: {
        companyId: companyIds["Initech Systems"], rule: "METRIC_CHANGE", metricDefinitionId: initechMrr.id,
        message: "MRR changed -34% (12,000 to 7,900)", dedupeKey: "local-alert-initech-mrr",
        metadata: { previousValue: 12000, latestValue: 7900, changePct: -34, previousDate: ago(105).toISOString(), latestDate: ago(75).toISOString() },
        firedAt: ago(4),
      },
    });
    await db.metricAlert.create({
      data: {
        companyId: companyIds["Example Co"], rule: "NO_METRICS_IN_UPDATES", message: "No figures in the last 3 updates",
        dedupeKey: "local-alert-example-no-metrics", firedAt: ago(9),
      },
    });
    await db.metricAlert.create({
      data: {
        companyId: companyIds["Globex Energy"], rule: "METRIC_CHANGE", metricDefinitionId: globexMrr.id,
        message: "MRR changed +4% (29,000 to 30,500)", dedupeKey: "local-alert-globex-resolved",
        firedAt: ago(30), resolvedAt: ago(28), resolvedById: sam.id,
      },
    });

    // ── Signups: pending, awaiting setup, dismissed ──────
    const pendingCompany = async (companyName: string, aliases: string[] = []) =>
      db.company.create({ data: { name: companyName, aliases, sector: "Fintech", geography: "Nigeria", fundingStage: "Seed", createdById: sam.id } });

    const cA = await pendingCompany("Dunder Mifflin Paper"); // matches a deal-ledger row below (link suggestion)
    const cB = await pendingCompany("Umbrella Health Inc"); // matches the no-founder Umbrella Health company
    const cC = await pendingCompany("Aperture Science Labs");
    const pending = [
      { name: "Chidi Eze", email: "chidi@dunder-mifflin-paper.example.com", company: cA, createdAt: ago(1) },
      { name: "Fatima Noor", email: "fatima@umbrella-health.example.com", company: cB, createdAt: ago(2) },
      { name: "Daniel Kimani", email: "daniel@aperture-labs.example.com", company: cC, createdAt: ago(5) },
    ];
    for (const p of pending) {
      await db.user.create({
        data: {
          name: p.name, email: p.email, roles: ["FOUNDER"], status: "PENDING", createdAt: p.createdAt,
          passwordHash: NOT_A_HASH,
          memberships: { create: { companyId: p.company.id, role: "OWNER" } },
        },
      });
    }

    const cD = await pendingCompany("Massive Dynamic Labs");
    const cE = await pendingCompany("Oscorp Therapeutics");
    await db.user.create({
      data: {
        name: "Grace Adeyemi", email: "grace@massive-dynamic.example.com", roles: ["FOUNDER"], status: "APPROVED",
        approvalToken: "local-token-valid", tokenExpiresAt: ahead(5), createdAt: ago(3),
        memberships: { create: { companyId: cD.id, role: "OWNER" } },
      },
    });
    await db.user.create({
      data: {
        name: "Hassan Ali", email: "hassan@oscorp.example.com", roles: ["FOUNDER"], status: "APPROVED",
        approvalToken: "local-token-expired", tokenExpiresAt: ago(6), createdAt: ago(20),
        memberships: { create: { companyId: cE.id, role: "OWNER" } },
      },
    });

    const dismissed = [
      { name: "Wei Zhang", email: "wei@globex-energy.example.com", company: "Globex Energy" },
      { name: "Maya Lindqvist", email: "maya@cyberdyne-bio.example.com", company: "Cyberdyne Bio" },
      { name: "Tunde Bakare", email: "tunde@tyrell-materials.example.com", company: "Tyrell Materials" },
    ];
    for (const d of dismissed) {
      await db.user.create({
        data: {
          name: d.name, email: d.email, roles: ["FOUNDER"], status: "APPROVED", createdAt: ago(90),
          approvalToken: `local-token-dismissed-${d.name.split(" ")[0].toLowerCase()}`, tokenExpiresAt: ago(60),
          setupQueueDismissedAt: ago(30),
          memberships: { create: { companyId: companyIds[d.company], role: "MEMBER" } },
        },
      });
    }
    await db.user.create({
      data: { name: "Rejected Person", email: "rejected@example.com", roles: ["FOUNDER"], status: "REJECTED", createdAt: ago(40) },
    });

    // ── Sectors ──────────────────────────────────────────
    for (const name of ["Fintech", "Healthtech", "Climate", "Agritech", "Logistics", "SaaS", "Industrial Tech"]) {
      await db.sector.create({ data: { name } });
    }

    // ── Funds, deal ledger ───────────────────────────────
    const fund1 = await db.fund.create({
      data: { slug: "FUND1", name: "Example Fund I", groupLabel: "Example Venture Funds", firstDealDate: ago(1500), aumUsd: 12_500_000, sortOrder: 1,
        grossMoicOverride: 1.8, netTvpiOverride: 1.5, netDpiOverride: 0.2 },
    });
    const fund2 = await db.fund.create({
      data: { slug: "FUND2", name: "Example Fund II", groupLabel: "Example Venture Funds", firstDealDate: ago(900), aumUsd: 28_000_000, sortOrder: 2 },
    });
    const fund3 = await db.fund.create({
      data: { slug: "GROWTH", name: "Example Growth Fund", groupLabel: "Example Growth Funds", firstDealDate: ago(300), aumUsd: 6_000_000, sortOrder: 3 },
    });

    const portcoSpecs: { name: string; country: string; linked?: string }[] = [
      { name: "Acme Robotics", country: "Nigeria", linked: "Acme Robotics" },
      { name: "Globex Energy", country: "Kenya", linked: "Globex Energy" },
      { name: "Initech Systems", country: "South Africa", linked: "Initech Systems" },
      { name: "Soylent Foods", country: "Kenya", linked: "Soylent Foods" },
      { name: "Dunder Mifflin Paper Co.", country: "Nigeria" },
      { name: "Bluth Company", country: "Ghana" },
      { name: "Prestige Worldwide", country: "Egypt" },
      { name: "Sterling Archer Logistics", country: "Rwanda" },
    ];
    const portco: Record<string, string> = {};
    for (const p of portcoSpecs) {
      const row = await db.portfolioCompany.create({
        data: { name: p.name, country: p.country, companyId: p.linked ? companyIds[p.linked] : null },
      });
      portco[p.name] = row.id;
    }

    const deal = (fundId: string, pc: string, type: "INITIAL" | "FOLLOW_ON", daysAgo: number, amount: number, entry: number | null, current: number | null, instrument = "SAFE") =>
      db.deal.create({
        data: {
          fundId, portfolioCompanyId: portco[pc], investmentType: type, dealDate: ago(daysAgo), amountUsd: amount,
          instrument, entryValuation: entry, currentValuation: current, valuationAsOf: current === null ? null : ago(30),
          country: portcoSpecs.find((p) => p.name === pc)?.country ?? null, ownershipPct: entry ? Number(((amount / entry) * 100).toFixed(2)) : null,
        },
      });
    await deal(fund1.id, "Acme Robotics", "INITIAL", 1400, 250_000, 5_000_000, 24_000_000);
    await deal(fund1.id, "Globex Energy", "INITIAL", 1300, 300_000, 6_000_000, 9_000_000);
    await deal(fund1.id, "Initech Systems", "INITIAL", 1200, 200_000, 4_000_000, 0, "Convertible note");
    await deal(fund1.id, "Dunder Mifflin Paper Co.", "INITIAL", 1100, 150_000, 3_000_000, 4_500_000);
    await deal(fund2.id, "Acme Robotics", "FOLLOW_ON", 700, 500_000, 20_000_000, 24_000_000, "Priced equity");
    await deal(fund2.id, "Soylent Foods", "INITIAL", 650, 400_000, 12_000_000, 15_000_000, "Priced equity");
    await deal(fund2.id, "Bluth Company", "INITIAL", 500, 350_000, 8_000_000, 8_000_000);
    await deal(fund2.id, "Prestige Worldwide", "INITIAL", 450, 275_000, 7_000_000, 6_000_000);
    await deal(fund3.id, "Soylent Foods", "FOLLOW_ON", 200, 1_000_000, 18_000_000, 18_000_000, "Priced equity");
    await deal(fund3.id, "Sterling Archer Logistics", "INITIAL", 120, 600_000, 10_000_000, null);

    await db.financingRound.create({
      data: { portfolioCompanyId: portco["Acme Robotics"], label: "Series A", kind: "PRICED", roundDate: ago(700), raisedUsd: 8_000_000, preMoneyUsd: 12_000_000, postMoneyUsd: 20_000_000 },
    });
    await db.financingRound.create({
      data: { portfolioCompanyId: portco["Acme Robotics"], label: "Seed SAFE", kind: "SAFE", roundDate: ago(1400), raisedUsd: 2_000_000, postMoneyUsd: 5_000_000 },
    });
    await db.valuationMark.create({ data: { portfolioCompanyId: portco["Acme Robotics"], valuationUsd: 24_000_000, asOf: ago(30) } });
    await db.valuationMark.create({ data: { portfolioCompanyId: portco["Initech Systems"], valuationUsd: 0, asOf: ago(60), notes: "Written off" } });
    await db.fundCashflow.create({ data: { fundId: fund1.id, kind: "CAPITAL_CALL", date: ago(1450), amountUsd: 2_000_000 } });
    await db.fundCashflow.create({ data: { fundId: fund1.id, kind: "DISTRIBUTION", date: ago(200), amountUsd: 500_000, portfolioCompanyId: portco["Dunder Mifflin Paper Co."] } });
    await db.fundCashflow.create({ data: { fundId: fund2.id, kind: "CAPITAL_CALL", date: ago(720), amountUsd: 5_000_000 } });

    await db.portfolioCompanyContact.create({
      data: { portfolioCompanyId: portco["Acme Robotics"], name: "Jane Founder", email: "jane@acme-robotics.example.com", role: "CEO" },
    });

    // ── Memos ────────────────────────────────────────────
    const memo = (
      title: string,
      status: "DRAFT" | "IN_REVIEW" | "FINAL",
      decision: string | null,
      extra: Record<string, unknown> = {},
      visibility: "PRIVATE" | "TEAM" = "TEAM"
    ) =>
      db.memo.create({
        data: {
          title, status, decision, visibility, ownerId: sam.id,
          source: "Founder Intro", tags: ["fintech", "africa"], introDate: dateOnly(40),
          websiteUrl: "https://memo-target.example.com",
          sections: {
            create: [
              { key: "summary", title: "Summary", markdown: "Placeholder summary of the opportunity.", position: 0 },
              { key: "risks", title: "Risks", markdown: "- Placeholder risk one\n- Placeholder risk two", position: 1 },
            ],
          },
          ...extra,
        },
      });
    await memo("Acme Robotics Series A follow-on", "FINAL", "INVESTED", { companyId: companyIds["Acme Robotics"] });
    await memo("Pied Piper Cloud seed round", "IN_REVIEW", "MEMO", { companyId: companyIds["Pied Piper Cloud"] });
    await memo("Wonka Payments bridge", "DRAFT", "IN_PROGRESS", { companyId: companyIds["Wonka Payments"], draftedByMarge: true });
    await memo("Black Mesa Energy first look", "DRAFT", "IN_PROGRESS", { companyNamePending: "Black Mesa Energy" }, "PRIVATE");
    await memo("Bluth Company follow-on pass", "FINAL", "PASSED", { portfolioCompanyId: portco["Bluth Company"] });
    await memo("Stark Grain Co. revisit later", "FINAL", "LATER", { companyNamePending: "Stark Grain Co." });

    // ── Team board ───────────────────────────────────────
    const samPerson = await db.boardPerson.create({ data: { displayName: "Sam Admin", userId: sam.id } });
    const rileyPerson = await db.boardPerson.create({ data: { displayName: "Riley Admin", userId: riley.id } });
    const alexPerson = await db.boardPerson.create({ data: { displayName: "Alex Contractor" } });
    const projA = await db.boardProject.create({ data: { name: "Portfolio support" } });
    const projB = await db.boardProject.create({ data: { name: "Fund reporting" } });

    const card = async (
      title: string,
      status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE",
      position: number,
      owners: { id: string }[],
      extra: Record<string, unknown> = {}
    ) => {
      const c = await db.boardCard.create({
        data: {
          title, status, position, notes: "Placeholder notes for this card.",
          ownerId: owners[0]?.id ?? null,
          projectId: position % 2 === 0 ? projA.id : projB.id,
          completedAt: status === "DONE" ? ago(2) : null,
          owners: { create: owners.map((o) => ({ personId: o.id })) },
          ...extra,
        },
      });
      return c;
    };
    await card("Chase Initech for the October update", "TODO", 1, [samPerson], { dueDate: dateOnly(-3) });
    await card("Review Q3 fund report draft", "TODO", 2, [rileyPerson, samPerson], { dueDate: dateOnly(-10) });
    await card("Tidy the investor link list", "TODO", 3, [], { needsReview: true, source: "GRANOLA" });
    await card("Prepare Acme follow-on memo", "IN_PROGRESS", 1, [samPerson], { dueDate: dateOnly(-1) });
    await card("Reconcile deal ledger with the sheet", "IN_PROGRESS", 2, [rileyPerson]);
    await card("Update the portfolio contact directory", "IN_PROGRESS", 3, [alexPerson]);
    const blocked1 = await card("Wire transfer for Fund II capital call", "BLOCKED", 1, [rileyPerson], { dueDate: dateOnly(5) });
    await card("Collect signed side letter from Globex", "BLOCKED", 2, [samPerson, alexPerson]);
    await card("Send the September digest", "DONE", 1, [samPerson]);
    await card("Archive stale company notes", "DONE", 2, [rileyPerson]);
    await card("Onboard Tyrell Materials", "DONE", 3, [samPerson, rileyPerson]);
    await db.boardCardLink.create({ data: { cardId: blocked1.id, url: "https://example.com/wire-instructions", label: "Wire instructions" } });

    // ── Audit log (so Settings / Audit pages are not empty) ──
    for (const [i, action] of ["USER_APPROVED", "COMPANY_CREATED", "FUND_UPDATED"].entries()) {
      await db.auditLog.create({
        data: { actorId: sam.id, actorEmail: sam.email, action, targetType: "Company", targetId: companyIds["Acme Robotics"], createdAt: ago(i + 1) },
      });
    }

    // ── Summary ──────────────────────────────────────────
    const [companies, users, updates, deals, memos, cards] = await Promise.all([
      db.company.count(), db.user.count(), db.update.count(), db.deal.count(), db.memo.count(), db.boardCard.count(),
    ]);
    console.log("\nSeeded molly_local:");
    console.log(`  admins: sam@example.com (Sam Admin), riley@example.com (Riley Admin)`);
    console.log(`  ${companies} companies, ${users} users, ${updates} updates`);
    console.log(`  3 pending signups, 2 awaiting setup (one expired), 3 dismissed`);
    console.log(`  3 funds, ${portcoSpecs.length} deal-ledger companies, ${deals} deals`);
    console.log(`  ${memos} memos, ${cards} team-board cards, 3 metric alerts`);
    console.log("Next: npx tsx scripts/visual/shoot.ts");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
