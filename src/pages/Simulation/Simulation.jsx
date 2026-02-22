import { useState, useEffect, useMemo, useCallback } from 'react';
import Map, { Source, Layer, NavigationControl, Marker } from 'react-map-gl';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
    Radar, Play, RotateCcw, AlertTriangle,
    Users, MapPin, ArrowRight,
    Target, Skull, Home, ChevronLeft,
    HeartPulse, Droplets, Mountain, Sun, Bug,
    ChevronRight, Search,
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

/* ── Mapbox Geocoding API ── */
const geocodeCache = {};
async function geocodePlace(placeName, country = '') {
    const key = `${placeName}|${country}`;
    if (geocodeCache[key]) return geocodeCache[key];
    try {
        const query = country ? `${placeName}, ${country}` : placeName;
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.features && data.features.length > 0) {
            const [lng, lat] = data.features[0].center;
            const result = { lat, lng, displayName: data.features[0].place_name };
            geocodeCache[key] = result;
            return result;
        }
    } catch (e) {
        console.warn('Geocoding failed for:', placeName, e);
    }
    return null;
}

const DISASTER_CONFIG = {
    Flood: { icon: '🌊', color: '#3b82f6', label: 'Flood', desc: 'Riverine flooding, flash floods, coastal surges' },
    Earthquake: { icon: '🫨', color: '#f59e0b', label: 'Earthquake', desc: 'Seismic activity & ground shaking' },
    Drought: { icon: '☀️', color: '#a855f7', label: 'Drought', desc: 'Prolonged water scarcity & crop failure' },
    Epidemic: { icon: '🦠', color: '#ef4444', label: 'Epidemic', desc: 'Disease outbreaks in urban populations' },
};

const severityColors = {
    Critical: '#ef4444',
    Severe: '#f59e0b',
    Moderate: '#3b82f6',
    Low: '#10b981',
};

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
    }).filter(d => d.disaster_type);
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

    // Flow: disaster → country → results
    const [phase, setPhase] = useState('disaster');
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
                label: `${count} recorded events`,
            }));
    }, [selectedDisaster, geoData, epidemicData]);

    /* ── Filtered countries by search ── */
    const filteredCountries = useMemo(() => {
        if (!searchQuery) return rankedCountries;
        return rankedCountries.filter(c =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [rankedCountries, searchQuery]);

    /* ── Loading state for geocoding ── */
    const [geocoding, setGeocoding] = useState(false);



    /* ── Handlers ── */
    const handleSelectDisaster = (type) => {
        setSelectedDisaster(type);
        setSelectedCountry('');
        setSearchQuery('');
        setResult(null);
        setPhase('country');
    };

    const handleSelectCountry = async (name) => {
        setSelectedCountry(name);
        // Geocode the country to fly the map there
        const geo = await geocodePlace(name);
        if (geo) {
            setMapViewState({ latitude: geo.lat, longitude: geo.lng, zoom: 5, pitch: 20 });
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
            if (zone.lat && zone.lng) {
                setMapViewState({ latitude: zone.lat, longitude: zone.lng, zoom: 8, pitch: 30 });
            }
        }
    }, [result]);

    /* ── Run analysis ── */
    const handleRun = async () => {
        if (!selectedCountry || !selectedDisaster) return;
        setGeocoding(true);

        try {
            if (selectedDisaster === 'Epidemic') {
                await runEpidemic();
            } else {
                await runDisaster();
            }
        } finally {
            setGeocoding(false);
        }
    };

    /* ── Epidemic ── */
    const runEpidemic = async () => {
        const countryData = epidemicData.find(d => d.country === selectedCountry);
        if (!countryData) return;

        // Geocode all cities in parallel
        const geocodeResults = await Promise.all(
            countryData.cities.map(city => geocodePlace(city.name, selectedCountry))
        );

        const cities = countryData.cities.map((city, i) => {
            const infectionRate = 0.12 + Math.random() * 0.08;
            const mortalityRate = 0.015 + Math.random() * 0.01;
            const hospitalizationRate = 0.08 + Math.random() * 0.04;
            const infected = Math.round(city.population * infectionRate);
            const deaths = Math.round(infected * mortalityRate);
            const hospitalized = Math.round(infected * hospitalizationRate);
            const geo = geocodeResults[i];
            return {
                ...city,
                lat: geo?.lat || 0,
                lng: geo?.lng || 0,
                infected, deaths, hospitalized,
                infectionRate: (infectionRate * 100).toFixed(1),
                severity: i === 0 ? 'Critical' : i === 1 ? 'Severe' : 'Moderate',
            };
        });

        const totalPop = cities.reduce((s, c) => s + c.population, 0);
        const totalInfected = cities.reduce((s, c) => s + c.infected, 0);
        const totalDeaths = cities.reduce((s, c) => s + c.deaths, 0);
        const totalHospitalized = cities.reduce((s, c) => s + c.hospitalized, 0);

        // Fly to first city
        if (cities[0]?.lat) {
            setMapViewState({ latitude: cities[0].lat, longitude: cities[0].lng, zoom: 7, pitch: 30 });
        }

        setResult({
            type: 'epidemic',
            country: selectedCountry,
            cities,
            summary: { totalPopulation: totalPop, totalInfected, totalDeaths, totalHospitalized },
            insights: [
                `**${cities[0].name}** is the most vulnerable with ${fmt(cities[0].population)} residents and a projected **${cities[0].infectionRate}%** infection rate.`,
                `An epidemic could affect **${fmt(totalInfected)} people** across ${cities.length} major urban centers.`,
                `Estimated **${fmt(totalHospitalized)} hospitalizations** would strain healthcare systems significantly.`,
                totalDeaths > 0 ? `Projected mortality: **${fmt(totalDeaths)}** — early intervention is critical.` : null,
            ].filter(Boolean),
        });
        setPhase('results');
    };

    /* ── Disaster (Flood / Earthquake / Drought) ── */
    const runDisaster = async () => {
        const points = geoData.filter(
            d => d.disaster_type === selectedDisaster && d.country === selectedCountry
        );

        const totalDeaths = points.reduce((s, d) => s + d.deaths, 0);
        const totalInjuries = points.reduce((s, d) => s + d.injuries, 0);
        const totalHomeless = points.reduce((s, d) => s + d.homeless, 0);
        const totalAffected = points.reduce((s, d) => s + d.total_affected, 0);

        // Cluster by location NAME (not lat/lng since CSV coords are unreliable)
        const clusters = {};
        points.forEach(d => {
            // Use first part of location as the cluster key
            const locName = (d.location || '').split(',')[0].trim() || 'Unknown';
            if (!clusters[locName]) {
                clusters[locName] = {
                    location: locName,
                    events: 0, deaths: 0, injuries: 0, homeless: 0, total_affected: 0,
                };
            }
            clusters[locName].events++;
            clusters[locName].deaths += d.deaths;
            clusters[locName].injuries += d.injuries;
            clusters[locName].homeless += d.homeless;
            clusters[locName].total_affected += d.total_affected;
        });

        // Rank by composite score: blend event frequency (40%) + impact (60%)
        const rawZones = Object.values(clusters);
        const maxEvents = Math.max(...rawZones.map(z => z.events), 1);
        const maxImpact = Math.max(...rawZones.map(z => z.deaths + z.total_affected), 1);

        const allZones = rawZones
            .map(zone => {
                const normEvents = zone.events / maxEvents;
                const normImpact = (zone.deaths + zone.total_affected) / maxImpact;
                const score = normEvents * 0.4 + normImpact * 0.6;
                return {
                    ...zone,
                    score,
                    severity: score >= 0.7 ? 'Critical'
                        : score >= 0.4 ? 'Severe'
                            : score >= 0.15 ? 'Moderate' : 'Low',
                };
            })
            .sort((a, b) => b.score - a.score);

        const topZones = allZones.slice(0, 3);

        // Geocode top 3 zones via Mapbox
        const geocodeResults = await Promise.all(
            topZones.map(z => geocodePlace(z.location, selectedCountry))
        );
        topZones.forEach((zone, i) => {
            const geo = geocodeResults[i];
            zone.lat = geo?.lat || 0;
            zone.lng = geo?.lng || 0;
        });

        const chartData = topZones.map(z => ({
            name: z.location?.substring(0, 15) || 'Zone',
            events: z.events,
            deaths: z.deaths,
            affected: z.total_affected,
        }));

        const insights = [];
        if (topZones[0]) {
            insights.push(`**${topZones[0].location || 'Primary zone'}** is the most disaster-prone area with **${topZones[0].events}** recorded ${selectedDisaster.toLowerCase()} events.`);
        }
        insights.push(`Historical data shows **${fmt(totalDeaths)} deaths** and **${fmt(totalAffected)} people affected** in ${selectedCountry}.`);
        if (totalHomeless > 0) {
            insights.push(`**${fmt(totalHomeless)} people** were displaced — shelter infrastructure is a key concern.`);
        }
        if (points.length > 20) {
            insights.push(`With **${points.length} events** on record, ${selectedCountry} has significant ${selectedDisaster.toLowerCase()} vulnerability.`);
        }

        // Fly to top zone
        if (topZones[0]?.lat) {
            setMapViewState({ latitude: topZones[0].lat, longitude: topZones[0].lng, zoom: 7, pitch: 30 });
        }

        setResult({
            type: 'disaster',
            country: selectedCountry,
            disasterType: selectedDisaster,
            topZones,
            allZones,
            chartData,
            summary: { totalEvents: points.length, totalDeaths, totalInjuries, totalHomeless, totalAffected },
            insights,
        });

        setPhase('results');
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
            setHeatmapOpacity(0);
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

                    {/* Top zone markers */}
                    {result?.type === 'disaster' && result.topZones.map((zone, i) => (
                        <Marker key={i} latitude={zone.lat} longitude={zone.lng} anchor="center">
                            <motion.div
                                className={`zone-marker ${activeZone === i ? 'active' : ''} ${zone.severity.toLowerCase()}`}
                                onClick={() => handleZoneClick(i)}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.3 + i * 0.2, type: 'spring', stiffness: 300 }}
                            >
                                <div className="zone-marker-ring" />
                                <div className="zone-marker-core">
                                    <span>{i + 1}</span>
                                </div>
                                {activeZone === i && (
                                    <motion.div
                                        className="zone-marker-label"
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                    >
                                        <span>{zone.location?.split(',')[0] || 'Zone'}</span>
                                    </motion.div>
                                )}
                            </motion.div>
                        </Marker>
                    ))}

                    {/* Epidemic city markers */}
                    {result?.type === 'epidemic' && result.cities.map((city, i) => (
                        <Marker key={i} latitude={city.lat || 0} longitude={city.lng || 0} anchor="center">
                            <motion.div
                                className={`zone-marker ${activeZone === i ? 'active' : ''} ${city.severity.toLowerCase()}`}
                                onClick={() => handleZoneClick(i)}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.2 + i * 0.15, type: 'spring' }}
                            >
                                <div className="zone-marker-ring" />
                                <div className="zone-marker-core">
                                    <span>{i + 1}</span>
                                </div>
                                {activeZone === i && (
                                    <motion.div
                                        className="zone-marker-label"
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                    >
                                        <span>{city.name}</span>
                                    </motion.div>
                                )}
                            </motion.div>
                        </Marker>
                    ))}
                </Map>

                {/* Legend */}
                {result?.type === 'disaster' && (
                    <motion.div
                        className="map-legend glass"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <span className="legend-title">{selectedDisaster} Risk Zones</span>
                        <div className="legend-gradient">
                            <div className="gradient-bar" />
                            <div className="gradient-labels"><span>Low</span><span>High</span></div>
                        </div>
                        <div className="legend-stats">{result.summary.totalEvents} events analyzed</div>
                    </motion.div>
                )}

                {/* Top overlay */}
                {selectedCountry && phase !== 'disaster' && (
                    <motion.div
                        className="map-overlay-info glass"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                    >
                        <span className="map-overlay-country">{selectedCountry}</span>
                        {cfg && <span className="map-overlay-tag" style={{ background: `${cfg.color}20`, color: cfg.color }}>{cfg.icon} {cfg.label}</span>}
                    </motion.div>
                )}
            </div>

            {/* ── Side Panel ── */}
            <div className="sim-panel">
                <div className="sim-panel-header">
                    <div className="sim-panel-title">
                        <Radar size={20} />
                        <h2>Disaster Forecast</h2>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {/* ═══ Phase 1: Disaster Type Selection ═══ */}
                    {phase === 'disaster' && (
                        <motion.div
                            key="disaster"
                            className="sim-phase"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className="sim-section">
                                <div className="disaster-type-grid">
                                    {Object.entries(DISASTER_CONFIG).map(([type, config]) => (
                                        <motion.button
                                            key={type}
                                            className="disaster-type-card"
                                            onClick={() => handleSelectDisaster(type)}
                                            whileHover={{ x: 4 }}
                                            whileTap={{ scale: 0.98 }}
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
                                        </motion.button>
                                    ))}
                                </div>
                            </div>

                            <div className="sim-info-card">
                                <Radar size={16} />
                                <p>Choose a disaster type to view country-level vulnerability rankings based on historical data and demographic analysis.</p>
                            </div>
                        </motion.div>
                    )}

                    {/* ═══ Phase 2: Country Selection ═══ */}
                    {phase === 'country' && (
                        <motion.div
                            key="country"
                            className="sim-phase"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                        >
                            <button className="back-btn" onClick={handleBack}>
                                <ChevronLeft size={14} /> Back
                            </button>

                            <div className="selected-disaster-badge" style={{ borderColor: cfg?.color, background: `${cfg?.color}08` }}>
                                <span className="sdb-icon">{cfg?.icon}</span>
                                <span className="sdb-label">{cfg?.label} Forecast</span>
                            </div>

                            <div className="sim-section">
                                <label className="sim-label">
                                    <MapPin size={14} />
                                    {selectedDisaster === 'Epidemic'
                                        ? 'Countries ranked by urban population at risk'
                                        : `Countries ranked by ${selectedDisaster?.toLowerCase()} frequency`
                                    }
                                </label>
                                <div className="search-wrap">
                                    <Search size={14} className="search-icon" />
                                    <input
                                        type="text"
                                        className="sim-search"
                                        placeholder="Search countries..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className="country-list">
                                    {filteredCountries.map((c, idx) => (
                                        <motion.button
                                            key={c.name}
                                            className={`country-row-btn ${selectedCountry === c.name ? 'active' : ''}`}
                                            onClick={() => handleSelectCountry(c.name)}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                                        >
                                            <span className="crb-rank">#{idx + 1}</span>
                                            <div className="crb-info">
                                                <span className="crb-name">{c.name}</span>
                                                <span className="crb-count">{c.label}</span>
                                            </div>
                                            <div className="crb-bar-wrap">
                                                <motion.div
                                                    className="crb-bar"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(c.count / (rankedCountries[0]?.count || 1)) * 100}%` }}
                                                    transition={{ delay: Math.min(idx * 0.02, 0.3), duration: 0.5 }}
                                                    style={{ background: cfg?.color }}
                                                />
                                            </div>
                                        </motion.button>
                                    ))}
                                    {filteredCountries.length === 0 && (
                                        <p className="no-results">No countries match your search</p>
                                    )}
                                </div>
                            </div>

                            <AnimatePresence>
                                {selectedCountry && (
                                    <motion.button
                                        className="run-btn"
                                        onClick={handleRun}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        style={{
                                            background: `linear-gradient(135deg, ${cfg?.color}, ${cfg?.color}cc)`,
                                        }}
                                    >
                                        {geocoding ? <span className="geocoding-spinner" /> : <Play size={18} />}
                                        {geocoding ? 'Locating zones…' : `Visualize ${cfg?.label} Risk`}
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}

                    {/* ═══ Phase 3: Results ═══ */}
                    {phase === 'results' && result && (
                        <motion.div
                            key="results"
                            className="sim-phase results-phase"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="results-header">
                                <button className="back-btn" onClick={handleBack}>
                                    <ChevronLeft size={14} /> Back
                                </button>
                                <button className="btn-ghost" onClick={handleReset}>
                                    <RotateCcw size={14} /> Reset
                                </button>
                            </div>

                            <div className="results-title-row">
                                <span className="results-title-icon" style={{ background: `${cfg?.color}15` }}>{cfg?.icon}</span>
                                <div>
                                    <h3>{cfg?.label} Impact</h3>
                                    <span className="results-subtitle">{selectedCountry}</span>
                                </div>
                            </div>

                            {result.type === 'epidemic' ? (
                                /* ─── Epidemic Results ─── */
                                <>
                                    <div className="result-stats">
                                        <motion.div className="result-stat" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}>
                                            <Users size={16} />
                                            <div>
                                                <div className="result-stat-val">{fmt(result.summary.totalPopulation)}</div>
                                                <div className="result-stat-label">Urban Pop.</div>
                                            </div>
                                        </motion.div>
                                        <motion.div className="result-stat" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 }}>
                                            <Bug size={16} />
                                            <div>
                                                <div className="result-stat-val danger">{fmt(result.summary.totalInfected)}</div>
                                                <div className="result-stat-label">Infected</div>
                                            </div>
                                        </motion.div>
                                        <motion.div className="result-stat" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}>
                                            <HeartPulse size={16} />
                                            <div>
                                                <div className="result-stat-val">{fmt(result.summary.totalHospitalized)}</div>
                                                <div className="result-stat-label">Hospitalized</div>
                                            </div>
                                        </motion.div>
                                        <motion.div className="result-stat" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25 }}>
                                            <Skull size={16} />
                                            <div>
                                                <div className="result-stat-val danger">{fmt(result.summary.totalDeaths)}</div>
                                                <div className="result-stat-label">Projected Deaths</div>
                                            </div>
                                        </motion.div>
                                    </div>

                                    <div className="city-impact-section">
                                        <h4>Urban Impact Breakdown</h4>
                                        {result.cities.map((city, i) => (
                                            <motion.div
                                                key={i}
                                                className={`city-impact-card ${activeZone === i ? 'active' : ''}`}
                                                onClick={() => handleZoneClick(i)}
                                                initial={{ opacity: 0, x: 10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.3 + i * 0.1 }}
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
                                                        <motion.div
                                                            className="cic-bar-fill"
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${parseFloat(city.infectionRate)}%` }}
                                                            transition={{ delay: 0.5 + i * 0.1, duration: 0.8, ease: 'easeOut' }}
                                                            style={{ background: severityColors[city.severity] }}
                                                        />
                                                    </div>
                                                    <span className="cic-bar-label">{city.infectionRate}% infection rate</span>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                /* ─── Disaster Results ─── */
                                <>
                                    <div className="result-stats">
                                        <motion.div className="result-stat" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}>
                                            <AlertTriangle size={16} />
                                            <div>
                                                <div className="result-stat-val">{result.summary.totalEvents}</div>
                                                <div className="result-stat-label">Events</div>
                                            </div>
                                        </motion.div>
                                        <motion.div className="result-stat" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 }}>
                                            <Skull size={16} />
                                            <div>
                                                <div className="result-stat-val danger">{fmt(result.summary.totalDeaths)}</div>
                                                <div className="result-stat-label">Deaths</div>
                                            </div>
                                        </motion.div>
                                        <motion.div className="result-stat" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}>
                                            <HeartPulse size={16} />
                                            <div>
                                                <div className="result-stat-val">{fmt(result.summary.totalInjuries)}</div>
                                                <div className="result-stat-label">Injuries</div>
                                            </div>
                                        </motion.div>
                                        <motion.div className="result-stat" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25 }}>
                                            <Home size={16} />
                                            <div>
                                                <div className="result-stat-val">{fmt(result.summary.totalHomeless)}</div>
                                                <div className="result-stat-label">Displaced</div>
                                            </div>
                                        </motion.div>
                                    </div>

                                    <div className="top-zones">
                                        <h4><Target size={14} /> Highest Risk Zones</h4>
                                        {result.topZones.map((zone, i) => (
                                            <motion.button
                                                key={i}
                                                className={`zone-card ${activeZone === i ? 'active' : ''}`}
                                                onClick={() => handleZoneClick(i)}
                                                initial={{ opacity: 0, x: 10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.3 + i * 0.1 }}
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

                                    {result.chartData.length > 0 && (
                                        <motion.div
                                            className="result-chart"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.6 }}
                                        >
                                            <h4>Events by Risk Zone</h4>
                                            <ResponsiveContainer width="100%" height={140}>
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
                                        </motion.div>
                                    )}
                                </>
                            )}

                            {/* Insights */}
                            <motion.div
                                className="result-insights"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.7 }}
                            >
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
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
