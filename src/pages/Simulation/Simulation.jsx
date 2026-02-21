import { useState, useEffect, useRef, useMemo } from 'react';
import Map, { Source, Layer, Marker, NavigationControl } from 'react-map-gl';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
    Crosshair, Play, RotateCcw, ChevronDown, AlertTriangle,
    Users, Droplets, Utensils, Zap, MapPin, TrendingDown,
    Shield, Activity, Loader2, CheckCircle2, ArrowRight,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { SIMULATION_COUNTRIES, CRISIS_TYPES } from '../../services/mockData';
import { runSimulation } from '../../services/api';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Simulation.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiZGVtby1hY2NvdW50IiwiYSI6ImNsdnR5cWVxejBhbTcyanBtdzV0dTl1MmYifQ.demo';

const severityColors = {
    Critical: '#ef4444',
    Severe: '#f59e0b',
    Moderate: '#3b82f6',
    Low: '#10b981',
};

const simulationSteps = [
    { label: 'Analyzing country profile', icon: Shield },
    { label: 'Modeling disaster impact', icon: Activity },
    { label: 'Calculating resource depletion', icon: TrendingDown },
    { label: 'Mapping affected regions', icon: MapPin },
    { label: 'Generating projections', icon: Crosshair },
];

function formatNum(n) {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toString();
}

export default function Simulation() {
    const { theme } = useTheme();
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [selectedCrisis, setSelectedCrisis] = useState(null);
    const [phase, setPhase] = useState('setup'); // setup | simulating | results
    const [simStep, setSimStep] = useState(0);
    const [result, setResult] = useState(null);
    const [mapViewState, setMapViewState] = useState({
        latitude: 20,
        longitude: 30,
        zoom: 2,
        pitch: 0,
    });

    const handleCountrySelect = (country) => {
        setSelectedCountry(country);
        setMapViewState({
            latitude: country.lat,
            longitude: country.lng,
            zoom: 5,
            pitch: 30,
        });
        setPhase('setup');
        setResult(null);
    };

    const handleRunSimulation = async () => {
        if (!selectedCountry || !selectedCrisis) return;

        setPhase('simulating');
        setSimStep(0);

        // Animate through steps
        for (let i = 0; i < simulationSteps.length; i++) {
            await new Promise(r => setTimeout(r, 800));
            setSimStep(i + 1);
        }

        try {
            const res = await runSimulation(selectedCountry.code, selectedCrisis.id);

            // Assign geo-coordinates to affected regions based on selected country
            const regionOffsets = [
                { dlat: -1.5, dlng: 0.5 },
                { dlat: 0.5, dlng: -1 },
                { dlat: 1, dlng: 1.5 },
                { dlat: -0.5, dlng: -1.5 },
            ];
            res.affectedRegions = res.affectedRegions.map((r, i) => ({
                ...r,
                lat: selectedCountry.lat + (regionOffsets[i]?.dlat || 0),
                lng: selectedCountry.lng + (regionOffsets[i]?.dlng || 0),
            }));

            setResult(res);
            setPhase('results');
        } catch (err) {
            setPhase('setup');
        }
    };

    const handleReset = () => {
        setPhase('setup');
        setResult(null);
        setSelectedCountry(null);
        setSelectedCrisis(null);
        setMapViewState({ latitude: 20, longitude: 30, zoom: 2, pitch: 0 });
    };

    // GeoJSON for affected region markers
    const affectedGeoJSON = useMemo(() => {
        if (!result?.affectedRegions) return null;
        return {
            type: 'FeatureCollection',
            features: result.affectedRegions.map((r) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
                properties: { name: r.name, severity: r.severity, population: r.population },
            })),
        };
    }, [result]);

    return (
        <div className="sim-page">
            {/* Map Area */}
            <div className="sim-map-area">
                <Map
                    {...mapViewState}
                    onMove={e => setMapViewState(e.viewState)}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle={theme === 'dark'
                        ? 'mapbox://styles/mapbox/dark-v11'
                        : 'mapbox://styles/mapbox/light-v11'
                    }
                    mapboxAccessToken={MAPBOX_TOKEN}
                >
                    <NavigationControl position="bottom-right" />

                    {/* Affected region markers */}
                    {result?.affectedRegions?.map((region, i) => (
                        <Marker
                            key={i}
                            latitude={region.lat}
                            longitude={region.lng}
                            anchor="center"
                        >
                            <div className={`region-marker ${region.severity.toLowerCase()}`}>
                                <div className="marker-pulse" />
                                <div className="marker-core">
                                    <AlertTriangle size={14} />
                                </div>
                                <div className="marker-label">
                                    <span className="marker-name">{region.name}</span>
                                    <span className="marker-sev">{region.severity}</span>
                                </div>
                            </div>
                        </Marker>
                    ))}

                    {/* Country marker when selected but before results */}
                    {selectedCountry && !result && (
                        <Marker latitude={selectedCountry.lat} longitude={selectedCountry.lng} anchor="center">
                            <div className="country-target">
                                <Crosshair size={32} />
                            </div>
                        </Marker>
                    )}
                </Map>

                {/* Map overlay info */}
                {selectedCountry && (
                    <div className="map-overlay-info glass">
                        <span className="map-overlay-country">{selectedCountry.name}</span>
                        {selectedCrisis && <span className="map-overlay-crisis">{selectedCrisis.icon} {selectedCrisis.name}</span>}
                    </div>
                )}
            </div>

            {/* Control Panel (Right) */}
            <div className="sim-panel">
                <div className="sim-panel-header">
                    <div className="sim-panel-title">
                        <Crosshair size={20} />
                        <h2>Crisis Simulator</h2>
                    </div>
                    <span className="sim-badge">BETA</span>
                </div>

                <AnimatePresence mode="wait">
                    {/* Phase: Setup */}
                    {phase === 'setup' && (
                        <motion.div
                            key="setup"
                            className="sim-phase"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            {/* Country Selection */}
                            <div className="sim-section">
                                <label className="sim-label">
                                    <MapPin size={14} />
                                    Select Country
                                </label>
                                <div className="country-grid">
                                    {SIMULATION_COUNTRIES.map((c) => (
                                        <button
                                            key={c.code}
                                            className={`country-chip ${selectedCountry?.code === c.code ? 'active' : ''}`}
                                            onClick={() => handleCountrySelect(c)}
                                        >
                                            <span className="country-chip-name">{c.name}</span>
                                            <span className="country-chip-pop">{formatNum(c.population)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Crisis Selection */}
                            {selectedCountry && (
                                <motion.div
                                    className="sim-section"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <label className="sim-label">
                                        <AlertTriangle size={14} />
                                        Select Crisis Scenario
                                    </label>
                                    <div className="crisis-list">
                                        {CRISIS_TYPES.map((ct) => (
                                            <button
                                                key={ct.id}
                                                className={`crisis-option ${selectedCrisis?.id === ct.id ? 'active' : ''}`}
                                                onClick={() => setSelectedCrisis(ct)}
                                            >
                                                <span className="crisis-icon">{ct.icon}</span>
                                                <div>
                                                    <div className="crisis-name">{ct.name}</div>
                                                    <div className="crisis-desc">{ct.description}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}

                            {/* Run Button */}
                            {selectedCountry && selectedCrisis && (
                                <motion.button
                                    className="run-btn"
                                    onClick={handleRunSimulation}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <Play size={18} />
                                    Run Simulation
                                </motion.button>
                            )}
                        </motion.div>
                    )}

                    {/* Phase: Simulating */}
                    {phase === 'simulating' && (
                        <motion.div
                            key="simulating"
                            className="sim-phase simulating-phase"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="sim-progress-header">
                                <Loader2 size={20} className="spin" />
                                <h3>Simulating Impact...</h3>
                            </div>
                            <p className="sim-progress-sub">
                                Analyzing {selectedCrisis?.name.toLowerCase()} impact on {selectedCountry?.name}
                            </p>

                            <div className="sim-steps">
                                {simulationSteps.map((step, i) => {
                                    const StepIcon = step.icon;
                                    const done = simStep > i;
                                    const active = simStep === i;
                                    return (
                                        <div key={i} className={`sim-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                                            <div className="sim-step-icon">
                                                {done ? <CheckCircle2 size={16} /> : <StepIcon size={16} />}
                                            </div>
                                            <span>{step.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* Phase: Results */}
                    {phase === 'results' && result && (
                        <motion.div
                            key="results"
                            className="sim-phase results-phase"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="results-header">
                                <h3>Impact Assessment</h3>
                                <button className="btn-ghost" onClick={handleReset}>
                                    <RotateCcw size={14} />
                                    New Sim
                                </button>
                            </div>

                            {/* Summary Stats */}
                            <div className="result-stats">
                                <div className="result-stat">
                                    <Users size={16} />
                                    <div>
                                        <div className="result-stat-val">{formatNum(result.summary.affectedPopulation)}</div>
                                        <div className="result-stat-label">Affected</div>
                                    </div>
                                </div>
                                <div className="result-stat">
                                    <Users size={16} />
                                    <div>
                                        <div className="result-stat-val">{formatNum(result.summary.displacedPopulation)}</div>
                                        <div className="result-stat-label">Displaced</div>
                                    </div>
                                </div>
                                <div className="result-stat">
                                    <Droplets size={16} />
                                    <div>
                                        <div className="result-stat-val">{result.summary.waterScarcityDays}d</div>
                                        <div className="result-stat-label">Water Scarcity</div>
                                    </div>
                                </div>
                                <div className="result-stat">
                                    <Zap size={16} />
                                    <div>
                                        <div className="result-stat-val">{result.summary.infrastructureDamage}%</div>
                                        <div className="result-stat-label">Infra Damage</div>
                                    </div>
                                </div>
                            </div>

                            {/* Risk Badge */}
                            <div className="food-risk">
                                <Utensils size={14} />
                                <span>Food Insecurity Risk: </span>
                                <span className="badge badge-danger">{result.summary.foodInsecurityRisk}</span>
                            </div>

                            {/* Resource Depletion Chart */}
                            <div className="result-chart">
                                <h4>Resource Depletion Over Time</h4>
                                <ResponsiveContainer width="100%" height={200}>
                                    <AreaChart data={result.timeline} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                                        <defs>
                                            <linearGradient id="gFood" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="gWater" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                                        <XAxis
                                            dataKey="day"
                                            tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                                            tickFormatter={v => `D${v}`}
                                        />
                                        <YAxis
                                            tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                                            unit="%"
                                            domain={[0, 100]}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                background: 'var(--bg-elevated)',
                                                border: '1px solid var(--border-primary)',
                                                borderRadius: 8,
                                                fontSize: 11,
                                                color: 'var(--text-primary)',
                                            }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 11 }} />
                                        <Area type="monotone" dataKey="food" stroke="#f59e0b" fill="url(#gFood)" strokeWidth={2} name="Food" />
                                        <Area type="monotone" dataKey="water" stroke="#3b82f6" fill="url(#gWater)" strokeWidth={2} name="Water" />
                                        <Line type="monotone" dataKey="medical" stroke="#10b981" strokeWidth={1.5} dot={false} name="Medical" />
                                        <Line type="monotone" dataKey="shelter" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="Shelter" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Affected Regions */}
                            <div className="result-regions">
                                <h4>Affected Regions</h4>
                                {result.affectedRegions.map((region, i) => (
                                    <div key={i} className="region-row">
                                        <div
                                            className="region-sev-dot"
                                            style={{ background: severityColors[region.severity] }}
                                        />
                                        <div className="region-info">
                                            <span className="region-name">{region.name}</span>
                                            <span className="region-stats">
                                                {formatNum(region.population)} pop · {formatNum(region.displacement)} displaced
                                            </span>
                                        </div>
                                        <span
                                            className="region-sev-tag"
                                            style={{ color: severityColors[region.severity] }}
                                        >
                                            {region.severity}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Key Insights */}
                            <div className="result-insights">
                                <h4>Key Insights</h4>
                                <ul>
                                    {result.keyInsights.map((insight, i) => (
                                        <li key={i}>
                                            <ArrowRight size={12} />
                                            <span>{insight}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
