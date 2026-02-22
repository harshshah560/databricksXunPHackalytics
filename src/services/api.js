/* ═══════════════════════════════════════════════════════════════════
   API SERVICE — Humanitarian Crisis Data Platform
   Primary:  Databricks SQL Statement Execution API
             Tables live at: workspace.frontend_tables.*
   Fallback: Local CSV-derived JSON (fallback_data.json)
             placed in same directory as this file
   ═══════════════════════════════════════════════════════════════════ */

// ── Databricks Config ─────────────────────────────────────────────
const DATABRICKS_HOST         = import.meta.env.VITE_DATABRICKS_HOST;
const DATABRICKS_TOKEN        = import.meta.env.VITE_DATABRICKS_TOKEN;
const DATABRICKS_WAREHOUSE_ID = import.meta.env.VITE_DATABRICKS_WAREHOUSE_ID;

// Tables are in workspace.frontend_tables — NOT main.default
const DB_TABLE = (name) => `workspace.frontend_tables.${name}`;

const USE_DATABRICKS = !!(DATABRICKS_HOST && DATABRICKS_TOKEN && DATABRICKS_WAREHOUSE_ID);

// ── Cluster category normalisation ───────────────────────────────
// 400+ messy multilingual cluster names → 6 canonical buckets
const CATEGORY_KEYWORDS = {
  'Food Security': [
    'FOOD', 'NUTRITION', 'AGRICULTURE', 'LIVELIHOODS', 'LIVELIHOOD',
    'ALIMENTAIRE', 'ALIMENTARIA', 'SECURITE ALIMENTAIRE',
    'SÉCURITÉ ALIMENTAIRE', 'SEGURIDAD ALIMENTARIA',
  ],
  Health: ['HEALTH', 'SANTE', 'SANTÉ', 'SALUD'],
  WASH: [
    'WASH', 'WATER', 'SANITATION', 'HYGIENE',
    'EAU', 'AGUA', 'ASSAINISSEMENT', 'EHA',
  ],
  Shelter: [
    'SHELTER', 'ABRIS', 'ALOJAMIENTO', 'HOUSING',
    'NFI', 'NON-FOOD', 'CCCM', 'CAMP COORD',
  ],
  Protection: [
    'PROTECTION', 'CHILD PROTECT', 'GBV', 'GENDER',
    'MINE ACTION', 'VBG',
  ],
  Education: ['EDUCATION', 'ÉDUCATION', 'EDUCACION', 'EDUCACIÓN'],
};

export const ISSUE_CATEGORIES = Object.keys(CATEGORY_KEYWORDS);

export function categorizeCluster(clusterName) {
  const upper = (clusterName || '').toUpperCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => upper.includes(k))) return cat;
  }
  return null;
}

// ── Databricks helpers ────────────────────────────────────────────
async function executeSQL(sql) {
  const url = `${DATABRICKS_HOST.replace(/\/$/, '')}/api/2.0/sql/statements/`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DATABRICKS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      warehouse_id: DATABRICKS_WAREHOUSE_ID,
      statement: sql,
      wait_timeout: '30s',
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
    }),
  });

  if (!res.ok) throw new Error(`Databricks HTTP ${res.status}`);

  const data = await res.json();

  if (data.status?.state === 'PENDING' || data.status?.state === 'RUNNING') {
    return pollStatement(data.statement_id);
  }
  if (data.status?.state === 'FAILED') {
    throw new Error(data.status.error?.message || 'Query failed');
  }
  return parseStatement(data);
}

async function pollStatement(id, retries = 25) {
  for (let i = 0; i < retries; i++) {
    await delay(1500);
    const res = await fetch(
      `${DATABRICKS_HOST.replace(/\/$/, '')}/api/2.0/sql/statements/${id}`,
      { headers: { Authorization: `Bearer ${DATABRICKS_TOKEN}` } },
    );
    const data = await res.json();
    if (data.status?.state === 'SUCCEEDED') return parseStatement(data);
    if (data.status?.state === 'FAILED')
      throw new Error(data.status.error?.message || 'Query failed');
  }
  throw new Error('Query timed out after 37.5 s');
}

function parseStatement(data) {
  const cols = (data.manifest?.schema?.columns || []).map((c) => c.name);
  return (data.result?.data_array || []).map((row) => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Fallback loader ───────────────────────────────────────────────
let _fallbackCache = null;

async function loadFallback() {
  if (_fallbackCache) return _fallbackCache;
  // Vite resolves this relative to /src — adjust path to match your project
  const mod = await import('./fallback_data.json');
  _fallbackCache = mod.default;
  return _fallbackCache;
}

// ── Data transformation helpers ───────────────────────────────────
function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const k = row[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(row);
    return acc;
  }, {});
}

const COUNTRY_NAMES = {
  AFG: 'Afghanistan', BFA: 'Burkina Faso', CAF: 'Central African Rep.',
  COD: 'DR Congo', COL: 'Colombia', ETH: 'Ethiopia', HTI: 'Haiti',
  IRQ: 'Iraq', LBN: 'Lebanon', MLI: 'Mali', MMR: 'Myanmar',
  MOZ: 'Mozambique', NER: 'Niger', NGA: 'Nigeria', PSE: 'Palestine',
  SDN: 'Sudan', SOM: 'Somalia', SSD: 'South Sudan', SYR: 'Syria',
  TCD: 'Chad', UKR: 'Ukraine', VEN: 'Venezuela', YEM: 'Yemen',
  CAR: 'Central African Rep.', DRC: 'DR Congo', JOR: 'Jordan', PAK: 'Pakistan',
};

// ── Primary data fetch: all countries enriched ────────────────────
/**
 * Returns an array of country objects, each containing:
 *   code, name, lat, lng,
 *   cbpf_timeline[]       — [{year, cbpf_funding, cbpf_target}]
 *   cluster_breakdown{}   — {[category]: {req, fund, pct}}
 *   cluster_history{}     — {[category]: [{year, req, fund}]}
 *   issue_pct_funded{}    — {[category]: pct}   ← used for map colouring
 *   affected{}            — {boys, girls, men, women, total}
 *   world{}               — all world_indicators fields
 *   pop_impact_pct        — (affected.total / world.population) * 100
 */
export async function fetchAllCountries() {
  if (USE_DATABRICKS) {
    try {
      return await fetchFromDatabricks();
    } catch (err) {
      console.warn('[API] Databricks failed, falling back to CSV data:', err.message);
    }
  }
  return loadFallback();
}

async function fetchFromDatabricks() {
  // Run all four queries in parallel
  const [cbpfRows, clusterRows, affectedRows, worldRows] = await Promise.all([
    executeSQL(`SELECT countrycode, year, cbpf_funding, cbpf_target
                FROM ${DB_TABLE('cbpfvshrp')}
                ORDER BY countrycode, year`),

    executeSQL(`SELECT countrycode, year, cluster, requirements, funding
                FROM ${DB_TABLE('fts_cluster')}
                ORDER BY countrycode, year`),

    executeSQL(`SELECT year, countrycode,
                       boys_targeted, girls_targeted,
                       men_targeted, women_targeted, total_targeted
                FROM ${DB_TABLE('affected_persons_clean')}
                ORDER BY countrycode, year DESC`),

    executeSQL(`SELECT countrycode, life_expectancy, infant_mortality,
                       maternal_mortality_ratio, physicians_per_thousand,
                       out_of_pocket_health_pct, birth_rate, fertility_rate,
                       gdp, population, urban_population, unemployment_rate,
                       latitude, longitude, vulnerability_score
                FROM ${DB_TABLE('world_indicators')}`),
  ]);

  return buildCountries({ cbpfRows, clusterRows, affectedRows, worldRows });
}

/**
 * Shared builder — works for both Databricks rows and fallback JSON rows
 */
function buildCountries({ cbpfRows, clusterRows, affectedRows, worldRows }) {
  // --- CBPF timeline ---
  const cbpfByCountry = groupBy(cbpfRows, 'countrycode');

  // --- World indicators ---
  const worldByCountry = {};
  worldRows.forEach((r) => {
    worldByCountry[r.countrycode] = {
      life_expectancy:         +r.life_expectancy || 0,
      infant_mortality:        +r.infant_mortality || 0,
      maternal_mortality_ratio:+r.maternal_mortality_ratio || 0,
      physicians_per_thousand: +r.physicians_per_thousand || 0,
      out_of_pocket_health_pct:+r.out_of_pocket_health_pct || 0,
      birth_rate:              +r.birth_rate || 0,
      fertility_rate:          +r.fertility_rate || 0,
      gdp:                     +r.gdp || 0,
      population:              +r.population || 0,
      urban_population:        +r.urban_population || 0,
      unemployment_rate:       +r.unemployment_rate || 0,
      latitude:                +r.latitude || 0,
      longitude:               +r.longitude || 0,
      vulnerability_score:     +r.vulnerability_score || 0,
    };
  });

  // --- Affected persons (latest year per country) ---
  const affectedByCountry = {};
  affectedRows.forEach((r) => {
    const yr = +r.year;
    if (!affectedByCountry[r.countrycode] || yr > affectedByCountry[r.countrycode]._year) {
      affectedByCountry[r.countrycode] = {
        _year:  yr,
        boys:   +r.boys_targeted   || 0,
        girls:  +r.girls_targeted  || 0,
        men:    +r.men_targeted    || 0,
        women:  +r.women_targeted  || 0,
        total:  +r.total_targeted  || 0,
      };
    }
  });

  // --- Cluster data: aggregate by (country, year, category) ---
  const clusterAgg = {};           // key → {req, fund}
  const clusterHistory = {};       // country → category → [{year,req,fund}]

  clusterRows.forEach((r) => {
    const cat = categorizeCluster(r.cluster);
    if (!cat) return;
    const cc = r.countrycode;
    const yr = +r.year;
    const req  = +r.requirements || 0;
    const fund = +r.funding || 0;
    const key = `${cc}|${yr}|${cat}`;
    if (!clusterAgg[key]) clusterAgg[key] = { cc, yr, cat, req: 0, fund: 0 };
    clusterAgg[key].req  += req;
    clusterAgg[key].fund += fund;

    if (!clusterHistory[cc]) clusterHistory[cc] = {};
    if (!clusterHistory[cc][cat]) clusterHistory[cc][cat] = {};
    if (!clusterHistory[cc][cat][yr]) clusterHistory[cc][cat][yr] = { req: 0, fund: 0 };
    clusterHistory[cc][cat][yr].req  += req;
    clusterHistory[cc][cat][yr].fund += fund;
  });

  // For each country pick latest available year for cluster_breakdown
  const breakdownByCountry = {};
  const PREFERRED_YEARS = [2025, 2024, 2026, 2023];
  const allCCs = new Set([
    ...Object.keys(cbpfByCountry),
    ...Object.keys(worldByCountry),
  ]);

  allCCs.forEach((cc) => {
    for (const yr of PREFERRED_YEARS) {
      const cats = {};
      ISSUE_CATEGORIES.forEach((cat) => {
        const agg = clusterAgg[`${cc}|${yr}|${cat}`];
        if (agg && agg.req > 0) cats[cat] = agg;
      });
      if (Object.keys(cats).length > 0) {
        breakdownByCountry[cc] = cats;
        break;
      }
    }
  });

  // Serialise cluster history
  const historyByCountry = {};
  Object.entries(clusterHistory).forEach(([cc, catMap]) => {
    historyByCountry[cc] = {};
    Object.entries(catMap).forEach(([cat, yrMap]) => {
      historyByCountry[cc][cat] = Object.entries(yrMap)
        .map(([yr, vals]) => ({ year: +yr, req: vals.req, fund: vals.fund }))
        .sort((a, b) => a.year - b.year);
    });
  });

  // --- Assemble final country objects ---
  return [...allCCs].map((cc) => {
    const wi       = worldByCountry[cc] || {};
    const af       = affectedByCountry[cc] || { boys:0, girls:0, men:0, women:0, total:0 };
    const bdRaw    = breakdownByCountry[cc] || {};
    const cbpfList = (cbpfByCountry[cc] || [])
      .map((r) => ({ year: +r.year, cbpf_funding: +r.cbpf_funding || 0, cbpf_target: +r.cbpf_target || 0 }))
      .sort((a, b) => a.year - b.year);

    const cluster_breakdown = {};
    const issue_pct_funded  = {};
    Object.entries(bdRaw).forEach(([cat, v]) => {
      const pct = v.req > 0 ? Math.round((v.fund / v.req) * 1000) / 10 : 0;
      cluster_breakdown[cat] = { req: v.req, fund: v.fund, pct };
      issue_pct_funded[cat]  = pct;
    });

    const pop            = wi.population || 0;
    const pop_impact_pct = pop > 0 ? Math.round((af.total / pop) * 1000) / 10 : 0;

    return {
      code: cc,
      name: COUNTRY_NAMES[cc] || cc,
      lat:  wi.latitude  || 0,
      lng:  wi.longitude || 0,
      cbpf_timeline:     cbpfList,
      cluster_breakdown,
      cluster_history:   historyByCountry[cc] || {},
      issue_pct_funded,
      affected: { boys: af.boys, girls: af.girls, men: af.men, women: af.women, total: af.total },
      world: wi,
      pop_impact_pct,
    };
  }).filter((c) => c.lat !== 0 || c.lng !== 0); // drop countries with no coords
}

// ── Convenience selectors (memoised after first call) ─────────────
let _countriesCache = null;

export async function getCountries() {
  if (!_countriesCache) _countriesCache = await fetchAllCountries();
  return _countriesCache;
}

/** Returns a flat list of {cc, name, lat, lng, pct} for a given issue,
 *  used to drive map circle colours. */
export async function getMapDataForIssue(issue) {
  const countries = await getCountries();
  return countries
    .filter((c) => c.issue_pct_funded[issue] !== undefined)
    .map((c) => ({
      code: c.code,
      name: c.name,
      lat:  c.lat,
      lng:  c.lng,
      pct:  c.issue_pct_funded[issue] ?? null,
    }));
}

// Legacy exports kept for backward-compat with existing components
export async function fetchCrisisCountries() { return getCountries(); }
export async function fetchClusterFunding()  { return []; }
export async function fetchTopDonors()       { return []; }
export async function fetchFundingTrends()   { return []; }
export async function fetchCBPFData()        { return []; }
export async function fetchDataSources() {return []};
export async function sendChatMessage() {return []};