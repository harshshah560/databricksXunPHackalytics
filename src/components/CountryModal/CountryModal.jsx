import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  X, Heart, Droplets, BookOpen, Home, ShieldCheck, Wheat, Activity,
  Users, Baby, AlertCircle
} from 'lucide-react';
import './CountryModal.css';

// ── Formatting helpers ────────────────────────────────────────────
const fmt = (n) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};
const fmtPeople = (n) => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
};
const pctColor = (pct) => {
  if (pct < 20) return '#ef4444';
  if (pct < 40) return '#f97316';
  if (pct < 60) return '#eab308';
  if (pct < 80) return '#84cc16';
  return '#22c55e';
};

// ── Issue icon map ────────────────────────────────────────────────
const ISSUE_ICONS = {
  'Food Security': Wheat,
  Health: Heart,
  Water: Droplets,
  Shelter: Home,
  Protection: ShieldCheck,
  Education: BookOpen,
};

const ISSUE_COLORS = {
  'Food Security': '#f59e0b',
  Health: '#ef4444',
  Water: '#38bdf8',
  Shelter: '#a78bfa',
  Protection: '#34d399',
  Education: '#fb923c',
};

// ── Pictogram component ───────────────────────────────────────────
const TOTAL_ICONS = 80; // total person-icons in pictogram

function Pictogram({ boys, girls, men, women }) {
  const total = boys + girls + men + women;
  if (total === 0) return <p className="cm-no-data">No demographic data available</p>;

  const children = boys + girls;
  const adults = men + women;
  const childCount = Math.round((children / total) * TOTAL_ICONS);
  const adultCount = TOTAL_ICONS - childCount;

  const icons = [
    ...Array(childCount).fill('child'),
    ...Array(adultCount).fill('adult'),
  ];

  return (
    <div className="pictogram-wrap">
      <div className="pictogram-grid">
        {icons.map((type, i) => (
          <svg
            key={i}
            className={`person-icon person-icon--${type}`}
            viewBox="0 0 20 36"
            width="18"
            height="32"
          >
            {/* head */}
            <circle cx="10" cy={type === 'child' ? 5 : 4} r={type === 'child' ? 4 : 3.5} />
            {/* body */}
            {type === 'child' ? (
              <>
                <line x1="10" y1="9" x2="10" y2="22" strokeWidth="2.5" />
                <line x1="10" y1="13" x2="5" y2="18" strokeWidth="2" />
                <line x1="10" y1="13" x2="15" y2="18" strokeWidth="2" />
                <line x1="10" y1="22" x2="6" y2="30" strokeWidth="2" />
                <line x1="10" y1="22" x2="14" y2="30" strokeWidth="2" />
              </>
            ) : (
              <>
                <line x1="10" y1="8" x2="10" y2="22" strokeWidth="2.5" />
                <line x1="10" y1="12" x2="4" y2="17" strokeWidth="2" />
                <line x1="10" y1="12" x2="16" y2="17" strokeWidth="2" />
                <line x1="10" y1="22" x2="6" y2="32" strokeWidth="2" />
                <line x1="10" y1="22" x2="14" y2="32" strokeWidth="2" />
              </>
            )}
          </svg>
        ))}
      </div>
      <div className="pictogram-legend">
        <span className="pleg-child">
          <span className="pleg-dot" />
          Children — {fmtPeople(children)}
          <span className="pleg-pct">({total > 0 ? Math.round(children / total * 100) : 0}%)</span>
        </span>
        <span className="pleg-adult">
          <span className="pleg-dot" />
          Adults — {fmtPeople(adults)}
          <span className="pleg-pct">({total > 0 ? Math.round(adults / total * 100) : 0}%)</span>
        </span>
      </div>
    </div>
  );
}

// ── Custom tooltip for charts ─────────────────────────────────────
function FundingTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="ct-label">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

function PctTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p style={{ color: payload[0].payload.fill }}>
        {payload[0].name}: {fmtPeople(payload[0].value)}
        {' '}({payload[0].payload.pct}%)
      </p>
    </div>
  );
}

// ── Stat badge ────────────────────────────────────────────────────
function StatBadge({ label, value, note, accent }) {
  return (
    <div className="stat-badge" style={{ '--accent': accent }}>
      <div className="sb-value">{value}</div>
      <div className="sb-label">{label}</div>
      {note && <div className="sb-note">{note}</div>}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────
export default function CountryModal({ country, onClose }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!country) return null;

  const { name, cbpf_timeline, cluster_breakdown, affected, world, pop_impact_pct } = country;

  // ── 1. CBPF Timeline data ─────────────────────────────────────
  const timelineData = cbpf_timeline.map((d) => ({
    year: d.year,
    Received: d.cbpf_funding,
    Target: d.cbpf_target,
  }));

  // ── 2. Cluster breakdown bars (sorted worst first) ─────────────
  const clusterData = Object.entries(cluster_breakdown)
    .map(([cat, v]) => ({
      name: cat,
      Required: v.req,
      Funded: v.fund,
      pct: v.pct,
      fill: ISSUE_COLORS[cat] || '#94a3b8',
    }))
    .sort((a, b) => a.pct - b.pct);

  // ── 3. Children vs Adults pie ──────────────────────────────────
  const { boys, girls, men, women, total } = affected;
  const children = boys + girls;
  const adults = men + women;
  const demoPie = total > 0 ? [
    { name: 'Children', value: children, pct: Math.round(children / total * 100), fill: '#fb923c' },
    { name: 'Adults', value: adults, pct: Math.round(adults / total * 100), fill: '#60a5fa' },
  ] : [];

  // ── 4. Population impact pie ───────────────────────────────────
  const popImpactPie = world.population > 0 ? [
    { name: 'Targeted', value: total, pct: pop_impact_pct, fill: '#ef4444' },
    { name: 'Not in crisis', value: Math.max(world.population - total, 0), pct: 100 - pop_impact_pct, fill: '#1e293b' },
  ] : [];

  // ── Latest CBPF gap ────────────────────────────────────────────
  const latest = cbpf_timeline[cbpf_timeline.length - 1];
  const gap = latest ? latest.cbpf_target - latest.cbpf_funding : 0;
  const latestPct = latest && latest.cbpf_target > 0
    ? Math.round((latest.cbpf_funding / latest.cbpf_target) * 100) : 0;

  const wi = world;

  return (
    <AnimatePresence>
      <motion.div
        className="cm-overlay"
        ref={overlayRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      >
        <motion.div
          className="cm-panel"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* ── Header ── */}
          <div className="cm-header">
            <div className="cm-header-left">
              <h2 className="cm-country-name">{name}</h2>
              <div className="cm-header-badges">
                {wi.vulnerability_score > 0 && (
                  <span className="cm-badge cm-badge-vuln">
                    Vulnerability score: {wi.vulnerability_score}
                  </span>
                )}
              </div>
            </div>
            <button className="cm-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>

          {/* ── Scrollable body ── */}
          <div className="cm-body">

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 1 — CBPF FUNDING TIMELINE
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="cm-section">
              <h3 className="cm-section-title">
                <Activity size={16} />
                CBPF Funding History
                <span className="cm-section-sub">2018 – 2025</span>
              </h3>

              {gap > 0 && (
                <div className="cm-alert">
                  <AlertCircle size={14} />
                  <span>
                    Funding gap in {latest?.year}: <strong>{fmt(gap)}</strong> — only{' '}
                    <strong style={{ color: pctColor(latestPct) }}>{latestPct}%</strong> of
                    the CBPF target was met.
                  </span>
                </div>
              )}

              {timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={timelineData} margin={{ top: 8, right: 16, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradTarget" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#475569" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#475569" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gradFund" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.7} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => fmt(v)} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip content={<FundingTooltip />} />
                    <Area type="monotone" dataKey="Target" stroke="#475569" fill="url(#gradTarget)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                    <Area type="monotone" dataKey="Received" stroke="#38bdf8" fill="url(#gradFund)" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8' }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="cm-no-data">No CBPF timeline data available</p>
              )}
            </section>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 2 — ISSUE BREAKDOWN
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="cm-section">
              <h3 className="cm-section-title">
                <AlertCircle size={16} />
                Funding by Issue
                <span className="cm-section-sub">Required vs. funded (CBPF cluster data)</span>
              </h3>

              {clusterData.length > 0 ? (
                <div className="issue-bars">
                  {clusterData.map((d) => {
                    const Icon = ISSUE_ICONS[d.name] || AlertCircle;
                    return (
                      <div key={d.name} className="issue-bar-row">
                        <div className="issue-bar-label">
                          <Icon size={13} color={d.fill} />
                          <span>{d.name}</span>
                        </div>
                        <div className="issue-bar-track">
                          <div
                            className="issue-bar-fill"
                            style={{
                              width: `${Math.min(d.pct, 100)}%`,
                              background: pctColor(d.pct),
                            }}
                          />
                        </div>
                        <div className="issue-bar-stats">
                          <span className="ib-pct" style={{ color: pctColor(d.pct) }}>
                            {d.pct}%
                          </span>
                          <span className="ib-gap">
                            gap: {fmt(d.Required - d.Funded)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="cm-no-data">No cluster breakdown available</p>
              )}
            </section>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 3 — PICTOGRAM + DEMOGRAPHICS PIE
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="cm-section">
              <h3 className="cm-section-title">
                <Users size={16} />
                Affected People
                {total > 0 && (
                  <span className="cm-section-sub">
                    {fmtPeople(total)} people targeted for assistance
                  </span>
                )}
              </h3>

              <div className="cm-row-split">
                {/* Left: pictogram */}
                <div className="cm-col">
                  <p className="cm-col-label">
                    <Baby size={12} /> Children vs Adults
                  </p>
                  <Pictogram boys={boys} girls={girls} men={men} women={women} />
                </div>

                {/* Right: pie */}
                <div className="cm-col">
                  <p className="cm-col-label">Demographic split</p>
                  {demoPie.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={demoPie}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {demoPie.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip content={<PctTooltip />} />
                        <Legend
                          iconType="circle"
                          iconSize={9}
                          wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="cm-no-data">No demographic data</p>
                  )}
                </div>
              </div>
            </section>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SECTION 4 — POPULATION IMPACT + HEALTH STATS
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="cm-section">
              <h3 className="cm-section-title">
                <Activity size={16} />
                Country Context
                <span className="cm-section-sub">Health &amp; population indicators</span>
              </h3>

              <div className="cm-row-split">
                {/* Left: population pie */}
                <div className="cm-col">
                  <p className="cm-col-label">% of population in need</p>
                  {popImpactPie.length > 0 ? (
                    <div className="pop-pie-wrap">
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            data={popImpactPie}
                            cx="50%"
                            cy="50%"
                            startAngle={90}
                            endAngle={-270}
                            innerRadius={48}
                            outerRadius={70}
                            paddingAngle={2}
                            dataKey="value"
                            strokeWidth={0}
                          >
                            {popImpactPie.map((entry) => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pop-pie-center">
                        <span className="pop-pct" style={{ color: pctColor(100 - pop_impact_pct) }}>
                          {pop_impact_pct}%
                        </span>
                        <span className="pop-label">in need</span>
                      </div>
                      <div className="pop-pie-legend">
                        <span><span className="pop-dot pop-dot-need" />In need: {fmtPeople(total)}</span>
                        <span><span className="pop-dot pop-dot-safe" />Total pop: {fmtPeople(wi.population)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="cm-no-data">Population data unavailable</p>
                  )}
                </div>

                {/* Right: stat badges */}
                <div className="cm-col">
                  <p className="cm-col-label">Health indicators</p>
                  <div className="stat-badges-grid">
                    {wi.life_expectancy > 0 && (
                      <StatBadge
                        label="Life expectancy"
                        value={`${wi.life_expectancy} yrs`}
                        note="Global avg: 73"
                        accent={wi.life_expectancy < 60 ? '#ef4444' : wi.life_expectancy < 68 ? '#f97316' : '#22c55e'}
                      />
                    )}
                    {wi.infant_mortality > 0 && (
                      <StatBadge
                        label="Infant mortality"
                        value={`${wi.infant_mortality}/1K`}
                        note="Deaths per 1,000 births"
                        accent={wi.infant_mortality > 60 ? '#ef4444' : wi.infant_mortality > 30 ? '#f97316' : '#22c55e'}
                      />
                    )}
                    {wi.maternal_mortality_ratio > 0 && (
                      <StatBadge
                        label="Maternal mortality"
                        value={`${wi.maternal_mortality_ratio}/100K`}
                        note="Per 100K live births"
                        accent={wi.maternal_mortality_ratio > 500 ? '#ef4444' : wi.maternal_mortality_ratio > 200 ? '#f97316' : '#22c55e'}
                      />
                    )}
                    {wi.physicians_per_thousand > 0 && (
                      <StatBadge
                        label="Doctors"
                        value={`${wi.physicians_per_thousand}/1K`}
                        note="Physicians per 1,000 people"
                        accent={wi.physicians_per_thousand < 0.5 ? '#ef4444' : wi.physicians_per_thousand < 1.5 ? '#f97316' : '#22c55e'}
                      />
                    )}
                    {wi.unemployment_rate > 0 && (
                      <StatBadge
                        label="Unemployment"
                        value={`${wi.unemployment_rate}%`}
                        accent={wi.unemployment_rate > 20 ? '#ef4444' : wi.unemployment_rate > 10 ? '#f97316' : '#94a3b8'}
                      />
                    )}
                    {wi.vulnerability_score > 0 && (
                      <StatBadge
                        label="Vulnerability score"
                        value={wi.vulnerability_score}
                        note="Higher = more vulnerable"
                        accent={wi.vulnerability_score > 65 ? '#ef4444' : wi.vulnerability_score > 45 ? '#f97316' : '#22c55e'}
                      />
                    )}
                  </div>
                </div>
              </div>
            </section>

          </div>{/* end cm-body */}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}