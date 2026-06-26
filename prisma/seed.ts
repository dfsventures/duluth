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
    name: "Briter Bridges",
    website: "https://briterbridges.com",
    category: "Market Research",
    description: "Data intelligence platform covering African and emerging market startup ecosystems.",
    country: "UK",
  },
  {
    type: "FIRM",
    name: "Africa: The Big Deal",
    website: "https://thebigdeal.gumroad.com",
    category: "Market Research",
    description: "Curated market data and ecosystem intelligence for African startup deals and funding.",
  },
  {
    type: "FIRM",
    name: "Rise Indonesia",
    website: "https://riseindonesia.org",
    category: "Market Research",
    description: "Runs the DFS Lab pathways survey for the Gates Indonesia project.",
    country: "Indonesia",
  },
  {
    type: "FIRM",
    name: "Brand Fusion Africa",
    website: "https://www.bfwafrica.com",
    category: "Market Research",
    description: "Conducted the DFS Lab digital retail survey on MSMEs across Nigeria and Kenya.",
    country: "Africa",
  },
  {
    type: "FIRM",
    name: "SlideXpress",
    website: "https://www.slidexpress.com",
    category: "Deck & Presentation Design",
    description: "Final design and polish for consulting decks. Trusted by the DFS Lab team.",
  },
  {
    type: "INDIVIDUAL",
    name: "Souraya Sbeih",
    linkedin: "https://www.linkedin.com/in/souraya-sbeih-20920319/",
    category: "Advisory & Finance",
    description: "Financial Sector Specialist. DFS Lab consultant for proposal work.",
  },
  {
    type: "INDIVIDUAL",
    name: "Jonathan Donner",
    linkedin: "https://www.linkedin.com/in/jdonner/",
    category: "Advisory & Finance",
    description: "Senior Researcher in Digital Economies. Hired for the Gates Indonesia Platform Livelihood project.",
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
    name: "Innogence Consulting",
    website: "https://www.innogenceconsulting.com",
    category: "Business Consulting",
    description: "Advisory firm providing market insights and business growth strategies.",
    contactEmail: "contact@innogenceconsulting.com",
    country: "France / Ivory Coast",
    city: "Paris / Abidjan",
  },
  {
    type: "FIRM",
    name: "Blossom Academy",
    website: "https://www.blossomacademy.co",
    category: "Data Analytics",
    description: "Recruits and develops African data scientists for on-demand and full-time placements within African businesses.",
    contactEmail: "info@blossomacademy.co",
    country: "Ghana",
    city: "Accra",
  },
  {
    type: "FIRM",
    name: "KASI Insight",
    website: "https://www.kasiinsight.com",
    category: "Market Research",
    description: "Award-winning research and advisory firm providing consumer and market insights from Africa.",
    country: "Kenya",
    city: "Nairobi",
  },
  {
    type: "FIRM",
    name: "Acumen",
    website: "https://www.acumen.digital",
    category: "Developer Talent",
    description: "Onboard vetted product designers, developers, and testers in a day.",
    contactEmail: "hello@acumen.digital",
    country: "Nigeria",
    city: "Lagos",
  },
  {
    type: "FIRM",
    name: "Afroshok",
    website: "https://afroshok.com",
    category: "Business Consulting",
    description: "Business and brand strategy for startups. Covers digital product, UI/UX, tech stack, and development.",
    contactEmail: "wave@afroshok.com",
    country: "Kenya",
    city: "Nairobi",
  },
  {
    type: "FIRM",
    name: "Trianum Hospitality",
    website: "http://www.trianum.co.ke",
    category: "Real Estate & Accommodation",
    description: "Apartment hotel chain with fully serviced apartments in Kilimani, Kileleshwa, and Riverside, Nairobi.",
    contactEmail: "sales@trianum.co.ke",
    country: "Kenya",
    city: "Nairobi",
  },
  {
    type: "FIRM",
    name: "Algum Africa Capital",
    category: "Advisory & Finance",
    description: "Boutique advisory firm providing corporate advisory services supporting SMEs and large enterprises.",
    contactEmail: "info@algumafricacapital.com",
    country: "Kenya",
    city: "Nairobi",
  },
  {
    type: "FIRM",
    name: "Maitri Capital",
    category: "Advisory & Finance",
    description: "Advisory on M&A, capital raising, valuations, business plans, and getting investor-ready.",
    contactEmail: "info@maitri-group.com",
    country: "Kenya",
    city: "Nairobi",
  },
  {
    type: "FIRM",
    name: "Africreate",
    website: "https://africreate.com",
    category: "Business Consulting",
    description: "Innovation advisors to entrepreneurs, startups, SMEs, and investors across Africa.",
    contactEmail: "hello@africreate.com",
    country: "Nigeria",
    city: "Lagos",
  },
  {
    type: "FIRM",
    name: "BalogunHarold",
    website: "http://balogunharold.com",
    category: "Business Consulting",
    description: "Advisory for high-growth companies and their investors across select industries and markets.",
    contactEmail: "info@balogunharold.com",
    country: "Nigeria",
    city: "Lagos",
  },
  {
    type: "FIRM",
    name: "The Longe Practice",
    website: "http://www.thelongepractice.com",
    category: "Legal Services",
    description: "Startup-focused boutique law firm. Supports companies from incubation through to early growth.",
    contactEmail: "Info@thelongepractice.com",
    country: "Nigeria",
    city: "Lagos",
  },
  {
    type: "FIRM",
    name: "GetDev",
    website: "http://getdev.co",
    category: "Developer Talent",
    description: "Helps startups source, assess, and hire talented developers, designers, and DevOps.",
    contactEmail: "hire@getdev.co",
    country: "Nigeria",
    city: "Lagos",
  },
  {
    type: "FIRM",
    name: "Olajide Oyewole LLP",
    website: "https://www.olajideoyewole.com",
    category: "Legal Services",
    description: "Full-service law firm for startups, tech companies, and investors navigating the legal landscape.",
    contactEmail: "technology@olajideoyewole.com",
    country: "Nigeria",
    city: "Lagos",
  },
  {
    type: "FIRM",
    name: "Altacyst",
    website: "https://www.altacyst.com",
    category: "Digital Marketing",
    description: "Helps SMEs and MSMEs leverage social and digital tools to maximize brand visibility.",
    contactEmail: "hello@altacyst.com",
    country: "Nigeria",
    city: "Lagos",
  },
  {
    type: "FIRM",
    name: "LeLaw Barristers & Solicitors",
    website: "https://www.lelawlegal.com",
    category: "Legal Services",
    description: "Niche commercial law firm specialising in transaction structuring and investment advisory. 25 years of PE experience.",
    contactEmail: "info@lelawlegal.com",
    country: "Nigeria",
    city: "Lagos",
  },
  {
    type: "FIRM",
    name: "Wild Fusion",
    website: "https://www.wildfusions.com",
    category: "Digital Marketing",
    description: "Digital marketing, growth hacking, customer acquisition, and product promotion for tech startups.",
    contactEmail: "info@wildfusions.com",
    country: "Nigeria / Ghana / Kenya",
    city: "Lagos",
  },
  {
    type: "FIRM",
    name: "Decor Nigeria",
    website: "https://www.decor.ng",
    category: "Interior Design",
    description: "Interior, furniture, landscape, and construction design specialising in functional office spaces.",
    contactEmail: "design@decor.ng",
    country: "Nigeria",
    city: "Lagos",
  },
  {
    type: "FIRM",
    name: "Leadwood",
    website: "https://www.leadwood.io",
    category: "Advisory & Finance",
    description: "Investment due diligence for African startups. Sector-agnostic, supports Seed to Series B.",
    contactEmail: "request@leadwood.io",
    country: "Nigeria / Germany",
    city: "Lagos / Berlin",
  },
  {
    type: "FIRM",
    name: "Legaldocx",
    website: "https://legaldocx.co.za",
    category: "Legal Services",
    description: "Fast, accessible legal documentation for startups. Removes barriers between the legal world and founders.",
    contactEmail: "hello@legaldocx.co.za",
    country: "South Africa",
    city: "Johannesburg",
  },
  {
    type: "FIRM",
    name: "Bytelex Advocates",
    website: "https://www.bytelexhq.com",
    category: "Legal Services",
    description: "Startup and tech law support across Uganda, Rwanda, Kenya, Zambia, Zimbabwe, South Africa, Ghana, and Nigeria.",
    contactEmail: "rasiimwe@bytelexhq.com",
    country: "East & West Africa",
    city: "Kampala",
  },
  {
    type: "FIRM",
    name: "Wimbart",
    website: "https://wimbart.com",
    category: "PR & Communications",
    description: "Boutique PR firm with heavy emphasis on Africa and emerging markets. Hyper-targeted media campaigns.",
    contactEmail: "jessica@wimbart.com",
    country: "UK",
    city: "London",
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
