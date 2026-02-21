/* ═══════════════════════════════════════════════
   API SERVICE LAYER
   Uses Databricks SQL Statement Execution API
   to pull live data from your warehouse tables.
   Falls back to mock data if env vars are missing.
   ═══════════════════════════════════════════════ */

import {
    CRISIS_COUNTRIES,
    DATA_SOURCES,
    MOCK_WIKI_RESPONSES,
    CLUSTER_FUNDING,
    TOP_DONORS,
    FUNDING_TRENDS,
    CBPF_DATA,
    MOCK_SIMULATION_RESULT,
} from './mockData';

// ── Databricks Config ──────────────────────────
const DATABRICKS_HOST = import.meta.env.VITE_DATABRICKS_HOST;       // e.g. https://adb-xxxx.azuredatabricks.net
const DATABRICKS_TOKEN = import.meta.env.VITE_DATABRICKS_TOKEN;     // Personal Access Token
const DATABRICKS_WAREHOUSE_ID = import.meta.env.VITE_DATABRICKS_WAREHOUSE_ID; // SQL Warehouse ID
const DATABRICKS_CATALOG = import.meta.env.VITE_DATABRICKS_CATALOG || 'main';
const DATABRICKS_SCHEMA = import.meta.env.VITE_DATABRICKS_SCHEMA || 'default';

const USE_DATABRICKS = !!(DATABRICKS_HOST && DATABRICKS_TOKEN && DATABRICKS_WAREHOUSE_ID);

// ── Databricks SQL Statement Execution API ─────
async function executeDatabricksSQL(sql) {
    const url = `${DATABRICKS_HOST}/api/2.0/sql/statements/`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            warehouse_id: DATABRICKS_WAREHOUSE_ID,
            catalog: DATABRICKS_CATALOG,
            schema: DATABRICKS_SCHEMA,
            statement: sql,
            wait_timeout: '30s',
            disposition: 'INLINE',
            format: 'JSON_ARRAY',
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        console.error('Databricks SQL error:', err);
        throw new Error(`Databricks query failed: ${response.status}`);
    }

    const data = await response.json();

    // If the query is still running, poll for result
    if (data.status?.state === 'PENDING' || data.status?.state === 'RUNNING') {
        return pollForResult(data.statement_id);
    }

    if (data.status?.state === 'FAILED') {
        throw new Error(`Query failed: ${data.status.error?.message || 'Unknown error'}`);
    }

    return parseResult(data);
}

async function pollForResult(statementId, maxRetries = 20) {
    for (let i = 0; i < maxRetries; i++) {
        await new Promise(r => setTimeout(r, 1500));

        const response = await fetch(
            `${DATABRICKS_HOST}/api/2.0/sql/statements/${statementId}`,
            { headers: { 'Authorization': `Bearer ${DATABRICKS_TOKEN}` } }
        );

        const data = await response.json();
        if (data.status?.state === 'SUCCEEDED') return parseResult(data);
        if (data.status?.state === 'FAILED') {
            throw new Error(`Query failed: ${data.status.error?.message}`);
        }
    }
    throw new Error('Query timed out');
}

function parseResult(data) {
    const columns = data.manifest?.schema?.columns?.map(c => c.name) || [];
    const rows = data.result?.data_array || [];
    return rows.map(row => {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
    });
}

// ── Helper ─────────────────────────────────────
async function simulateDelay(ms = 800) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Landing Page ───────────────────────────────
export async function fetchCrisisCountries() {
    if (USE_DATABRICKS) {
        try {
            const rows = await executeDatabricksSQL(`
                SELECT f.countryCode, f.name, f.year,
                       f.requirements, f.funding, f.percentFunded,
                       d.DisasterType, d.TotalDeaths, d.TotalAffected
                FROM fts_requirements_funding_global f
                LEFT JOIN emdat_disasters d ON f.countryCode = d.ISO
                WHERE f.year >= 2024
                  AND f.requirements > 0
                ORDER BY (f.requirements - COALESCE(f.funding, 0)) DESC
                LIMIT 20
            `);
            return rows.map(r => ({
                code: r.countryCode,
                name: r.name?.replace(/Humanitarian.*$/, '').trim() || r.countryCode,
                crisis: r.DisasterType || 'Humanitarian Crisis',
                funding: { required: Number(r.requirements) || 0, received: Number(r.funding) || 0 },
                percentFunded: Number(r.percentFunded) || 0,
                affected: Number(r.TotalAffected) || 0,
            }));
        } catch (e) {
            console.warn('Databricks fetch failed, using mock data:', e.message);
        }
    }
    await simulateDelay(300);
    return CRISIS_COUNTRIES;
}

// ── Wiki / Chat ────────────────────────────────
export async function fetchDataSources() {
    if (USE_DATABRICKS) {
        try {
            // Get table metadata from Databricks
            const tables = await executeDatabricksSQL(`
                SHOW TABLES IN ${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}
            `);
            return tables.map(t => ({
                id: t.tableName,
                name: t.tableName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                description: `Data table: ${t.tableName}`,
                rows: '—',
                file: t.tableName,
            }));
        } catch (e) {
            console.warn('Databricks fetch failed, using mock data:', e.message);
        }
    }
    await simulateDelay(200);
    return DATA_SOURCES;
}

export async function sendChatMessage(message, history = []) {
    // 1. Try custom RAG endpoint if configured
    const RAG_ENDPOINT = import.meta.env.VITE_RAG_ENDPOINT;
    if (RAG_ENDPOINT) {
        try {
            const res = await fetch(RAG_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message, history }),
            });
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn('RAG endpoint failed, using mock:', e.message);
        }
    }

    // 3. Fallback to mock responses
    await simulateDelay(1500);
    const lower = message.toLowerCase();
    if (lower.includes('afghanistan') || lower.includes('afg')) {
        return MOCK_WIKI_RESPONSES['afghanistan'];
    } else if (lower.includes('sudan') || lower.includes('sdn')) {
        return MOCK_WIKI_RESPONSES['sudan'];
    } else {
        return MOCK_WIKI_RESPONSES['default'];
    }
}

// ── Visualizations ─────────────────────────────
export async function fetchClusterFunding() {
    if (USE_DATABRICKS) {
        try {
            const rows = await executeDatabricksSQL(`
                SELECT cluster, 
                       SUM(requirements) as required, 
                       SUM(funding) as funded,
                       AVG(percentFunded) as pctFunded
                FROM fts_requirements_funding_cluster_global
                WHERE year >= 2024
                GROUP BY cluster
                ORDER BY SUM(requirements) DESC
                LIMIT 10
            `);
            return rows.map(r => ({
                cluster: r.cluster,
                required: Number(r.required) || 0,
                funded: Number(r.funded) || 0,
                pctFunded: Number(r.pctFunded) || 0,
            }));
        } catch (e) {
            console.warn('Databricks fetch failed, using mock data:', e.message);
        }
    }
    await simulateDelay(400);
    return CLUSTER_FUNDING;
}

export async function fetchTopDonors() {
    if (USE_DATABRICKS) {
        try {
            const rows = await executeDatabricksSQL(`
                SELECT name as donor,
                       SUM(funding) as totalFunding
                FROM cbpf_vs_hrp
                GROUP BY name
                ORDER BY SUM(funding) DESC
                LIMIT 10
            `);
            return rows.map(r => ({
                donor: r.donor,
                amount: Number(r.totalFunding) || 0,
            }));
        } catch (e) {
            console.warn('Databricks fetch failed, using mock data:', e.message);
        }
    }
    await simulateDelay(400);
    return TOP_DONORS;
}

export async function fetchFundingTrends() {
    if (USE_DATABRICKS) {
        try {
            const rows = await executeDatabricksSQL(`
                SELECT year,
                       SUM(requirements) as required,
                       SUM(funding) as funded
                FROM fts_requirements_funding_global
                WHERE year >= 2019 AND year <= 2026
                GROUP BY year
                ORDER BY year
            `);
            return rows.map(r => ({
                year: Number(r.year),
                required: Number(r.required) || 0,
                funded: Number(r.funded) || 0,
            }));
        } catch (e) {
            console.warn('Databricks fetch failed, using mock data:', e.message);
        }
    }
    await simulateDelay(400);
    return FUNDING_TRENDS;
}

export async function fetchCBPFData() {
    if (USE_DATABRICKS) {
        try {
            const rows = await executeDatabricksSQL(`
                SELECT *
                FROM cbpf_vs_hrp
                ORDER BY CBPFFunding DESC
                LIMIT 15
            `);
            return rows.map(r => ({
                name: r.CBPFName || r.name,
                cbpfFunding: Number(r.CBPFFunding) || 0,
                cbpfTarget: Number(r.CBPFTarget) || 0,
                cbpfPctOfHRP: Number(r['CBPFFundingAsPercentOfHRPFunding']) || 0,
                hrpFunding: Number(r.HRPFunding) || 0,
                hrpRequirements: Number(r.HRPRequirements) || 0,
            }));
        } catch (e) {
            console.warn('Databricks fetch failed, using mock data:', e.message);
        }
    }
    await simulateDelay(400);
    return CBPF_DATA;
}

// ── Simulation ─────────────────────────────────
export async function runSimulation(countryCode, crisisType) {
    // Simulation uses a GPT agent endpoint if available
    const SIM_ENDPOINT = import.meta.env.VITE_SIMULATION_ENDPOINT;
    if (SIM_ENDPOINT) {
        try {
            const res = await fetch(SIM_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ countryCode, crisisType }),
            });
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn('Simulation endpoint failed, using mock:', e.message);
        }
    }

    await simulateDelay(4000);
    return MOCK_SIMULATION_RESULT;
}
