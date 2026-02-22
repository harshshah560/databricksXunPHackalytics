/**
 * Wiki.jsx — Humanitarian Intelligence Chat
 *
 * Original UI preserved (chat-panel, message, suggested-chip, etc.)
 * Data sources injected as context into every relevant query:
 *   1. projects_clean.csv  → projects_data.json  (1,261 CBPF projects)
 *   2. humanitarian_response_plans.csv → hrp_by_iso.json (HRP requirements 2000–2026)
 *   3. Alloc_Documentation.csv → cerf_ids.json  (CERF country IDs → live page URLs)
 *      These are the same URLs the CERF web scraper targets.
 */
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Send, Sparkles, Database, BarChart3 } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import projectsData from '../../services/projects_data.json';
import cerfIds from '../../services/cerf_ids.json';
import hrpData from '../../services/hrp_by_iso.json';
import { useSearchParams } from 'react-router-dom';
import { streamChatMessage } from '../../services/api';
import { SAMPLE_CHAT } from '../../services/mockData';
import './Wiki.css';

// ─────────────────────────────────────────────────────────────────
// Country lookups
// ─────────────────────────────────────────────────────────────────
const COUNTRY_NAMES = {
    AFG: 'Afghanistan', BFA: 'Burkina Faso', CAF: 'Central African Republic',
    COD: 'DR Congo', COL: 'Colombia', ETH: 'Ethiopia', HTI: 'Haiti',
    IRQ: 'Iraq', LBN: 'Lebanon', MLI: 'Mali', MMR: 'Myanmar',
    MOZ: 'Mozambique', NER: 'Niger', NGA: 'Nigeria', PSE: 'Palestine',
    SDN: 'Sudan', SOM: 'Somalia', SSD: 'South Sudan', SYR: 'Syria',
    TCD: 'Chad', UKR: 'Ukraine', VEN: 'Venezuela', YEM: 'Yemen',
};

const NAME_TO_CODE = Object.entries(COUNTRY_NAMES).reduce((acc, [code, name]) => {
    acc[name.toLowerCase()] = code;
    return acc;
}, {
    'dr congo': 'COD', 'democratic republic of the congo': 'COD',
    'central african rep': 'CAF', 'cent. african rep.': 'CAF',
    'state of palestine': 'PSE', 'occupied palestinian territory': 'PSE',
    'south sudan': 'SSD', 'burkina': 'BFA', 'drc': 'COD',
});

// ─────────────────────────────────────────────────────────────────
// Data helpers
// ─────────────────────────────────────────────────────────────────
function detectCountries(text) {
    const lower = text.toLowerCase();
    const found = new Set();
    for (const [name, code] of Object.entries(NAME_TO_CODE)) {
        if (lower.includes(name)) found.add(code);
    }
    return [...found];
}

function detectYear(text) {
    const m = text.match(/\b(20[012][0-9])\b/);
    if (m) return m[1];
    if (/last year/i.test(text)) return String(new Date().getFullYear() - 1);
    return null;
}

function getCerfUrl(cc, year = '2025') {
    const key = `${cc}_${year}`;
    const id = cerfIds[key] ?? cerfIds[`${cc}_2024`] ?? cerfIds[`${cc}_2023`];
    if (!id) return null;
    const y = cerfIds[key] ? year : (cerfIds[`${cc}_2024`] ? '2024' : '2023');
    return `https://cerf.un.org/what-we-do/allocation/${y}/country/${id}`;
}

const fmtMoney = n => {
    if (!n) return '$0';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n}`;
};

/**
 * buildDataContext — injects all three CSV data sources into the Claude prompt.
 *
 * 1. CBPF projects  (projects_clean.csv via projects_data.json)
 * 2. HRP plans      (humanitarian_response_plans.csv via hrp_by_iso.json)
 * 3. CERF URLs      (Alloc_Documentation.csv via cerf_ids.json)
 *    → These are the live URLs the CERF web scraper reads project tables from.
 *    → We expose them directly so users can click through to see full live data.
 */
function buildDataContext(countryCodes, queryYear = null, sectorHint = null) {
    if (!countryCodes.length) return '';
    const year = queryYear || '2025';
    let ctx = '\n\n---\n## INJECTED DATA CONTEXT\n\n';

    for (const cc of countryCodes.slice(0, 3)) {
        const name = COUNTRY_NAMES[cc] || cc;
        const cerfUrl = getCerfUrl(cc, year);

        ctx += `### ${name}\n`;

        // ── CERF web-scraper source URL ──────────────────────────
        if (cerfUrl) {
            ctx += `**CERF Live Page (${year}):** ${cerfUrl}\n`;
            ctx += `*(This is the page the CERF web scraper reads — click to see the full live project table)*\n\n`;
        }

        // ── CBPF Projects ─────────────────────────────────────────
        const allProjs = projectsData[cc] || [];
        const projs = sectorHint
            ? allProjs.filter(p => p.sector?.toLowerCase().includes(sectorHint.toLowerCase()))
            : allProjs;
        const topProjs = [...projs].sort((a, b) => b.allocation - a.allocation).slice(0, 10);
        const totAlloc = projs.reduce((s, p) => s + p.allocation, 0);
        const totPeople = projs.reduce((s, p) => s + (p.targeted || 0), 0);

        if (topProjs.length) {
            ctx += `**CBPF Projects (projects_clean.csv — ${projs.length} total):**\n`;
            ctx += `Total: ${fmtMoney(totAlloc)} allocated | ${Math.round(totPeople / 1000)}K people targeted\n\n`;
            for (const p of topProjs) {
                ctx += `- **${p.title.slice(0, 100)}**\n`;
                ctx += `  Partner: ${p.partner} | ${fmtMoney(p.allocation)} | `;
                ctx += `${(p.targeted || 0).toLocaleString()} people | $${p.cpp?.toFixed(0) || '?'}/person`;
                ctx += ` | Sector: ${p.sector} | Code: \`${p.project_code}\`\n`;
            }
            ctx += '\n';
        }

        // ── HRP Response Plans ────────────────────────────────────
        const plans = hrpData[cc] || [];
        if (plans.length) {
            ctx += `**Humanitarian Response Plans (humanitarian_response_plans.csv):**\n`;
            const relevant = queryYear
                ? plans.filter(p => Math.abs(parseInt(p.year) - parseInt(queryYear)) <= 3)
                : plans;
            const show = (relevant.length ? relevant : plans).slice(0, 6);
            for (const pl of show) {
                ctx += `- ${pl.year}: ${pl.plan} — Requirements: **${fmtMoney(pl.req_usd)}**\n`;
            }
            if (plans.length >= 3) {
                const trend = plans[0].req_usd > plans[2].req_usd ? '📈 increasing' : '📉 decreasing';
                ctx += `  *(HRP requirements trend: ${trend} in recent years)*\n`;
            }
            ctx += '\n';
        }
    }

    ctx += '---\n';
    return ctx;
}

// ─────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a humanitarian data analyst AI embedded in a crisis monitoring platform built for UN and Databricks judges.

You have three data sources injected as context when the user asks about specific countries:

1. **CBPF Projects** (from projects_clean.csv)
   - 1,261 active 2025 CBPF-funded projects across 23 crisis countries
   - Fields: title, implementing partner, allocation ($), people targeted, cost/person, sector
   - CBPF = Country-Based Pooled Funds (flexible funding allocated by country-level humanitarian coordinators)

2. **Humanitarian Response Plans** (from humanitarian_response_plans.csv)
   - Official UN HRP requirements going back to 2000 for all monitored countries
   - Shows the annual funding ask — compare against actual CBPF allocations to reveal gaps

3. **CERF Allocation Pages** (from Alloc_Documentation.csv — these are the web scraper source URLs)
   - CERF = Central Emergency Response Fund (UN Secretary-General's emergency fund)
   - URL format: https://cerf.un.org/what-we-do/allocation/{year}/country/{id}
   - These pages contain the live project tables that the CERF web scraper reads
   - Always surface these links so users can verify live data directly

When answering:
- Lead with the most important data point (gap, scale, trend)
- Show cost-per-person and flag outliers vs sector medians
- Compare CBPF allocation vs HRP requirement to show the coverage fraction
- For project comparisons, list projects in descending allocation order
- Always include the CERF URL when available

Sector cost/person medians for benchmarking:
Education: $59 | Shelter & NFI: $51 | Food Security: $37 | Health: $14 | Nutrition: $21 | Protection: $28 | WASH: $14

For chart requests, output a \`\`\`chart block:
{"type":"bar"|"line"|"pie","title":"...","data":[...],"keys":["key1","key2"]}`;

// ─────────────────────────────────────────────────────────────────
// Chart colour palette
// ─────────────────────────────────────────────────────────────────
const CHART_COLORS = ['#009EDB', '#E74C3C', '#F39C12', '#27AE60', '#7B61FF', '#D63384', '#1A2B4A', '#7CB342'];

// ─────────────────────────────────────────────────────────────────
// Parse ```chart blocks
// ─────────────────────────────────────────────────────────────────
function parseCharts(text) {
    const parts = [];
    const regex = /```chart\s*\n([\s\S]*?)\n```/g;
    let lastIndex = 0, match;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex)
            parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
        try { parts.push({ type: 'chart', data: JSON.parse(match[1].trim()) }); }
        catch { parts.push({ type: 'text', content: match[0] }); }
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length)
        parts.push({ type: 'text', content: text.slice(lastIndex) });
    return parts.length ? parts : [{ type: 'text', content: text }];
}

// ─────────────────────────────────────────────────────────────────
// Chart renderer
// ─────────────────────────────────────────────────────────────────
function ChartRenderer({ chart }) {
    if (!chart?.data?.length) return null;

    const tooltipStyle = {
        background: 'rgba(15,15,25,0.95)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, color: '#fff', fontSize: 12,
        backdropFilter: 'blur(10px)',
    };

    if (chart.type === 'pie') return (
        <div className="chat-chart">
            <div className="chart-header"><BarChart3 size={14} /><h4 className="chart-title">{chart.title}</h4></div>
            <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                    <Pie data={chart.data} cx="50%" cy="50%" innerRadius={55} outerRadius={95}
                        paddingAngle={3} dataKey="value" nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {chart.data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );

    if (chart.type === 'line') {
        const keys = chart.keys || Object.keys(chart.data[0]).filter(k => k !== 'year' && k !== 'name');
        const labels = chart.labels || keys;
        return (
            <div className="chat-chart">
                <div className="chart-header"><BarChart3 size={14} /><h4 className="chart-title">{chart.title}</h4></div>
                <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chart.data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey={chart.data[0]?.year !== undefined ? 'year' : 'name'} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                        <Tooltip contentStyle={tooltipStyle} /><Legend />
                        {keys.map((key, i) => <Line key={key} type="monotone" dataKey={key}
                            stroke={CHART_COLORS[i]} strokeWidth={2.5}
                            dot={{ r: 3, fill: CHART_COLORS[i] }} name={labels[i] || key} />)}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        );
    }

    // Default: bar
    const keys = chart.keys || Object.keys(chart.data[0]).filter(k => k !== 'name');
    const labels = chart.labels || keys;
    return (
        <div className="chat-chart">
            <div className="chart-header"><BarChart3 size={14} /><h4 className="chart-title">{chart.title}</h4></div>
            <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chart.data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} /><Legend />
                    {keys.map((key, i) => <Bar key={key} dataKey={key} fill={CHART_COLORS[i]}
                        radius={[6, 6, 0, 0]} name={labels[i] || key} />)}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────
export default function Wiki() {
    const [searchParams] = useSearchParams();
    const [messages, setMessages] = useState(SAMPLE_CHAT);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-fire prompt written by CountryModal's "Ask AI" button
    useEffect(() => {
        const autoPrompt = localStorage.getItem('wiki_autoprompt');
        if (autoPrompt) {
            localStorage.removeItem('wiki_autoprompt');
            // Small delay so the component is fully mounted
            setTimeout(() => handleSendPrompt(autoPrompt), 120);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const query = searchParams.get('q');
        if (query) {
            setInput(query);
            // Small delay to ensure inputRef is available after initial render
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [searchParams]);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [input]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // Core send function — accepts optional text (for auto-prompt) or uses input state
    const handleSendPrompt = async (textOverride) => {
        const currentInput = textOverride ?? input;
        if (!currentInput.trim() || loading) return;

        if (!textOverride) setInput('');
        setLoading(true);
        setStreaming(false);

        const userMsg = { role: 'user', content: currentInput };
        setMessages(prev => [...prev, userMsg]);

        // ── Detect context from the query ────────────────────────
        const mentionedCCs = detectCountries(currentInput);
        const mentionedYear = detectYear(currentInput);
        const SECTOR_HINTS = ['health', 'wash', 'water', 'education', 'shelter', 'nfi',
            'nutrition', 'protection', 'food', 'livelihoods'];
        const sectorHint = SECTOR_HINTS.find(s => currentInput.toLowerCase().includes(s)) || null;

        const dataCtx = buildDataContext(mentionedCCs, mentionedYear, sectorHint);

        const historyForApi = messages.map(m => ({ role: m.role, content: m.content }));
        const userContentForApi = currentInput + dataCtx;
        const apiMessages = [...historyForApi, { role: 'user', content: userContentForApi }];

        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        const assistantIdx = messages.length + 1;

        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1000,
                    system: SYSTEM_PROMPT,
                    messages: apiMessages,
                }),
            });

            if (!res.ok) throw new Error(`API ${res.status}`);
            const data = await res.json();
            const reply = data.content?.find(b => b.type === 'text')?.text || 'No response received.';

            setStreaming(true);
            setMessages(prev => {
                const updated = [...prev];
                updated[assistantIdx] = { role: 'assistant', content: reply };
                return updated;
            });
        } catch (err) {
            setMessages(prev => {
                const updated = [...prev];
                updated[assistantIdx] = {
                    role: 'assistant',
                    content: `Sorry, something went wrong: ${err.message}. Please try again.`,
                };
                return updated;
            });
        }

        setStreaming(false);
        setLoading(false);
    };

    const handleSend = () => handleSendPrompt();

    const handleKeyDown = e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendPrompt(); }
    };

    const suggestedQueries = [
        'Show projects in Afghanistan for Health',
        "Sudan's CBPF allocation vs HRP requirements",
        'Compare WASH projects across Yemen and Syria',
        'Which sectors are most underfunded globally?',
        'List shelter projects in Nigeria with cost per person',
        'HRP funding trend for Ethiopia since 2020',
    ];

    const renderMessageContent = msg => {
        const parts = parseCharts(msg.content || '');
        return parts.map((part, i) => {
            if (part.type === 'chart') return <ChartRenderer key={i} chart={part.data} />;
            return (
                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}
                    components={{
                        a: ({ href, children, ...props }) =>
                            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>,
                        hr: () => <div className="sources-divider" />,
                    }}>
                    {part.content}
                </ReactMarkdown>
            );
        });
    };

    return (
        <div className="wiki-page">
            <div className="chat-panel">

                {/* Messages */}
                <div className="chat-messages">
                    {messages.map((msg, i) => (
                        <motion.div key={i} className={`message ${msg.role}`}
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, delay: 0.05 }}>
                            {msg.role === 'assistant' && (
                                <div className="message-avatar"><Sparkles size={14} /></div>
                            )}
                            <div className="message-body">
                                {renderMessageContent(msg)}
                            </div>
                        </motion.div>
                    ))}

                    {loading && !streaming && (
                        <motion.div className="message assistant"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <div className="message-avatar"><Sparkles size={14} /></div>
                            <div className="message-body">
                                <div className="typing-indicator">
                                    <span /><span /><span />
                                </div>
                            </div>
                        </motion.div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Suggested chips — visible until first message */}
                {messages.length === 0 && (
                    <div className="suggested-queries">
                        {suggestedQueries.map((q, i) => (
                            <button key={i} className="suggested-chip"
                                onClick={() => { setInput(q); inputRef.current?.focus(); }}>
                                {q}
                            </button>
                        ))}
                    </div>
                )}

                {/* Input */}
                <div className="chat-input-wrap">
                    <div className="chat-input-area">
                        <textarea ref={inputRef}
                            placeholder="Ask about projects, HRP plans, funding gaps, or any crisis country…"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={1} />
                        <button className={`send-btn ${input.trim() ? 'active' : ''}`}
                            onClick={handleSend} disabled={!input.trim() || loading}>
                            <Send size={16} />
                        </button>
                    </div>
                    <p className="chat-disclaimer">
                        Reads from CBPF projects, HRP plans, and CERF.un.org live pages · Always verify critical figures.
                    </p>
                </div>
            </div>
        </div>
    );
}