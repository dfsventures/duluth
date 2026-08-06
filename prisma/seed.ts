import { PrismaClient, ProviderType, ProviderStatus } from "@prisma/client";

const db = new PrismaClient();

const CATEGORIES = [
  "Advisory & Finance",
  "Business Consulting",
  "Data Analytics",
  "Deck & Presentation Design",
  "Developer Talent",
  "Digital Marketing",
  "Interior Design",
  "Legal Services",
  "Market Research",
  "PR & Communications",
  "Real Estate & Accommodation",
  "Other",
];

// Synthetic example directory (F56 remediation) — replace with your own
// vetted-provider list. Uses only the app's established Acme/example.com
// placeholder convention; no real firm names, sites, or contact details.
const VETTED_PROVIDERS: Array<{
  type: ProviderType;
  name: string;
  website?: string;
  linkedin?: string;
  category: string;
  description?: string;
  contactEmail?: string;
  country?: string;
  city?: string;
}> = [
  {
    type: "FIRM",
    name: "Acme Advisory",
    website: "https://example.com",
    category: "Advisory & Finance",
    description: "Example vetted provider — replace with your own directory.",
    contactEmail: "hello@example.com",
    country: "Exampleland",
    city: "Example City",
  },
  {
    type: "FIRM",
    name: "Acme Market Research",
    website: "https://example.com",
    category: "Market Research",
    description: "Example vetted market-data and ecosystem-intelligence provider.",
    country: "Exampleland",
  },
  {
    type: "FIRM",
    name: "Acme Deck Studio",
    website: "https://example.com",
    category: "Deck & Presentation Design",
    description: "Example vetted presentation-design provider.",
  },
  {
    type: "INDIVIDUAL",
    name: "Jane Founder",
    linkedin: "https://www.linkedin.com/in/jane-founder-example/",
    category: "Advisory & Finance",
    description: "Example vetted individual consultant.",
  },
];

const COMMUNITY_PROVIDERS: Array<{
  type: ProviderType;
  name: string;
  website?: string;
  category: string;
  description?: string;
  contactEmail?: string;
  country?: string;
  city?: string;
}> = [
  {
    type: "FIRM",
    name: "Acme Consulting",
    website: "https://example.com",
    category: "Business Consulting",
    description: "Example community-submitted provider — replace with your own directory.",
    contactEmail: "contact@example.com",
    country: "Exampleland",
    city: "Example City",
  },
  {
    type: "FIRM",
    name: "Acme Data Labs",
    website: "https://example.com",
    category: "Data Analytics",
    description: "Example community-submitted data-analytics provider.",
    contactEmail: "info@example.com",
    country: "Exampleland",
    city: "Example City",
  },
  {
    type: "FIRM",
    name: "Acme Dev Collective",
    website: "https://example.com",
    category: "Developer Talent",
    description: "Example community-submitted developer-talent provider.",
    contactEmail: "hire@example.com",
    country: "Exampleland",
    city: "Example City",
  },
  {
    type: "FIRM",
    name: "Acme Legal Partners",
    website: "https://example.com",
    category: "Legal Services",
    description: "Example community-submitted legal-services provider.",
    contactEmail: "info@example.com",
    country: "Exampleland",
    city: "Example City",
  },
  {
    type: "FIRM",
    name: "Acme Digital Growth",
    website: "https://example.com",
    category: "Digital Marketing",
    description: "Example community-submitted digital-marketing provider.",
    contactEmail: "hello@example.com",
    country: "Exampleland",
    city: "Example City",
  },
];

async function main() {
  console.log("Seeding service categories...");
  const categoryMap: Record<string, string> = {};
  for (const name of CATEGORIES) {
    const cat = await db.serviceCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoryMap[name] = cat.id;
  }

  console.log("Seeding vetted providers...");
  for (const p of VETTED_PROVIDERS) {
    const categoryId = categoryMap[p.category];
    const existing = await db.serviceProvider.findFirst({ where: { name: p.name, categoryId } });
    if (!existing) {
      await db.serviceProvider.create({
        data: {
          type: p.type,
          name: p.name,
          website: p.website ?? null,
          linkedin: p.linkedin ?? null,
          categoryId,
          description: p.description ?? null,
          contactEmail: p.contactEmail ?? null,
          country: p.country ?? null,
          city: p.city ?? null,
          status: "VETTED" as ProviderStatus,
        },
      });
    }
  }

  console.log("Seeding community providers...");
  for (const p of COMMUNITY_PROVIDERS) {
    const categoryId = categoryMap[p.category];
    const existing = await db.serviceProvider.findFirst({ where: { name: p.name, categoryId } });
    if (!existing) {
      await db.serviceProvider.create({
        data: {
          type: p.type,
          name: p.name,
          website: p.website ?? null,
          categoryId,
          description: p.description ?? null,
          contactEmail: p.contactEmail ?? null,
          country: p.country ?? null,
          city: p.city ?? null,
          status: "PENDING" as ProviderStatus,
        },
      });
    }
  }

  console.log(`Done. ${CATEGORIES.length} categories, ${VETTED_PROVIDERS.length} vetted, ${COMMUNITY_PROVIDERS.length} community providers.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
