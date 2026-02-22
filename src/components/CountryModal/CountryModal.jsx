import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  X, Heart, Droplets, BookOpen, Home, ShieldCheck, Wheat,
  Activity, Users, Baby, AlertCircle, Apple, TrendingDown,
  ChevronDown, ChevronUp, MessageSquare,
} from 'lucide-react';
import './CountryModal.css';

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n) => {
  if (!n && n !== 0) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};
const fmtN = (n) => {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
};

// OCHA severity palette
const pctColor = (pct) => {
  if (pct == null) return 'var(--cm-muted)';
  if (pct < 10) return '#C0392B';
  if (pct < 20) return '#E74C3C';
  if (pct < 35) return '#E67E22';
  if (pct < 50) return '#F39C12';
  if (pct < 70) return '#7CB342';
  return '#27AE60';
};

// ── Issue meta ────────────────────────────────────────────────────
const ISSUE_META = {
  'Education':                  { icon: BookOpen,   color: '#F5A623' },
  'Emergency Shelter & NFI':    { icon: Home,        color: '#7B61FF' },
  'Food Security & Agriculture':{ icon: Wheat,       color: '#D4890A' },
  'Health':                     { icon: Heart,       color: '#C0392B' },
  'Nutrition':                  { icon: Apple,       color: '#D63384' },
  'Protection':                 { icon: ShieldCheck, color: '#009EDB' },
  'Water, Sanitation, Hygiene': { icon: Droplets,    color: '#0070C0' },
};

// ── Tooltips ──────────────────────────────────────────────────────
function PctTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="cm-tip">
      <span className="cm-tip-yr">{label}</span>
      {payload.map(p => (
        <span key={p.dataKey} style={{ color: p.color || p.stroke }}>
          {p.name}: <strong>{p.value}%</strong>
        </span>
      ))}
    </div>
  );
}

// CBPF two-line chart tooltip: shows $ amounts + % funded
function CbpfTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const target   = payload.find(p => p.dataKey === 'Target')?.value   ?? 0;
  const received = payload.find(p => p.dataKey === 'Received')?.value ?? 0;
  const pct      = target > 0 ? Math.round(received / target * 100)  : 0;
  const gap      = Math.max(target - received, 0);
  return (
    <div className="cm-tip cm-tip--cbpf">
      <span className="cm-tip-yr">{label}</span>
      <span style={{ color:'#94a3b8' }}>
        Target: <strong style={{ color:'var(--cm-text)' }}>{fmt(target)}</strong>
      </span>
      <span style={{ color:'#009EDB' }}>
        Received: <strong>{fmt(received)}</strong>
      </span>
      <div className="cm-tip-divider"/>
      <span style={{ color: pctColor(pct) }}>
        Funded: <strong>{pct}%</strong>
      </span>
      {gap > 0 && (
        <span style={{ color:'#C0392B' }}>
          Gap: <strong>{fmt(gap)}</strong>
        </span>
      )}
    </div>
  );
}

// ── Gender breakdown bars ─────────────────────────────────────────
function GenderBars({ affected }) {
  const { boys=0, girls=0, men=0, women=0, total=0,
          boys_reached=0, girls_reached=0, men_reached=0, women_reached=0 } = affected;

  if (total === 0) return <p className="cm-empty">No demographic data</p>;

  const groups = [
    { label: 'Boys',  targeted: boys,  reached: boys_reached,  color: '#4A90D9' },
    { label: 'Girls', targeted: girls, reached: girls_reached, color: '#E91E8C' },
    { label: 'Men',   targeted: men,   reached: men_reached,   color: '#1565C0' },
    { label: 'Women', targeted: women, reached: women_reached, color: '#AD1457' },
  ].filter(g => g.targeted > 0);

  return (
    <div className="cm-gender">
      {groups.map(g => {
        const tgtPct     = total > 0 ? g.targeted / total * 100 : 0;
        const reachPct   = g.targeted > 0 ? g.reached / g.targeted * 100 : 0;
        return (
          <div key={g.label} className="cm-gbar-row">
            <div className="cm-gbar-header">
              <span className="cm-gbar-name">{g.label}</span>
              <span className="cm-gbar-nums">
                <span className="cm-gbar-targeted">{fmtN(g.targeted)}</span>
                {g.reached > 0 && (
                  <span className="cm-gbar-reached" style={{ color: '#27AE60' }}>
                    {fmtN(g.reached)} reached
                  </span>
                )}
              </span>
            </div>
            {/* Targeted bar */}
            <div className="cm-gbar-track">
              <div className="cm-gbar-fill" style={{ width:`${tgtPct}%`, background: g.color }} />
              {g.reached > 0 && (
                <div className="cm-gbar-reach-fill"
                  style={{ width:`${tgtPct * reachPct / 100}%`, background: '#27AE60', opacity: 0.6 }} />
              )}
            </div>
            <span className="cm-gbar-pct">{Math.round(tgtPct)}%</span>
          </div>
        );
      })}
      <div className="cm-gbar-legend">
        <span><span className="cm-gdot" style={{ background:'#009EDB'}} /> Targeted</span>
        <span><span className="cm-gdot" style={{ background:'#27AE60'}} /> Reached (overlay)</span>
      </div>
    </div>
  );
}

// ── Pictogram (compact) ───────────────────────────────────────────
function Pictogram({ boys, girls, men, women }) {
  const total    = boys + girls + men + women;
  if (total === 0) return null;
  const children = boys + girls;
  const nChild   = Math.round((children / total) * 60);
  const nAdult   = 60 - nChild;
  return (
    <div className="cm-pict-wrap">
      <div className="cm-pict-grid">
        {[...Array(nChild).fill('c'), ...Array(nAdult).fill('a')].map((t, i) => (
          <svg key={i} viewBox="0 0 20 36" width="13" height="22"
            style={{ stroke: t==='c'?'#E91E8C':'#4A90D9', fill:'none', strokeLinecap:'round', flexShrink:0 }}>
            <circle cx="10" cy={t==='c'?5:4} r={t==='c'?4:3.5}/>
            {t==='c' ? (<>
              <line x1="10" y1="9"  x2="10" y2="22" strokeWidth="2.5"/>
              <line x1="10" y1="13" x2="5"  y2="18" strokeWidth="2"/>
              <line x1="10" y1="13" x2="15" y2="18" strokeWidth="2"/>
              <line x1="10" y1="22" x2="6"  y2="30" strokeWidth="2"/>
              <line x1="10" y1="22" x2="14" y2="30" strokeWidth="2"/>
            </>) : (<>
              <line x1="10" y1="8"  x2="10" y2="22" strokeWidth="2.5"/>
              <line x1="10" y1="12" x2="4"  y2="17" strokeWidth="2"/>
              <line x1="10" y1="12" x2="16" y2="17" strokeWidth="2"/>
              <line x1="10" y1="22" x2="6"  y2="32" strokeWidth="2"/>
              <line x1="10" y1="22" x2="14" y2="32" strokeWidth="2"/>
            </>)}
          </svg>
        ))}
      </div>
      <div className="cm-pict-legend">
        <span><span className="cm-gdot" style={{background:'#E91E8C'}}/>Children ({Math.round(children/total*100)}%)</span>
        <span><span className="cm-gdot" style={{background:'#4A90D9'}}/>Adults ({Math.round((men+women)/total*100)}%)</span>
      </div>
    </div>
  );
}

// ── Efficiency/priority color helpers (mirrors Landing.jsx) ──────
const effColor = (ratio) => {
  if (ratio == null) return '#718096';
  if (ratio >= 1.75) return '#27AE60';  // well-resourced
  if (ratio >= 1.25) return '#7CB342';
  if (ratio >= 0.75) return '#F39C12';
  if (ratio >= 0.5)  return '#E67E22';
  return '#C0392B';                     // severely underspending per person
};
const priorityColor = (score) => {
  if (score == null) return '#718096';
  if (score >= 60)   return '#C0392B';
  if (score >= 50)   return '#E74C3C';
  if (score >= 40)   return '#E67E22';
  if (score >= 30)   return '#F39C12';
  if (score >= 20)   return '#7CB342';
  return '#27AE60';
};

// ── Stat badge ────────────────────────────────────────────────────
function Stat({ label, value, note, accent }) {
  return (
    <div className="cm-stat" style={{ '--a': accent || '#009EDB' }}>
      <div className="cm-stat-val">{value}</div>
      <div className="cm-stat-lbl">{label}</div>
      {note && <div className="cm-stat-note">{note}</div>}
    </div>
  );
}

// ── Expandable sector row ─────────────────────────────────────────
function SectorRow({ cat, data, history, isOpen, onToggle }) {
  const meta = ISSUE_META[cat] || {};
  const Icon = meta.icon || AlertCircle;
  const { pct, req, fund, gap, targeted_people=0, reached_people=0 } = data;

  const histChart = (history || [])
    .filter(h => h.year <= 2025)
    .map(h => ({ year: h.year, 'Funded %': Math.min(h.pct, 100) }));

  const reachPct = targeted_people > 0 ? Math.round(reached_people / targeted_people * 100) : 0;

  return (
    <div className={`cm-sector-row ${isOpen ? 'cm-sector-row--open' : ''}`}>
      <button className="cm-sector-btn" onClick={onToggle}>
        <div className="cm-sector-left">
          <Icon size={13} color={meta.color} style={{ flexShrink:0 }}/>
          <span className="cm-sector-name">{cat}</span>
          {targeted_people > 0 && (
            <span className="cm-sector-people">
              <Users size={9} /> {fmtN(targeted_people)}
            </span>
          )}
        </div>
        <div className="cm-sector-right">
          <div className="cm-sector-track">
            <div className="cm-sector-fill" style={{ width:`${Math.min(pct,100)}%`, background:pctColor(pct) }}/>
          </div>
          <span className="cm-sector-pct" style={{ color:pctColor(pct) }}>{pct}%</span>
          <span className="cm-sector-gap">{fmt(gap)}</span>
          {isOpen ? <ChevronUp size={12} color="var(--cm-muted)"/> : <ChevronDown size={12} color="var(--cm-muted)"/>}
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div className="cm-sector-detail"
            initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }}
            exit={{ height:0, opacity:0 }} transition={{ duration:0.2 }}>
            <div className="cm-sector-detail-inner">
              {/* People targeted vs reached */}
              {targeted_people > 0 && (
                <div className="cm-sector-ppl">
                  <div className="cm-sector-ppl-row">
                    <span>People targeted:</span>
                    <strong>{fmtN(targeted_people)}</strong>
                  </div>
                  {reached_people > 0 && (
                    <div className="cm-sector-ppl-row">
                      <span>People reached:</span>
                      <strong style={{ color:'#27AE60' }}>{fmtN(reached_people)} ({reachPct}%)</strong>
                    </div>
                  )}
                  {reached_people > 0 && (
                    <div className="cm-sector-reach-bar-wrap">
                      <div className="cm-sector-reach-bg">
                        <div className="cm-sector-reach-fg" style={{ width:`${Math.min(reachPct,100)}%` }}/>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* History chart */}
              {histChart.length >= 2 ? (
                <>
                  <p className="cm-sector-chart-title">
                    {cat} — % funded · {histChart[0].year}–{histChart.at(-1).year}
                  </p>
                  <ResponsiveContainer width="100%" height={110}>
                    <AreaChart data={histChart} margin={{top:4,right:8,left:-18,bottom:0}}>
                      <defs>
                        <linearGradient id={`sg-${cat.replace(/\W/g,'')}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={meta.color} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={meta.color} stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="year" tick={{fill:'var(--cm-muted)',fontSize:9}} axisLine={false}
                        tickLine={false} tickFormatter={v=>`'${String(v).slice(2)}`} interval="preserveStartEnd"/>
                      <YAxis tick={{fill:'var(--cm-muted)',fontSize:9}} axisLine={false} tickLine={false}
                        tickFormatter={v=>`${v}%`} domain={[0,100]} width={26}/>
                      <Tooltip content={<PctTip/>}/>
                      <ReferenceLine y={50} stroke="var(--cm-rule-color)" strokeDasharray="3 2" strokeWidth={0.8}/>
                      <Area type="monotone" dataKey="Funded %" stroke={meta.color}
                        fill={`url(#sg-${cat.replace(/\W/g,'')})`}
                        strokeWidth={2} dot={{r:2,fill:meta.color,strokeWidth:0}}/>
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="cm-sector-hist-stats">
                    <span>Avg: <strong style={{color:pctColor(Math.round(histChart.reduce((s,h)=>s+h['Funded %'],0)/histChart.length))}}>
                      {Math.round(histChart.reduce((s,h)=>s+h['Funded %'],0)/histChart.length)}%
                    </strong></span>
                    <span>Years tracked: <strong>{histChart.length}</strong></span>
                    <span>Worst: <strong style={{color:'#C0392B'}}>
                      {Math.min(...histChart.map(h=>h['Funded %'])).toFixed(0)}%
                    </strong></span>
                  </div>
                </>
              ) : (
                <p className="cm-empty cm-empty--sm">Limited historical data</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────
export default function CountryModal({ country, onClose }) {
  const overlayRef = useRef(null);
  const navigate   = useNavigate();
  const [openSector,   setOpenSector]   = useState(null);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  if (!country) return null;

  const {
    name, cbpf_timeline=[], cluster_breakdown={},
    cluster_history={}, affected={}, world:wi={}, pop_impact_pct=0,
  } = country;

  // ── Build a specific, data-rich prompt for the Wiki AI ──────────
  const buildWikiPrompt = () => {
    const pcts      = country.issue_pct_funded || {};
    const total     = affected.total || 0;
    const reached   = affected.total_reached || 0;
    const children  = (affected.boys || 0) + (affected.girls || 0);
    const childPct  = total > 0 ? Math.round(children / total * 100) : 0;
    const pop       = wi.population || 0;
    const popPct    = pop > 0 ? (total / pop * 100).toFixed(1) : null;
    const vuln      = wi.vulnerability_score;
    const lifeExp   = wi.life_expectancy;
    const latestCbpf = cbpf_timeline.at(-1);
    const cbpfCovPct = latestCbpf?.cbpf_target > 0
      ? Math.round(latestCbpf.cbpf_funding / latestCbpf.cbpf_target * 100) : null;

    // Worst 3 sectors by funding %
    const worstSectors = Object.entries(pcts)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([s, p]) => `${s} (${p}% funded)`)
      .join(', ');

    // Best 2 sectors for contrast
    const bestSectors = Object.entries(pcts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([s, p]) => `${s} (${p}% funded)`)
      .join(', ');

    let prompt =
      `Explain ${name}'s humanitarian crisis in depth. ` +
      `Use all available data — CBPF project records, HRP funding history, and sector breakdowns — to answer:\n\n` +
      `1. **Funding severity**: ${name}'s most underfunded sectors are ${worstSectors}. ` +
      `Its best-funded are ${bestSectors}. Why is this pattern occurring and what drives the gaps?\n\n` +
      `2. **Scale of need**: ${total.toLocaleString()} people are targeted for assistance` +
      (popPct ? ` (${popPct}% of the population)` : '') +
      `, of whom ${childPct}% are children. Only ${reached.toLocaleString()} have actually been reached. ` +
      `Which groups are most underserved and why?\n\n`;

    if (cbpfCovPct !== null) {
      prompt +=
        `3. **Funding trend**: In ${latestCbpf.year}, CBPF allocations covered only ${cbpfCovPct}% of the target. ` +
        `How has this coverage changed over the years, and is the situation improving or worsening?\n\n`;
    }

    prompt += `4. **Country context**: `;
    if (vuln) prompt += `Vulnerability score is ${vuln}/100. `;
    if (lifeExp) prompt += `Life expectancy is ${lifeExp} years. `;
    prompt +=
      `How do these structural factors drive the humanitarian situation?\n\n` +
      `5. **Comparable cases**: Which other crisis countries face similar patterns, ` +
      `and what interventions have worked there?\n\n` +
      `6. **Recommendations**: Based on the data, what specific actions — sectors, partners, funding mechanisms — ` +
      `would most effectively close the gap for ${name}?`;

    return prompt;
  };

  const handleLearnMore = () => {
    const prompt = buildWikiPrompt();
    localStorage.setItem('wiki_autoprompt', prompt);
    onClose();
    navigate('/wiki');
  };

  // 1. CBPF two-line chart: Target (required) vs Received (funded), dollars on Y-axis
  const cbpfChart = cbpf_timeline.map(d => ({
    year:     d.year,
    Target:   d.cbpf_target,
    Received: d.cbpf_funding,
  }));
  const latest    = cbpf_timeline.at(-1);
  const latestPct = latest?.cbpf_target > 0 ? Math.round(latest.cbpf_funding/latest.cbpf_target*100) : 0;
  const cbpfGap   = latest ? Math.max(latest.cbpf_target - latest.cbpf_funding, 0) : 0;

  // 2. Sectors sorted worst → best
  const sectorRows = Object.entries(cluster_breakdown)
    .map(([cat, v]) => ({ cat, ...v }))
    .sort((a, b) => a.pct - b.pct);

  // 3. Demographics
  const { boys=0, girls=0, men=0, women=0, total=0 } = affected;
  const pop    = wi.population || 0;
  const reached_total = affected.total_reached || 0;
  const popPie = total > 0 ? [
    { name:`Receiving aid (${fmtN(reached_total)})`, value: reached_total,              fill:'#009EDB' },
    { name:'Not yet reached',                        value: Math.max(total-reached_total,0), fill:'var(--cm-fill-safe)' },
  ] : [];

  return (
    <AnimatePresence>
      <motion.div className="cm-overlay" ref={overlayRef}
        initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.18}}
        onClick={e => { if(e.target===overlayRef.current) onClose(); }}>
        <motion.div className="cm-panel"
          initial={{opacity:0,scale:0.96,y:16}} animate={{opacity:1,scale:1,y:0}}
          exit={{opacity:0,scale:0.96,y:16}} transition={{duration:0.22,ease:[0.16,1,0.3,1]}}>

          {/* HEADER */}
          <div className="cm-header">
            <div>
              <h2 className="cm-title">{name}</h2>
              <div className="cm-badges">
                <span className="cm-bdg" style={{ '--c': pctColor(latestPct) }}>
                  {latestPct}% CBPF funded ({latest?.year ?? '—'})
                </span>
                {wi.vulnerability_score > 0 && (
                  <span className="cm-bdg cm-bdg-vuln">Vulnerability: {wi.vulnerability_score}/100</span>
                )}
              </div>
            </div>
            <div className="cm-header-actions">
              <button className="cm-learn-more-btn" onClick={handleLearnMore}
                title={`Ask AI to explain ${name}'s crisis ranking`}>
                <MessageSquare size={13} />
                More Information
              </button>
              <button className="cm-close" onClick={onClose} aria-label="Close"><X size={17}/></button>
            </div>
          </div>

          <div className="cm-body">

            {/* ━━━ SECTION 1: CBPF % timeline ━━━ */}
            <section className="cm-sec">
              <h3 className="cm-sec-title">
                <Activity size={13}/>
                CBPF Funding Coverage
                <span className="cm-sec-sub">Required vs. received · {cbpf_timeline[0]?.year}–{cbpf_timeline.at(-1)?.year}</span>
              </h3>
              {cbpfGap > 0 && (
                <div className="cm-alert">
                  <TrendingDown size={12}/>
                  <span>{latest?.year} shortfall:&nbsp;
                    <strong style={{color:'#fca5a5'}}>{fmt(cbpfGap)}</strong>
                    &nbsp;— only <strong style={{color:pctColor(latestPct)}}>{latestPct}%</strong> of target
                  </span>
                </div>
              )}
              {cbpfChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={cbpfChart} margin={{top:8,right:16,left:8,bottom:0}}>
                    <defs>
                      {/* Gap zone: red fill between Target and Received */}
                      <linearGradient id="gapFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#C0392B" stopOpacity={0.20}/>
                        <stop offset="100%" stopColor="#C0392B" stopOpacity={0.04}/>
                      </linearGradient>
                      {/* Received fill: OCHA blue beneath the received line */}
                      <linearGradient id="recvFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#009EDB" stopOpacity={0.38}/>
                        <stop offset="100%" stopColor="#009EDB" stopOpacity={0.04}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="year" tick={{fill:'var(--cm-muted)',fontSize:10}}
                      axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={v => fmt(v)} tick={{fill:'var(--cm-muted)',fontSize:9}}
                      axisLine={false} tickLine={false} width={56}/>
                    <Tooltip content={<CbpfTip/>}/>
                    {/* Target — dashed grey line, fills gap area red above received */}
                    <Area type="monotone" dataKey="Target"
                      stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3"
                      fill="url(#gapFill)"
                      dot={false}
                      activeDot={{r:4, fill:'#94a3b8', strokeWidth:0}}/>
                    {/* Received — solid OCHA blue, fills area below in blue */}
                    <Area type="monotone" dataKey="Received"
                      stroke="#009EDB" strokeWidth={2.5}
                      fill="url(#recvFill)"
                      dot={{r:3, fill:'#009EDB', strokeWidth:0}}
                      activeDot={{r:5, fill:'#009EDB', stroke:'var(--cm-panel-bg)', strokeWidth:2}}/>
                  </AreaChart>
                </ResponsiveContainer>
              ) : <p className="cm-empty">No CBPF data</p>}
              {/* Chart legend */}
              {cbpfChart.length > 0 && (
                <div className="cm-cbpf-legend">
                  <span className="cm-cbpf-leg-item">
                    <span className="cm-cbpf-leg-line cm-cbpf-leg-line--target"/>
                    Target (required)
                  </span>
                  <span className="cm-cbpf-leg-item">
                    <span className="cm-cbpf-leg-line cm-cbpf-leg-line--recv"/>
                    Received
                  </span>
                  <span className="cm-cbpf-leg-item">
                    <span className="cm-cbpf-leg-box"/>
                    Funding gap
                  </span>
                </div>
              )}
            </section>

            {/* ━━━ SECTION 2: Sector funding (expandable, with people counts) ━━━ */}
            <section className="cm-sec">
              <h3 className="cm-sec-title">
                <AlertCircle size={13}/>
                Sector Funding &amp; People Reached
                <span className="cm-sec-sub">Click to expand full history</span>
              </h3>
              <div className="cm-sector-list">
                {sectorRows.map(row => (
                  <SectorRow
                    key={row.cat}
                    cat={row.cat}
                    data={row}
                    history={cluster_history[row.cat]}
                    isOpen={openSector === row.cat}
                    onToggle={() => setOpenSector(openSector === row.cat ? null : row.cat)}
                  />
                ))}
              </div>
            </section>

            {/* ━━━ SECTION 3: Gender breakdown ━━━ */}
            <section className="cm-sec">
              <h3 className="cm-sec-title">
                <Users size={13}/>
                Affected People — Gender Breakdown
                {total > 0 && <span className="cm-sec-sub">{fmtN(total)} targeted · {fmtN(affected.total_reached||0)} reached</span>}
              </h3>
              <div className="cm-cols">
                <div className="cm-col">
                  <p className="cm-col-hd"><Baby size={11}/> Demographics</p>
                  <Pictogram boys={boys} girls={girls} men={men} women={women}/>
                </div>
                <div className="cm-col">
                  <p className="cm-col-hd">Targeted by gender</p>
                  <GenderBars affected={affected}/>
                </div>
              </div>
            </section>

            {/* ━━━ SECTION 4: Population impact + health ━━━ */}
            <section className="cm-sec">
              <h3 className="cm-sec-title">
                <Activity size={13}/>
                Country Context
                <span className="cm-sec-sub">Population impact &amp; health indicators</span>
              </h3>
              <div className="cm-cols">
                <div className="cm-col">
                  <p className="cm-col-hd">Aid coverage of people in need</p>
                  {popPie.length > 0 ? (
                    <div className="cm-pop-wrap">
                      <ResponsiveContainer width="100%" height={145}>
                        <PieChart>
                          <Pie data={popPie} cx="50%" cy="50%" startAngle={90} endAngle={-270}
                            innerRadius={42} outerRadius={64} paddingAngle={2}
                            dataKey="value" strokeWidth={0}>
                            {popPie.map((e,i) => <Cell key={i} fill={e.fill}/>)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="cm-pop-center">
                        <span className="cm-pop-pct" style={{color:'#009EDB'}}>{pop_impact_pct}%</span>
                        <span className="cm-pop-sub">receiving aid</span>
                      </div>
                      <div className="cm-pop-legend">
                        <span><span className="cm-pdot" style={{background:'#009EDB'}}/>Reached: {fmtN(affected.total_reached||0)}</span>
                        <span><span className="cm-pdot cm-pdot-safe"/>In need: {fmtN(total)}</span>
                      </div>
                    </div>
                  ) : <p className="cm-empty">Population data unavailable</p>}
                </div>
                <div className="cm-col">
                  <p className="cm-col-hd">Health indicators</p>
                  <div className="cm-stat-grid">
                    {wi.life_expectancy > 0 && (
                      <Stat label="Life expectancy" value={`${wi.life_expectancy} yrs`} note="Global avg: 73"
                        accent={wi.life_expectancy<60?'#C0392B':wi.life_expectancy<68?'#E67E22':'#27AE60'}/>
                    )}
                    {wi.infant_mortality > 0 && (
                      <Stat label="Infant mortality" value={`${wi.infant_mortality}/1K`} note="Per 1,000 births"
                        accent={wi.infant_mortality>60?'#C0392B':wi.infant_mortality>30?'#E67E22':'#27AE60'}/>
                    )}
                    {wi.maternal_mortality_ratio > 0 && (
                      <Stat label="Maternal mortality" value={`${wi.maternal_mortality_ratio}/100K`}
                        accent={wi.maternal_mortality_ratio>500?'#C0392B':wi.maternal_mortality_ratio>200?'#E67E22':'#27AE60'}/>
                    )}
                    {wi.physicians_per_thousand > 0 && (
                      <Stat label="Doctors / 1K" value={wi.physicians_per_thousand}
                        accent={wi.physicians_per_thousand<0.5?'#C0392B':wi.physicians_per_thousand<1.5?'#E67E22':'#27AE60'}/>
                    )}
                    {wi.unemployment_rate > 0 && (
                      <Stat label="Unemployment" value={`${wi.unemployment_rate}%`}
                        accent={wi.unemployment_rate>20?'#C0392B':wi.unemployment_rate>10?'#E67E22':'#718096'}/>
                    )}
                    {wi.vulnerability_score > 0 && (
                      <Stat label="Vulnerability" value={`${wi.vulnerability_score}/100`} note="Higher = more vulnerable"
                        accent={wi.vulnerability_score>65?'#C0392B':wi.vulnerability_score>45?'#E67E22':'#27AE60'}/>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ━━━ SECTION 5: Efficiency & Priority Benchmarking ━━━ */}
            {Object.keys(country.cost_per_person || {}).length > 0 && (
            <section className="cm-sec">
              <h3 className="cm-sec-title">
                <Activity size={13}/>
                Cost Efficiency &amp; Priority Benchmarking
                <span className="cm-sec-sub">$/person vs global median · priority score breakdown</span>
              </h3>

              <div className="cm-eff-intro">
                Cost efficiency = CBPF allocation ÷ people targeted. Lower than the global sector
                median means more lives reachable per dollar — a higher funding priority signal.
              </div>

              <div className="cm-eff-table">
                <div className="cm-eff-header">
                  <span>Sector</span>
                  <span>$/person</span>
                  <span>vs. median</span>
                  <span>Priority</span>
                </div>
                {Object.entries(country.cluster_breakdown || {})
                  .filter(([,bd]) => bd.cost_per_person != null)
                  .sort((a, b) => (country.priority_index?.[b[0]] ?? 0) - (country.priority_index?.[a[0]] ?? 0))
                  .map(([cat, bd]) => {
                    const ratio    = bd.cost_ratio;
                    const glMed    = bd.global_median_cpp;
                    const priScore = country.priority_index?.[cat];
                    const meta     = ISSUE_META[cat] || {};
                    const Icon     = meta.icon || AlertCircle;
                    const diffPct  = ratio != null ? Math.round(Math.abs(ratio - 1) * 100) : null;
                    const cheaper  = ratio != null && ratio < 1;  // below median = underfunded
                    return (
                      <div key={cat} className="cm-eff-row">
                        <span className="cm-eff-cat">
                          <Icon size={11} color={meta.color} style={{flexShrink:0}}/>
                          {cat}
                        </span>
                        <span className="cm-eff-cpp">${bd.cost_per_person?.toFixed(0)}</span>
                        <span className="cm-eff-ratio">
                          {ratio != null ? (
                            <span className={`cm-eff-badge ${!cheaper ? 'cm-eff-badge--good' : ratio >= 0.75 ? 'cm-eff-badge--mid' : 'cm-eff-badge--bad'}`}>
                              {!cheaper ? '↑' : '↓'}{diffPct}% {!cheaper ? 'above' : 'below'}
                              <span className="cm-eff-med"> (med ${glMed?.toFixed(0)})</span>
                            </span>
                          ) : '—'}
                        </span>
                        <span className="cm-eff-pri" style={{ color: priorityColor(priScore) }}>
                          {priScore ?? '—'}
                          {priScore != null && priScore >= 55 && (
                            <span className="cm-eff-flag">⚑ High</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
              </div>

              <div className="cm-eff-note">
                <strong>Priority Index</strong> (0–100) combines: funding gap (30%) · population
                impact (20%) · vulnerability (15%) · chronic neglect (15%) · cost efficiency
                (10%) · scale of need (10%).
              </div>
            </section>
            )}

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}