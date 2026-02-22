import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { streamChatMessage } from '../../services/api';
import { SAMPLE_CHAT } from '../../services/mockData';
import './Wiki.css';

const CHART_COLORS = ['#e94560', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// Parse ```chart blocks from markdown text
function parseCharts(text) {
    const parts = [];
    const regex = /```chart\s*\n([\s\S]*?)\n```/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
        }
        try {
            const chartData = JSON.parse(match[1].trim());
            parts.push({ type: 'chart', data: chartData });
        } catch {
            parts.push({ type: 'text', content: match[0] });
        }
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
        parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return parts.length ? parts : [{ type: 'text', content: text }];
}

function ChartRenderer({ chart }) {
    if (!chart || !chart.data?.length) return null;

    if (chart.type === 'pie') {
        return (
            <div className="chat-chart">
                <h4 className="chart-title">{chart.title}</h4>
                <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                        <Pie
                            data={chart.data}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                            {chart.data.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 8,
                                color: 'var(--text-primary)',
                                fontSize: 12,
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        );
    }

    if (chart.type === 'line') {
        const keys = chart.keys || Object.keys(chart.data[0]).filter(k => k !== 'year' && k !== 'name');
        const labels = chart.labels || keys;
        return (
            <div className="chat-chart">
                <h4 className="chart-title">{chart.title}</h4>
                <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chart.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                        <XAxis dataKey={chart.data[0]?.year !== undefined ? 'year' : 'name'} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
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
                        <Legend />
                        {keys.map((key, i) => (
                            <Line key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} name={labels[i] || key} />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        );
    }

    // Default: bar chart
    const keys = chart.keys || Object.keys(chart.data[0]).filter(k => k !== 'name');
    const labels = chart.labels || keys;
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
                    <Legend />
                    {keys.map((key, i) => (
                        <Bar key={key} dataKey={key} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} name={labels[i] || key} />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export default function Wiki() {
    const [messages, setMessages] = useState(SAMPLE_CHAT);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        const userMsg = { role: 'user', content: input };
        const currentInput = input;
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        const assistantIdx = messages.length + 1;
        setMessages(prev => [...prev, {
            role: 'assistant',
            content: '',
        }]);

        try {
            await streamChatMessage(currentInput, messages, (partialText) => {
                setStreaming(true);
                setMessages(prev => {
                    const updated = [...prev];
                    updated[assistantIdx] = {
                        ...updated[assistantIdx],
                        content: partialText,
                    };
                    return updated;
                });
            });
        } catch {
            setMessages(prev => {
                const updated = [...prev];
                updated[assistantIdx] = {
                    ...updated[assistantIdx],
                    content: 'Sorry, I encountered an error. Please try again.',
                };
                return updated;
            });
        }
        setStreaming(false);
        setLoading(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const suggestedQueries = [
        'How is Afghanistan funded in 2026?',
        'Show me Sudan\'s CBPF allocation vs HRP',
        'What is the global funding gap trend?',
        'Which clusters are most underfunded?',
        'Compare top donors and their contributions',
        'Show me the CBPF data for all countries',
    ];

    const renderMessageContent = (msg) => {
        const parts = parseCharts(msg.content || '');
        return parts.map((part, i) => {
            if (part.type === 'chart') {
                return <ChartRenderer key={i} chart={part.data} />;
            }
            return (
                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                    {part.content}
                </ReactMarkdown>
            );
        });
    };

    return (
        <div className="wiki-page">
            <div className="chat-panel full-width">
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
                                {renderMessageContent(msg)}
                            </div>
                        </motion.div>
                    ))}

                    {loading && !streaming && (
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
        </div>
    );
}
