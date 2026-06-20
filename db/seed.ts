import { db } from './client';
import { customer, customerProfile, quote } from './schema';

async function seed() {
  console.log('Seeding database with 3 fixture customers...');

  // ── Customer 1: Maria Müller — Family-Skeptic blend ─────────────────────
  // 60% family / 25% skeptic / 10% environmentalist / 5% investor
  const [maria] = await db.insert(customer).values({
    id: 'cust_maria_mueller',
    firstName: 'Maria',
    lastName: 'Müller',
    email: 'maria.mueller@example.de',
    phoneNumber: '+49 30 12345678',
    preferredChannel: 'email',
    preferredLanguage: 'de',
    formalityRegister: 'formal',
    addressLine: 'Musterstraße 12',
    city: 'Berlin',
    postalCode: '10115',
    countryCode: 'DE',
    latitude: 52.5200,
    longitude: 13.4050,
    timezone: 'Europe/Berlin',
    solarIrradianceKwhM2Year: 1050,
    consentDataProcessing: true,
    consentDataProcessingAt: new Date(),
    consentMarketing: true,
    consentMarketingAt: new Date(),
    consentVoiceCloning: false,
  }).returning();

  await db.insert(customerProfile).values({
    customerId: maria.id,
    archetypeFamily: 0.60,
    archetypeInvestor: 0.05,
    archetypeEnvironmentalist: 0.10,
    archetypeSkeptic: 0.25,
    customerVerbatimPhrases: [
      "worried we'll get scammed",
      "done before the kids leave for uni next September",
      "tired of my bill going up every year",
      "my neighbor regrets not getting the battery",
      "want something reliable for the family",
    ],
    statedMotivations: [
      'Reduce monthly energy costs',
      'Energy independence for family',
      'Protect against rising electricity prices',
    ],
    statedObjections: [
      'Worried about scams / fly-by-night installers',
      'Concerned about roof damage during installation',
      'Not sure if the savings are real',
    ],
    competitorMentioned: false,
    competitorNames: [],
    decisionTimeline: 'this_quarter',
    householdSize: 4,
    inferenceConfidence: 0.85,
  });

  await db.insert(quote).values({
    customerId: maria.id,
    systemSizeKw: 8.5,
    panelCount: 20,
    panelBrand: 'Solarwatt',
    batteryIncluded: true,
    batteryKwh: 10,
    totalPrice: 18400,
    currency: 'EUR',
    financingType: 'installment',
    estimatedAnnualSavings: 1560,
    monthlyEquivalentSavings: 130,
    paybackPeriodYears: 11.8,
    annualRoiPct: 8.5,
    co2OffsetTons25yr: 47,
    quotePdfUrl: '/fixtures/maria-mueller-quote.pdf',
  });

  // ── Customer 2: Thomas Klein — Investor-dominant ─────────────────────────
  // 10% family / 70% investor / 10% environmentalist / 10% skeptic
  const [thomas] = await db.insert(customer).values({
    id: 'cust_thomas_klein',
    firstName: 'Thomas',
    lastName: 'Klein',
    email: 'thomas.klein@example.de',
    phoneNumber: '+49 89 98765432',
    preferredChannel: 'email',
    preferredLanguage: 'de',
    formalityRegister: 'informal',
    addressLine: 'Investorenweg 7',
    city: 'München',
    postalCode: '80331',
    countryCode: 'DE',
    latitude: 48.1351,
    longitude: 11.5820,
    timezone: 'Europe/Berlin',
    solarIrradianceKwhM2Year: 1180,
    consentDataProcessing: true,
    consentDataProcessingAt: new Date(),
    consentMarketing: true,
    consentMarketingAt: new Date(),
    consentVoiceCloning: false,
  }).returning();

  await db.insert(customerProfile).values({
    customerId: thomas.id,
    archetypeFamily: 0.10,
    archetypeInvestor: 0.70,
    archetypeEnvironmentalist: 0.10,
    archetypeSkeptic: 0.10,
    customerVerbatimPhrases: [
      "what's the IRR on this compared to ETFs",
      "show me the numbers, I don't care about the story",
      "payback in under 10 years or I walk",
      "I've already gotten two other quotes",
    ],
    statedMotivations: [
      'Best ROI on capital deployment',
      'Beat inflation with hard asset',
      'Take advantage of current incentives before they expire',
    ],
    statedObjections: [
      'Payback period too long vs alternatives',
      'Comparing with SolarCity quote that came in 8% cheaper',
    ],
    competitorMentioned: true,
    competitorNames: ['SolarCity'],
    decisionTimeline: 'asap',
    householdSize: 2,
    inferenceConfidence: 0.92,
  });

  await db.insert(quote).values({
    customerId: thomas.id,
    systemSizeKw: 12.0,
    panelCount: 28,
    panelBrand: 'SMA',
    batteryIncluded: false,
    batteryKwh: null,
    totalPrice: 22500,
    currency: 'EUR',
    financingType: 'cash',
    estimatedAnnualSavings: 2640,
    monthlyEquivalentSavings: 220,
    paybackPeriodYears: 8.5,
    annualRoiPct: 11.7,
    co2OffsetTons25yr: 66,
    quotePdfUrl: '/fixtures/thomas-klein-quote.pdf',
  });

  // ── Customer 3: Sophie Dubois — Environmentalist-Family blend ────────────
  // 35% family / 10% investor / 50% environmentalist / 5% skeptic
  const [sophie] = await db.insert(customer).values({
    id: 'cust_sophie_dubois',
    firstName: 'Sophie',
    lastName: 'Dubois',
    email: 'sophie.dubois@example.fr',
    phoneNumber: '+33 1 23456789',
    preferredChannel: 'whatsapp_text',
    preferredLanguage: 'fr',
    formalityRegister: 'informal',
    addressLine: '14 Rue de la Paix',
    city: 'Lyon',
    postalCode: '69001',
    countryCode: 'FR',
    latitude: 45.7640,
    longitude: 4.8357,
    timezone: 'Europe/Paris',
    solarIrradianceKwhM2Year: 1380,
    consentDataProcessing: true,
    consentDataProcessingAt: new Date(),
    consentMarketing: true,
    consentMarketingAt: new Date(),
    consentVoiceCloning: true,
  }).returning();

  await db.insert(customerProfile).values({
    customerId: sophie.id,
    archetypeFamily: 0.35,
    archetypeInvestor: 0.10,
    archetypeEnvironmentalist: 0.50,
    archetypeSkeptic: 0.05,
    customerVerbatimPhrases: [
      "I want my kids to inherit a livable planet",
      "every ton of CO2 counts at this point",
      "we already compost and have an electric car",
      "I want the house to be the battery for the neighborhood",
      "my daughter keeps asking when we're going solar",
    ],
    statedMotivations: [
      'Leave a clean planet for children',
      'Complete the family green journey (EV + solar)',
      'Be an example for the neighborhood',
    ],
    statedObjections: [
      'Concerned about aesthetics on heritage-style roof',
    ],
    competitorMentioned: false,
    competitorNames: [],
    decisionTimeline: 'this_quarter',
    householdSize: 4,
    inferenceConfidence: 0.88,
  });

  await db.insert(quote).values({
    customerId: sophie.id,
    systemSizeKw: 6.0,
    panelCount: 14,
    panelBrand: 'REC',
    batteryIncluded: true,
    batteryKwh: 7.5,
    totalPrice: 15900,
    currency: 'EUR',
    financingType: 'loan',
    estimatedAnnualSavings: 1080,
    monthlyEquivalentSavings: 90,
    paybackPeriodYears: 14.7,
    annualRoiPct: 6.8,
    co2OffsetTons25yr: 33,
    quotePdfUrl: '/fixtures/sophie-dubois-quote.pdf',
  });

  console.log('✓ Seeded: Maria Müller (Family-Skeptic), Thomas Klein (Investor-dominant), Sophie Dubois (Environmentalist-Family)');
  console.log('✓ Customer IDs:', maria.id, thomas.id, sophie.id);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
