import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Users, DollarSign, Search, ChevronDown, ChevronUp, Globe } from 'lucide-react';

// ── Static data imports (placed in src/services/) ────────────────
import projectsData from '../../services/projects_data.json';
import cerfIds      from '../../services/cerf_ids.json';

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n) => {
  if (!n) return '$0';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtN = (n) => {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
};

// Derive CERF country page URL for a project
function cerfUrl(countryCode, year) {
  const key = `${countryCode}_${year}`;
  const id  = cerfIds[key];
  if (!id) return null;
  return `https://cerf.un.org/what-we-do/allocation/${year}/country/${id}`;
}

// Severity chip for cost-per-person
function CppChip({ cpp, median }) {
  if (!cpp || !median) return null;
  const ratio = cpp / median;
  const color = ratio < 0.75 ? '#C0392B' : ratio < 1.25 ? '#F39C12' : '#27AE60';
  const label = ratio < 0.75 ? 'Low spend' : ratio < 1.25 ? 'Avg' : 'Well-funded';
  return (
    <span className="pd-cpp-chip" style={{ color, borderColor: color + '50', background: color + '12' }}>
      ${cpp.toFixed(0)}/person · {label}
    </span>
  );
}

// ── Project card ──────────────────────────────────────────────────
function ProjectCard({ project, countryCode, sectorMedianCpp, isComparable }) {
  const [open, setOpen] = useState(false);
  const url = cerfUrl(countryCode, project.year);

  return (
    <div className={`pd-card ${isComparable ? 'pd-card--comparable' : ''}`}>
      <button className="pd-card-header" onClick={() => setOpen(o => !o)}>
        <div className="pd-card-top">
          <span className="pd-card-sector">{project.sector}</span>
          <div className="pd-card-meta">
            <span className="pd-alloc">{fmt(project.allocation)}</span>
            {isComparable && (
              <span className="pd-comparable-tag">
                <Globe size={9} /> {project.location}
              </span>
            )}
          </div>
        </div>
        <p className="pd-card-title">{project.title}</p>
        <div className="pd-card-stats">
          <span className="pd-stat">
            <Users size={10} />
            {fmtN(project.targeted)} people targeted
          </span>
          <CppChip cpp={project.cpp} median={sectorMedianCpp} />
        </div>
        <span className="pd-card-chevron">
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div className="pd-card-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}>
            <div className="pd-card-inner">
              <div className="pd-detail-row">
                <span className="pd-detail-label">Partner</span>
                <span className="pd-detail-val">{project.partner}</span>
              </div>
              <div className="pd-detail-row">
                <span className="pd-detail-label">Allocation</span>
                <span className="pd-detail-val pd-detail-alloc">{fmt(project.allocation)}</span>
              </div>
              <div className="pd-detail-row">
                <span className="pd-detail-label">People targeted</span>
                <span className="pd-detail-val">{project.targeted?.toLocaleString()}</span>
              </div>
              <div className="pd-detail-row">
                <span className="pd-detail-label">Cost / person</span>
                <span className="pd-detail-val">${project.cpp?.toFixed(2)}</span>
              </div>
              <div className="pd-detail-row">
                <span className="pd-detail-label">Year</span>
                <span className="pd-detail-val">{project.year}</span>
              </div>
              <div className="pd-detail-row">
                <span className="pd-detail-label">Project code</span>
                <span className="pd-detail-val pd-code">{project.project_code}</span>
              </div>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="pd-cerf-link">
                  <ExternalLink size={12} />
                  View on CERF.un.org → {project.year} country page
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────
export default function ProjectsDrawer({ country, activeIssue, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab]                 = useState('country'); // 'country' | 'comparable'
  const [sectorFilter, setSectorFilter] = useState(activeIssue || 'All');

  const countryCode  = country.code;
  const countryName  = country.name;

  // All sectors present in this country's projects
  const allSectors = useMemo(() => {
    const s = new Set((projectsData[countryCode] || []).map(p => p.sector));
    return ['All', ...Array.from(s).sort()];
  }, [countryCode]);

  // Country's own projects, filtered
  const countryProjects = useMemo(() => {
    const all = projectsData[countryCode] || [];
    return all
      .filter(p => {
        const matchSector = sectorFilter === 'All' || p.sector === sectorFilter;
        const matchSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase())
          || p.partner.toLowerCase().includes(searchQuery.toLowerCase());
        return matchSector && matchSearch;
      })
      .sort((a, b) => b.allocation - a.allocation);
  }, [countryCode, sectorFilter, searchQuery]);

  // Comparable projects: same sector, different countries
  const comparableProjects = useMemo(() => {
    const sector = sectorFilter === 'All' ? activeIssue : sectorFilter;
    const results = [];
    for (const [cc, projs] of Object.entries(projectsData)) {
      if (cc === countryCode) continue;
      const matching = projs
        .filter(p => {
          const matchSector = p.sector === sector;
          const matchSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase())
            || p.partner.toLowerCase().includes(searchQuery.toLowerCase());
          return matchSector && matchSearch;
        });
      results.push(...matching);
    }
    // Sort by allocation descending, take top 30
    return results.sort((a, b) => b.allocation - a.allocation).slice(0, 30);
  }, [countryCode, sectorFilter, activeIssue, searchQuery]);

  // Global median cost/person for current sector filter
  const sectorMedianCpp = useMemo(() => {
    const sector = sectorFilter === 'All' ? null : sectorFilter;
    const vals = [];
    for (const projs of Object.values(projectsData)) {
      for (const p of projs) {
        if ((!sector || p.sector === sector) && p.cpp > 0) vals.push(p.cpp);
      }
    }
    if (!vals.length) return null;
    vals.sort((a, b) => a - b);
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  }, [sectorFilter]);

  // Summary stats
  const countryTotal    = countryProjects.reduce((s, p) => s + p.allocation, 0);
  const countryPeople   = countryProjects.reduce((s, p) => s + (p.targeted || 0), 0);
  const comparableTotal = comparableProjects.reduce((s, p) => s + p.allocation, 0);

  const displayProjects = tab === 'country' ? countryProjects : comparableProjects;

  return (
    <motion.div className="pd-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={e => { if (e.target.classList.contains('pd-overlay')) onClose(); }}>

      <motion.div className="pd-drawer"
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}>

        {/* Header */}
        <div className="pd-header">
          <div className="pd-header-left">
            <h2 className="pd-title">Projects</h2>
            <span className="pd-subtitle">{countryName} · CBPF funded</span>
          </div>
          <button className="pd-close" onClick={onClose} aria-label="Close projects panel">
            <X size={16} />
          </button>
        </div>

        {/* Sector + search filters */}
        <div className="pd-filters">
          <div className="pd-search-wrap">
            <Search size={13} className="pd-search-icon" />
            <input
              type="text"
              className="pd-search"
              placeholder="Search projects or partners…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="pd-sector-pills">
            {allSectors.map(s => (
              <button key={s}
                className={`pd-sec-pill ${sectorFilter === s ? 'pd-sec-pill--on' : ''}`}
                onClick={() => setSectorFilter(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="pd-tabs">
          <button className={`pd-tab ${tab === 'country' ? 'pd-tab--on' : ''}`}
            onClick={() => setTab('country')}>
            {countryName} ({countryProjects.length})
          </button>
          <button className={`pd-tab ${tab === 'comparable' ? 'pd-tab--on' : ''}`}
            onClick={() => setTab('comparable')}>
            Comparable elsewhere ({comparableProjects.length})
          </button>
        </div>

        {/* Summary bar */}
        <div className="pd-summary">
          {tab === 'country' ? (
            <>
              <span><strong>{fmt(countryTotal)}</strong> total allocated</span>
              <span className="pd-sum-dot" />
              <span><strong>{fmtN(countryPeople)}</strong> people targeted</span>
              {sectorMedianCpp && (
                <>
                  <span className="pd-sum-dot" />
                  <span>Sector median: <strong>${sectorMedianCpp.toFixed(0)}/person</strong></span>
                </>
              )}
            </>
          ) : (
            <>
              <span><strong>{comparableProjects.length}</strong> comparable projects</span>
              <span className="pd-sum-dot" />
              <span><strong>{fmt(comparableTotal)}</strong> total allocated</span>
              <span className="pd-sum-dot" />
              <span>Sector: <strong>{sectorFilter === 'All' ? activeIssue : sectorFilter}</strong></span>
            </>
          )}
        </div>

        {/* Project list */}
        <div className="pd-list">
          {displayProjects.length > 0 ? (
            displayProjects.map((p, i) => (
              <ProjectCard
                key={p.project_code + i}
                project={p}
                countryCode={tab === 'comparable' ? p.country_code : countryCode}
                sectorMedianCpp={sectorMedianCpp}
                isComparable={tab === 'comparable'}
              />
            ))
          ) : (
            <div className="pd-empty">
              <p>No projects found{searchQuery ? ` for "${searchQuery}"` : ''}.</p>
              {tab === 'comparable' && (
                <p className="pd-empty-hint">
                  Try selecting a specific sector filter to find comparable work in other countries.
                </p>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}