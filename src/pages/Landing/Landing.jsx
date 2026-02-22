import { useState, useEffect, useCallback, useRef } from 'react';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Users, DollarSign, TrendingDown,
  Wheat, Heart, Droplets, Home, ShieldCheck, BookOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { fetchAllCountries, ISSUE_CATEGORIES } from '../../services/api';
import CountryModal from '../../components/CountryModal/CountryModal';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Landing.css';

const MAPBOX_TOKEN =
  import.meta.env.VITE_MAPBOX_TOKEN ||
  'pk.eyJ1IjoiZGVtby1hY2NvdW50IiwiYSI6ImNsdnR5cWVxejBhbTcyanBtdzV0dTl1MmYifQ.demo';

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${(n / 1e3).toFixed(0)}K`;
};

const pctToColor = (pct) => {
  // Red → Orange → Yellow → Green gradient
  if (pct === null || pct === undefined) return '#334155';
  if (pct < 10)  return '#b91c1c';
  if (pct < 20)  return '#ef4444';
  if (pct < 35)  return '#f97316';
  if (pct < 50)  return '#eab308';
  if (pct < 70)  return '#84cc16';
  return '#22c55e';
};

const ISSUE_META = {
  'Food Security': { icon: Wheat,       color: '#f59e0b' },
  Health:          { icon: Heart,        color: '#ef4444' },
  WASH:            { icon: Droplets,     color: '#38bdf8' },
  Shelter:         { icon: Home,         color: '#a78bfa' },
  Protection:      { icon: ShieldCheck,  color: '#34d399' },
  Education:       { icon: BookOpen,     color: '#fb923c' },
};

// ── Map hover popup (mini, no chart) ──────────────────────────────
function HoverPopup({ country, activeIssue }) {
  if (!country) return null;
  const pct = country.issue_pct_funded?.[activeIssue];
  const latestCbpf = country.cbpf_timeline?.at(-1);
  const cbpfGap = latestCbpf
    ? latestCbpf.cbpf_target - latestCbpf.cbpf_funding
    : null;

  return (
    <div className="map-hover-popup">
      <div className="mhp-name">{country.name}</div>
      <div className="mhp-issue">
        {activeIssue} funding
        <span
          className="mhp-pct"
          style={{ color: pctToColor(pct) }}
        >
          {pct != null ? `${pct}%` : 'N/A'}
        </span>
      </div>

      {/* Mini funding bar */}
      {pct != null && (
        <div className="mhp-bar-track">
          <div
            className="mhp-bar-fill"
            style={{ width: `${Math.min(pct, 100)}%`, background: pctToColor(pct) }}
          />
        </div>
      )}

      {/* CBPF gap from latest year */}
      {latestCbpf && (
        <div className="mhp-gap">
          <span className="mhp-gap-label">CBPF gap {latestCbpf.year}:</span>
          <span style={{ color: '#ef4444', fontWeight: 700 }}>
            {cbpfGap > 0 ? fmt(cbpfGap) : 'Fully met'}
          </span>
        </div>
      )}

      {country.affected?.total > 0 && (
        <div className="mhp-affected">
          <Users size={10} />
          {(country.affected.total / 1e6).toFixed(1)}M people targeted
        </div>
      )}

      <p className="mhp-hint">Click for full analysis ↗</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export default function Landing() {
  const { theme } = useTheme();
  const navigate  = useNavigate();
  const mapRef    = useRef(null);

  const [countries,    setCountries]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [mapLoaded,    setMapLoaded]    = useState(false);
  const [activeIssue,  setActiveIssue]  = useState('Food Security');
  const [hoveredCode,  setHoveredCode]  = useState(null);
  const [hoveredPos,   setHoveredPos]   = useState(null); // {lat, lng}
  const [selectedCode, setSelectedCode] = useState(null); // for modal

  useEffect(() => {
    fetchAllCountries()
      .then(setCountries)
      .finally(() => setLoading(false));
  }, []);

  // ── Build GeoJSON for current issue ────────────────────────────
  const geojson = {
    type: 'FeatureCollection',
    features: countries
      .filter((c) => c.lat && c.lng)
      .map((c) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        properties: {
          code: c.code,
          name: c.name,
          pct:  c.issue_pct_funded?.[activeIssue] ?? -1,
          total_affected: c.affected?.total ?? 0,
        },
      })),
  };

  // ── Map paint expressions ───────────────────────────────────────
  const circleColor = [
    'case',
    ['<', ['get', 'pct'], 0],  '#334155',
    ['<', ['get', 'pct'], 10], '#b91c1c',
    ['<', ['get', 'pct'], 20], '#ef4444',
    ['<', ['get', 'pct'], 35], '#f97316',
    ['<', ['get', 'pct'], 50], '#eab308',
    ['<', ['get', 'pct'], 70], '#84cc16',
    '#22c55e',
  ];

  // Scale circle by total affected (min 8 max 28 at zoom 3)
  const circleRadius = [
    'interpolate', ['linear'], ['zoom'],
    1, ['interpolate', ['linear'], ['get', 'total_affected'], 0, 5, 5000000, 10],
    5, ['interpolate', ['linear'], ['get', 'total_affected'], 0, 9, 5000000, 24],
  ];

  // ── Interaction handlers ────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const feat = e.features?.[0];
    if (feat) {
      const code = feat.properties.code;
      setHoveredCode(code);
      setHoveredPos({
        lat: feat.geometry.coordinates[1],
        lng: feat.geometry.coordinates[0],
      });
    } else {
      setHoveredCode(null);
      setHoveredPos(null);
    }
  }, []);

  const handleClick = useCallback((e) => {
    const feat = e.features?.[0];
    if (feat?.properties?.code) {
      setSelectedCode(feat.properties.code);
    }
  }, []);

  const hoveredCountry = countries.find((c) => c.code === hoveredCode) ?? null;
  const selectedCountry = countries.find((c) => c.code === selectedCode) ?? null;

  // ── Summary stats ───────────────────────────────────────────────
  const issueCountries = countries.filter(
    (c) => c.issue_pct_funded?.[activeIssue] !== undefined,
  );
  const totalGap = issueCountries.reduce((sum, c) => {
    const bd = c.cluster_breakdown?.[activeIssue];
    return sum + (bd ? bd.req - bd.fund : 0);
  }, 0);
  const worstCountry = [...issueCountries].sort(
    (a, b) => (a.issue_pct_funded[activeIssue] ?? 100) - (b.issue_pct_funded[activeIssue] ?? 100),
  )[0];
  const totalAffected = countries.reduce((s, c) => s + (c.affected?.total ?? 0), 0);

  return (
    <div className="landing-page">
      {/* ── Map ── */}
      <div className="map-container">
        <Map
          ref={mapRef}
          initialViewState={{ latitude: 15, longitude: 25, zoom: 2.2, pitch: 10 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle={
            theme === 'dark'
              ? 'mapbox://styles/mapbox/dark-v11'
              : 'mapbox://styles/mapbox/light-v11'
          }
          mapboxAccessToken={MAPBOX_TOKEN}
          onLoad={() => setMapLoaded(true)}
          interactiveLayerIds={['crisis-points']}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { setHoveredCode(null); setHoveredPos(null); }}
          onClick={handleClick}
          cursor={hoveredCode ? 'pointer' : 'grab'}
          fog={{
            color:        theme === 'dark' ? '#060d1a' : '#f0f4fb',
            'high-color': theme === 'dark' ? '#0f1e38' : '#d8e6f4',
            'space-color': theme === 'dark' ? '#000008' : '#c8d8ee',
          }}
        >
          <NavigationControl position="bottom-right" />

          {mapLoaded && (
            <Source id="crisis" type="geojson" data={geojson} generateId>
              {/* Glow ring */}
              <Layer
                id="crisis-glow"
                type="circle"
                paint={{
                  'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    1, 14, 5, 36,
                  ],
                  'circle-color': circleColor,
                  'circle-opacity': 0.08,
                  'circle-blur': 1,
                }}
              />
              {/* Main dot */}
              <Layer
                id="crisis-points"
                type="circle"
                paint={{
                  'circle-radius': circleRadius,
                  'circle-color':  circleColor,
                  'circle-stroke-width': 1.5,
                  'circle-stroke-color': 'rgba(255,255,255,0.18)',
                  'circle-opacity': [
                    'case',
                    ['==', ['get', 'code'], hoveredCode ?? ''], 1,
                    0.82,
                  ],
                }}
              />
            </Source>
          )}

          {/* Hover popup */}
          {hoveredCountry && hoveredPos && (
            <Popup
              latitude={hoveredPos.lat}
              longitude={hoveredPos.lng}
              closeButton={false}
              closeOnClick={false}
              anchor="bottom"
              offset={18}
              className="map-popup-wrapper"
            >
              <HoverPopup
                country={hoveredCountry}
                activeIssue={activeIssue}
              />
            </Popup>
          )}
        </Map>
      </div>

      {/* ── Issue filter tabs ── */}
      <div className="issue-tabs-bar">
        <div className="issue-tabs-inner">
          {ISSUE_CATEGORIES.map((issue) => {
            const meta  = ISSUE_META[issue] || {};
            const Icon  = meta.icon || AlertTriangle;
            const color = meta.color || '#94a3b8';
            const active = activeIssue === issue;
            return (
              <button
                key={issue}
                className={`issue-tab ${active ? 'issue-tab--active' : ''}`}
                style={{ '--ic': color }}
                onClick={() => setActiveIssue(issue)}
              >
                <Icon size={13} />
                <span>{issue}</span>
              </button>
            );
          })}
        </div>

        {/* Severity legend */}
        <div className="severity-legend">
          <span className="sl-label">Funding %</span>
          {[
            { label: '<10%',  color: '#b91c1c' },
            { label: '10–35%', color: '#f97316' },
            { label: '35–70%', color: '#eab308' },
            { label: '>70%',  color: '#22c55e' },
          ].map((s) => (
            <span key={s.label} className="sl-item">
              <span className="sl-dot" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Hero overlay ── */}
      <div className="hero-overlay">
        <motion.div
          className="hero-content"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          <div className="hero-badge">
            <AlertTriangle size={13} />
            <span>GLOBAL HUMANITARIAN DATA PLATFORM</span>
          </div>

          <h1 className="hero-title">
            Underfunded.<br />
            <span className="text-accent">Overlooked.</span><br />
            Unforgotten.
          </h1>

          <p className="hero-subtitle">
            CBPF funding gaps across {issueCountries.length} crisis zones.
            Filter by issue above — click any circle for full analysis.
          </p>

          <div className="hero-actions">
            <button className="btn-primary" onClick={() => navigate('/wiki')}>
              Explore Knowledge Base
            </button>
            <button className="btn-secondary" onClick={() => navigate('/forecast')}>
              Disaster Forecast
            </button>
          </div>
        </motion.div>

        {/* ── Stats bar ── */}
        <motion.div
          className="stats-bar glass"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55 }}
        >
          {/* Active issue */}
          <div className="stat-item">
            <div className="stat-icon stat-icon--issue">
              {(() => {
                const Icon = ISSUE_META[activeIssue]?.icon || AlertTriangle;
                return <Icon size={20} color={ISSUE_META[activeIssue]?.color} />;
              })()}
            </div>
            <div>
              <div className="stat-value stat-value--issue"
                   style={{ color: ISSUE_META[activeIssue]?.color }}>
                {activeIssue}
              </div>
              <div className="stat-label">Active filter</div>
            </div>
          </div>

          <div className="stat-divider" />

          <div className="stat-item">
            <div className="stat-icon"><TrendingDown size={20} /></div>
            <div>
              <div className="stat-value danger">{fmt(totalGap)}</div>
              <div className="stat-label">Funding gap ({activeIssue})</div>
            </div>
          </div>

          <div className="stat-divider" />

          {worstCountry && (
            <>
              <div
                className="stat-item stat-item--clickable"
                onClick={() => setSelectedCode(worstCountry.code)}
                title={`Open ${worstCountry.name}`}
              >
                <div className="stat-icon"><AlertTriangle size={20} /></div>
                <div>
                  <div className="stat-value" style={{ color: '#ef4444' }}>
                    {worstCountry.name}
                  </div>
                  <div className="stat-label">
                    Most underfunded —{' '}
                    {worstCountry.issue_pct_funded[activeIssue]}% funded
                  </div>
                </div>
              </div>
              <div className="stat-divider" />
            </>
          )}

          <div className="stat-item">
            <div className="stat-icon"><Users size={20} /></div>
            <div>
              <div className="stat-value">
                {totalAffected >= 1e6
                  ? `${(totalAffected / 1e6).toFixed(0)}M+`
                  : `${(totalAffected / 1e3).toFixed(0)}K+`}
              </div>
              <div className="stat-label">People targeted (all crises)</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Loading overlay ── */}
      <AnimatePresence>
        {loading && (
          <motion.div
            className="loading-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="loading-spinner" />
            <p>Loading crisis data…</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Country modal ── */}
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