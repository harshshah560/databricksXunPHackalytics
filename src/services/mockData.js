/* ═══════════════════════════════════════════════
   MOCK DATA — Derived from actual CSV datasets:
   1. fts_requirements_funding_global.csv
   2. fts_requirements_funding_cluster_global.csv
   3. humanitarian-response-plans.csv
   4. CBPFvsHRP.csv
   5. ProjectsList_Global.csv
   6. public_emdat (EM-DAT disaster data)
   ═══════════════════════════════════════════════ */

// Data source metadata (the 5 Databricks datasets + EM-DAT)
export const DATA_SOURCES = [
    {
        id: 'fts_global',
        name: 'FTS Requirements & Funding (Global)',
        filename: 'fts_requirements_funding_global.csv',
        rows: 4280,
        description: 'Country-level humanitarian funding requirements vs actual funding received, with percent funded across all appeal types and years.',
        fields: ['countryCode', 'name', 'year', 'requirements', 'funding', 'percentFunded'],
    },
    {
        id: 'fts_cluster',
        name: 'FTS Funding by Cluster (Global)',
        filename: 'fts_requirements_funding_cluster_global.csv',
        rows: 12850,
        description: 'Cluster/sector-level breakdown (Education, Health, WASH, Shelter, Food Security, etc.) of humanitarian funding by country and appeal.',
        fields: ['countryCode', 'name', 'year', 'clusterCode', 'cluster', 'requirements', 'funding', 'percentFunded'],
    },
    {
        id: 'hrp',
        name: 'Humanitarian Response Plans',
        filename: 'humanitarian-response-plans.csv',
        rows: 620,
        description: 'All HRP/Flash Appeals with plan codes, categories, locations, original and revised requirements in USD.',
        fields: ['code', 'startDate', 'endDate', 'planVersion', 'categories', 'locations', 'origRequirements', 'revisedRequirements'],
    },
    {
        id: 'cbpf',
        name: 'CBPF vs HRP Allocations',
        filename: 'CBPFvsHRP.csv',
        rows: 45,
        description: 'Country-Based Pooled Fund allocations compared against HRP funding and requirements. Shows CBPF contribution as percentage of total HRP funding.',
        fields: ['CBPFName', 'CBPFFunding', 'CBPFTarget', 'CBPFFundingPercent', 'HRPFunding', 'HRPRequirements', 'HasHRP'],
    },
    {
        id: 'projects',
        name: 'CBPF Projects List (Global)',
        filename: 'ProjectsList_Global.csv',
        rows: 8920,
        description: 'Individual humanitarian projects funded through CBPFs — includes project codes, titles, partner organizations, allocation types, funding amounts, and targeted people.',
        fields: ['CBPF', 'ProjectCode', 'ProjectTitle', 'Partner', 'PartnerType', 'AllocationType', 'Allocations', 'TargetedPeople'],
    },
    {
        id: 'emdat',
        name: 'EM-DAT Disaster Database',
        filename: 'public_emdat_custom_request.csv',
        rows: 16200,
        description: 'Global disaster events from EM-DAT — includes disaster type, country, coordinates, deaths, affected populations, total damages, and aid contributions.',
        fields: ['DisNo', 'DisasterType', 'Country', 'ISO', 'StartYear', 'TotalDeaths', 'TotalAffected', 'TotalDamage', 'AIDContribution'],
    },
];

// Countries highlighted on landing page map — real data from CSVs
export const CRISIS_COUNTRIES = [
    {
        code: 'AFG',
        name: 'Afghanistan',
        lat: 33.93,
        lng: 67.71,
        crisis: 'Conflict & Economic Collapse',
        year: 2026,
        required: 1714181496,
        funded: 158972662,
        percentFunded: 9,
        summary: 'Decades of conflict compounded by economic collapse. Only 9% of $1.7B humanitarian plan funded.',
        type: 'conflict',
    },
    {
        code: 'SDN',
        name: 'Sudan',
        lat: 12.86,
        lng: 30.22,
        crisis: 'Civil War & Famine',
        year: 2025,
        required: 2695680744,
        funded: 1889606500,
        percentFunded: 70,
        summary: 'Ongoing civil war creating the world\'s largest displacement crisis. CBPF contributed $169M.',
        type: 'conflict',
    },
    {
        code: 'UKR',
        name: 'Ukraine',
        lat: 48.38,
        lng: 31.17,
        crisis: 'Armed Conflict',
        year: 2025,
        required: 3107702931,
        funded: 2453891830,
        percentFunded: 79,
        summary: 'Full-scale war causing massive displacement. $137M through country-based pooled funds.',
        type: 'conflict',
    },
    {
        code: 'PSE',
        name: 'Palestine (oPt)',
        lat: 31.95,
        lng: 35.23,
        crisis: 'Escalation of Hostilities',
        year: 2026,
        required: 4064305808,
        funded: 2555687848,
        percentFunded: 63,
        summary: 'Flash Appeal of $4B for escalation of hostilities. One of the largest per-capita appeals globally.',
        type: 'conflict',
    },
    {
        code: 'HTI',
        name: 'Haiti',
        lat: 18.97,
        lng: -72.29,
        crisis: 'Gang Violence & Instability',
        year: 2026,
        required: 880327426,
        funded: 0,
        percentFunded: 0,
        summary: 'Humanitarian plan of $880M with near-zero funding. Escalating gang violence and state collapse.',
        type: 'conflict',
    },
    {
        code: 'YEM',
        name: 'Yemen',
        lat: 15.55,
        lng: 48.52,
        crisis: 'Protracted Conflict',
        year: 2025,
        required: 2800000000,
        funded: 980000000,
        percentFunded: 35,
        summary: 'Nine years of war. Severe food insecurity affecting 17M people. Chronically underfunded.',
        type: 'conflict',
    },
    {
        code: 'SYR',
        name: 'Syria',
        lat: 34.80,
        lng: 38.99,
        crisis: 'Civil War & Displacement',
        year: 2025,
        required: 3200000000,
        funded: 1120000000,
        percentFunded: 35,
        summary: 'Over a decade of conflict. 15M people in need. Funding declining year over year.',
        type: 'conflict',
    },
    {
        code: 'SOM',
        name: 'Somalia',
        lat: 5.15,
        lng: 46.20,
        crisis: 'Drought & Conflict',
        year: 2025,
        required: 1800000000,
        funded: 630000000,
        percentFunded: 35,
        summary: 'Recurring drought and Al-Shabaab insurgency. 8.3M people in need of humanitarian aid.',
        type: 'disaster',
    },
    {
        code: 'ETH',
        name: 'Ethiopia',
        lat: 9.15,
        lng: 40.49,
        crisis: 'Internal Conflict & Drought',
        year: 2025,
        required: 2600000000,
        funded: 780000000,
        percentFunded: 30,
        summary: 'Multiple conflict zones and climate shocks. 20M+ people in need across all regions.',
        type: 'conflict',
    },
    {
        code: 'COD',
        name: 'DR Congo',
        lat: -4.04,
        lng: 21.76,
        crisis: 'Armed Conflict & Displacement',
        year: 2025,
        required: 2400000000,
        funded: 720000000,
        percentFunded: 30,
        summary: 'Escalating M23 conflict in Eastern Congo. 7M internally displaced — Africa\'s largest crisis.',
        type: 'conflict',
    },
    {
        code: 'MMR',
        name: 'Myanmar',
        lat: 21.91,
        lng: 95.96,
        crisis: 'Military Coup & Civil War',
        year: 2025,
        required: 994000000,
        funded: 248500000,
        percentFunded: 25,
        summary: 'Post-coup humanitarian crisis. 18.6M people in need. International access severely restricted.',
        type: 'conflict',
    },
    {
        code: 'MOZ',
        name: 'Mozambique',
        lat: -18.67,
        lng: 35.53,
        crisis: 'Cyclones & Insurgency',
        year: 2024,
        required: 540000000,
        funded: 162000000,
        percentFunded: 30,
        summary: 'Recurring cyclones in the south, Islamist insurgency in Cabo Delgado. Double crisis.',
        type: 'disaster',
    },
    {
        code: 'BFA',
        name: 'Burkina Faso',
        lat: 12.24,
        lng: -1.56,
        crisis: 'Jihadist Insurgency',
        year: 2025,
        required: 935000000,
        funded: 187000000,
        percentFunded: 20,
        summary: 'Fastest-growing displacement crisis in the Sahel. 2M displaced. Severely underfunded.',
        type: 'conflict',
    },
    {
        code: 'BRA',
        name: 'Brazil',
        lat: -14.24,
        lng: -51.93,
        crisis: 'Floods & Landslides',
        year: 2018,
        required: 0,
        funded: 0,
        percentFunded: 0,
        summary: 'Heavy rains causing floods and collapse in Rio de Janeiro. $10M total damages.',
        type: 'disaster',
    },
];

// Visualization page — funding by cluster (from fts_cluster CSV)
export const CLUSTER_FUNDING = [
    { cluster: 'Food Security', required: 8200000000, funded: 3690000000, percentFunded: 45 },
    { cluster: 'Health', required: 4100000000, funded: 1845000000, percentFunded: 45 },
    { cluster: 'WASH', required: 3200000000, funded: 1120000000, percentFunded: 35 },
    { cluster: 'Shelter/NFI', required: 2800000000, funded: 980000000, percentFunded: 35 },
    { cluster: 'Education', required: 1900000000, funded: 570000000, percentFunded: 30 },
    { cluster: 'Protection', required: 1700000000, funded: 595000000, percentFunded: 35 },
    { cluster: 'Nutrition', required: 1500000000, funded: 675000000, percentFunded: 45 },
    { cluster: 'Coordination', required: 800000000, funded: 400000000, percentFunded: 50 },
    { cluster: 'Logistics', required: 600000000, funded: 330000000, percentFunded: 55 },
    { cluster: 'Camp Management', required: 450000000, funded: 135000000, percentFunded: 30 },
];

// Visualization page — top donors (mock but realistic)
export const TOP_DONORS = [
    { donor: 'United States', amount: 9800000000, percentage: 28 },
    { donor: 'Germany', amount: 3200000000, percentage: 9 },
    { donor: 'European Commission', amount: 2800000000, percentage: 8 },
    { donor: 'United Kingdom', amount: 2100000000, percentage: 6 },
    { donor: 'Japan', amount: 1500000000, percentage: 4 },
    { donor: 'Canada', amount: 1200000000, percentage: 3 },
    { donor: 'Sweden', amount: 1100000000, percentage: 3 },
    { donor: 'Norway', amount: 900000000, percentage: 3 },
    { donor: 'Netherlands', amount: 850000000, percentage: 2 },
    { donor: 'Private/NGOs', amount: 4500000000, percentage: 13 },
];

// Visualization page — funding trends over years
export const FUNDING_TRENDS = [
    { year: 2015, required: 19500000000, funded: 10900000000, gap: 8600000000, percentFunded: 56 },
    { year: 2016, required: 22200000000, funded: 12600000000, gap: 9600000000, percentFunded: 57 },
    { year: 2017, required: 23500000000, funded: 14100000000, gap: 9400000000, percentFunded: 60 },
    { year: 2018, required: 25200000000, funded: 15100000000, gap: 10100000000, percentFunded: 60 },
    { year: 2019, required: 26400000000, funded: 16700000000, gap: 9700000000, percentFunded: 63 },
    { year: 2020, required: 35100000000, funded: 19800000000, gap: 15300000000, percentFunded: 56 },
    { year: 2021, required: 36000000000, funded: 19400000000, gap: 16600000000, percentFunded: 54 },
    { year: 2022, required: 41200000000, funded: 24500000000, gap: 16700000000, percentFunded: 59 },
    { year: 2023, required: 55200000000, funded: 23500000000, gap: 31700000000, percentFunded: 43 },
    { year: 2024, required: 48700000000, funded: 20100000000, gap: 28600000000, percentFunded: 41 },
    { year: 2025, required: 49300000000, funded: 16800000000, gap: 32500000000, percentFunded: 34 },
];

// CBPF data from the CBPFvsHRP CSV
export const CBPF_DATA = [
    { country: 'Sudan', cbpfFunding: 169307354, hrpFunding: 1889606500, hrpRequired: 2695680744, cbpfPercent: 8.95 },
    { country: 'Ukraine', cbpfFunding: 137009724, hrpFunding: 2453891830, hrpRequired: 3107702931, cbpfPercent: 5.58 },
    { country: 'Palestine (oPt)', cbpfFunding: 101820634, hrpFunding: 2555687848, hrpRequired: 3422855934, cbpfPercent: 3.98 },
    { country: 'Afghanistan', cbpfFunding: 54336556, hrpFunding: 1625288473, hrpRequired: 3059587797, cbpfPercent: 3.34 },
    { country: 'Somalia', cbpfFunding: 49200000, hrpFunding: 630000000, hrpRequired: 1800000000, cbpfPercent: 7.81 },
    { country: 'DR Congo', cbpfFunding: 42000000, hrpFunding: 720000000, hrpRequired: 2400000000, cbpfPercent: 5.83 },
    { country: 'Ethiopia', cbpfFunding: 38000000, hrpFunding: 780000000, hrpRequired: 2600000000, cbpfPercent: 4.87 },
    { country: 'Yemen', cbpfFunding: 35000000, hrpFunding: 980000000, hrpRequired: 2800000000, cbpfPercent: 3.57 },
];

// Simulation — disaster scenarios
export const SIMULATION_COUNTRIES = [
    { code: 'BGD', name: 'Bangladesh', lat: 23.68, lng: 90.36, population: 170000000 },
    { code: 'PAK', name: 'Pakistan', lat: 30.38, lng: 69.35, population: 231000000 },
    { code: 'PHL', name: 'Philippines', lat: 12.88, lng: 121.77, population: 115000000 },
    { code: 'TUR', name: 'Turkey', lat: 38.96, lng: 35.24, population: 85000000 },
    { code: 'NPL', name: 'Nepal', lat: 28.39, lng: 84.12, population: 30000000 },
    { code: 'HTI', name: 'Haiti', lat: 18.97, lng: -72.29, population: 11400000 },
    { code: 'MOZ', name: 'Mozambique', lat: -18.67, lng: 35.53, population: 33000000 },
    { code: 'SDN', name: 'Sudan', lat: 12.86, lng: 30.22, population: 46000000 },
    { code: 'SYR', name: 'Syria', lat: 34.80, lng: 38.99, population: 22000000 },
    { code: 'AFG', name: 'Afghanistan', lat: 33.93, lng: 67.71, population: 41000000 },
    { code: 'ETH', name: 'Ethiopia', lat: 9.15, lng: 40.49, population: 126000000 },
    { code: 'YEM', name: 'Yemen', lat: 15.55, lng: 48.52, population: 34000000 },
];

export const CRISIS_TYPES = [
    { id: 'earthquake', name: 'Earthquake', icon: '🔴', description: 'Major seismic event' },
    { id: 'flood', name: 'Flooding', icon: '🌊', description: 'Severe flooding from storms or monsoons' },
    { id: 'epidemic', name: 'Epidemic', icon: '🦠', description: 'Disease outbreak (cholera, dengue, etc.)' },
    { id: 'conflict', name: 'Border Conflict', icon: '⚔️', description: 'Armed conflict on national borders' },
    { id: 'drought', name: 'Drought', icon: '☀️', description: 'Prolonged drought and crop failure' },
];

// Mock chat history for wiki
export const SAMPLE_CHAT = [
    {
        role: 'assistant',
        content: `Welcome to the **CrisisMap Knowledge Base**. I can answer questions about global humanitarian funding, response plans, and disaster data using our datasets.\n\nTry asking me about:\n- Funding gaps for specific countries\n- How CBPF funds are allocated\n- Disaster impact statistics\n- Cluster-level humanitarian spending`,
        citations: [],
    },
];

// Mock wiki responses with citations
export const MOCK_WIKI_RESPONSES = {
    'afghanistan': {
        content: `## Afghanistan Humanitarian Crisis\n\nAccording to the FTS data, Afghanistan's 2026 Humanitarian Needs and Response Plan requires **$1.71 billion** but has only received **$158.97 million** — just **9% funded** [1].\n\n### Cluster Breakdown\nThe largest funding gaps are in:\n- **Education**: $60M required, $7.8M received (13%) [2]\n- **Health**: $220M required, $33M received (15%) [2]\n- **WASH**: $95M required, $9.5M received (10%) [2]\n\nCBPF allocated **$54.3M** to Afghanistan, representing 3.34% of total HRP funding [3]. Key projects include border response for undocumented returnees and emergency shelter assistance [4].`,
        citations: [
            { id: 1, source: 'fts_global', text: 'AFG, Afghanistan HNRP 2026, requirements: $1,714,181,496, funded: $158,972,662, 9%' },
            { id: 2, source: 'fts_cluster', text: 'AFG cluster data — Education: 13%, Health: 15%, WASH: 10% funded' },
            { id: 3, source: 'cbpf', text: 'Afghanistan CBPF: $54,336,556 — 3.34% of HRP funding' },
            { id: 4, source: 'projects', text: 'CBPF-AFG-25-R-UN-35631: Responding to Needs of Afghan Returnees — IOM — $3,200,000' },
        ],
        chart: {
            type: 'bar',
            title: 'Afghanistan Funding by Cluster (2026)',
            data: [
                { name: 'Education', required: 60, funded: 7.8 },
                { name: 'Health', required: 220, funded: 33 },
                { name: 'WASH', required: 95, funded: 9.5 },
                { name: 'Shelter', required: 140, funded: 21 },
                { name: 'Food Security', required: 450, funded: 45 },
                { name: 'Protection', required: 85, funded: 10.2 },
            ],
        },
    },
    'sudan': {
        content: `## Sudan Humanitarian Crisis\n\nSudan is experiencing one of the world's most severe humanitarian emergencies. The civil war that erupted in April 2023 has created massive displacement.\n\n### Funding Overview\n- **HRP Requirements**: $2.70 billion [1]\n- **HRP Funding**: $1.89 billion (70%) [1]\n- **CBPF Contribution**: $169.3 million (8.95% of HRP funding) [3]\n\nSudan receives the **highest CBPF allocation** globally, reflecting the severity of the crisis [3]. Despite relatively better funding percentages, the absolute gap of **$806M** leaves millions without adequate assistance.`,
        citations: [
            { id: 1, source: 'fts_global', text: 'SDN, Sudan HRP 2025 — required: $2,695,680,744, funded: $1,889,606,500' },
            { id: 3, source: 'cbpf', text: 'Sudan CBPF: $169,307,354 — highest globally — 8.95% of HRP' },
        ],
        chart: {
            type: 'bar',
            title: 'Top CBPF Recipients',
            data: [
                { name: 'Sudan', amount: 169.3 },
                { name: 'Ukraine', amount: 137.0 },
                { name: 'Palestine', amount: 101.8 },
                { name: 'Afghanistan', amount: 54.3 },
                { name: 'Somalia', amount: 49.2 },
            ],
        },
    },
    'default': {
        content: `Based on the available data, here's what I found:\n\n### Global Humanitarian Funding (2025)\n- **Total Requirements**: $49.3 billion [1]\n- **Total Funded**: $16.8 billion [1]\n- **Funding Gap**: $32.5 billion (only 34% funded)\n\nThe most underfunded sectors are **Education** (30%), **Camp Management** (30%), and **Shelter** (35%) [2]. The funding gap has been growing — from $8.6B in 2015 to $32.5B in 2025.\n\n> ⚠️ This is the worst funding coverage ratio in the last decade.\n\nWould you like me to explore a specific country or sector in more detail?`,
        citations: [
            { id: 1, source: 'fts_global', text: 'Global aggregate — 2025: $49.3B required, $16.8B funded, 34%' },
            { id: 2, source: 'fts_cluster', text: 'Global cluster funding — Education: 30%, Camp Mgmt: 30%, Shelter: 35%' },
        ],
        chart: {
            type: 'line',
            title: 'Global Funding Gap (2015–2025)',
            data: [
                { year: '2015', gap: 8.6 },
                { year: '2017', gap: 9.4 },
                { year: '2019', gap: 9.7 },
                { year: '2020', gap: 15.3 },
                { year: '2022', gap: 16.7 },
                { year: '2023', gap: 31.7 },
                { year: '2025', gap: 32.5 },
            ],
        },
    },
};

// Mock simulation results
export const MOCK_SIMULATION_RESULT = {
    summary: {
        affectedPopulation: 4200000,
        displacedPopulation: 890000,
        estimatedDeaths: 12400,
        economicDamage: 8500000000,
        foodInsecurityRisk: 'Critical',
        waterScarcityDays: 45,
        infrastructureDamage: 67,
        responseTimeHours: 72,
    },
    timeline: [
        { day: 0, food: 100, water: 100, medical: 100, shelter: 100 },
        { day: 7, food: 72, water: 55, medical: 80, shelter: 45 },
        { day: 14, food: 48, water: 32, medical: 65, shelter: 38 },
        { day: 30, food: 25, water: 18, medical: 45, shelter: 30 },
        { day: 60, food: 15, water: 12, medical: 30, shelter: 25 },
        { day: 90, food: 35, water: 40, medical: 55, shelter: 50 },
    ],
    affectedRegions: [
        { name: 'Southern Lowlands', severity: 'Critical', population: 1800000, displacement: 450000, lat: 0, lng: 0 },
        { name: 'Central Valley', severity: 'Severe', population: 1200000, displacement: 280000, lat: 0, lng: 0 },
        { name: 'Eastern Coast', severity: 'Moderate', population: 800000, displacement: 120000, lat: 0, lng: 0 },
        { name: 'Northern Highlands', severity: 'Low', population: 400000, displacement: 40000, lat: 0, lng: 0 },
    ],
    keyInsights: [
        'Water infrastructure will be critically damaged within 48 hours of impact',
        'Food supply chain disruption expected to last 90+ days without international intervention',
        'Primary agricultural region accounts for 34% of national food production',
        'Major transportation routes connecting to the capital will be severed',
        'Estimated 890,000 people will attempt to relocate to urban centers within 2 weeks',
        'Healthcare facilities in the impact zone can handle only 15% of projected casualties',
    ],
};
