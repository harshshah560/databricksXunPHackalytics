import { NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import {
    Globe,
    BookOpen,
    BarChart3,
    Radar,
    Sun,
    Moon,
    Menu,
    X,
    Compass
} from 'lucide-react';
import { useState } from 'react';
import './Navbar.css';

const navItems = [
    { path: '/', label: 'Home', icon: Globe },
    { path: '/wiki', label: 'Wiki', icon: BookOpen },
    { path: '/visualizations', label: 'Insights', icon: BarChart3 },
    { path: '/forecast', label: 'Forecast', icon: Radar },
];

export default function Navbar() {
    const { theme, toggleTheme } = useTheme();
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();

    return (
        <>
            <nav className="navbar glass">
                <div className="navbar-brand">
                    <Compass size={22} className="brand-icon" />
                    <span className="brand-text">NEXATLAS</span>
                </div>

                <div className={`navbar-links ${mobileOpen ? 'open' : ''}`}>
                    {navItems.map(({ path, label, icon: Icon }) => (
                        <NavLink
                            key={path}
                            to={path}
                            className={({ isActive }) =>
                                `nav-link ${isActive ? 'active' : ''}`
                            }
                            onClick={() => setMobileOpen(false)}
                        >
                            <Icon size={18} />
                            <span>{label}</span>
                        </NavLink>
                    ))}
                </div>

                <div className="navbar-actions">
                    <button
                        className="theme-toggle"
                        onClick={toggleTheme}
                        aria-label="Toggle theme"
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>

                    <button
                        className="mobile-toggle"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </nav>

            {mobileOpen && (
                <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />
            )}
        </>
    );
}
