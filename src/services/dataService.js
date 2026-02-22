/**
 * dataService.js
 * Loads all humanitarian data from raw CSV files (Vite ?raw imports).
 * Exports getCountries() — returns a cached array of enriched country objects.
 * No JSON fallback file required.
 */

import cbpfRaw     from './cbpfvshrp.csv?raw';
import ftsRaw      from './fts_cluster.csv?raw';
import affRaw      from './affected_persons_clean.csv?raw';
import worldRaw    from './world_indicators.csv?raw';
import sectorsRaw  from './sectors_overview_clean.csv?raw';

// ── Tiny CSV parser (handles quoted fields) ───────────────────────
function parseCSV(raw) {
  const lines  = raw.trim().split('\n');
  const header = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const obj  = {};
    header.forEach((h, i) => { obj[h.replace(/"/g, '').trim()] = (vals[i] || '').replace(/"/g, '').trim(); });
    return obj;
  });
}

function splitLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

const n = v => parseFloat(v) || 0;

// ── Canonical 7 sectors ───────────────────────────────────────────
export const ISSUE_CATEGORIES = [
  'Education',
  'Emergency Shelter & NFI',
  'Food Security & Agriculture',
  'Health',
  'Nutrition',
  'Protection',
  'Water, Sanitation, Hygiene',
];

// Keyword matching for fts_cluster (multilingual)
const FTS_KEYWORDS = {
  'Education':                  ['EDUCATION','EDUCACION','EDUCACIÓN','ÉDUCATION'],
  'Emergency Shelter & NFI':    ['SHELTER','ABRIS','NFI','NON-FOOD','ALOJAMIENTO','CCCM','CAMP COORD'],
  'Food Security & Agriculture':['FOOD','AGRICULTURE','LIVELIHOODS','LIVELIHOOD','ALIMENTAIRE',
                                  'ALIMENTARIA','SECURITE ALIMENTAIRE','SÉCURITÉ ALIMENTAIRE','SEGURIDAD ALIMENTARIA'],
  'Health':                     ['HEALTH','SANTE','SANTÉ','SALUD'],
  'Nutrition':                  ['NUTRITION','NUTRICION','NUTRICIÓN'],
  'Protection':                 ['PROTECTION','PROTECCION','PROTECCIÓN','VBG','GBV','CHILD PROTECT','MINE ACTION'],
  'Water, Sanitation, Hygiene': ['WASH','WATER','SANITATION','HYGIENE','EAU','AGUA','ASSAINISSEMENT','EHA'],
};
// Priority order — Nutrition before Health, WASH before others
const FTS_ORDER = ['Nutrition','Education','Emergency Shelter & NFI',
                   'Food Security & Agriculture','Health','Protection','Water, Sanitation, Hygiene'];

function catFTS(cluster) {
  const c = cluster.toUpperCase().trim();
  for (const cat of FTS_ORDER) {
    if (FTS_KEYWORDS[cat].some(k => c.includes(k))) return cat;
  }
  return null;
}

// sectors_overview cluster matching
const SO_KEYWORDS = {
  'Education':                  ['EDUCATION'],
  'Emergency Shelter & NFI':    ['EMERGENCY SHELTER AND NFI','SHELTER AND NON-FOOD','SHELTER'],
  'Food Security & Agriculture':['FOOD SECURITY AND AGRICULTURE','FOOD SECURITY','AGRICULTURE'],
  'Health':                     ['HEALTH AND NUTRITION','HEALTH'],
  'Nutrition':                  ['NUTRITION'],
  'Protection':                 ['CHILD PROTECTION','GENDER-BASED VIOLENCE','MINE ACTION','PROTECTION'],
  'Water, Sanitation, Hygiene': ['WATER, SANITATION AND HYGIENE','WATER SANITATION AND HYGIENE','WASH'],
};
const SO_ORDER = ['Emergency Shelter & NFI','Food Security & Agriculture',
                  'Health','Nutrition','Protection','Water, Sanitation, Hygiene','Education'];

function catSO(cluster) {
  const c = cluster.toUpperCase().trim();
  for (const cat of SO_ORDER) {
    if (SO_KEYWORDS[cat].some(k => c.includes(k))) return cat;
  }
  return null;
}

// ── Country master list ───────────────────────────────────────────
const CBPF_COUNTRIES = new Set([
  'AFG','BFA','CAF','COD','COL','ETH','HTI','IRQ','LBN','MLI',
  'MMR','MOZ','NER','NGA','PSE','SDN','SOM','SSD','SYR','TCD',
  'UKR','VEN','YEM',
]);

const COUNTRY_NAMES = {
  AFG:'Afghanistan', BFA:'Burkina Faso', CAF:'Cent. African Rep.',
  COD:'DR Congo',    COL:'Colombia',     ETH:'Ethiopia',
  HTI:'Haiti',       IRQ:'Iraq',         LBN:'Lebanon',
  MLI:'Mali',        MMR:'Myanmar',      MOZ:'Mozambique',
  NER:'Niger',       NGA:'Nigeria',      PSE:'Palestine',
  SDN:'Sudan',       SOM:'Somalia',      SSD:'South Sudan',
  SYR:'Syria',       TCD:'Chad',         UKR:'Ukraine',
  VEN:'Venezuela',   YEM:'Yemen',
};

// ── Build & cache ─────────────────────────────────────────────────
let _cache = null;

export function getCountries() {
  if (_cache) return _cache;

  // --- FTS cluster ---
  const ftsAgg = {}; // cc -> cat -> yr -> {req, fund}
  for (const row of parseCSV(ftsRaw)) {
    const cc  = row.countrycode;
    if (!CBPF_COUNTRIES.has(cc)) continue;
    const yr  = parseInt(row.year);
    const cat = catFTS(row.cluster);
    if (!cat) continue;
    const req  = n(row.requirements);
    const fund = n(row.funding);
    if (!ftsAgg[cc])          ftsAgg[cc]          = {};
    if (!ftsAgg[cc][cat])     ftsAgg[cc][cat]     = {};
    if (!ftsAgg[cc][cat][yr]) ftsAgg[cc][cat][yr] = { req: 0, fund: 0 };
    ftsAgg[cc][cat][yr].req  += req;
    ftsAgg[cc][cat][yr].fund += fund;
  }

  // --- Sectors overview (people per sector, latest year) ---
  const soPeople = {}; // cc -> cat -> {targeted, reached, alloc, year}
  for (const row of parseCSV(sectorsRaw)) {
    const cc  = row.countrycode;
    const yr  = parseInt(row.Year);
    const cat = catSO(row.Cluster);
    if (!cat) continue;
    const t = n(row.Targeted_People);
    const r = n(row.Reached_People);
    if (!soPeople[cc]) soPeople[cc] = {};
    if (!soPeople[cc][cat] || yr > soPeople[cc][cat].year) {
      soPeople[cc][cat] = { targeted: t, reached: r, alloc: n(row.Total_Allocations), year: yr };
    }
  }

  // --- World indicators ---
  const world = {};
  for (const row of parseCSV(worldRaw)) {
    const cc = row.countrycode;
    world[cc] = {};
    for (const [k, v] of Object.entries(row)) {
      if (k !== 'countrycode') world[cc][k] = n(v);
    }
  }

  // --- Affected persons (latest per country, with reached) ---
  // Note: affected_persons_clean.csv uses different codes for some countries:
  //   CAR → CAF (Central African Republic)
  //   DRC → COD (DR Congo)
  const AFFECTED_CODE_FIX = { CAR: 'CAF', DRC: 'COD' };
  const affected = {};
  for (const row of parseCSV(affRaw)) {
    const cc = AFFECTED_CODE_FIX[row.countrycode] ?? row.countrycode;
    const yr = parseInt(row.year);
    if (!affected[cc] || yr > affected[cc].year) {
      affected[cc] = {
        year:           yr,
        boys:           n(row.boys_targeted),
        girls:          n(row.girls_targeted),
        men:            n(row.men_targeted),
        women:          n(row.women_targeted),
        total:          n(row.total_targeted),
        boys_reached:   n(row.boys_reached),
        girls_reached:  n(row.girls_reached),
        men_reached:    n(row.men_reached),
        women_reached:  n(row.women_reached),
        total_reached:  n(row.total_reached),
      };
    }
  }

  // --- CBPF timeline ---
  const cbpfByCC = {};
  for (const row of parseCSV(cbpfRaw)) {
    const cc = row.countrycode;
    if (!cbpfByCC[cc]) cbpfByCC[cc] = [];
    cbpfByCC[cc].push({
      year:         parseInt(row.year),
      cbpf_funding: n(row.cbpf_funding),
      cbpf_target:  n(row.cbpf_target),
    });
  }
  for (const cc of Object.keys(cbpfByCC)) {
    cbpfByCC[cc].sort((a, b) => a.year - b.year);
  }

  // --- Global median cost-per-person per sector (for benchmarking) ---
  // cpp = Total_Allocations / Targeted_People from sectors_overview
  const cppByCat = {}; // cat -> array of values across all countries
  for (const cc of CBPF_COUNTRIES) {
    for (const cat of ISSUE_CATEGORIES) {
      const so = soPeople[cc]?.[cat];
      if (!so || so.targeted <= 0 || so.alloc <= 0) continue;
      if (!cppByCat[cat]) cppByCat[cat] = [];
      cppByCat[cat].push(so.alloc / so.targeted);
    }
  }
  // Median helper
  const med = arr => {
    if (!arr?.length) return null;
    const s = [...arr].sort((a,b)=>a-b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m-1]+s[m])/2;
  };
  const globalMedians = {}; // cat -> median $/person
  for (const cat of ISSUE_CATEGORIES) {
    const m = med(cppByCat[cat]);
    if (m != null) globalMedians[cat] = Math.round(m * 100) / 100;
  }

  // Max targeted per sector for scale normalization
  const maxTargeted = {};
  for (const cat of ISSUE_CATEGORIES) {
    const vals = [...CBPF_COUNTRIES]
      .map(cc => soPeople[cc]?.[cat]?.targeted || 0)
      .filter(v => v > 0);
    maxTargeted[cat] = vals.length ? Math.max(...vals) : 1;
  }

  // --- Assemble countries ---
  _cache = [...CBPF_COUNTRIES]
    .map(cc => {
      const wi = world[cc]  || {};
      const af = affected[cc] || {};
      if (!wi.latitude && !wi.longitude) return null;

      const issue_pct_funded  = {};
      const cluster_breakdown = {};
      const cluster_history   = {};
      const cost_per_person   = {}; // cat -> $/person (from sectors_overview alloc)
      const cost_ratio        = {}; // cat -> ratio vs global median (>1 expensive, <1 cheap)
      const priority_index    = {}; // cat -> 0-100 composite score

      for (const cat of ISSUE_CATEGORIES) {
        const cd = ftsAgg[cc]?.[cat];
        if (!cd) continue;

        // Latest year with data
        const years = Object.keys(cd).map(Number).sort((a,b)=>b-a);
        let req = 0, fund = 0;
        for (const yr of years) {
          if (cd[yr].req > 0) { req = cd[yr].req; fund = cd[yr].fund; break; }
        }
        if (!req) continue;

        const pct = Math.min(fund / req * 100, 100);
        const so  = soPeople[cc]?.[cat] || {};
        const targeted = so.targeted || 0;
        const reached  = so.reached  || 0;
        const alloc    = so.alloc    || 0;

        // Cost per person
        const cpp = (targeted > 0 && alloc > 0)
          ? Math.round(alloc / targeted * 100) / 100 : null;
        const glMed = globalMedians[cat] || null;
        const ratio = (cpp && glMed) ? Math.round(cpp / glMed * 100) / 100 : null;

        cluster_breakdown[cat] = {
          req, fund,
          pct:              Math.round(pct * 10) / 10,
          gap:              Math.max(req - fund, 0),
          targeted_people:  targeted,
          reached_people:   reached,
          cost_per_person:  cpp,
          cost_ratio:       ratio,
          global_median_cpp:glMed,
        };
        issue_pct_funded[cat]  = Math.round(pct * 10) / 10;
        if (cpp  != null) cost_per_person[cat] = cpp;
        if (ratio != null) cost_ratio[cat]     = ratio;

        // Full history
        const hist = Object.keys(cd)
          .map(Number).sort((a,b)=>a-b)
          .filter(yr => cd[yr].req > 0)
          .map(yr => ({
            year: yr, req: cd[yr].req, fund: cd[yr].fund,
            pct: Math.round(Math.min(cd[yr].fund / cd[yr].req * 100, 100) * 10) / 10,
          }));
        if (hist.length) cluster_history[cat] = hist;

        // Priority Index (0-100): gap weight + scale + vulnerability + chronic + cost efficiency
        const gapF    = Math.max(req - fund, 0) / req;
        const pop     = wi.population || 0;
        const popImp  = pop > 0 && targeted > 0 ? Math.min(targeted / pop, 1.0) : 0;
        const vuln    = (wi.vulnerability_score || 45) / 100;
        const pctHist = Object.keys(cd)
          .filter(yr => cd[yr].req > 0)
          .map(yr => Math.min(cd[yr].fund / cd[yr].req, 1.0));
        const chronic = pctHist.length
          ? pctHist.filter(p => p < 0.30).length / pctHist.length : 0.5;
        const effScore = (cpp && glMed && cpp > 0)
          ? Math.min(glMed / cpp, 3.0) / 3.0 : 0.5; // cheaper = higher priority
        const scale   = targeted > 0 ? targeted / (maxTargeted[cat] || 1) : 0;

        priority_index[cat] = Math.round(
          (gapF * 0.30 + popImp * 0.20 + vuln * 0.15 +
           chronic * 0.15 + effScore * 0.10 + scale * 0.10) * 1000
        ) / 10;
      }

      const pop = wi.population || 0;
      const tot = af.total || 0;

      return {
        code:              cc,
        name:              COUNTRY_NAMES[cc] || cc,
        lat:               wi.latitude  || 0,
        lng:               wi.longitude || 0,
        cbpf_timeline:     cbpfByCC[cc]  || [],
        cluster_breakdown,
        cluster_history,
        issue_pct_funded,
        cost_per_person,
        cost_ratio,
        priority_index,
        global_medians:    globalMedians,
        affected: {
          boys:          af.boys          || 0,
          girls:         af.girls         || 0,
          men:           af.men           || 0,
          women:         af.women         || 0,
          total:         af.total         || 0,
          boys_reached:  af.boys_reached  || 0,
          girls_reached: af.girls_reached || 0,
          men_reached:   af.men_reached   || 0,
          women_reached: af.women_reached || 0,
          total_reached: af.total_reached || 0,
        },
        world:           wi,
        // % of people in need who are actually receiving aid (reached / targeted)
        pop_impact_pct:  tot > 0 ? Math.round((af.total_reached || 0) / tot * 1000) / 10 : 0,
      };
    })
    .filter(Boolean);

  return _cache;
}