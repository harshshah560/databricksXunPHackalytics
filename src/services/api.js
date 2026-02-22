/* ═══════════════════════════════════════════════════════════════════
   API SERVICE — Humanitarian Crisis Data Platform
   Primary:  Django API (Databricks-backed)
   Fallback: Local CSV-derived JSON (fallback_data.json) + mockData
   ═══════════════════════════════════════════════════════════════════ */

import {
  CLUSTER_FUNDING,
  TOP_DONORS,
  FUNDING_TRENDS,
  CBPF_DATA,
  DATA_SOURCES,
  MOCK_WIKI_RESPONSES,
} from './mockData';

export const ISSUE_CATEGORIES = [
  'Food Security',
  'Health',
  'WASH',
  'Shelter',
  'Protection',
  'Education',
];

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  return res.json();
}

// ── Fallback loader ───────────────────────────────────────────────
let _fallbackCache = null;

async function loadFallback() {
  if (_fallbackCache) return _fallbackCache;
  const mod = await import('./fallback_data.json');
  _fallbackCache = mod.default;
  return _fallbackCache;
}

// ── Primary data fetch: all countries enriched ────────────────────
export async function fetchAllCountries() {
  try {
    return await fetchJson('/countries/');
  } catch (err) {
    console.warn('[API] Backend failed, falling back to CSV data:', err.message);
    return loadFallback();
  }
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

export async function fetchClusterFunding() {
  try {
    return await fetchJson('/visualizations/cluster-funding/');
  } catch (err) {
    console.warn('[API] cluster-funding fallback:', err.message);
    return CLUSTER_FUNDING;
  }
}

export async function fetchTopDonors() {
  try {
    return await fetchJson('/visualizations/top-donors/');
  } catch (err) {
    console.warn('[API] top-donors fallback:', err.message);
    return TOP_DONORS;
  }
}

export async function fetchFundingTrends() {
  try {
    return await fetchJson('/visualizations/funding-trends/');
  } catch (err) {
    console.warn('[API] funding-trends fallback:', err.message);
    return FUNDING_TRENDS;
  }
}

export async function fetchCBPFData() {
  try {
    return await fetchJson('/visualizations/cbpf/');
  } catch (err) {
    console.warn('[API] cbpf fallback:', err.message);
    return CBPF_DATA;
  }
}

export async function fetchDataSources() {
  try {
    return await fetchJson('/sources/');
  } catch (err) {
    console.warn('[API] sources fallback:', err.message);
    return DATA_SOURCES;
  }
}

export async function sendChatMessage(message) {
  const key = (message || '').trim().toLowerCase();
  return MOCK_WIKI_RESPONSES[key] || MOCK_WIKI_RESPONSES.default;
}