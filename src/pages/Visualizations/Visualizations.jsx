import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    Treemap,
} from 'recharts';
import {
    AlertTriangle, TrendingDown, Users, DollarSign,
    Heart, Droplets, Utensils, Home, Shield, BookOpen,
    ArrowRight, ChevronDown,
} from 'lucide-react';
import {
    fetchClusterFunding, fetchTopDonors, fetchFundingTrends, fetchCBPFData,
} from '../../services/api';
import './Visualizations.css';

const chartColors = ['#e94560', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#6366f1'];

function formatB(n) {
    return `$${(n / 1e9).toFixed(1)}B`;
}
function formatM(n) {
    return `$${(n / 1e6).toFixed(0)}M`;
}

function StorySection({ children, index }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: '-100px' });

    return (
        <motion.section
            ref={ref}
            className="story-section"
            initial={{ opacity: 0, y: 60 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
        >
            {children}
        </motion.section>
    );
}

function StatCard({ icon: Icon, value, label, color }) {
    return (
        <div className="viz-stat-card" style={{ '--card-accent': color }}>
            <div className="viz-stat-icon">
                <Icon size={20} />
            </div>
            <div className="viz-stat-value">{value}</div>
            <div className="viz-stat-label">{label}</div>
        </div>
    );
}

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="custom-tooltip">
            <p className="tooltip-label">{label}</p>
            {payload.map((p, i) => (
                <p key={i} className="tooltip-value" style={{ color: p.color }}>
                    {p.name}: {typeof p.value === 'number' && p.value > 1e6
                        ? formatB(p.value)
                        : typeof p.value === 'number'
                            ? `$${p.value.toFixed(1)}B`
                            : p.value}
                </p>
            ))}
        </div>
    );
};

export default function Visualizations() {
    const [clusters, setClusters] = useState([]);
    const [donors, setDonors] = useState([]);
    const [trends, setTrends] = useState([]);
    const [cbpf, setCbpf] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            fetchClusterFunding(),
            fetchTopDonors(),
            fetchFundingTrends(),
            fetchCBPFData(),
        ]).then(([c, d, t, cb]) => {
            setClusters(c);
            setDonors(d);
            setTrends(t.map(y => ({
                ...y,
                requiredB: y.required / 1e9,
                fundedB: y.funded / 1e9,
                gapB: y.gap / 1e9,
            })));
            setCbpf(cb);
            setLoading(false);
        });
    }, []);

    if (loading) {
        return (
            <div className="viz-loading">
                <div className="skeleton" style={{ width: 200, height: 24, marginBottom: 16 }} />
                <div className="skeleton" style={{ width: 300, height: 16 }} />
            </div>
        );
    }

    const totalRequired = trends[trends.length - 1]?.required || 0;
    const totalFunded = trends[trends.length - 1]?.funded || 0;
    const fundingGap = totalRequired - totalFunded;

    const treemapData = clusters.map((c, i) => ({
        name: c.cluster,
        size: c.required,
        funded: c.funded,
        fill: chartColors[i % chartColors.length],
    }));

    return (
        <div className="viz-page">
            {/* Hero */}
            <div className="viz-hero">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="hero-badge">
                        <BarChart size={14} />
                        <span>DATA STORY</span>
                    </div>
                    <h1>The Humanitarian<br /><span className="text-accent">Funding Crisis</span></h1>
                    <p className="viz-hero-sub">
                        A data-driven exploration of global humanitarian aid — who gives, who receives,
                        what's needed, and the ever-widening gap between crises and resources.
                    </p>
                </motion.div>
                <motion.div
                    className="scroll-cue"
                    animate={{ y: [0, 8, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                >
                    <ChevronDown size={24} />
                    <span>Scroll to explore</span>
                </motion.div>
            </div>

            {/* Section 1: The Scale */}
            <StorySection index={0}>
                <div className="section-header">
                    <span className="section-number">01</span>
                    <h2>The Scale of the Crisis</h2>
                    <p>In 2025, the world needs $49.3 billion in humanitarian aid. Only $16.8 billion has been funded — leaving a gap of $32.5 billion.</p>
                </div>

                <div className="viz-stats-grid">
                    <StatCard icon={DollarSign} value={formatB(totalRequired)} label="Required (2025)" color="#3b82f6" />
                    <StatCard icon={Heart} value={formatB(totalFunded)} label="Funded" color="#10b981" />
                    <StatCard icon={TrendingDown} value={formatB(fundingGap)} label="Funding Gap" color="#e94560" />
                    <StatCard icon={Users} value="300M+" label="People in Need" color="#f59e0b" />
                </div>

                <div className="chart-container">
                    <h3 className="chart-heading">Funding Gap Over Time (2015–2025)</h3>
                    <ResponsiveContainer width="100%" height={380}>
                        <AreaChart data={trends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gradRequired" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradFunded" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                            <XAxis dataKey="year" tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} />
                            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} unit="B" tickFormatter={v => `$${v}`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Area type="monotone" dataKey="requiredB" stroke="#3b82f6" fill="url(#gradRequired)" strokeWidth={2} name="Required ($B)" />
                            <Area type="monotone" dataKey="fundedB" stroke="#10b981" fill="url(#gradFunded)" strokeWidth={2} name="Funded ($B)" />
                        </AreaChart>
                    </ResponsiveContainer>
                    <p className="chart-insight">
                        <AlertTriangle size={14} /> The gap between needs and funding has <strong>quadrupled</strong> since 2015 — from $8.6B to $32.5B.
                    </p>
                </div>
            </StorySection>

            {/* Section 2: The Response */}
            <StorySection index={1}>
                <div className="section-header">
                    <span className="section-number">02</span>
                    <h2>Who Responds?</h2>
                    <p>Humanitarian aid is concentrated among a handful of donors. The top 10 contributors provide over 75% of all funding.</p>
                </div>

                <div className="chart-container">
                    <h3 className="chart-heading">Top Donors by Contribution</h3>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={donors} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                            <XAxis type="number" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={v => `$${(v / 1e9).toFixed(0)}B`} />
                            <YAxis dataKey="donor" type="category" tick={{ fill: 'var(--text-primary)', fontSize: 12 }} width={110} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="amount" radius={[0, 6, 6, 0]} name="Contribution">
                                {donors.map((_, i) => (
                                    <Cell key={i} fill={chartColors[i % chartColors.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </StorySection>

            {/* Section 3: The Resources */}
            <StorySection index={2}>
                <div className="section-header">
                    <span className="section-number">03</span>
                    <h2>Where Does Aid Go?</h2>
                    <p>Humanitarian funding is allocated across sectors (clusters). Food security dominates requirements, but critical sectors like education and shelter remain severely underfunded.</p>
                </div>

                <div className="chart-container">
                    <h3 className="chart-heading">Funding by Humanitarian Cluster</h3>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={clusters} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                            <XAxis dataKey="cluster" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
                            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={v => `$${(v / 1e9).toFixed(0)}B`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="required" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Required" />
                            <Bar dataKey="funded" fill="#e94560" radius={[4, 4, 0, 0]} name="Funded" />
                        </BarChart>
                    </ResponsiveContainer>
                    <p className="chart-insight">
                        <AlertTriangle size={14} /> Education receives only <strong>30%</strong> of its requirements — leaving millions of children without schooling in crisis zones.
                    </p>
                </div>
            </StorySection>

            {/* Section 4: The Pooled Funds */}
            <StorySection index={3}>
                <div className="section-header">
                    <span className="section-number">04</span>
                    <h2>Country-Based Pooled Funds</h2>
                    <p>CBPFs channel resources directly to frontline responders. Sudan receives the highest allocation at $169M, yet this represents only 8.95% of total HRP funding.</p>
                </div>

                <div className="chart-container">
                    <h3 className="chart-heading">CBPF Allocations vs HRP Requirements</h3>
                    <div className="cbpf-grid">
                        {cbpf.map((item, i) => (
                            <div key={i} className="cbpf-card card">
                                <div className="cbpf-header">
                                    <h4>{item.country}</h4>
                                    <span className="badge badge-info">{item.cbpfPercent}% of HRP</span>
                                </div>
                                <div className="cbpf-bars">
                                    <div className="cbpf-bar-row">
                                        <span className="cbpf-bar-label">CBPF</span>
                                        <div className="cbpf-bar-bg">
                                            <div
                                                className="cbpf-bar-fill cbpf-color"
                                                style={{ width: `${(item.cbpfFunding / item.hrpRequired) * 100}%` }}
                                            />
                                        </div>
                                        <span className="cbpf-bar-value">{formatM(item.cbpfFunding)}</span>
                                    </div>
                                    <div className="cbpf-bar-row">
                                        <span className="cbpf-bar-label">HRP Funded</span>
                                        <div className="cbpf-bar-bg">
                                            <div
                                                className="cbpf-bar-fill hrp-color"
                                                style={{ width: `${(item.hrpFunding / item.hrpRequired) * 100}%` }}
                                            />
                                        </div>
                                        <span className="cbpf-bar-value">{formatM(item.hrpFunding)}</span>
                                    </div>
                                    <div className="cbpf-bar-row">
                                        <span className="cbpf-bar-label">HRP Required</span>
                                        <div className="cbpf-bar-bg">
                                            <div className="cbpf-bar-fill req-color" style={{ width: '100%' }} />
                                        </div>
                                        <span className="cbpf-bar-value">{formatB(item.hrpRequired)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </StorySection>

            {/* Section 5: The Verdict */}
            <StorySection index={4}>
                <div className="section-header verdict-header">
                    <span className="section-number">05</span>
                    <h2>The Verdict</h2>
                    <p>The humanitarian system is at a breaking point. Needs are growing faster than resources. The funding gap is not just a number — it's measured in lives.</p>
                </div>

                <div className="verdict-cards">
                    <div className="verdict-card critical">
                        <div className="verdict-num">34%</div>
                        <div className="verdict-desc">Global funding coverage — the lowest in a decade</div>
                    </div>
                    <div className="verdict-card warning">
                        <div className="verdict-num">$32.5B</div>
                        <div className="verdict-desc">Unfunded gap leaving 300M+ people without adequate aid</div>
                    </div>
                    <div className="verdict-card info">
                        <div className="verdict-num">10×</div>
                        <div className="verdict-desc">Every $1 in prevention saves $10 in emergency response</div>
                    </div>
                </div>

                <div className="verdict-cta">
                    <p>Data doesn't change the world. What you do with it can.</p>
                </div>
            </StorySection>
        </div>
    );
}
