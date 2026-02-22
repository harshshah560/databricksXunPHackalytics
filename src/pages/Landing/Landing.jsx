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
  'Education':                  { icon: BookOpen,   color: '#F5A623', short: 'Edu.'    },
  'Emergency Shelter & NFI':    { icon: Home,        color: '#7B61FF', short: 'Shelter' },
  'Food Security & Agriculture':{ icon: Wheat,       color: '#D4890A', short: 'Food'    },
  'Health':                     { icon: Heart,       color: '#C0392B', short: 'Health'  },
  'Nutrition':                  { icon: Apple,       color: '#D63384', short: 'Nutr.'   },
  'Protection':                 { icon: ShieldCheck, color: '#009EDB', short: 'Prot.'   },
  'Water, Sanitation, Hygiene': { icon: Droplets,    color: '#0070C0', short: 'WASH'    },
};

// ISO-3 → Mapbox name_en for choropleth
const ISO3_MAPBOX = {
  AFG:'Afghanistan', BFA:'Burkina Faso', CAF:'Central African Republic',
  COD:'Democratic Republic of the Congo', COL:'Colombia', ETH:'Ethiopia',
  HTI:'Haiti', IRQ:'Iraq', LBN:'Lebanon', MLI:'Mali', MMR:'Myanmar',
  MOZ:'Mozambique', NER:'Niger', NGA:'Nigeria', PSE:'Palestine',
  SDN:'Sudan', SOM:'Somalia', SSD:'South Sudan', SYR:'Syria',
  TCD:'Chad', UKR:'Ukraine', VEN:'Venezuela', YEM:'Yemen',
};

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
  if (pct < 10)  return '#C0392B';
  if (pct < 20)  return '#E74C3C';
  if (pct < 35)  return '#E67E22';
  if (pct < 50)  return '#F39C12';
  if (pct < 70)  return '#7CB342';
  return '#27AE60';
};

// ── Hover popup — compact, pie + gender ───────────────────────────
function HoverPopup({ country, activeIssue, onExpand }) {
  const pct  = country.issue_pct_funded?.[activeIssue];
  const bd   = country.cluster_breakdown?.[activeIssue];
  const wi   = country.world || {};
  const meta = ISSUE_META[activeIssue] || {};
  const Icon = meta.icon || AlertTriangle;

  const { boys=0, girls=0, men=0, women=0, total=0 } = country.affected || {};
  const children   = boys + girls;
  const adults     = men + women;
  const childPct   = total > 0 ? Math.round(children / total * 100) : 0;

  // Gender breakdown bars (targeted)
  const genderBars = [
    { label: 'Boys',   val: boys,  color: '#4A90D9', pct: total > 0 ? boys/total*100 : 0 },
    { label: 'Girls',  val: girls, color: '#E91E8C', pct: total > 0 ? girls/total*100 : 0 },
    { label: 'Men',    val: men,   color: '#1565C0', pct: total > 0 ? men/total*100 : 0 },
    { label: 'Women',  val: women, color: '#AD1457', pct: total > 0 ? women/total*100 : 0 },
  ].filter(g => g.val > 0);

  // Donut: funded vs gap
  const funded = bd?.fund || 0;
  const needed = bd?.req  || 0;
  const gap    = bd?.gap  || 0;
  const pieData = needed > 0 ? [
    { name: 'Funded',  value: funded, color: pctColor(pct) },
    { name: 'Unfunded', value: gap,   color: '#E5E9F0' },
  ] : [];

  // People impacted by this sector
  const targetedPeople = bd?.targeted_people || 0;
  const reachedPeople  = bd?.reached_people  || 0;

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
        {/* Left: donut */}
        <div className="hpop-donut-wrap">
          <ResponsiveContainer width={96} height={96}>
            <PieChart>
              <Pie
                data={pieData.length ? pieData : [{ name:'No data', value:1, color:'#E5E9F0' }]}
                cx="50%" cy="50%"
                innerRadius={28} outerRadius={42}
                startAngle={90} endAngle={-270}
                paddingAngle={pieData.length > 1 ? 2 : 0}
                dataKey="value"
                strokeWidth={0}
              >
                {(pieData.length ? pieData : [{ color:'#E5E9F0' }]).map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val, name) => [name === 'Funded' ? `${pct}%` : fmt(val), name]}
                contentStyle={{
                  background: 'var(--hpop-bg)',
                  border: '1px solid var(--hpop-border)',
                  borderRadius: 6,
                  fontSize: 11,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="hpop-donut-center">
            <span className="hpop-pct-big" style={{ color: pctColor(pct) }}>
              {pct != null ? `${pct}%` : '—'}
            </span>
            <span className="hpop-pct-sub">funded</span>
          </div>
        </div>

        {/* Right: stats */}
        <div className="hpop-stats">
          <div className="hpop-stat-row">
            <span className="hpop-stat-label">Required</span>
            <span className="hpop-stat-val">{fmt(needed)}</span>
          </div>
          <div className="hpop-stat-row hpop-stat-row--funded">
            <span className="hpop-stat-label">Funded</span>
            <span className="hpop-stat-val" style={{ color: pctColor(pct) }}>{fmt(funded)}</span>
          </div>
          <div className="hpop-stat-row hpop-stat-row--gap">
            <span className="hpop-stat-label">Gap</span>
            <span className="hpop-stat-val hpop-gap-val">{fmt(gap)}</span>
          </div>

          {targetedPeople > 0 && (
            <div className="hpop-stat-row hpop-stat-row--people">
              <span className="hpop-stat-label">People targeted</span>
              <span className="hpop-stat-val">{fmtN(targetedPeople)}</span>
            </div>
          )}
          {reachedPeople > 0 && (
            <div className="hpop-stat-row">
              <span className="hpop-stat-label">People reached</span>
              <span className="hpop-stat-val" style={{ color: '#27AE60' }}>{fmtN(reachedPeople)}</span>
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
  const { theme }   = useTheme();
  const mapRef      = useRef(null);

  const [countries,    setCountries]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [mapLoaded,    setMapLoaded]    = useState(false);
  const [activeIssue,  setActiveIssue]  = useState('Food Security & Agriculture');
  const [hoveredCode,  setHoveredCode]  = useState(null);
  const [hoveredPos,   setHoveredPos]   = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);

  // Load from CSV via dataService (synchronous after first parse)
  useEffect(() => {
    const data = getCountries();
    setCountries(data);
    setLoading(false);
  }, []);

  // Choropleth fill expression
  const fillExpr = useMemo(() => {
    if (!countries.length) return 'rgba(0,0,0,0)';
    const expr = ['match', ['get', 'name_en']];
    countries.forEach(c => {
      const mb = ISO3_MAPBOX[c.code];
      if (!mb) return;
      expr.push(mb, pctColor(c.issue_pct_funded?.[activeIssue] ?? -1));
    });
    expr.push('rgba(0,0,0,0)');
    return expr;
  }, [countries, activeIssue]);

  const hoveredMapboxName = ISO3_MAPBOX[hoveredCode ?? ''] ?? '__none__';

  const fillOpacityExpr = useMemo(() => [
    'case', ['==', ['get','name_en'], hoveredMapboxName], 0.78, 0.50,
  ], [hoveredMapboxName]);

  const outlineWidthExpr = useMemo(() => [
    'case', ['==', ['get','name_en'], hoveredMapboxName], 2.5, 0.5,
  ], [hoveredMapboxName]);

  const geojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: countries.filter(c => c.lat && c.lng).map(c => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: {
        code: c.code,
        pct:  c.issue_pct_funded?.[activeIssue] ?? -1,
        total_affected: c.affected?.total ?? 0,
      },
    })),
  }), [countries, activeIssue]);

  const circleColor = ['case',
    ['<',['get','pct'],0], 'rgba(0,0,0,0)',
    ['<',['get','pct'],10], '#C0392B',
    ['<',['get','pct'],20], '#E74C3C',
    ['<',['get','pct'],35], '#E67E22',
    ['<',['get','pct'],50], '#F39C12',
    ['<',['get','pct'],70], '#7CB342',
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

  const hoveredCountry  = countries.find(c => c.code === hoveredCode) ?? null;
  const selectedCountry = countries.find(c => c.code === selectedCode) ?? null;

  // Summary stats
  const issueMeta    = ISSUE_META[activeIssue] || {};
  const IssueIcon    = issueMeta.icon || AlertTriangle;
  const issueColor   = issueMeta.color || '#009EDB';
  const issueSet     = countries.filter(c => c.issue_pct_funded?.[activeIssue] != null);
  const totalGap     = issueSet.reduce((s,c) => s + (c.cluster_breakdown?.[activeIssue]?.gap || 0), 0);
  const avgFunded    = issueSet.length
    ? issueSet.reduce((s,c) => s + (c.issue_pct_funded[activeIssue]||0), 0) / issueSet.length : 0;
  const totalTargeted = issueSet.reduce((s,c) => s + (c.cluster_breakdown?.[activeIssue]?.targeted_people||0), 0);

  // Popup anchor: if country is in top half, show below; otherwise above
  const popupAnchor = useMemo(() => {
    if (!hoveredPos) return 'bottom';
    return hoveredPos.lat > 20 ? 'bottom' : 'top';
  }, [hoveredPos]);

  return (
    <div className="landing-page">

      {/* MAP */}
      <div className="map-container">
        <Map
          ref={mapRef}
          initialViewState={{ latitude: 10, longitude: 25, zoom: 2.1, pitch: 0 }}
          style={{ width:'100%', height:'100%' }}
          mapStyle={theme==='dark'
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
              <Layer id="country-fills" type="fill"
                source="composite" source-layer="country_label"
                beforeId="waterway-label"
                paint={{ 'fill-color': fillExpr, 'fill-opacity': fillOpacityExpr }} />
              <Layer id="country-lines" type="line"
                source="composite" source-layer="country_label"
                paint={{ 'line-color': fillExpr, 'line-width': outlineWidthExpr, 'line-opacity': 0.8 }} />
              <Source id="crisis" type="geojson" data={geojson} generateId>
                <Layer id="crisis-glow" type="circle" paint={{
                  'circle-radius': ['interpolate',['linear'],['zoom'],1,20,5,50],
                  'circle-color': circleColor,
                  'circle-opacity': 0.06, 'circle-blur': 1.5,
                }} />
                <Layer id="crisis-points" type="circle" paint={{
                  'circle-radius': ['interpolate',['linear'],['zoom'],1,4,5,10],
                  'circle-color':  circleColor,
                  'circle-stroke-width': 1.5,
                  'circle-stroke-color': theme==='dark'?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.8)',
                  'circle-opacity': ['case',['==',['get','code'],hoveredCode??''],1,0.75],
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
              offset={popupAnchor === 'bottom' ? 16 : -16}
              className="hpop-outer"
            >
              <HoverPopup
                country={hoveredCountry}
                activeIssue={activeIssue}
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

      {/* ══ RIGHT: VERTICAL SECTOR TABS ══ */}
      <nav className="sector-nav" aria-label="Filter by sector">
        <span className="sector-nav-eyebrow">Sector</span>
        {ISSUE_CATEGORIES.map(issue => {
          const m  = ISSUE_META[issue] || {};
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

        {/* Severity legend */}
        <div className="snav-legend" aria-label="Funding % severity scale">
          <span className="snav-leg-title">% Funded</span>
          {[
            ['< 10%',  '#C0392B'],
            ['10–35%', '#E67E22'],
            ['35–70%', '#F39C12'],
            ['> 70%',  '#27AE60'],
          ].map(([lbl, clr]) => (
            <span key={lbl} className="snav-leg-item">
              <span className="snav-leg-dot" style={{ background: clr }} />
              <span>{lbl}</span>
            </span>
          ))}
        </div>
      </nav>

      {/* ══ BOTTOM: ISSUE STATS BAR ══ */}
      <div className="stats-footer" role="status" aria-live="polite">
        <div className="sf-icon-wrap" style={{ background:`${issueColor}18`, border:`1px solid ${issueColor}35` }}>
          <IssueIcon size={16} color={issueColor} aria-hidden="true" />
        </div>
        <div className="sf-item">
          <span className="sf-val" style={{ color: issueColor }}>{issueMeta.short || activeIssue}</span>
          <span className="sf-lbl">{issueSet.length} crisis zones</span>
        </div>
        <div className="sf-sep" />
        <div className="sf-item">
          <span className="sf-val" style={{ color:'#C0392B' }}>{fmt(totalGap)}</span>
          <span className="sf-lbl">Funding gap</span>
        </div>
        <div className="sf-sep" />
        <div className="sf-item">
          <span className="sf-val" style={{ color: pctColor(avgFunded) }}>{avgFunded.toFixed(0)}%</span>
          <span className="sf-lbl">Avg. funded</span>
        </div>
        {totalTargeted > 0 && (
          <>
            <div className="sf-sep" />
            <div className="sf-item">
              <span className="sf-val">{fmtN(totalTargeted)}</span>
              <span className="sf-lbl">People targeted</span>
            </div>
          </>
        )}
      </div>

      {/* Loading */}
      <AnimatePresence>
        {loading && (
          <motion.div className="loading-overlay"
            initial={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.4 }}>
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