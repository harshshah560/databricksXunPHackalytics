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
    CRISIS_COUNTRIES,
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

/** Returns a flat list of {cc, name, lat, lng, pct} for a given issue */
export async function getMapDataForIssue(issue) {
    const countries = await getCountries();
    return countries
        .filter((c) => c.issue_pct_funded[issue] !== undefined)
        .map((c) => ({
            code: c.code,
            name: c.name,
            lat: c.lat,
            lng: c.lng,
            pct: c.issue_pct_funded[issue] ?? null,
        }));
}

export async function fetchCrisisCountries() { return getCountries(); }

export async function fetchClusterFunding() {
    try { return await fetchJson('/visualizations/cluster-funding/'); }
    catch { return CLUSTER_FUNDING; }
}

export async function fetchTopDonors() {
    try { return await fetchJson('/visualizations/top-donors/'); }
    catch { return TOP_DONORS; }
}

export async function fetchFundingTrends() {
    try { return await fetchJson('/visualizations/funding-trends/'); }
    catch { return FUNDING_TRENDS; }
}

export async function fetchCBPFData() {
    try { return await fetchJson('/visualizations/cbpf/'); }
    catch { return CBPF_DATA; }
}

export async function fetchDataSources() {
    try { return await fetchJson('/sources/'); }
    catch { return DATA_SOURCES; }
}

// ── Build Rich Data Context for AI ────────────────────────────────

function fmt(n) {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n}`;
}

async function buildDataContext() {
    // Load the real fallback data (per-country Databricks data)
    let countries = [];
    try {
        countries = await loadFallback();
    } catch { /* empty */ }

    // ── Country-level data ────────────────────────────────────────
    const countryLines = (countries.length ? countries : CRISIS_COUNTRIES)
        .slice(0, 25)
        .map(c => {
            const parts = [`${c.name} (${c.code})`];
            if (c.cluster_breakdown) {
                const clusters = Object.entries(c.cluster_breakdown)
                    .map(([k, v]) => `${k}: req ${fmt(v.req)}, funded ${fmt(v.fund)} (${v.pct}%)`)
                    .join('; ');
                parts.push(`Clusters: ${clusters}`);
            }
            if (c.cbpf_timeline?.length) {
                const latest = c.cbpf_timeline[c.cbpf_timeline.length - 1];
                parts.push(`Latest CBPF (${latest.year}): funding ${fmt(latest.cbpf_funding)}, target ${fmt(latest.cbpf_target)}`);
            }
            if (c.required) parts.push(`HRP required: ${fmt(c.required)}, funded: ${fmt(c.funded)} (${c.percentFunded}%)`);
            if (c.crisis) parts.push(`Crisis: ${c.crisis}`);
            return parts.join(' | ');
        });

    // ── Global aggregates ─────────────────────────────────────────
    const trendLines = FUNDING_TRENDS
        .map(t => `${t.year}: req ${fmt(t.required)}, funded ${fmt(t.funded)}, gap ${fmt(t.gap)} (${t.percentFunded}%)`)
        .join('\n');

    const clusterLines = CLUSTER_FUNDING
        .map(c => `${c.cluster}: req ${fmt(c.required)}, funded ${fmt(c.funded)} (${c.percentFunded}%)`)
        .join('\n');

    const cbpfLines = CBPF_DATA
        .map(c => `${c.country}: CBPF ${fmt(c.cbpfFunding)}, HRP funded ${fmt(c.hrpFunding)}, HRP req ${fmt(c.hrpRequired)} (CBPF = ${c.cbpfPercent}% of HRP)`)
        .join('\n');

    const donorLines = TOP_DONORS
        .map(d => `${d.donor}: ${fmt(d.amount)} (${d.percentage}% of total)`)
        .join('\n');

    // ── Crisis country profiles (conflict, disasters, summaries) ──
    const crisisLines = CRISIS_COUNTRIES
        .map(c => `${c.name} (${c.code}): ${c.crisis} (${c.year}) — ${c.summary} | HRP req: ${fmt(c.required)}, funded: ${fmt(c.funded)} (${c.percentFunded}%)`)
        .join('\n');

    return `
=== COUNTRY-LEVEL DATA (from Databricks) ===
${countryLines.join('\n')}

=== CRISIS PROFILES (conflicts, disasters, summaries) ===
${crisisLines}

=== GLOBAL FUNDING TRENDS (FTS) ===
${trendLines}

=== CLUSTER FUNDING (FTS) ===
${clusterLines}

=== CBPF vs HRP ALLOCATIONS ===
${cbpfLines}

=== TOP DONORS ===
${donorLines}
`;
}

// ── OpenAI Streaming Chat ─────────────────────────────────────────
const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const BASE_SYSTEM_PROMPT = `You are NexAtlas AI — an expert humanitarian data analyst for the NexAtlas platform, powered by real data from Databricks, UN OCHA FTS, CBPF, and EM-DAT.

IMPORTANT RULES:
1. ALWAYS lead with the data you have. NEVER start your response with disclaimers like "the available dataset does not provide" or "I don't have data on". Just answer the question using whatever relevant data you DO have.
2. Always cite specific numbers from the data provided below. Reference the dataset name (e.g. "FTS data", "CBPF allocation data", "EM-DAT").
3. Use markdown formatting extensively: headers, bold, lists, blockquotes, tables.
4. When it makes sense, include a CHART BLOCK to visualize data. Use this exact format:

\`\`\`chart
{"type":"bar","title":"Chart Title","data":[{"name":"A","value1":10,"value2":5},{"name":"B","value1":20,"value2":8}],"keys":["value1","value2"],"labels":["Label 1","Label 2"]}
\`\`\`

Chart types: "bar" (grouped bars), "line" (trend line), "pie" (donut).
For bar charts: data items have "name" + value keys. Include "keys" and "labels" arrays.
For line charts: data items have "year" + value keys. Include "keys" and "labels".
For pie charts: data items have "name" and "value".

5. Include charts whenever showing comparative data, trends, or breakdowns.
6. Be thorough but concise. Structure your answer with clear sections.
7. Never fabricate numbers, but DO use all the data you have — including crisis descriptions, summaries, and context from the country profiles.
`;

let _systemPrompt = null;

async function getSystemPrompt() {
    if (_systemPrompt) return _systemPrompt;
    const dataContext = await buildDataContext();
    _systemPrompt = BASE_SYSTEM_PROMPT + '\n\nHere is the REAL DATA from our Databricks pipeline:\n' + dataContext;
    return _systemPrompt;
}

/**
 * Stream a ChatGPT response. Calls onChunk(text) as each token arrives.
 * Returns the complete message when done.
 */
export async function streamChatMessage(message, history = [], onChunk) {
    if (!OPENAI_KEY) {
        const msg = '⚠️ OpenAI API key not configured. Set `VITE_OPENAI_API_KEY` in `.env`.';
        onChunk?.(msg);
        return msg;
    }

    try {
        const systemPrompt = await getSystemPrompt();
        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...history
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: message },
        ];

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OPENAI_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: apiMessages,
                stream: true,
                max_tokens: 2048,
                temperature: 0.7,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]') break;

                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullText += delta;
                        onChunk?.(fullText);
                    }
                } catch { /* skip */ }
            }
        }

        return fullText || 'No response received.';
    } catch (err) {
        console.error('[OpenAI] Error:', err);
        const errMsg = `⚠️ Error: ${err.message}`;
        onChunk?.(errMsg);
        return errMsg;
    }
}

// Legacy non-streaming fallback
export async function sendChatMessage(message, history = []) {
    let result = '';
    await streamChatMessage(message, history, (text) => { result = text; });
    return { content: result, citations: [] };
}