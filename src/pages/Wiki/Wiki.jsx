import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send,
    Database,
    FileText,
    BookOpen,
    X,
    ChevronRight,
    Sparkles,
    ExternalLink,
    BarChart3,
} from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { fetchDataSources, sendChatMessage } from '../../services/api';
import { SAMPLE_CHAT } from '../../services/mockData';
import './Wiki.css';

const SOURCE_ICONS = {
    fts_global: DollarSignIcon,
    fts_cluster: BarChart3Icon,
    hrp: FileTextIcon,
    cbpf: DatabaseIcon,
    projects: BookOpenIcon,
    emdat: AlertIcon,
};

function DollarSignIcon() { return <Database size={16} />; }
function BarChart3Icon() { return <BarChart3 size={16} />; }
function FileTextIcon() { return <FileText size={16} />; }
function DatabaseIcon() { return <Database size={16} />; }
function BookOpenIcon() { return <BookOpen size={16} />; }
function AlertIcon() { return <FileText size={16} />; }

export default function Wiki() {
    const [sources, setSources] = useState([]);
    const [messages, setMessages] = useState(SAMPLE_CHAT);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeCitation, setActiveCitation] = useState(null);
    const [sourcePanelOpen, setSourcePanelOpen] = useState(true);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        fetchDataSources().then(setSources);
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const response = await sendChatMessage(input, messages);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.content,
                citations: response.citations || [],
                chart: response.chart || null,
            }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Sorry, I encountered an error processing your request. Please try again.',
                citations: [],
            }]);
        }
        setLoading(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const chartColors = ['#e94560', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

    const renderChart = (chart) => {
        if (!chart) return null;

        if (chart.type === 'bar') {
            return (
                <div className="chat-chart">
                    <h4 className="chart-title">{chart.title}</h4>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={chart.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                            <XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: 8,
                                    color: 'var(--text-primary)',
                                    fontSize: 12,
                                }}
                            />
                            {chart.data[0]?.required !== undefined ? (
                                <>
                                    <Bar dataKey="required" fill="var(--chart-3)" radius={[4, 4, 0, 0]} name="Required ($M)" />
                                    <Bar dataKey="funded" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name="Funded ($M)" />
                                </>
                            ) : (
                                <Bar dataKey="amount" radius={[4, 4, 0, 0]} name="Amount ($M)">
                                    {chart.data.map((entry, i) => (
                                        <Cell key={i} fill={chartColors[i % chartColors.length]} />
                                    ))}
                                </Bar>
                            )}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            );
        }

        if (chart.type === 'line') {
            return (
                <div className="chat-chart">
                    <h4 className="chart-title">{chart.title}</h4>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={chart.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                            <XAxis dataKey="year" tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                            <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} unit="B" />
                            <Tooltip
                                contentStyle={{
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: 8,
                                    color: 'var(--text-primary)',
                                    fontSize: 12,
                                }}
                            />
                            <Line type="monotone" dataKey="gap" stroke="var(--accent-primary)" strokeWidth={2} dot={{ r: 3 }} name="Gap ($B)" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            );
        }
        return null;
    };

    const suggestedQueries = [
        'How is Afghanistan funded in 2026?',
        'Show me Sudan\'s CBPF allocation',
        'What is the global funding gap?',
        'Which clusters are most underfunded?',
    ];

    return (
        <div className="wiki-page">
            {/* Left Panel — Sources */}
            <motion.aside
                className={`sources-panel ${sourcePanelOpen ? 'open' : 'closed'}`}
                initial={false}
                animate={{ width: sourcePanelOpen ? 280 : 0 }}
            >
                <div className="sources-inner">
                    <div className="sources-header">
                        <h3><Database size={18} /> Knowledge Base</h3>
                        <button className="btn-ghost" onClick={() => setSourcePanelOpen(false)}>
                            <X size={16} />
                        </button>
                    </div>
                    <p className="sources-subtitle">5 datasets connected from Databricks + EM-DAT</p>

                    <div className="sources-list">
                        {sources.map((src) => (
                            <div
                                key={src.id}
                                className={`source-card ${activeCitation?.source === src.id ? 'highlighted' : ''}`}
                            >
                                <div className="source-card-header">
                                    <FileText size={14} />
                                    <span className="source-name">{src.name}</span>
                                </div>
                                <p className="source-desc">{src.description}</p>
                                <div className="source-meta">
                                    <span className="badge badge-info">{src.rows.toLocaleString()} rows</span>
                                    <span className="source-file">{src.filename}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.aside>

            {/* Center — Chat */}
            <div className="chat-panel">
                {!sourcePanelOpen && (
                    <button className="sources-toggle" onClick={() => setSourcePanelOpen(true)}>
                        <ChevronRight size={16} />
                        <span>Sources</span>
                    </button>
                )}

                <div className="chat-messages">
                    {messages.map((msg, i) => (
                        <motion.div
                            key={i}
                            className={`message ${msg.role}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            {msg.role === 'assistant' && (
                                <div className="message-avatar">
                                    <Sparkles size={16} />
                                </div>
                            )}
                            <div className="message-body">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>

                                {msg.chart && renderChart(msg.chart)}

                                {msg.citations?.length > 0 && (
                                    <div className="citations-row">
                                        {msg.citations.map((cit) => (
                                            <button
                                                key={cit.id}
                                                className={`citation-chip ${activeCitation?.id === cit.id ? 'active' : ''}`}
                                                onClick={() => setActiveCitation(activeCitation?.id === cit.id ? null : cit)}
                                            >
                                                <span className="citation-num">[{cit.id}]</span>
                                                <span className="citation-source">{cit.source}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}

                    {loading && (
                        <motion.div
                            className="message assistant"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <div className="message-avatar">
                                <Sparkles size={16} />
                            </div>
                            <div className="message-body">
                                <div className="typing-indicator">
                                    <span /><span /><span />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    <div ref={chatEndRef} />
                </div>

                {/* Suggested Queries */}
                {messages.length <= 1 && (
                    <div className="suggested-queries">
                        {suggestedQueries.map((q, i) => (
                            <button
                                key={i}
                                className="suggested-chip"
                                onClick={() => { setInput(q); inputRef.current?.focus(); }}
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                )}

                {/* Input */}
                <div className="chat-input-area glass">
                    <textarea
                        ref={inputRef}
                        placeholder="Ask about humanitarian funding, crises, or any dataset..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                    />
                    <button
                        className={`send-btn ${input.trim() ? 'active' : ''}`}
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>

            {/* Right Panel — Citation Detail */}
            <AnimatePresence>
                {activeCitation && (
                    <motion.aside
                        className="citation-panel"
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 320, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                    >
                        <div className="citation-panel-inner">
                            <div className="citation-panel-header">
                                <h4>Source Reference</h4>
                                <button className="btn-ghost" onClick={() => setActiveCitation(null)}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="citation-detail">
                                <div className="citation-source-name">
                                    <ExternalLink size={14} />
                                    <span>{activeCitation.source}</span>
                                </div>
                                <div className="citation-text">
                                    {activeCitation.text}
                                </div>
                            </div>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>
        </div>
    );
}
