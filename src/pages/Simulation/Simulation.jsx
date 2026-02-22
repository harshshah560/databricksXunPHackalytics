import { useState, useEffect, useMemo } from 'react';
import Map, { Source, Layer, NavigationControl } from 'react-map-gl';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
    Crosshair, Play, RotateCcw, AlertTriangle,
    Users, MapPin, Loader2, CheckCircle2, ArrowRight,
    Shield, Activity, TrendingDown, Skull, Home,
    HeartPulse,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Simulation.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/* ─── Helpers ─────────────────────────────────── */
function formatNum(n) {
    if (!n || isNaN(n)) return '0';
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toLocaleString();
}

const DISASTER_COLORS = {
    Flood: '#3b82f6',
    Earthquake: '#f59e0b',
    Epidemic: '#ef4444',
    Drought: '#a855f7',
};

const simulationSteps = [
    { label: 'Loading geocoded disaster data', icon: Shield },
    { label: 'Filtering by country & disaster type', icon: Activity },
    { label: 'Computing spatial density clusters', icon: MapPin },
    { label: 'Aggregating impact statistics', icon: TrendingDown },
    { label: 'Generating heatmap visualization', icon: Crosshair },
];

/* ─── Parse CSV ───────────────────────────────── */
async function loadGeocodedData() {
    const res = await fetch('/csv/geocoding/geocoded_output.csv');
    const text = await res.text();
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',');

    return lines.slice(1).map(line => {
        // Handle quoted fields with commas inside
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
            if (char === '"') { inQuotes = !inQuotes; continue; }
            if (char === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
            current += char;
        }
        fields.push(current.trim());

        return {
            disaster_id: fields[0],
            disaster_type: fields[1],
            country: fields[2],
            region: fields[3],
            location: fields[4],
            lat: parseFloat(fields[5]),
            lng: parseFloat(fields[6]),
            deaths: parseInt(fields[7]) || 0,
            injuries: parseInt(fields[8]) || 0,
            general_affected: parseInt(fields[9]) || 0,
            homeless: parseInt(fields[10]) || 0,
            total_affected: parseInt(fields[11]) || 0,
        };
    }).filter(d => !isNaN(d.lat) && !isNaN(d.lng));
}

/* ─── Component ───────────────────────────────── */
export default function Simulation() {
    const { theme } = useTheme();
    const [allData, setAllData] = useState([]);
    const [countries, setCountries] = useState([]);
    const [disasterTypes, setDisasterTypes] = useState([]);
    const [selectedCountry, setSelectedCountry] = useState('');
    const [selectedDisaster, setSelectedDisaster] = useState('All');
    const [phase, setPhase] = useState('setup');
    const [simStep, setSimStep] = useState(0);
    const [result, setResult] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [mapViewState, setMapViewState] = useState({
        latitude: 20, longitude: 25, zoom: 2, pitch: 0,
    });

    // Load CSV data on mount
    useEffect(() => {
        loadGeocodedData().then(data => {
            setAllData(data);

            // Extract unique countries sorted by frequency
            const countryCount = {};
            data.forEach(d => { countryCount[d.country] = (countryCount[d.country] || 0) + 1; });
            const sortedCountries = Object.entries(countryCount)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({ name, count }));
            setCountries(sortedCountries);

            // Extract disaster types
            const types = [...new Set(data.map(d => d.disaster_type).filter(Boolean))];
            setDisasterTypes(types);
        });
    }, []);

    // Filtered data for selected country + disaster type
    const filteredData = useMemo(() => {
        if (!selectedCountry) return [];
        let filtered = allData.filter(d => d.country === selectedCountry);
        if (selectedDisaster !== 'All') {
            filtered = filtered.filter(d => d.disaster_type === selectedDisaster);
        }
        return filtered;
    }, [allData, selectedCountry, selectedDisaster]);

    // GeoJSON for heatmap
    const heatmapGeoJSON = useMemo(() => {
        if (!result) return null;
        return {
            type: 'FeatureCollection',
            features: result.points.map(d => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
                properties: {
                    weight: Math.log10(Math.max(d.total_affected, 1) + 1),
                    deaths: d.deaths,
                    injuries: d.injuries,
                    homeless: d.homeless,
                    total_affected: d.total_affected,
                    disaster_type: d.disaster_type,
                    location: d.location,
                },
            })),
        };
    }, [result]);

    // Country center coordinates (computed from data)
    const countryCenters = useMemo(() => {
        const centers = {};
        allData.forEach(d => {
            if (!centers[d.country]) centers[d.country] = { lats: [], lngs: [] };
            centers[d.country].lats.push(d.lat);
            centers[d.country].lngs.push(d.lng);
        });
        const result = {};
        for (const [country, coords] of Object.entries(centers)) {
            result[country] = {
                lat: coords.lats.reduce((a, b) => a + b, 0) / coords.lats.length,
                lng: coords.lngs.reduce((a, b) => a + b, 0) / coords.lngs.length,
            };
        }
        return result;
    }, [allData]);

    const handleCountrySelect = (countryName) => {
        setSelectedCountry(countryName);
        setResult(null);
        setPhase('setup');
        const center = countryCenters[countryName];
        if (center) {
            setMapViewState({
                latitude: center.lat,
                longitude: center.lng,
                zoom: 5,
                pitch: 20,
            });
        }
    };

    const handleRunSimulation = async () => {
        if (!selectedCountry) return;
        setPhase('simulating');
        setSimStep(0);

        // Animated progress steps
        for (let i = 0; i < simulationSteps.length; i++) {
            await new Promise(r => setTimeout(r, 600));
            setSimStep(i + 1);
        }

        // Compute real stats from the filtered data
        const points = filteredData;
        const totalDeaths = points.reduce((s, d) => s + d.deaths, 0);
        const totalInjuries = points.reduce((s, d) => s + d.injuries, 0);
        const totalHomeless = points.reduce((s, d) => s + d.homeless, 0);
        const totalAffected = points.reduce((s, d) => s + d.total_affected, 0);
        const totalEvents = points.length;

        // Break down by disaster type
        const byType = {};
        points.forEach(d => {
            if (!byType[d.disaster_type]) {
                byType[d.disaster_type] = { events: 0, deaths: 0, injuries: 0, homeless: 0, total_affected: 0 };
            }
            byType[d.disaster_type].events++;
            byType[d.disaster_type].deaths += d.deaths;
            byType[d.disaster_type].injuries += d.injuries;
            byType[d.disaster_type].homeless += d.homeless;
            byType[d.disaster_type].total_affected += d.total_affected;
        });

        // Find top affected locations (cluster by rounding lat/lng to 1 decimal)
        const clusters = {};
        points.forEach(d => {
            const key = `${d.lat.toFixed(1)},${d.lng.toFixed(1)}`;
            if (!clusters[key]) {
                clusters[key] = {
                    lat: d.lat, lng: d.lng,
                    location: d.location,
                    events: 0, deaths: 0, injuries: 0, homeless: 0, total_affected: 0,
                };
            }
            clusters[key].events++;
            clusters[key].deaths += d.deaths;
            clusters[key].injuries += d.injuries;
            clusters[key].homeless += d.homeless;
            clusters[key].total_affected += d.total_affected;
        });

        const topClusters = Object.values(clusters)
            .sort((a, b) => b.events - a.events)
            .slice(0, 8);

        // Severity based on event density
        topClusters.forEach(c => {
            if (c.events >= 10) c.severity = 'Critical';
            else if (c.events >= 5) c.severity = 'Severe';
            else if (c.events >= 3) c.severity = 'Moderate';
            else c.severity = 'Low';
        });

        // Chart data by disaster type
        const chartData = Object.entries(byType).map(([type, stats]) => ({
            name: type,
            events: stats.events,
            deaths: stats.deaths,
            affected: stats.total_affected,
            color: DISASTER_COLORS[type] || '#6b7280',
        }));

        // Key insights generated from the data
        const insights = [];
        const dominantType = chartData.sort((a, b) => b.events - a.events)[0];
        if (dominantType) {
            insights.push(`**${dominantType.name}** is the most frequent disaster type with ${dominantType.events} recorded events.`);
        }
        if (totalDeaths > 0) {
            insights.push(`Historical disasters caused **${formatNum(totalDeaths)} deaths** and affected **${formatNum(totalAffected)} people** total.`);
        }
        if (topClusters.length > 0) {
            insights.push(`Highest risk zone: **${topClusters[0].location || 'Unknown'}** with ${topClusters[0].events} disaster events clustered.`);
        }
        if (totalHomeless > 0) {
            insights.push(`**${formatNum(totalHomeless)} people** were left homeless across all recorded events.`);
        }
        const floodPct = byType['Flood'] ? ((byType['Flood'].events / totalEvents) * 100).toFixed(0) : 0;
        if (floodPct > 50) {
            insights.push(`Floods account for **${floodPct}%** of all disaster events — flood preparedness is critical.`);
        }

        setResult({
            points,
            summary: {
                totalEvents,
                totalDeaths,
                totalInjuries,
                totalHomeless,
                totalAffected,
            },
            byType: chartData,
            topClusters,
            insights,
        });
        setPhase('results');

        // Zoom to show all points
        if (points.length > 0) {
            const center = countryCenters[selectedCountry];
            if (center) {
                setMapViewState({
                    latitude: center.lat,
                    longitude: center.lng,
                    zoom: 5,
                    pitch: 30,
                });
            }
        }
    };

    const handleReset = () => {
        setPhase('setup');
        setResult(null);
        setSelectedCountry('');
        setSelectedDisaster('All');
        setSearchQuery('');
        setMapViewState({ latitude: 20, longitude: 25, zoom: 2, pitch: 0 });
    };

    // Filter countries by search
    const filteredCountries = useMemo(() => {
        if (!searchQuery) return countries.slice(0, 30);
        return countries.filter(c =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [countries, searchQuery]);

    const severityColors = {
        Critical: '#ef4444',
        Severe: '#f59e0b',
        Moderate: '#3b82f6',
        Low: '#10b981',
    };

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

                    {/* Heatmap layer */}
                    {heatmapGeoJSON && (
                        <Source id="disaster-heat" type="geojson" data={heatmapGeoJSON}>
                            <Layer
                                id="heatmap-layer"
                                type="heatmap"
                                paint={{
                                    'heatmap-weight': ['get', 'weight'],
                                    'heatmap-intensity': [
                                        'interpolate', ['linear'], ['zoom'],
                                        0, 1,
                                        9, 3,
                                    ],
                                    'heatmap-color': [
                                        'interpolate', ['linear'], ['heatmap-density'],
                                        0, 'rgba(0,0,0,0)',
                                        0.1, 'rgba(49,130,206,0.3)',
                                        0.3, 'rgba(49,163,84,0.5)',
                                        0.5, 'rgba(255,195,0,0.6)',
                                        0.7, 'rgba(245,130,48,0.8)',
                                        1.0, 'rgba(220,38,38,0.9)',
                                    ],
                                    'heatmap-radius': [
                                        'interpolate', ['linear'], ['zoom'],
                                        0, 15,
                                        5, 30,
                                        10, 50,
                                    ],
                                    'heatmap-opacity': 0.8,
                                }}
                            />
                            {/* Point layer visible when zoomed in */}
                            <Layer
                                id="disaster-points"
                                type="circle"
                                minzoom={7}
                                paint={{
                                    'circle-radius': 6,
                                    'circle-color': [
                                        'match', ['get', 'disaster_type'],
                                        'Flood', '#3b82f6',
                                        'Earthquake', '#f59e0b',
                                        'Epidemic', '#ef4444',
                                        'Drought', '#a855f7',
                                        '#6b7280',
                                    ],
                                    'circle-stroke-width': 1,
                                    'circle-stroke-color': 'rgba(255,255,255,0.5)',
                                    'circle-opacity': 0.8,
                                }}
                            />
                        </Source>
                    )}
                </Map>

                {/* Map legend */}
                {result && (
                    <div className="map-legend glass">
                        <span className="legend-title">Disaster Density</span>
                        <div className="legend-gradient">
                            <div className="gradient-bar" />
                            <div className="gradient-labels">
                                <span>Low</span>
                                <span>High</span>
                            </div>
                        </div>
                        <div className="legend-stats">
                            <span>{result.points.length} events mapped</span>
                        </div>
                    </div>
                )}

                {/* Country overlay */}
                {selectedCountry && (
                    <div className="map-overlay-info glass">
                        <span className="map-overlay-country">{selectedCountry}</span>
                        {selectedDisaster !== 'All' && (
                            <span className="map-overlay-crisis">
                                {selectedDisaster}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Control Panel */}
            <div className="sim-panel">
                <div className="sim-panel-header">
                    <div className="sim-panel-title">
                        <Crosshair size={20} />
                        <h2>Disaster Risk Simulator</h2>
                    </div>
                    <span className="sim-badge">LIVE DATA</span>
                </div>

                <AnimatePresence mode="wait">
                    {/* ── Setup Phase ── */}
                    {phase === 'setup' && (
                        <motion.div
                            key="setup"
                            className="sim-phase"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            {/* Country Search */}
                            <div className="sim-section">
                                <label className="sim-label">
                                    <MapPin size={14} />
                                    Select Country
                                </label>
                                <input
                                    type="text"
                                    className="sim-search"
                                    placeholder="Search countries..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                <div className="country-grid">
                                    {filteredCountries.map(c => (
                                        <button
                                            key={c.name}
                                            className={`country-chip ${selectedCountry === c.name ? 'active' : ''}`}
                                            onClick={() => handleCountrySelect(c.name)}
                                        >
                                            <span className="country-chip-name">{c.name}</span>
                                            <span className="country-chip-pop">{c.count} events</span>
                                        </button>
                                    ))}
                                    {filteredCountries.length === 0 && (
                                        <p className="no-results">No countries match your search</p>
                                    )}
                                </div>
                            </div>

                            {/* Disaster Type Filter */}
                            {selectedCountry && (
                                <motion.div
                                    className="sim-section"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <label className="sim-label">
                                        <AlertTriangle size={14} />
                                        Disaster Type
                                    </label>
                                    <div className="crisis-list">
                                        <button
                                            className={`crisis-option ${selectedDisaster === 'All' ? 'active' : ''}`}
                                            onClick={() => setSelectedDisaster('All')}
                                        >
                                            <span className="crisis-icon">🌍</span>
                                            <div>
                                                <div className="crisis-name">All Types</div>
                                                <div className="crisis-desc">Show all disaster events</div>
                                            </div>
                                        </button>
                                        {disasterTypes.map(type => {
                                            const icons = { Flood: '🌊', Earthquake: '🫨', Epidemic: '🦠', Drought: '☀️' };
                                            const countForType = allData.filter(d => d.country === selectedCountry && d.disaster_type === type).length;
                                            if (countForType === 0) return null;
                                            return (
                                                <button
                                                    key={type}
                                                    className={`crisis-option ${selectedDisaster === type ? 'active' : ''}`}
                                                    onClick={() => setSelectedDisaster(type)}
                                                >
                                                    <span className="crisis-icon">{icons[type] || '⚠️'}</span>
                                                    <div>
                                                        <div className="crisis-name">{type}</div>
                                                        <div className="crisis-desc">{countForType} events in {selectedCountry}</div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            )}

                            {/* Run Button */}
                            {selectedCountry && (
                                <motion.button
                                    className="run-btn"
                                    onClick={handleRunSimulation}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <Play size={18} />
                                    Analyze Disaster Risk
                                </motion.button>
                            )}
                        </motion.div>
                    )}

                    {/* ── Simulating Phase ── */}
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
                                <h3>Analyzing Risk...</h3>
                            </div>
                            <p className="sim-progress-sub">
                                Processing {filteredData.length} disaster events in {selectedCountry}
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

                    {/* ── Results Phase ── */}
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
                                    <AlertTriangle size={16} />
                                    <div>
                                        <div className="result-stat-val">{result.summary.totalEvents}</div>
                                        <div className="result-stat-label">Events</div>
                                    </div>
                                </div>
                                <div className="result-stat">
                                    <Skull size={16} />
                                    <div>
                                        <div className="result-stat-val danger">{formatNum(result.summary.totalDeaths)}</div>
                                        <div className="result-stat-label">Deaths</div>
                                    </div>
                                </div>
                                <div className="result-stat">
                                    <HeartPulse size={16} />
                                    <div>
                                        <div className="result-stat-val">{formatNum(result.summary.totalInjuries)}</div>
                                        <div className="result-stat-label">Injuries</div>
                                    </div>
                                </div>
                                <div className="result-stat">
                                    <Home size={16} />
                                    <div>
                                        <div className="result-stat-val">{formatNum(result.summary.totalHomeless)}</div>
                                        <div className="result-stat-label">Homeless</div>
                                    </div>
                                </div>
                                <div className="result-stat full-width">
                                    <Users size={16} />
                                    <div>
                                        <div className="result-stat-val">{formatNum(result.summary.totalAffected)}</div>
                                        <div className="result-stat-label">Total Affected</div>
                                    </div>
                                </div>
                            </div>

                            {/* Chart: Events by Disaster Type */}
                            {result.byType.length > 1 && (
                                <div className="result-chart">
                                    <h4>Events by Disaster Type</h4>
                                    <ResponsiveContainer width="100%" height={180}>
                                        <BarChart data={result.byType} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                                            <XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                                            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                                            <Tooltip
                                                contentStyle={{
                                                    background: 'var(--bg-elevated)',
                                                    border: '1px solid var(--border-primary)',
                                                    borderRadius: 8,
                                                    fontSize: 11,
                                                    color: 'var(--text-primary)',
                                                }}
                                            />
                                            <Bar dataKey="events" name="Events" radius={[4, 4, 0, 0]}>
                                                {result.byType.map((entry, i) => (
                                                    <Cell key={i} fill={entry.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* High Risk Zones */}
                            <div className="result-regions">
                                <h4>Highest Risk Zones</h4>
                                {result.topClusters.map((cluster, i) => (
                                    <div key={i} className="region-row">
                                        <div
                                            className="region-sev-dot"
                                            style={{ background: severityColors[cluster.severity] }}
                                        />
                                        <div className="region-info">
                                            <span className="region-name">
                                                {cluster.location || `Zone ${cluster.lat.toFixed(1)}°, ${cluster.lng.toFixed(1)}°`}
                                            </span>
                                            <span className="region-stats">
                                                {cluster.events} events · {formatNum(cluster.deaths)} deaths · {formatNum(cluster.total_affected)} affected
                                            </span>
                                        </div>
                                        <span
                                            className="region-sev-tag"
                                            style={{ color: severityColors[cluster.severity] }}
                                        >
                                            {cluster.severity}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Key Insights */}
                            <div className="result-insights">
                                <h4>Key Insights</h4>
                                <ul>
                                    {result.insights.map((insight, i) => (
                                        <li key={i}>
                                            <ArrowRight size={12} />
                                            <span dangerouslySetInnerHTML={{
                                                __html: insight.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                            }} />
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
