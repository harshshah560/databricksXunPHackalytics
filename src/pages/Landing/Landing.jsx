import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
    AlertTriangle, Users, TrendingDown,
    Wheat, Heart, Droplets, Home, ShieldCheck, BookOpen,
    Apple, Maximize2, Activity,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import CountryModal from '../../components/CountryModal/CountryModal';
import { getCountries, ISSUE_CATEGORIES } from '../../services/dataService';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Landing.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// ── UN/OCHA design tokens ─────────────────────────────────────────
// Primary blue: OCHA #009EDB  |  Dark: #1A2B4A  |  Text: #333333
// Severity scale follows OCHA traffic-light convention

// ── Issue meta — 7 canonical sectors ─────────────────────────────
const ISSUE_META = {
    'Education': { icon: BookOpen, color: '#F5A623', short: 'Edu.' },
    'Emergency Shelter & NFI': { icon: Home, color: '#7B61FF', short: 'Shelter' },
    'Food Security & Agriculture': { icon: Wheat, color: '#D4890A', short: 'Food' },
    'Health': { icon: Heart, color: '#C0392B', short: 'Health' },
    'Nutrition': { icon: Apple, color: '#D63384', short: 'Nutr.' },
    'Protection': { icon: ShieldCheck, color: '#009EDB', short: 'Prot.' },
    'Water, Sanitation, Hygiene': { icon: Droplets, color: '#0070C0', short: 'WASH' },
};

// ISO-3 codes match directly in Mapbox Streets v8 "country" source-layer
// via the iso_3166_1_alpha_3 property — no translation needed

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n) => {
    if (!n && n !== 0) return '$0';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return `$${(n / 1e3).toFixed(0)}K`;
};
const fmtN = (n) => {
    if (!n) return '0';
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return String(Math.round(n));
};

// OCHA severity palette: red → orange → amber → lime → green
const pctColor = (pct) => {
    if (pct == null || pct < 0) return '#94a3b8';
    if (pct < 10) return '#C0392B';
    if (pct < 20) return '#E74C3C';
    if (pct < 35) return '#E67E22';
    if (pct < 50) return '#F39C12';
    if (pct < 70) return '#7CB342';
    return '#27AE60';
};

// ── Map display modes ─────────────────────────────────────────────
export const MAP_MODES = [
    { id: 'funding', label: 'Funding Gap', icon: '💸' },
    { id: 'efficiency', label: 'Cost Efficiency', icon: '⚡' },
    { id: 'priority', label: 'Priority Index', icon: '🎯' },
];

// Cost efficiency color: HIGH $/person = GREEN (well-resourced), LOW = RED (underspending)
// ratio = country cost_per_person / global_sector_median
// ratio > 1 = spending more than median per person = better resourced = GREEN
// ratio < 1 = spending less than median per person = underfunded = RED
const effColor = (ratio) => {
    if (ratio == null) return '#94a3b8';
    if (ratio >= 1.75) return '#27AE60';  // well above median — well-resourced
    if (ratio >= 1.25) return '#7CB342';  // above median
    if (ratio >= 0.75) return '#F39C12';  // near median
    if (ratio >= 0.5) return '#E67E22';  // below median
    return '#C0392B';                     // far below — severely underspending per person
};

// Priority color: higher score = more urgent = red
const priorityColor = (score) => {
    if (score == null) return '#94a3b8';
    if (score >= 60) return '#C0392B';
    if (score >= 50) return '#E74C3C';
    if (score >= 40) return '#E67E22';
    if (score >= 30) return '#F39C12';
    if (score >= 20) return '#7CB342';
    return '#27AE60';
};

// Efficiency label
const effLabel = (ratio) => {
    if (ratio == null) return 'No data';
    if (ratio >= 1.75) return 'Well-resourced';
    if (ratio >= 1.25) return 'Above median';
    if (ratio < 0.5) return 'Severely underfunded';
    if (ratio < 0.75) return 'Below median';
    return 'Near median';
};

// ── Hover popup — compact, pie + gender ───────────────────────────
function HoverPopup({ country, activeIssue, mapMode, onExpand }) {
    const pct = country.issue_pct_funded?.[activeIssue];
    const bd = country.cluster_breakdown?.[activeIssue];
    const wi = country.world || {};
    const meta = ISSUE_META[activeIssue] || {};
    const Icon = meta.icon || AlertTriangle;
    const cpp = country.cost_per_person?.[activeIssue];
    const ratio = country.cost_ratio?.[activeIssue];
    const glMed = bd?.global_median_cpp;
    const priScore = country.priority_index?.[activeIssue];

    const { boys = 0, girls = 0, men = 0, women = 0, total = 0 } = country.affected || {};
    const children = boys + girls;
    const childPct = total > 0 ? Math.round(children / total * 100) : 0;

    const genderBars = [
        { label: 'Boys', val: boys, color: '#4A90D9', pct: total > 0 ? boys / total * 100 : 0 },
        { label: 'Girls', val: girls, color: '#E91E8C', pct: total > 0 ? girls / total * 100 : 0 },
        { label: 'Men', val: men, color: '#1565C0', pct: total > 0 ? men / total * 100 : 0 },
        { label: 'Women', val: women, color: '#AD1457', pct: total > 0 ? women / total * 100 : 0 },
    ].filter(g => g.val > 0);

    const funded = bd?.fund || 0;
    const needed = bd?.req || 0;
    const gap = bd?.gap || 0;

    // Donut data depends on mode
    let donutData, donutCenterVal, donutCenterSub, donutColor;
    if (mapMode === 'efficiency') {
        const effPct = ratio != null ? Math.min(Math.round((2 - Math.min(ratio, 2)) / 2 * 100), 100) : null;
        donutColor = effColor(ratio);
        donutData = effPct != null ? [
            { name: effLabel(ratio), value: effPct, color: donutColor },
            { name: 'Remaining', value: 100 - effPct, color: '#E5E9F0' },
        ] : [];
        donutCenterVal = cpp != null ? `$${cpp.toFixed(0)}` : '—';
        donutCenterSub = 'per person';
    } else if (mapMode === 'priority') {
        donutColor = priorityColor(priScore);
        donutData = priScore != null ? [
            { name: 'Priority', value: priScore, color: donutColor },
            { name: 'Remaining', value: 100 - priScore, color: '#E5E9F0' },
        ] : [];
        donutCenterVal = priScore != null ? `${priScore}` : '—';
        donutCenterSub = 'priority';
    } else {
        donutColor = pctColor(pct);
        donutData = needed > 0 ? [
            { name: 'Funded', value: funded, color: donutColor },
            { name: 'Unfunded', value: gap, color: '#E5E9F0' },
        ] : [];
        donutCenterVal = pct != null ? `${pct}%` : '—';
        donutCenterSub = 'funded';
    }

    const targetedPeople = bd?.targeted_people || 0;
    const reachedPeople = bd?.reached_people || 0;

    return (
        <div className="hpop">
            {/* Header */}
            <div className="hpop-header">
                <div className="hpop-title-row">
                    <span className="hpop-country">{country.name}</span>
                    <button className="hpop-expand" onClick={onExpand} title="Full analysis">
                        <Maximize2 size={11} />
                        <span>Details</span>
                    </button>
                </div>
                <div className="hpop-sector-row">
                    <Icon size={11} color={meta.color} />
                    <span className="hpop-sector">{activeIssue}</span>
                </div>
            </div>

            {/* Donut + key stats */}
            <div className="hpop-body">
                <div className="hpop-donut-wrap">
                    <ResponsiveContainer width={96} height={96}>
                        <PieChart>
                            <Pie
                                data={donutData.length ? donutData : [{ name: 'No data', value: 1, color: '#E5E9F0' }]}
                                cx="50%" cy="50%"
                                innerRadius={28} outerRadius={42}
                                startAngle={90} endAngle={-270}
                                paddingAngle={donutData.length > 1 ? 2 : 0}
                                dataKey="value" strokeWidth={0}
                            >
                                {(donutData.length ? donutData : [{ color: '#E5E9F0' }]).map((e, i) => (
                                    <Cell key={i} fill={e.color} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ background: 'var(--hpop-bg)', border: '1px solid var(--hpop-border)', borderRadius: 6, fontSize: 11 }} />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="hpop-donut-center">
                        <span className="hpop-pct-big" style={{ color: donutColor }}>
                            {donutCenterVal}
                        </span>
                        <span className="hpop-pct-sub">{donutCenterSub}</span>
                    </div>
                </div>

                <div className="hpop-stats">
                    {/* Always show funding stats */}
                    <div className="hpop-stat-row">
                        <span className="hpop-stat-label">Required</span>
                        <span className="hpop-stat-val">{fmt(needed)}</span>
                    </div>
                    <div className="hpop-stat-row">
                        <span className="hpop-stat-label">Funded</span>
                        <span className="hpop-stat-val" style={{ color: pctColor(pct) }}>{fmt(funded)}</span>
                    </div>
                    <div className="hpop-stat-row hpop-stat-row--gap">
                        <span className="hpop-stat-label">Gap</span>
                        <span className="hpop-stat-val hpop-gap-val">{fmt(gap)}</span>
                    </div>

                    {/* Efficiency stats — shown in all modes */}
                    {cpp != null && (
                        <div className="hpop-stat-row hpop-stat-row--people">
                            <span className="hpop-stat-label">Cost / person</span>
                            <span className="hpop-stat-val" style={{ color: effColor(ratio) }}>
                                ${cpp.toFixed(0)}
                                {ratio != null && (
                                    <span className="hpop-ratio-badge" style={{ color: effColor(ratio) }}>
                                        {ratio < 1 ? `${((1 - ratio) * 100).toFixed(0)}% below avg` : `${((ratio - 1) * 100).toFixed(0)}% above avg`}
                                    </span>
                                )}
                            </span>
                        </div>
                    )}
                    {glMed != null && (
                        <div className="hpop-stat-row">
                            <span className="hpop-stat-label">Sector median</span>
                            <span className="hpop-stat-val hpop-muted">${glMed.toFixed(0)}/person</span>
                        </div>
                    )}
                    {priScore != null && (
                        <div className="hpop-stat-row">
                            <span className="hpop-stat-label">Priority score</span>
                            <span className="hpop-stat-val" style={{ color: priorityColor(priScore) }}>
                                {priScore}/100
                            </span>
                        </div>
                    )}
                    {targetedPeople > 0 && (
                        <div className="hpop-stat-row">
                            <span className="hpop-stat-label">People targeted</span>
                            <span className="hpop-stat-val">{fmtN(targetedPeople)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Gender row */}
            {genderBars.length > 0 && (
                <div className="hpop-gender">
                    <span className="hpop-gender-title">
                        <Users size={10} />
                        {fmtN(total)} targeted · {childPct}% children
                    </span>
                    <div className="hpop-gender-bars">
                        {genderBars.map(g => (
                            <div key={g.label} className="hpop-gbar">
                                <span className="hpop-gbar-label">{g.label}</span>
                                <div className="hpop-gbar-track">
                                    <div className="hpop-gbar-fill" style={{ width: `${g.pct}%`, background: g.color }} />
                                </div>
                                <span className="hpop-gbar-pct">{Math.round(g.pct)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Root ──────────────────────────────────────────────────────────
export default function Landing() {
    const { theme } = useTheme();
    const mapRef = useRef(null);

    const [countries, setCountries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [activeIssue, setActiveIssue] = useState('Food Security & Agriculture');
    const [mapMode, setMapMode] = useState('funding');
    const [hoveredCode, setHoveredCode] = useState(null);
    const [hoveredPos, setHoveredPos] = useState(null);
    const [selectedCode, setSelectedCode] = useState(null);
    const [navIdx, setNavIdx] = useState(0);  // index into ranked nation list

    // Load from CSV via dataService (synchronous after first parse)
    useEffect(() => {
        const data = getCountries();
        setCountries(data);
        setLoading(false);
    }, []);

    // Ranked nation list for current sector + mode (worst first)
    const rankedNations = useMemo(() => {
        if (!countries.length) return [];
        const filtered = countries.filter(c => {
            if (mapMode === 'efficiency') return c.cost_ratio?.[activeIssue] != null;
            if (mapMode === 'priority') return c.priority_index?.[activeIssue] != null;
            return c.issue_pct_funded?.[activeIssue] != null;
        });
        return [...filtered].sort((a, b) => {
            if (mapMode === 'efficiency') {
                // Worst = lowest ratio (underspending per person = red = bad)
                return (a.cost_ratio[activeIssue] ?? 999) - (b.cost_ratio[activeIssue] ?? 999);
            }
            if (mapMode === 'priority') {
                // Worst = highest priority score
                return (b.priority_index[activeIssue] ?? 0) - (a.priority_index[activeIssue] ?? 0);
            }
            // Worst = lowest % funded
            return (a.issue_pct_funded[activeIssue] ?? 100) - (b.issue_pct_funded[activeIssue] ?? 100);
        });
    }, [countries, activeIssue, mapMode]);

    // Reset nav index and fly to region centroid when sector or mode changes
    useEffect(() => {
        setNavIdx(0);
        if (!mapLoaded || !rankedNations.length || !mapRef.current) return;
        // Compute centroid of top-5 worst countries
        const top5 = rankedNations.slice(0, 5);
        const lat = top5.reduce((s, c) => s + c.lat, 0) / top5.length;
        const lng = top5.reduce((s, c) => s + c.lng, 0) / top5.length;
        mapRef.current.flyTo({ center: [lng, lat], zoom: 3.2, duration: 1400, essential: true });
    }, [activeIssue, mapMode, mapLoaded]);  // eslint-disable-line react-hooks/exhaustive-deps

    // Fly to a specific nation in the navigator
    const flyToNation = useCallback((idx) => {
        const c = rankedNations[idx];
        if (!c || !mapRef.current) return;
        mapRef.current.flyTo({ center: [c.lng, c.lat], zoom: 4.5, duration: 900, essential: true });
    }, [rankedNations]);

    // Choropleth fill expression: changes colour logic based on mapMode
    const fillExpr = useMemo(() => {
        if (!countries.length) return 'rgba(0,0,0,0)';
        const expr = ['match', ['get', 'iso_3166_1_alpha_3']];
        countries.forEach(c => {
            let color;
            if (mapMode === 'efficiency') {
                color = effColor(c.cost_ratio?.[activeIssue] ?? null);
            } else if (mapMode === 'priority') {
                color = priorityColor(c.priority_index?.[activeIssue] ?? null);
            } else {
                color = pctColor(c.issue_pct_funded?.[activeIssue] ?? -1);
            }
            expr.push(c.code, color);
        });
        expr.push('rgba(0,0,0,0)');
        return expr;
    }, [countries, activeIssue, mapMode]);

    const fillOpacityExpr = useMemo(() => [
        'case', ['==', ['get', 'iso_3166_1_alpha_3'], hoveredCode ?? '__none__'], 0.80, 0.52,
    ], [hoveredCode]);

    const outlineWidthExpr = useMemo(() => [
        'case', ['==', ['get', 'iso_3166_1_alpha_3'], hoveredCode ?? '__none__'], 2.5, 0.5,
    ], [hoveredCode]);

    const geojson = useMemo(() => ({
        type: 'FeatureCollection',
        features: countries.filter(c => c.lat && c.lng).map(c => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
            properties: {
                code: c.code,
                pct: c.issue_pct_funded?.[activeIssue] ?? -1,
                total_affected: c.affected?.total ?? 0,
            },
        })),
    }), [countries, activeIssue]);

    const circleColor = ['case',
        ['<', ['get', 'pct'], 0], 'rgba(0,0,0,0)',
        ['<', ['get', 'pct'], 10], '#C0392B',
        ['<', ['get', 'pct'], 20], '#E74C3C',
        ['<', ['get', 'pct'], 35], '#E67E22',
        ['<', ['get', 'pct'], 50], '#F39C12',
        ['<', ['get', 'pct'], 70], '#7CB342',
        '#27AE60',
    ];

    const handleMouseMove = useCallback(e => {
        const feat = e.features?.[0];
        if (feat) {
            setHoveredCode(feat.properties.code);
            setHoveredPos({ lat: feat.geometry.coordinates[1], lng: feat.geometry.coordinates[0] });
        } else { setHoveredCode(null); setHoveredPos(null); }
    }, []);

    const handleClick = useCallback(e => {
        const code = e.features?.[0]?.properties?.code;
        if (code) setSelectedCode(code);
    }, []);

    const hoveredCountry = countries.find(c => c.code === hoveredCode) ?? null;
    const selectedCountry = countries.find(c => c.code === selectedCode) ?? null;

    // Summary stats
    const issueMeta = ISSUE_META[activeIssue] || {};
    const IssueIcon = issueMeta.icon || AlertTriangle;
    const issueColor = issueMeta.color || '#009EDB';
    const issueSet = countries.filter(c => c.issue_pct_funded?.[activeIssue] != null);
    const totalGap = issueSet.reduce((s, c) => s + (c.cluster_breakdown?.[activeIssue]?.gap || 0), 0);
    const avgFunded = issueSet.length
        ? issueSet.reduce((s, c) => s + (c.issue_pct_funded[activeIssue] || 0), 0) / issueSet.length : 0;
    const totalTargeted = issueSet.reduce((s, c) => s + (c.cluster_breakdown?.[activeIssue]?.targeted_people || 0), 0);

    // Popup anchor: compute based on actual pixel position within map container
    // to prevent cutoff near any edge. Popup is 280px wide, ~420px tall.
    const popupAnchor = useMemo(() => {
        if (!hoveredPos || !mapRef.current) return 'bottom';
        try {
            const map = mapRef.current.getMap();
            const container = map.getContainer();
            const { width, height } = container.getBoundingClientRect();
            const px = map.project([hoveredPos.lng, hoveredPos.lat]);

            const POPUP_W = 300;
            const POPUP_H = 440;
            const MARGIN = 20;

            const tooRight = px.x + POPUP_W / 2 + MARGIN > width;
            const tooLeft = px.x - POPUP_W / 2 - MARGIN < 0;
            const tooBottom = px.y + POPUP_H + MARGIN > height;

            if (tooRight) return tooBottom ? 'top-right' : 'bottom-right';
            if (tooLeft) return tooBottom ? 'top-left' : 'bottom-left';
            return tooBottom ? 'top' : 'bottom';
        } catch {
            return 'bottom';
        }
    }, [hoveredPos]);

    return (
        <div className="landing-page">

            {/* MAP */}
            <div className="map-container">
                <Map
                    ref={mapRef}
                    initialViewState={{ latitude: 10, longitude: 25, zoom: 2.1, pitch: 0 }}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle={theme === 'dark'
                        ? 'mapbox://styles/mapbox/dark-v11'
                        : 'mapbox://styles/mapbox/light-v11'}
                    mapboxAccessToken={MAPBOX_TOKEN}
                    onLoad={() => setMapLoaded(true)}
                    interactiveLayerIds={['crisis-points']}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => { setHoveredCode(null); setHoveredPos(null); }}
                    onClick={handleClick}
                    cursor={hoveredCode ? 'pointer' : 'grab'}
                >
                    <NavigationControl position="bottom-right" />

                    {mapLoaded && (
                        <>
                            {/* ── Choropleth: whole-country polygon fills ── */}
                            {/* source-layer "country" in Mapbox Streets v8 contains country polygons */}
                            {/* matched via iso_3166_1_alpha_3 property (e.g. "AFG", "SDN") */}
                            <Layer id="country-fills" type="fill"
                                source="composite" source-layer="country"
                                beforeId="waterway-label"
                                paint={{ 'fill-color': fillExpr, 'fill-opacity': fillOpacityExpr }} />
                            <Layer id="country-lines" type="line"
                                source="composite" source-layer="country"
                                paint={{ 'line-color': fillExpr, 'line-width': outlineWidthExpr, 'line-opacity': 0.9 }} />
                            <Source id="crisis" type="geojson" data={geojson} generateId>
                                <Layer id="crisis-glow" type="circle" paint={{
                                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 20, 5, 50],
                                    'circle-color': circleColor,
                                    'circle-opacity': 0.06, 'circle-blur': 1.5,
                                }} />
                                <Layer id="crisis-points" type="circle" paint={{
                                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 4, 5, 10],
                                    'circle-color': circleColor,
                                    'circle-stroke-width': 1.5,
                                    'circle-stroke-color': theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)',
                                    'circle-opacity': ['case', ['==', ['get', 'code'], hoveredCode ?? ''], 1, 0.75],
                                }} />
                            </Source>
                        </>
                    )}

                    {hoveredCountry && hoveredPos && (
                        <Popup
                            latitude={hoveredPos.lat}
                            longitude={hoveredPos.lng}
                            closeButton={false}
                            closeOnClick={false}
                            anchor={popupAnchor}
                            offset={16}
                            className="hpop-outer"
                        >
                            <HoverPopup
                                country={hoveredCountry}
                                activeIssue={activeIssue}
                                mapMode={mapMode}
                                onExpand={() => {
                                    setSelectedCode(hoveredCode);
                                    setHoveredCode(null);
                                    setHoveredPos(null);
                                }}
                            />
                        </Popup>
                    )}
                </Map>
            </div>

            {/* ══ RIGHT: VERTICAL SECTOR NAV ══ */}
            <nav className="sector-nav" aria-label="Filter by sector">
                <span className="sector-nav-eyebrow">Sector</span>
                {ISSUE_CATEGORIES.map(issue => {
                    const m = ISSUE_META[issue] || {};
                    const Ic = m.icon || AlertTriangle;
                    const on = activeIssue === issue;
                    return (
                        <button
                            key={issue}
                            className={`snav-btn ${on ? 'snav-btn--on' : ''}`}
                            style={{ '--c': m.color || '#009EDB' }}
                            onClick={() => setActiveIssue(issue)}
                            title={issue}
                            aria-pressed={on}
                        >
                            <Ic size={14} className="snav-icon" aria-hidden="true" />
                            <span className="snav-label">{issue}</span>
                        </button>
                    );
                })}

                {/* Map mode toggle */}
                <div className="snav-mode-group" role="group" aria-label="Map view mode">
                    <span className="snav-leg-title" style={{ marginBottom: 4 }}>Map view</span>
                    {MAP_MODES.map(m => (
                        <button key={m.id}
                            className={`snav-mode-btn ${mapMode === m.id ? 'snav-mode-btn--on' : ''}`}
                            onClick={() => setMapMode(m.id)}
                            aria-pressed={mapMode === m.id}
                            title={m.label}
                        >
                            <span className="snav-mode-icon">{m.icon}</span>
                            <span className="snav-mode-label">{m.label}</span>
                        </button>
                    ))}
                </div>

                {/* Nation navigator — worst countries for this sector/mode */}
                {rankedNations.length > 0 && (
                    <div className="snav-navigator">
                        <span className="snav-leg-title">Navigate worst</span>
                        <div className="snav-nav-row">
                            <button
                                className="snav-nav-arrow"
                                onClick={() => {
                                    const next = (navIdx - 1 + rankedNations.length) % rankedNations.length;
                                    setNavIdx(next);
                                    flyToNation(next);
                                }}
                                aria-label="Previous nation"
                                title="Previous"
                            >‹</button>

                            <button
                                className="snav-nav-name"
                                onClick={() => setSelectedCode(rankedNations[navIdx]?.code)}
                                title="Open full analysis"
                            >
                                <span className="snav-nav-idx">{navIdx + 1}/{rankedNations.length}</span>
                                <span className="snav-nav-label">{rankedNations[navIdx]?.name}</span>
                                <span className="snav-nav-metric" style={{
                                    color:
                                        mapMode === 'efficiency'
                                            ? effColor(rankedNations[navIdx]?.cost_ratio?.[activeIssue])
                                            : mapMode === 'priority'
                                                ? priorityColor(rankedNations[navIdx]?.priority_index?.[activeIssue])
                                                : pctColor(rankedNations[navIdx]?.issue_pct_funded?.[activeIssue])
                                }}>
                                    {mapMode === 'efficiency'
                                        ? `$${(rankedNations[navIdx]?.cost_per_person?.[activeIssue] ?? 0).toFixed(0)}/p`
                                        : mapMode === 'priority'
                                            ? `${rankedNations[navIdx]?.priority_index?.[activeIssue] ?? '—'} pts`
                                            : `${rankedNations[navIdx]?.issue_pct_funded?.[activeIssue] ?? '—'}%`}
                                </span>
                            </button>

                            <button
                                className="snav-nav-arrow"
                                onClick={() => {
                                    const next = (navIdx + 1) % rankedNations.length;
                                    setNavIdx(next);
                                    flyToNation(next);
                                }}
                                aria-label="Next nation"
                                title="Next"
                            >›</button>
                        </div>
                    </div>
                )}
                <div className="snav-legend">
                    {mapMode === 'funding' && (<>
                        <span className="snav-leg-title">% Funded</span>
                        {[['< 10%', '#C0392B'], ['10–35%', '#E67E22'], ['35–70%', '#F39C12'], ['>70%', '#27AE60']].map(([l, c]) => (
                            <span key={l} className="snav-leg-item"><span className="snav-leg-dot" style={{ background: c }} /><span>{l}</span></span>
                        ))}
                    </>)}
                    {mapMode === 'efficiency' && (<>
                        <span className="snav-leg-title">$/person vs median</span>
                        {[['Underspending (<0.5×)', '#C0392B'], ['Near median', '#F39C12'], ['Well-resourced (>1.75×)', '#27AE60']].map(([l, c]) => (
                            <span key={l} className="snav-leg-item"><span className="snav-leg-dot" style={{ background: c }} /><span>{l}</span></span>
                        ))}
                    </>)}
                    {mapMode === 'priority' && (<>
                        <span className="snav-leg-title">Priority score</span>
                        {[['≥ 60 critical', '#C0392B'], ['40–59 high', '#E67E22'], ['< 40', '#27AE60']].map(([l, c]) => (
                            <span key={l} className="snav-leg-item"><span className="snav-leg-dot" style={{ background: c }} /><span>{l}</span></span>
                        ))}
                    </>)}
                </div>
            </nav>

            {/* ══ BOTTOM: STATS BAR ══ */}
            {!selectedCountry && (
                <div className="stats-footer" role="status" aria-live="polite">
                    <div className="sf-icon-wrap" style={{ background: `${issueColor}18`, border: `1px solid ${issueColor}35` }}>
                        <IssueIcon size={16} color={issueColor} aria-hidden="true" />
                    </div>
                    <div className="sf-item">
                        <span className="sf-val" style={{ color: issueColor }}>{issueMeta.short || activeIssue}</span>
                        <span className="sf-lbl">
                            {mapMode === 'funding' ? 'Funding gap' : mapMode === 'efficiency' ? 'Cost efficiency' : 'Priority index'}
                        </span>
                    </div>
                    <div className="sf-sep" />
                    <div className="sf-item">
                        <span className="sf-val" style={{ color: '#C0392B' }}>{fmt(totalGap)}</span>
                        <span className="sf-lbl">Total funding gap</span>
                    </div>
                    <div className="sf-sep" />
                    <div className="sf-item">
                        <span className="sf-val" style={{ color: pctColor(avgFunded) }}>{avgFunded.toFixed(0)}%</span>
                        <span className="sf-lbl">Avg. funded</span>
                    </div>
                    {totalTargeted > 0 && (<>
                        <div className="sf-sep" />
                        <div className="sf-item">
                            <span className="sf-val">{fmtN(totalTargeted)}</span>
                            <span className="sf-lbl">People targeted</span>
                        </div>
                    </>)}
                </div>
            )}

            {/* Loading */}
            <AnimatePresence>
                {loading && (
                    <motion.div className="loading-overlay"
                        initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                        <div className="loading-spinner" />
                        <p>Loading humanitarian data…</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal */}
            <AnimatePresence>
                {selectedCountry && (
                    <CountryModal
                        country={selectedCountry}
                        onClose={() => setSelectedCode(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}