import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  X, Heart, Droplets, BookOpen, Home, ShieldCheck, Wheat,
  Activity, Users, Baby, AlertCircle, Apple, TrendingDown,
  ChevronDown, ChevronUp,
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
  const [openSector, setOpenSector] = useState(null);

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

  // 1. CBPF % funded timeline
  const cbpfChart = cbpf_timeline.map(d => ({
    year: d.year,
    'Funded %': d.cbpf_target > 0 ? Math.round(Math.min(d.cbpf_funding/d.cbpf_target*100,200)) : 0,
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
  const popPie = pop > 0 ? [
    { name:`In need (${fmtN(total)})`, value:total,               fill:'#C0392B' },
    { name:'Not targeted',             value:Math.max(pop-total,0), fill:'var(--cm-fill-safe)' },
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
            <button className="cm-close" onClick={onClose} aria-label="Close"><X size={17}/></button>
          </div>

          <div className="cm-body">

            {/* ━━━ SECTION 1: CBPF % timeline ━━━ */}
            <section className="cm-sec">
              <h3 className="cm-sec-title">
                <Activity size={13}/>
                CBPF Funding Coverage
                <span className="cm-sec-sub">% of target met · {cbpf_timeline[0]?.year}–{cbpf_timeline.at(-1)?.year}</span>
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
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={cbpfChart} margin={{top:6,right:12,left:-14,bottom:0}}>
                    <defs>
                      <linearGradient id="cbpfG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#009EDB" stopOpacity={0.45}/>
                        <stop offset="95%" stopColor="#009EDB" stopOpacity={0.02}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="year" tick={{fill:'var(--cm-muted)',fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:'var(--cm-muted)',fontSize:10}} axisLine={false} tickLine={false}
                      tickFormatter={v=>`${v}%`} width={36}/>
                    <Tooltip content={<PctTip/>}/>
                    <ReferenceLine y={100} stroke="var(--cm-rule-color)" strokeDasharray="4 3" strokeWidth={1}
                      label={{value:'100% (target met)',position:'right',fontSize:9,fill:'var(--cm-muted)'}}/>
                    <ReferenceLine y={50} stroke="var(--cm-rule-color)" strokeDasharray="3 2" strokeWidth={0.7}/>
                    <Area type="monotone" dataKey="Funded %" stroke="#009EDB" fill="url(#cbpfG)"
                      strokeWidth={2.5} dot={{r:3,fill:'#009EDB',strokeWidth:0}}/>
                  </AreaChart>
                </ResponsiveContainer>
              ) : <p className="cm-empty">No CBPF data</p>}
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
                  <p className="cm-col-hd">Population in need</p>
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
                        <span className="cm-pop-pct" style={{color:'#C0392B'}}>{pop_impact_pct}%</span>
                        <span className="cm-pop-sub">in need</span>
                      </div>
                      <div className="cm-pop-legend">
                        <span><span className="cm-pdot" style={{background:'#C0392B'}}/>In need: {fmtN(total)}</span>
                        <span><span className="cm-pdot cm-pdot-safe"/>Total: {fmtN(pop)}</span>
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

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}