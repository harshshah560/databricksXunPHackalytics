import { useState, useEffect, useCallback, useRef } from 'react';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl';
import { AnimatePresence } from 'framer-motion';
import { Users } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { fetchAllCountries } from '../../services/api';
import CountryModal from '../../components/CountryModal/CountryModal';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Landing.css';

const MAPBOX_TOKEN =
    import.meta.env.VITE_MAPBOX_TOKEN ||
    'pk.eyJ1IjoiZGVtby1hY2NvdW50IiwiYSI6ImNsdnR5cWVxejBhbTcyanBtdzV0dTl1MmYifQ.demo';

const pctToColor = (pct) => {
    if (pct === null || pct === undefined) return '#334155';
    if (pct < 10) return '#b91c1c';
    if (pct < 20) return '#ef4444';
    if (pct < 35) return '#f97316';
    if (pct < 50) return '#eab308';
    if (pct < 70) return '#84cc16';
    return '#22c55e';
};

export default function Landing() {
    const { theme } = useTheme();
    const mapRef = useRef(null);

    const [countries, setCountries] = useState([]);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [hoveredCode, setHoveredCode] = useState(null);
    const [hoveredPos, setHoveredPos] = useState(null);
    const [selectedCode, setSelectedCode] = useState(null);

    useEffect(() => {
        fetchAllCountries().then(setCountries);
    }, []);

    const geojson = {
        type: 'FeatureCollection',
        features: countries
            .filter((c) => c.lat && c.lng)
            .map((c) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
                properties: {
                    code: c.code,
                    name: c.name,
                    pct: c.issue_pct_funded?.['Food Security'] ?? -1,
                    total_affected: c.affected?.total ?? 0,
                },
            })),
    };

    const circleColor = [
        'case',
        ['<', ['get', 'pct'], 0], '#334155',
        ['<', ['get', 'pct'], 10], '#b91c1c',
        ['<', ['get', 'pct'], 20], '#ef4444',
        ['<', ['get', 'pct'], 35], '#f97316',
        ['<', ['get', 'pct'], 50], '#eab308',
        ['<', ['get', 'pct'], 70], '#84cc16',
        '#22c55e',
    ];

    const circleRadius = [
        'interpolate', ['linear'], ['zoom'],
        1, ['interpolate', ['linear'], ['get', 'total_affected'], 0, 5, 5000000, 10],
        5, ['interpolate', ['linear'], ['get', 'total_affected'], 0, 9, 5000000, 24],
    ];

    const handleMouseMove = useCallback((e) => {
        const feat = e.features?.[0];
        if (feat) {
            setHoveredCode(feat.properties.code);
            setHoveredPos({
                lat: feat.geometry.coordinates[1],
                lng: feat.geometry.coordinates[0],
            });
        } else {
            setHoveredCode(null);
            setHoveredPos(null);
        }
    }, []);

    const handleClick = useCallback((e) => {
        const feat = e.features?.[0];
        if (feat?.properties?.code) {
            setSelectedCode(feat.properties.code);
        }
    }, []);

    const hoveredCountry = countries.find((c) => c.code === hoveredCode) ?? null;
    const selectedCountry = countries.find((c) => c.code === selectedCode) ?? null;

    return (
        <div className="landing-page">
            <div className="map-container">
                <Map
                    ref={mapRef}
                    initialViewState={{ latitude: 15, longitude: 25, zoom: 2.2, pitch: 10 }}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle={
                        theme === 'dark'
                            ? 'mapbox://styles/mapbox/dark-v11'
                            : 'mapbox://styles/mapbox/light-v11'
                    }
                    mapboxAccessToken={MAPBOX_TOKEN}
                    onLoad={() => setMapLoaded(true)}
                    interactiveLayerIds={['crisis-points']}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => { setHoveredCode(null); setHoveredPos(null); }}
                    onClick={handleClick}
                    cursor={hoveredCode ? 'pointer' : 'grab'}
                    fog={{
                        color: theme === 'dark' ? '#060d1a' : '#f0f4fb',
                        'high-color': theme === 'dark' ? '#0f1e38' : '#d8e6f4',
                        'space-color': theme === 'dark' ? '#000008' : '#c8d8ee',
                    }}
                >
                    <NavigationControl position="bottom-right" />

                    {mapLoaded && (
                        <Source id="crisis" type="geojson" data={geojson} generateId>
                            <Layer
                                id="crisis-glow"
                                type="circle"
                                paint={{
                                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 14, 5, 36],
                                    'circle-color': circleColor,
                                    'circle-opacity': 0.08,
                                    'circle-blur': 1,
                                }}
                            />
                            <Layer
                                id="crisis-points"
                                type="circle"
                                paint={{
                                    'circle-radius': circleRadius,
                                    'circle-color': circleColor,
                                    'circle-stroke-width': 1.5,
                                    'circle-stroke-color': 'rgba(255,255,255,0.18)',
                                    'circle-opacity': [
                                        'case',
                                        ['==', ['get', 'code'], hoveredCode ?? ''], 1,
                                        0.82,
                                    ],
                                }}
                            />
                        </Source>
                    )}

                    {hoveredCountry && hoveredPos && (
                        <Popup
                            latitude={hoveredPos.lat}
                            longitude={hoveredPos.lng}
                            closeButton={false}
                            closeOnClick={false}
                            anchor="bottom"
                            offset={18}
                            className="map-popup-wrapper"
                        >
                            <div className="map-hover-popup">
                                <div className="mhp-name">{hoveredCountry.name}</div>
                                {hoveredCountry.affected?.total > 0 && (
                                    <div className="mhp-affected">
                                        <Users size={10} />
                                        {(hoveredCountry.affected.total / 1e6).toFixed(1)}M people targeted
                                    </div>
                                )}
                                <p className="mhp-hint">Click for full analysis</p>
                            </div>
                        </Popup>
                    )}
                </Map>
            </div>

            <AnimatePresence>
                {selectedCountry && (
                    <CountryModal
                        country={selectedCountry}
                        onClose={() => setSelectedCode(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}