import { useState, useEffect, useMemo, useCallback } from 'react';
import Map, { Source, Layer, NavigationControl, Marker } from 'react-map-gl';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
    Crosshair, Play, RotateCcw, AlertTriangle,
    Users, MapPin, Loader2, CheckCircle2, ArrowRight,
    Shield, Activity, TrendingDown, Skull, Home,
    HeartPulse, Droplets, Mountain, Sun, Bug,
    ChevronRight, Target, Zap,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Simulation.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */
function fmt(n) {
    if (!n || isNaN(n)) return '0';
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toLocaleString();
}

const DISASTER_CONFIG = {
    Flood: { icon: '🌊', color: '#3b82f6', emoji: <Droplets size={18} />, label: 'Flood', desc: 'Riverine flooding, flash floods, coastal surges' },
    Earthquake: { icon: '🫨', color: '#f59e0b', emoji: <Mountain size={18} />, label: 'Earthquake', desc: 'Seismic activity & ground shaking' },
    Drought: { icon: '☀️', color: '#a855f7', emoji: <Sun size={18} />, label: 'Drought', desc: 'Prolonged water scarcity & crop failure' },
    Epidemic: { icon: '🦠', color: '#ef4444', emoji: <Bug size={18} />, label: 'Epidemic', desc: 'Disease outbreaks in urban populations' },
};

const severityColors = {
    Critical: '#ef4444',
    Severe: '#f59e0b',
    Moderate: '#3b82f6',
    Low: '#10b981',
};

const simulationSteps = [
    { label: 'Loading disaster database', icon: Shield },
    { label: 'Filtering events by region', icon: Activity },
    { label: 'Computing spatial clusters', icon: MapPin },
    { label: 'Aggregating impact data', icon: TrendingDown },
    { label: 'Rendering risk visualization', icon: Crosshair },
];

/* ═══════════════════════════════════════════════
   CSV PARSERS
   ═══════════════════════════════════════════════ */
function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue; }
        current += ch;
    }
    fields.push(current.trim());
    return fields;
}

async function loadGeocodedData() {
    const res = await fetch('/csv/geocoding/geocoded_output.csv');
    const text = await res.text();
    const lines = text.split('\n').filter(l => l.trim());
    return lines.slice(1).map(line => {
        const f = parseCSVLine(line);
        return {
            disaster_type: f[1],
            country: f[2],
            region: f[3],
            location: f[4],
            lat: parseFloat(f[5]),
            lng: parseFloat(f[6]),
            deaths: parseInt(f[7]) || 0,
            injuries: parseInt(f[8]) || 0,
            general_affected: parseInt(f[9]) || 0,
            homeless: parseInt(f[10]) || 0,
            total_affected: parseInt(f[11]) || 0,
        };
    }).filter(d => !isNaN(d.lat) && !isNaN(d.lng) && d.disaster_type);
}

async function loadEpidemicCities() {
    const res = await fetch('/csv/geocoding/epidemic_cities.csv');
    const text = await res.text();
    const lines = text.split('\n').filter(l => l.trim());
    return lines.slice(1).map(line => {
        const f = parseCSVLine(line);
        return {
            country: f[0],
            cities: [
                { name: f[1], population: parseInt(f[2]) || 0 },
                { name: f[3], population: parseInt(f[4]) || 0 },
                { name: f[5], population: parseInt(f[6]) || 0 },
            ].filter(c => c.name && c.population > 0),
        };
    }).filter(d => d.country && d.cities.length > 0);
}

/* ═══════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════ */
export default function Simulation() {
    const { theme } = useTheme();

    // Data
    const [geoData, setGeoData] = useState([]);
    const [epidemicData, setEpidemicData] = useState([]);
    const [loading, setLoading] = useState(true);

    // Selections
    const [selectedDisaster, setSelectedDisaster] = useState(null);
    const [selectedCountry, setSelectedCountry] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Simulation
    const [phase, setPhase] = useState('disaster'); // disaster | country | simulating | results
    const [simStep, setSimStep] = useState(0);
    const [result, setResult] = useState(null);
    const [activeZone, setActiveZone] = useState(0);

    // Map
    const [mapViewState, setMapViewState] = useState({
        latitude: 20, longitude: 25, zoom: 2, pitch: 0,
    });

    /* ── Load data ── */
    useEffect(() => {
        Promise.all([loadGeocodedData(), loadEpidemicCities()]).then(([geo, epi]) => {
            setGeoData(geo);
            setEpidemicData(epi);
            setLoading(false);
        });
    }, []);

    /* ── Disaster type counts ── */
    const disasterCounts = useMemo(() => {
        const counts = {};
        geoData.forEach(d => {
            counts[d.disaster_type] = (counts[d.disaster_type] || 0) + 1;
        });
        // Add Epidemic from epidemic cities
        counts['Epidemic'] = epidemicData.length;
        return counts;
    }, [geoData, epidemicData]);

    /* ── Countries for selected disaster ── */
    const rankedCountries = useMemo(() => {
        if (!selectedDisaster) return [];

        if (selectedDisaster === 'Epidemic') {
            return epidemicData
                .map(d => ({
                    name: d.country,
                    count: d.cities.reduce((s, c) => s + c.population, 0),
                    label: `${fmt(d.cities.reduce((s, c) => s + c.population, 0))} urban pop.`,
                }))
                .sort((a, b) => b.count - a.count);
        }

        const countryCounts = {};
        geoData
            .filter(d => d.disaster_type === selectedDisaster)
            .forEach(d => {
                countryCounts[d.country] = (countryCounts[d.country] || 0) + 1;
            });
        return Object.entries(countryCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({
                name,
                count,
                label: `${count} events`,
            }));
    }, [selectedDisaster, geoData, epidemicData]);

    /* ── Filtered countries by search ── */
    const filteredCountries = useMemo(() => {
        if (!searchQuery) return rankedCountries;
        return rankedCountries.filter(c =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [rankedCountries, searchQuery]);

    /* ── Country centers ── */
    const countryCenters = useMemo(() => {
        const centers = {};
        geoData.forEach(d => {
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
    }, [geoData]);

    /* ── GeoJSON for heatmap ── */
    const heatmapGeoJSON = useMemo(() => {
        if (!result || result.type === 'epidemic') return null;
        return {
            type: 'FeatureCollection',
            features: result.points.map(d => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
                properties: {
                    weight: Math.log10(Math.max(d.total_affected, 1) + 1),
                    disaster_type: d.disaster_type,
                },
            })),
        };
    }, [result]);

    /* ── Handlers ── */
    const handleSelectDisaster = (type) => {
        setSelectedDisaster(type);
        setSelectedCountry('');
        setSearchQuery('');
        setResult(null);
        setPhase('country');
    };

    const handleSelectCountry = (name) => {
        setSelectedCountry(name);
        const center = countryCenters[name];
        if (center) {
            setMapViewState({ latitude: center.lat, longitude: center.lng, zoom: 5, pitch: 20 });
        }
    };

    const handleZoneClick = useCallback((idx) => {
        setActiveZone(idx);
        if (!result) return;

        if (result.type === 'epidemic' && result.cities[idx]) {
            const city = result.cities[idx];
            if (city.lat && city.lng) {
                setMapViewState({ latitude: city.lat, longitude: city.lng, zoom: 10, pitch: 30 });
            }
        } else if (result.topZones[idx]) {
            const zone = result.topZones[idx];
            setMapViewState({ latitude: zone.lat, longitude: zone.lng, zoom: 8, pitch: 30 });
        }
    }, [result]);

    const handleRunSimulation = async () => {
        if (!selectedCountry || !selectedDisaster) return;
        setPhase('simulating');
        setSimStep(0);
        setActiveZone(0);

        for (let i = 0; i < simulationSteps.length; i++) {
            await new Promise(r => setTimeout(r, 550));
            setSimStep(i + 1);
        }

        if (selectedDisaster === 'Epidemic') {
            await runEpidemicSim();
        } else {
            await runDisasterSim();
        }
        setPhase('results');
    };

    /* ── Epidemic simulation ── */
    const runEpidemicSim = async () => {
        const countryData = epidemicData.find(d => d.country === selectedCountry);
        if (!countryData) return;

        // Simulate epidemic impact per city
        const cities = countryData.cities.map((city, i) => {
            // Simulated spread rates based on population density
            const infectionRate = 0.12 + Math.random() * 0.08; // 12-20%
            const mortalityRate = 0.015 + Math.random() * 0.01; // 1.5-2.5%
            const hospitalizationRate = 0.08 + Math.random() * 0.04; // 8-12%
            const infected = Math.round(city.population * infectionRate);
            const deaths = Math.round(infected * mortalityRate);
            const hospitalized = Math.round(infected * hospitalizationRate);

            return {
                ...city,
                infected,
                deaths,
                hospitalized,
                infectionRate: (infectionRate * 100).toFixed(1),
                severity: i === 0 ? 'Critical' : i === 1 ? 'Severe' : 'Moderate',
            };
        });

        const totalPop = cities.reduce((s, c) => s + c.population, 0);
        const totalInfected = cities.reduce((s, c) => s + c.infected, 0);
        const totalDeaths = cities.reduce((s, c) => s + c.deaths, 0);
        const totalHospitalized = cities.reduce((s, c) => s + c.hospitalized, 0);

        setResult({
            type: 'epidemic',
            country: selectedCountry,
            cities,
            summary: {
                totalPopulation: totalPop,
                totalInfected,
                totalDeaths,
                totalHospitalized,
            },
            insights: [
                `**${cities[0].name}** is the most vulnerable with ${fmt(cities[0].population)} residents and a projected **${cities[0].infectionRate}%** infection rate.`,
                `An epidemic could affect **${fmt(totalInfected)} people** across ${cities.length} major urban centers.`,
                `Estimated **${fmt(totalHospitalized)} hospitalizations** would strain healthcare systems significantly.`,
                totalDeaths > 0 ? `Projected mortality: **${fmt(totalDeaths)}** — early intervention is critical.` : null,
            ].filter(Boolean),
        });
    };

    /* ── Disaster simulation (Flood / Earthquake / Drought) ── */
    const runDisasterSim = async () => {
        const points = geoData.filter(
            d => d.disaster_type === selectedDisaster && d.country === selectedCountry
        );

        const totalDeaths = points.reduce((s, d) => s + d.deaths, 0);
        const totalInjuries = points.reduce((s, d) => s + d.injuries, 0);
        const totalHomeless = points.reduce((s, d) => s + d.homeless, 0);
        const totalAffected = points.reduce((s, d) => s + d.total_affected, 0);

        // Spatial clustering: round lat/lng to 1 decimal
        const clusters = {};
        points.forEach(d => {
            const key = `${d.lat.toFixed(1)},${d.lng.toFixed(1)}`;
            if (!clusters[key]) {
                clusters[key] = {
                    lat: d.lat, lng: d.lng, location: d.location,
                    events: 0, deaths: 0, injuries: 0, homeless: 0, total_affected: 0,
                    points: [],
                };
            }
            clusters[key].events++;
            clusters[key].deaths += d.deaths;
            clusters[key].injuries += d.injuries;
            clusters[key].homeless += d.homeless;
            clusters[key].total_affected += d.total_affected;
            clusters[key].points.push(d);
        });

        const allZones = Object.values(clusters)
            .sort((a, b) => b.events - a.events)
            .map((zone, i) => ({
                ...zone,
                severity: zone.events >= 8 ? 'Critical'
                    : zone.events >= 4 ? 'Severe'
                        : zone.events >= 2 ? 'Moderate' : 'Low',
            }));

        const topZones = allZones.slice(0, 3);

        // Impact chart data
        const chartData = topZones.map(z => ({
            name: z.location?.split(',')[0]?.substring(0, 15) || `Zone`,
            events: z.events,
            deaths: z.deaths,
            affected: z.total_affected,
        }));

        // Insights
        const insights = [];
        if (topZones[0]) {
            insights.push(`**${topZones[0].location?.split(',')[0] || 'Primary zone'}** is the most disaster-prone area with **${topZones[0].events}** recorded ${selectedDisaster.toLowerCase()} events.`);
        }
        insights.push(`Historical data shows **${fmt(totalDeaths)} deaths** and **${fmt(totalAffected)} people affected** in ${selectedCountry}.`);
        if (totalHomeless > 0) {
            insights.push(`**${fmt(totalHomeless)} people** were displaced — shelter infrastructure is a key concern.`);
        }
        if (points.length > 20) {
            insights.push(`With **${points.length} events** on record, ${selectedCountry} has significant ${selectedDisaster.toLowerCase()} vulnerability.`);
        }

        setResult({
            type: 'disaster',
            country: selectedCountry,
            disasterType: selectedDisaster,
            points,
            topZones,
            allZones,
            chartData,
            summary: {
                totalEvents: points.length,
                totalDeaths,
                totalInjuries,
                totalHomeless,
                totalAffected,
            },
            insights,
        });

        // Zoom to top zone
        if (topZones[0]) {
            setMapViewState({
                latitude: topZones[0].lat,
                longitude: topZones[0].lng,
                zoom: 7,
                pitch: 30,
            });
        }
    };

    const handleReset = () => {
        setPhase('disaster');
        setResult(null);
        setSelectedCountry('');
        setSelectedDisaster(null);
        setSearchQuery('');
        setActiveZone(0);
        setMapViewState({ latitude: 20, longitude: 25, zoom: 2, pitch: 0 });
    };

    const handleBack = () => {
        if (phase === 'country') {
            setPhase('disaster');
            setSelectedDisaster(null);
            setSelectedCountry('');
            setSearchQuery('');
        } else if (phase === 'results') {
            setPhase('country');
            setResult(null);
        }
    };

    const cfg = selectedDisaster ? DISASTER_CONFIG[selectedDisaster] : null;

    /* ═══════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════ */
    return (
        <div className="sim-page">
            {/* ── Map ── */}
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

                    {/* Heatmap for Flood/Earthquake/Drought */}
                    {heatmapGeoJSON && (
                        <Source id="disaster-heat" type="geojson" data={heatmapGeoJSON}>
                            <Layer
                                id="heatmap-layer"
                                type="heatmap"
                                paint={{
                                    'heatmap-weight': ['get', 'weight'],
                                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
                                    'heatmap-color': [
                                        'interpolate', ['linear'], ['heatmap-density'],
                                        0, 'rgba(0,0,0,0)',
                                        0.1, `${cfg?.color || '#3b82f6'}33`,
                                        0.3, `${cfg?.color || '#3b82f6'}88`,
                                        0.5, 'rgba(255,195,0,0.6)',
                                        0.7, 'rgba(245,130,48,0.8)',
                                        1.0, 'rgba(220,38,38,0.9)',
                                    ],
                                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 5, 30, 10, 50],
                                    'heatmap-opacity': 0.8,
                                }}
                            />
                            <Layer
                                id="disaster-points"
                                type="circle"
                                minzoom={7}
                                paint={{
                                    'circle-radius': 6,
                                    'circle-color': cfg?.color || '#3b82f6',
                                    'circle-stroke-width': 1,
                                    'circle-stroke-color': 'rgba(255,255,255,0.5)',
                                    'circle-opacity': 0.8,
                                }}
                            />
                        </Source>
                    )}

                    {/* Top zone markers */}
                    {result?.type === 'disaster' && result.topZones.map((zone, i) => (
                        <Marker key={i} latitude={zone.lat} longitude={zone.lng} anchor="center">
                            <div
                                className={`zone-marker ${activeZone === i ? 'active' : ''} ${zone.severity.toLowerCase()}`}
                                onClick={() => handleZoneClick(i)}
                            >
                                <div className="zone-marker-ring" />
                                <div className="zone-marker-core">
                                    <span>{i + 1}</span>
                                </div>
                                {activeZone === i && (
                                    <div className="zone-marker-label">
                                        <span>{zone.location?.split(',')[0] || 'Zone'}</span>
                                    </div>
                                )}
                            </div>
                        </Marker>
                    ))}

                    {/* Epidemic city markers */}
                    {result?.type === 'epidemic' && result.cities.map((city, i) => (
                        <Marker key={i} latitude={city.lat || 0} longitude={city.lng || 0} anchor="center">
                            <div
                                className={`zone-marker ${activeZone === i ? 'active' : ''} ${city.severity.toLowerCase()}`}
                                onClick={() => handleZoneClick(i)}
                            >
                                <div className="zone-marker-ring" />
                                <div className="zone-marker-core">
                                    <span>{i + 1}</span>
                                </div>
                                {activeZone === i && (
                                    <div className="zone-marker-label">
                                        <span>{city.name}</span>
                                    </div>
                                )}
                            </div>
                        </Marker>
                    ))}
                </Map>

                {/* Legend */}
                {result?.type === 'disaster' && (
                    <div className="map-legend glass">
                        <span className="legend-title">{selectedDisaster} Risk Density</span>
                        <div className="legend-gradient">
                            <div className="gradient-bar" />
                            <div className="gradient-labels"><span>Low</span><span>High</span></div>
                        </div>
                        <div className="legend-stats">{result.points.length} events mapped</div>
                    </div>
                )}

                {/* Top overlay */}
                {selectedCountry && phase !== 'disaster' && (
                    <div className="map-overlay-info glass">
                        <span className="map-overlay-country">{selectedCountry}</span>
                        {cfg && <span className="map-overlay-crisis">{cfg.icon} {cfg.label}</span>}
                    </div>
                )}
            </div>

            {/* ── Side Panel ── */}
            <div className="sim-panel">
                <div className="sim-panel-header">
                    <div className="sim-panel-title">
                        <Crosshair size={20} />
                        <h2>Crisis Simulator</h2>
                    </div>
                    <span className="sim-badge">LIVE DATA</span>
                </div>

                <AnimatePresence mode="wait">
                    {/* ═══ Phase: Disaster Type Selection ═══ */}
                    {phase === 'disaster' && (
                        <motion.div
                            key="disaster"
                            className="sim-phase"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <div className="sim-section">
                                <label className="sim-label">
                                    <AlertTriangle size={14} />
                                    What disaster do you want to simulate?
                                </label>
                                <div className="disaster-type-grid">
                                    {Object.entries(DISASTER_CONFIG).map(([type, config]) => (
                                        <button
                                            key={type}
                                            className="disaster-type-card"
                                            onClick={() => handleSelectDisaster(type)}
                                        >
                                            <div className="dtc-icon" style={{ background: `${config.color}15`, color: config.color }}>
                                                <span className="dtc-emoji">{config.icon}</span>
                                            </div>
                                            <div className="dtc-content">
                                                <span className="dtc-name">{config.label}</span>
                                                <span className="dtc-desc">{config.desc}</span>
                                            </div>
                                            <div className="dtc-count">
                                                <span>{type === 'Epidemic' ? epidemicData.length : (disasterCounts[type] || 0)}</span>
                                                <span className="dtc-count-label">{type === 'Epidemic' ? 'countries' : 'events'}</span>
                                            </div>
                                            <ChevronRight size={16} className="dtc-arrow" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="sim-info-card">
                                <Shield size={16} />
                                <p>Select a disaster type to see which countries are most vulnerable based on historical data and demographics.</p>
                            </div>
                        </motion.div>
                    )}

                    {/* ═══ Phase: Country Selection ═══ */}
                    {phase === 'country' && (
                        <motion.div
                            key="country"
                            className="sim-phase"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <button className="back-btn" onClick={handleBack}>
                                ← Back to disaster types
                            </button>

                            <div className="selected-disaster-badge" style={{ borderColor: cfg?.color }}>
                                <span className="sdb-icon">{cfg?.icon}</span>
                                <span className="sdb-label">{cfg?.label} Simulation</span>
                            </div>

                            <div className="sim-section">
                                <label className="sim-label">
                                    <MapPin size={14} />
                                    {selectedDisaster === 'Epidemic'
                                        ? 'Select country (ranked by urban population)'
                                        : `Select country (ranked by ${selectedDisaster?.toLowerCase()} events)`
                                    }
                                </label>
                                <input
                                    type="text"
                                    className="sim-search"
                                    placeholder="Search countries..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                <div className="country-list">
                                    {filteredCountries.map((c, idx) => (
                                        <button
                                            key={c.name}
                                            className={`country-row-btn ${selectedCountry === c.name ? 'active' : ''}`}
                                            onClick={() => handleSelectCountry(c.name)}
                                        >
                                            <span className="crb-rank">#{idx + 1}</span>
                                            <div className="crb-info">
                                                <span className="crb-name">{c.name}</span>
                                                <span className="crb-count">{c.label}</span>
                                            </div>
                                            <div className="crb-bar-wrap">
                                                <div
                                                    className="crb-bar"
                                                    style={{
                                                        width: `${(c.count / (rankedCountries[0]?.count || 1)) * 100}%`,
                                                        background: cfg?.color,
                                                    }}
                                                />
                                            </div>
                                        </button>
                                    ))}
                                    {filteredCountries.length === 0 && (
                                        <p className="no-results">No countries match your search</p>
                                    )}
                                </div>
                            </div>

                            {selectedCountry && (
                                <motion.button
                                    className="run-btn"
                                    onClick={handleRunSimulation}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    style={{
                                        background: `linear-gradient(135deg, ${cfg?.color}, ${cfg?.color}cc)`,
                                    }}
                                >
                                    <Play size={18} />
                                    Run {cfg?.label} Simulation
                                </motion.button>
                            )}
                        </motion.div>
                    )}

                    {/* ═══ Phase: Simulating ═══ */}
                    {phase === 'simulating' && (
                        <motion.div
                            key="simulating"
                            className="sim-phase simulating-phase"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="sim-progress-header">
                                <Loader2 size={20} className="spin" style={{ color: cfg?.color }} />
                                <h3>Simulating {cfg?.label}...</h3>
                            </div>
                            <p className="sim-progress-sub">
                                {selectedDisaster === 'Epidemic'
                                    ? `Modeling epidemic spread in ${selectedCountry}'s major cities`
                                    : `Processing disaster events in ${selectedCountry}`
                                }
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

                    {/* ═══ Phase: Results ═══ */}
                    {phase === 'results' && result && (
                        <motion.div
                            key="results"
                            className="sim-phase results-phase"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="results-header">
                                <h3>{cfg?.icon} {cfg?.label} Impact — {selectedCountry}</h3>
                                <button className="btn-ghost" onClick={handleReset}>
                                    <RotateCcw size={14} /> New
                                </button>
                            </div>

                            {result.type === 'epidemic' ? (
                                /* ─── Epidemic Results ─── */
                                <>
                                    {/* Stats */}
                                    <div className="result-stats">
                                        <div className="result-stat">
                                            <Users size={16} />
                                            <div>
                                                <div className="result-stat-val">{fmt(result.summary.totalPopulation)}</div>
                                                <div className="result-stat-label">Urban Pop.</div>
                                            </div>
                                        </div>
                                        <div className="result-stat">
                                            <Bug size={16} />
                                            <div>
                                                <div className="result-stat-val danger">{fmt(result.summary.totalInfected)}</div>
                                                <div className="result-stat-label">Infected</div>
                                            </div>
                                        </div>
                                        <div className="result-stat">
                                            <HeartPulse size={16} />
                                            <div>
                                                <div className="result-stat-val">{fmt(result.summary.totalHospitalized)}</div>
                                                <div className="result-stat-label">Hospitalized</div>
                                            </div>
                                        </div>
                                        <div className="result-stat">
                                            <Skull size={16} />
                                            <div>
                                                <div className="result-stat-val danger">{fmt(result.summary.totalDeaths)}</div>
                                                <div className="result-stat-label">Projected Deaths</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* City breakdown */}
                                    <div className="city-impact-section">
                                        <h4>Urban Impact Breakdown</h4>
                                        {result.cities.map((city, i) => (
                                            <motion.div
                                                key={i}
                                                className={`city-impact-card ${activeZone === i ? 'active' : ''}`}
                                                onClick={() => handleZoneClick(i)}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.1 }}
                                            >
                                                <div className="cic-header">
                                                    <div className="cic-rank" style={{ background: severityColors[city.severity] }}>
                                                        {i + 1}
                                                    </div>
                                                    <div className="cic-title">
                                                        <span className="cic-name">{city.name}</span>
                                                        <span className="cic-pop">{fmt(city.population)} population</span>
                                                    </div>
                                                    <span className="cic-severity" style={{ color: severityColors[city.severity] }}>
                                                        {city.severity}
                                                    </span>
                                                </div>
                                                <div className="cic-stats">
                                                    <div className="cic-stat">
                                                        <span className="cic-stat-val">{fmt(city.infected)}</span>
                                                        <span className="cic-stat-label">infected</span>
                                                    </div>
                                                    <div className="cic-stat">
                                                        <span className="cic-stat-val">{fmt(city.hospitalized)}</span>
                                                        <span className="cic-stat-label">hospitalized</span>
                                                    </div>
                                                    <div className="cic-stat">
                                                        <span className="cic-stat-val danger-text">{fmt(city.deaths)}</span>
                                                        <span className="cic-stat-label">deaths</span>
                                                    </div>
                                                </div>
                                                <div className="cic-bar-container">
                                                    <div className="cic-bar-bg">
                                                        <div
                                                            className="cic-bar-fill"
                                                            style={{
                                                                width: `${parseFloat(city.infectionRate)}%`,
                                                                background: severityColors[city.severity],
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="cic-bar-label">{city.infectionRate}% infection rate</span>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                /* ─── Disaster Results (Flood/Earthquake/Drought) ─── */
                                <>
                                    {/* Stats */}
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
                                                <div className="result-stat-val danger">{fmt(result.summary.totalDeaths)}</div>
                                                <div className="result-stat-label">Deaths</div>
                                            </div>
                                        </div>
                                        <div className="result-stat">
                                            <HeartPulse size={16} />
                                            <div>
                                                <div className="result-stat-val">{fmt(result.summary.totalInjuries)}</div>
                                                <div className="result-stat-label">Injuries</div>
                                            </div>
                                        </div>
                                        <div className="result-stat">
                                            <Home size={16} />
                                            <div>
                                                <div className="result-stat-val">{fmt(result.summary.totalHomeless)}</div>
                                                <div className="result-stat-label">Homeless</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Top 3 Risk Zones */}
                                    <div className="top-zones">
                                        <h4><Target size={14} /> Most Prone Zones</h4>
                                        {result.topZones.map((zone, i) => (
                                            <motion.button
                                                key={i}
                                                className={`zone-card ${activeZone === i ? 'active' : ''}`}
                                                onClick={() => handleZoneClick(i)}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.1 }}
                                            >
                                                <div className="zc-rank" style={{ background: severityColors[zone.severity] }}>
                                                    {i + 1}
                                                </div>
                                                <div className="zc-info">
                                                    <span className="zc-name">
                                                        {zone.location?.split(',')[0] || `Zone ${zone.lat.toFixed(1)}°`}
                                                    </span>
                                                    <span className="zc-stats">
                                                        {zone.events} events · {fmt(zone.deaths)} deaths · {fmt(zone.total_affected)} affected
                                                    </span>
                                                </div>
                                                <span className="zc-severity" style={{ color: severityColors[zone.severity] }}>
                                                    {zone.severity}
                                                </span>
                                            </motion.button>
                                        ))}
                                    </div>

                                    {/* Chart */}
                                    {result.chartData.length > 0 && (
                                        <div className="result-chart">
                                            <h4>Events by Risk Zone</h4>
                                            <ResponsiveContainer width="100%" height={160}>
                                                <BarChart data={result.chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                                                    <XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                                                    <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                                                    <Tooltip
                                                        contentStyle={{
                                                            background: 'var(--bg-elevated)',
                                                            border: '1px solid var(--border-primary)',
                                                            borderRadius: 8, fontSize: 11,
                                                            color: 'var(--text-primary)',
                                                        }}
                                                    />
                                                    <Bar dataKey="events" name="Events" radius={[4, 4, 0, 0]}>
                                                        {result.chartData.map((_, i) => (
                                                            <Cell
                                                                key={i}
                                                                fill={i === activeZone ? cfg?.color : `${cfg?.color}66`}
                                                            />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Insights (shared) */}
                            <div className="result-insights">
                                <h4>Key Insights</h4>
                                <ul>
                                    {result.insights.map((insight, i) => (
                                        <li key={i}>
                                            <ArrowRight size={12} />
                                            <span dangerouslySetInnerHTML={{
                                                __html: insight.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
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
