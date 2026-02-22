import { useState, useEffect, useCallback, useRef } from 'react';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Users, DollarSign, AlertTriangle, TrendingDown, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { fetchCrisisCountries } from '../../services/api';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Landing.css';

// Free Mapbox token for demo — replace with your own
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiZGVtby1hY2NvdW50IiwiYSI6ImNsdnR5cWVxejBhbTcyanBtdzV0dTl1MmYifQ.demo';

function formatNumber(num) {
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num}`;
}

export default function Landing() {
    const { theme } = useTheme();
    const navigate = useNavigate();
    const [countries, setCountries] = useState([]);
    const [hoveredCountry, setHoveredCountry] = useState(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const mapRef = useRef(null);

    useEffect(() => {
        fetchCrisisCountries().then(setCountries);
    }, []);

    const geojsonPoints = {
        type: 'FeatureCollection',
        features: countries.map(c => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
            properties: { ...c },
        })),
    };

    const handleHover = useCallback((event) => {
        const feature = event.features?.[0];
        if (feature) {
            setHoveredCountry(feature.properties);
        } else {
            setHoveredCountry(null);
        }
    }, []);

    const totalRequired = countries.reduce((s, c) => s + c.required, 0);
    const totalFunded = countries.reduce((s, c) => s + c.funded, 0);
    const totalAffectedCountries = countries.length;

    return (
        <div className="landing-page">
            {/* Background Map */}
            <div className="map-container">
                <Map
                    ref={mapRef}
                    initialViewState={{
                        latitude: 20,
                        longitude: 25,
                        zoom: 2.2,
                        pitch: 15,
                    }}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle={theme === 'dark'
                        ? 'mapbox://styles/mapbox/dark-v11'
                        : 'mapbox://styles/mapbox/light-v11'
                    }
                    mapboxAccessToken={MAPBOX_TOKEN}
                    onLoad={() => setMapLoaded(true)}
                    interactiveLayerIds={['crisis-points', 'crisis-pulse']}
                    onMouseMove={handleHover}
                    onMouseLeave={() => setHoveredCountry(null)}
                    cursor={hoveredCountry ? 'pointer' : 'grab'}
                    fog={{
                        color: theme === 'dark' ? '#0a0a0f' : '#f8f9fb',
                        'high-color': theme === 'dark' ? '#1a1a2e' : '#e0e5f0',
                        'space-color': theme === 'dark' ? '#000008' : '#d8dce8',
                    }}
                >
                    <NavigationControl position="bottom-right" />

                    {mapLoaded && (
                        <Source id="crisis-data" type="geojson" data={geojsonPoints}>
                            {/* Outer pulse ring */}
                            <Layer
                                id="crisis-pulse"
                                type="circle"
                                paint={{
                                    'circle-radius': [
                                        'interpolate', ['linear'], ['zoom'],
                                        1, 18,
                                        5, 35,
                                    ],
                                    'circle-color': 'rgba(233, 69, 96, 0.08)',
                                    'circle-stroke-width': 1,
                                    'circle-stroke-color': 'rgba(233, 69, 96, 0.15)',
                                }}
                            />
                            {/* Core crisis dot */}
                            <Layer
                                id="crisis-points"
                                type="circle"
                                paint={{
                                    'circle-radius': [
                                        'interpolate', ['linear'], ['zoom'],
                                        1, 5,
                                        5, 12,
                                    ],
                                    'circle-color': [
                                        'case',
                                        ['<', ['get', 'percentFunded'], 20], '#ef4444',
                                        ['<', ['get', 'percentFunded'], 40], '#f59e0b',
                                        '#e94560',
                                    ],
                                    'circle-stroke-width': 2,
                                    'circle-stroke-color': 'rgba(255,255,255,0.3)',
                                    'circle-opacity': 0.9,
                                }}
                            />
                        </Source>
                    )}

                    {/* Hover Popup */}
                    {hoveredCountry && (
                        <Popup
                            latitude={Number(hoveredCountry.lat)}
                            longitude={Number(hoveredCountry.lng)}
                            closeButton={false}
                            closeOnClick={false}
                            anchor="bottom"
                            offset={20}
                            className="crisis-popup"
                        >
                            <div className="popup-content">
                                <div className="popup-header">
                                    <span className="popup-country">{hoveredCountry.name}</span>
                                    <span className={`badge ${Number(hoveredCountry.percentFunded) < 20 ? 'badge-danger' : Number(hoveredCountry.percentFunded) < 50 ? 'badge-warning' : 'badge-info'}`}>
                                        {hoveredCountry.percentFunded}% funded
                                    </span>
                                </div>
                                <p className="popup-crisis">{hoveredCountry.crisis} · {hoveredCountry.year}</p>
                                <div className="popup-funding">
                                    <div className="funding-bar-bg">
                                        <div
                                            className="funding-bar-fill"
                                            style={{ width: `${Math.min(Number(hoveredCountry.percentFunded), 100)}%` }}
                                        />
                                    </div>
                                    <div className="funding-numbers">
                                        <span>Funded: {formatNumber(Number(hoveredCountry.funded))}</span>
                                        <span>Required: {formatNumber(Number(hoveredCountry.required))}</span>
                                    </div>
                                </div>
                                <p className="popup-summary">{hoveredCountry.summary}</p>
                            </div>
                        </Popup>
                    )}
                </Map>
            </div>

            {/* Hero Overlay */}
            <div className="hero-overlay">
                <motion.div
                    className="hero-content"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                >
                    <div className="hero-badge">
                        <AlertTriangle size={14} />
                        <span>GLOBAL HUMANITARIAN DATA PLATFORM</span>
                    </div>

                    <h1 className="hero-title">
                        Underfunded.<br />
                        <span className="text-accent">Overlooked.</span><br />
                        Unforgotten.
                    </h1>

                    <p className="hero-subtitle">
                        Real-time analysis of humanitarian funding gaps across {totalAffectedCountries}+ crisis zones.
                        Hover over the map to explore underfunded emergencies around the world.
                    </p>

                    <div className="hero-actions">
                        <button className="btn-primary" onClick={() => navigate('/wiki')}>
                            Explore Knowledge Base
                            <ArrowRight size={16} />
                        </button>
                        <button className="btn-secondary" onClick={() => navigate('/forecast')}>
                            Disaster Forecast
                        </button>
                    </div>
                </motion.div>

                {/* Stats Bar */}
                <motion.div
                    className="stats-bar glass"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                >
                    <div className="stat-item">
                        <div className="stat-icon"><AlertTriangle size={20} /></div>
                        <div>
                            <div className="stat-value">{totalAffectedCountries}</div>
                            <div className="stat-label">Active Crises</div>
                        </div>
                    </div>
                    <div className="stat-divider" />
                    <div className="stat-item">
                        <div className="stat-icon"><DollarSign size={20} /></div>
                        <div>
                            <div className="stat-value">{formatNumber(totalRequired)}</div>
                            <div className="stat-label">Total Required</div>
                        </div>
                    </div>
                    <div className="stat-divider" />
                    <div className="stat-item">
                        <div className="stat-icon"><TrendingDown size={20} /></div>
                        <div>
                            <div className="stat-value danger">{formatNumber(totalRequired - totalFunded)}</div>
                            <div className="stat-label">Funding Gap</div>
                        </div>
                    </div>
                    <div className="stat-divider" />
                    <div className="stat-item">
                        <div className="stat-icon"><Users size={20} /></div>
                        <div>
                            <div className="stat-value">300M+</div>
                            <div className="stat-label">People in Need</div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Scroll indicator */}
            <motion.div
                className="scroll-indicator"
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
            >
                <ChevronDown size={24} />
            </motion.div>
        </div>
    );
}
