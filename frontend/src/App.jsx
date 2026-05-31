import { useState } from "react";
import jsPDF from "jspdf";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

// Fix grey sides globally
const globalStyle = document.createElement("style");
globalStyle.textContent = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { background: #0a0a0f; overflow-x: hidden; }`;
document.head.appendChild(globalStyle);

function getRiskColor(score) {
  if (score >= 70) return "#ef4444";
  if (score >= 40) return "#f59e0b";
  return "#22c55e";
}

function getRiskColorRGB(score) {
  if (score >= 70) return [239, 68, 68];
  if (score >= 40) return [245, 158, 11];
  return [34, 197, 94];
}

function RiskRing({ score }) {
  const color = getRiskColor(score);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, position: "relative" }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#ffffff08" strokeWidth="10" />
        <circle cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 70 70)" style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
        <text x="70" y="66" textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize="32" fontWeight="600">{score}</text>
        <text x="70" y="90" textAnchor="middle" fill="#888" fontSize="10" fontWeight="500">RISK SCORE</text>
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
        <span style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 500 }}>{score < 40 ? "Low Risk" : score < 70 ? "Medium Risk" : "High Risk"}</span>
        <span onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}
          style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid #ffffff20", color: "#a1a1aa",
            fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", cursor: "help", fontWeight: 600 }}>i</span>
        {showTooltip && (
          <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
            background: "#11111a", border: "1px solid #ffffff15", borderRadius: 8,
            padding: "12px 14px", width: 240, zIndex: 100, color: "#a1a1aa", fontSize: 12, lineHeight: 1.6,
            boxShadow: "0 12px 32px rgba(0,0,0,0.6)" }}>
            <div style={{ color: "#ededed", fontWeight: 500, marginBottom: 6 }}>How risk is calculated</div>
            Lower score = safer prospect.<br />
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ color: "#ef4444" }}>● Critical signals (+15)</span>
              <span style={{ color: "#f59e0b" }}>● High signals (+8)</span>
              <span style={{ color: "#9ca3af" }}>● Medium signals (+4)</span>
              <span style={{ color: "#22c55e" }}>● Positive signals (−6)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Toast({ messages, current }) {
  if (!messages.length) return null;
  return (
    <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
      background: "#0a0a0f", border: "1px solid #ffffff15", borderRadius: 999,
      padding: "10px 20px", zIndex: 1000, display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1", animation: "pulse 1.5s infinite" }} />
      <span style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 500 }}>{messages[current]}</span>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

function NewsCard({ item }) {
  const domain = item.url ? item.url.split("/")[2]?.replace("www.", "") : "";
  return (
    <a href={item.url} target="_blank" rel="noreferrer"
      style={{ display: "block", background: "#ffffff04", border: "1px solid #ffffff0a",
        borderRadius: 12, padding: "16px", textDecoration: "none", transition: "all 0.2s" }}
      onMouseEnter={e => { e.currentTarget.style.background = "#ffffff08"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#ffffff04"; e.currentTarget.style.transform = "translateY(0)"; }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {item.favicon && <img src={item.favicon} width={14} height={14} style={{ borderRadius: 3 }} onError={e => e.target.style.display = "none"} />}
        <span style={{ color: "#71717a", fontSize: 12 }}>{domain}</span>
      </div>
      <div style={{ color: "#ededed", fontSize: 14, fontWeight: 500, marginBottom: 6, lineHeight: 1.5 }}>{item.name}</div>
      <div style={{ color: "#a1a1aa", fontSize: 13, lineHeight: 1.6 }}>{item.content?.slice(0, 160)}...</div>
    </a>
  );
}

function downloadPDF(data) {
  const doc = new jsPDF({ putOnlyUsedFonts: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 0;

  const bg = () => { doc.setFillColor(10,10,15); doc.rect(0,0,pageW,pageH,"F"); };
  const addPage = () => { doc.addPage(); bg(); y = 20; };
  const checkY = (n=10) => { if(y+n>pageH-15) addPage(); };
  const addLine = (text, size=11, rgb=[237,237,237], bold=false) => {
    doc.setFontSize(size); doc.setTextColor(...rgb); doc.setFont("helvetica", bold?"bold":"normal");
    doc.splitTextToSize(String(text), pageW-40).forEach(l => { checkY(size*0.5); doc.text(l,20,y); y+=size*0.5+2; });
    y+=2;
  };
  const divider = (rgb=[255,255,255], alpha=0.08) => {
    checkY(8);
    doc.setDrawColor(...rgb.map(v=>Math.round(v*alpha)));
    doc.setLineWidth(0.3);
    doc.line(20, y, pageW-20, y);
    y+=8;
  };

  bg(); y=24;

  // Header accent bar
  doc.setFillColor(99,102,241);
  doc.rect(0,0,4,pageH,"F");

  // Title
  addLine("SalesGuard", 28, [237,237,237], true);
  addLine("Sales Intelligence Report", 13, [113,113,122]);
  y+=4;
  addLine(`${data.company}`, 18, [237,237,237], true);
  addLine(`Generated ${new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}`, 10, [82,82,91]);
  y+=8;
  divider([99,102,241], 1);

  // Risk Score
  const riskRGB = getRiskColorRGB(data.analysis.risk_score);
  const riskLabel = data.analysis.risk_score < 40 ? "LOW RISK" : data.analysis.risk_score < 70 ? "MEDIUM RISK" : "HIGH RISK";
  addLine("RISK ASSESSMENT", 9, [113,113,122], true);
  y+=2;
  addLine(`${data.analysis.risk_score}/100 — ${riskLabel}`, 16, riskRGB, true);

  // Risk bar
  const barW = pageW - 40;
  const fillW = (data.analysis.risk_score/100) * barW;
  doc.setFillColor(30,30,40);
  doc.roundedRect(20, y, barW, 6, 3, 3, "F");
  doc.setFillColor(...riskRGB);
  doc.roundedRect(20, y, fillW, 6, 3, 3, "F");
  y+=16;
  divider();

  // Summary
  addLine("EXECUTIVE SUMMARY", 9, [113,113,122], true);
  y+=2;
  addLine(data.analysis.risk_summary, 11, [209,213,219]);
  y+=4;
  divider();

  // Suggestions
  addLine("STRATEGIC OUTREACH PATHS", 9, [113,113,122], true);
  y+=2;
  data.analysis.suggestions.forEach((s,i) => {
    checkY(16);
    doc.setFillColor(99,102,241);
    doc.circle(24, y-1, 2.5, "F");
    doc.setFontSize(10); doc.setTextColor(209,213,219); doc.setFont("helvetica","normal");
    const lines = doc.splitTextToSize(`${s}`, pageW-50);
    lines.forEach(l => { checkY(6); doc.text(l, 30, y); y+=6; });
    y+=3;
  });
  divider();

  // News
  addLine("NEWS & SOURCES", 9, [113,113,122], true);
  y+=2;
  data.results.forEach(r => {
    checkY(14);
    addLine(`${r.name}`, 10, [237,237,237]);
    addLine(`${r.url}`, 9, [99,102,241]);
    y+=1;
  });

  y+=12; checkY(12);
  divider([99,102,241],1);
  addLine("Powered by Linkup  ·  SalesGuard  ·  Linkup Async Hackathon 2026", 9, [82,82,91]);

  doc.save(`SalesGuard_${data.company.replace(/\s+/g,"_")}_${Date.now()}.pdf`);
}

const STATUS_MESSAGES = [
  "Fetching live data from Linkup...",
  "Scoring risk signals...",
  "Generating sales intelligence...",
  "Finalizing report..."
];

function ChatPanel({ data, open, onClose }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: `Hi. I'm your SalesGuard assistant for ${data.company}. Ask me anything about their sales approach, risks, or outreach strategy.` }
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  const context = `
Risk Score: ${data.analysis.risk_score}/100
Summary: ${data.analysis.risk_summary}
Suggestions: ${data.analysis.suggestions.join(", ")}
Homepage: ${data.homepage || "unknown"}
LinkedIn: ${data.linkedin || "unknown"}
Recent News: ${data.results.map(r => r.name + ": " + r.content?.slice(0,150)).join(" | ")}
  `.trim();

  const QUICK = ["Write an outreach email", "What are the key risks?", "Who should I contact?", "Best pitch angle?"];

  async function send(text) {
    const msg = text || input.trim();
    if (!msg) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: msg }]);
    setThinking(true);
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, company: data.company, context })
      });
      const json = await res.json();
      setMessages(m => [...m, { role: "assistant", content: json.reply || json.error || "No response received." }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally { setThinking(false); }
  }

  if (!open) return null;

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, width: 440, height: 600,
      background: "#0a0a0f", border: "1px solid #ffffff15", borderRadius: 16,
      display: "flex", flexDirection: "column", zIndex: 1000,
      boxShadow: "0 24px 64px rgba(0,0,0,0.8)" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #ffffff0a",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div>
          <div style={{ color: "#ededed", fontWeight: 500, fontSize: 14 }}>SalesGuard AI</div>
          <div style={{ color: "#a1a1aa", fontSize: 12 }}>{data.company} · Sales Intelligence</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#a1a1aa",
          cursor: "pointer", fontFamily: "Material Symbols Outlined", fontSize: 20 }}
          onMouseEnter={e => e.currentTarget.style.color = "#ededed"}
          onMouseLeave={e => e.currentTarget.style.color = "#a1a1aa"}>close</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "85%", padding: "12px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.6,
              background: m.role === "user" ? "#ededed" : "#ffffff08",
              color: m.role === "user" ? "#0a0a0f" : "#d4d4d8",
              borderBottomRightRadius: m.role === "user" ? 4 : 12,
              borderBottomLeftRadius: m.role === "assistant" ? 4 : 12 }}>
              {m.content}
            </div>
          </div>
        ))}
        {thinking && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ background: "#ffffff08", borderRadius: 12, borderBottomLeftRadius: 4, padding: "16px", display: "flex", gap: 4, alignItems: "center" }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "#a1a1aa",
                  animation: "pulseDots 1.4s infinite", animationDelay: `${i*0.2}s` }} />
              ))}
              <style>{`@keyframes pulseDots{0%,100%{opacity:0.2}50%{opacity:1}}`}</style>
            </div>
          </div>
        )}
      </div>
      {messages.length <= 1 && (
        <div style={{ padding: "0 20px 12px", display: "flex", flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
          {QUICK.map((q, i) => (
            <button key={i} onClick={() => send(q)}
              style={{ background: "#ffffff05", border: "1px solid #ffffff10", borderRadius: 8,
                padding: "8px 12px", color: "#d4d4d8", fontSize: 12, cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#ffffff0a"; e.currentTarget.style.color = "#ededed"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#ffffff05"; e.currentTarget.style.color = "#d4d4d8"; }}>
              {q}
            </button>
          ))}
        </div>
      )}
      <div style={{ padding: "16px 20px", borderTop: "1px solid #ffffff0a", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#ffffff05",
          border: "1px solid #ffffff15", borderRadius: 8, padding: "6px 6px 6px 14px" }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Ask anything..."
            style={{ flex: 1, background: "transparent", border: "none", color: "#ededed", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
          <button onClick={() => send()} disabled={thinking || !input.trim()}
            style={{ background: thinking || !input.trim() ? "transparent" : "#ededed", border: "none", borderRadius: 6,
              width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
              color: thinking || !input.trim() ? "#52525b" : "#0a0a0f", cursor: thinking || !input.trim() ? "not-allowed" : "pointer" }}>
            <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 16 }}>arrow_upward</span>
          </button>
        </div>
        <div style={{ color: "#71717a", fontSize: 11, textAlign: "center", marginTop: 10 }}>
          ⚠️ AI can make mistakes. Always verify before use.
        </div>
      </div>
    </div>
  );
}

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!email.includes("@")) return;
    setSubmitted(true);
  }

  return (
    <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.05) 0%, #0f0f1a 100%)",
      border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: "#ededed", marginBottom: 8 }}>Stay ahead of every sales call</div>
      <div style={{ color: "#71717a", fontSize: 14, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
        Join the waitlist for SalesGuard Pro — team accounts, CRM integrations, and batch company analysis.
      </div>
      {submitted ? (
        <div style={{ color: "#22c55e", fontSize: 14, fontWeight: 500 }}>✓ You're on the list. We'll be in touch.</div>
      ) : (
        <div style={{ display: "flex", gap: 10, maxWidth: 420, margin: "0 auto" }}>
          <input value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="your@email.com"
            style={{ flex: 1, background: "#ffffff05", border: "1px solid #ffffff10", borderRadius: 10,
              padding: "12px 16px", color: "#ededed", fontSize: 14, outline: "none", fontFamily: "inherit" }}
            onFocus={e => e.currentTarget.style.borderColor = "#6366f160"}
            onBlur={e => e.currentTarget.style.borderColor = "#ffffff10"} />
          <button onClick={handleSubmit}
            style={{ background: "#ededed", border: "none", borderRadius: 10, padding: "12px 20px",
              color: "#0a0a0f", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
            Join Waitlist
          </button>
        </div>
      )}
    </div>
  );
}

function CompanyLogo({ logo, company }) {
  const [failed, setFailed] = useState(false);
  if (failed || !logo) {
    return (
      <div style={{ width: 48, height: 48, borderRadius: 12, background: "#6366f120",
        border: "1px solid #6366f140", display: "flex", alignItems: "center", justifyContent: "center",
        color: "#6366f1", fontSize: 20, fontWeight: 600, textTransform: "uppercase" }}>
        {company ? company[0] : "C"}
      </div>
    );
  }
  return (
    <div style={{ width: 48, height: 48, borderRadius: 12, background: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid #ffffff20" }}>
      <img src={logo} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        onError={() => setFailed(true)} />
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [toastIndex, setToastIndex] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);

  function copyToClipboard(text, index) {
    navigator.clipboard.writeText(text);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true); setError(null); setData(null); setToastIndex(0); setChatOpen(false);
    const interval = setInterval(() => {
      setToastIndex(i => { if (i >= STATUS_MESSAGES.length-1) { clearInterval(interval); return i; } return i+1; });
    }, 4000);
    try {
      const res = await fetch(`${API_URL}/search`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: query.trim() })
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (!json.analysis) throw new Error("Invalid response from server");
      setData(json);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally { clearInterval(interval); setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#ededed",
      fontFamily: "'Inter', -apple-system, sans-serif", padding: "64px 48px", WebkitFontSmoothing: "antialiased" }}>
      {loading && <Toast messages={STATUS_MESSAGES} current={toastIndex} />}
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ position: "relative", textAlign: "center", marginBottom: 56 }}>
        <a href="https://tally.so/r/RGkZl9" target="_blank" rel="noreferrer"
          style={{ position: "absolute", right: 0, top: 0, background: "#ffffff05",
            border: "1px solid #ffffff10", borderRadius: 8, padding: "8px 14px",
            color: "#a1a1aa", textDecoration: "none", fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#ffffff0a"; e.currentTarget.style.color = "#ededed"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#ffffff05"; e.currentTarget.style.color = "#a1a1aa"; }}>
          <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 16 }}>rate_review</span>
          Feedback
        </a>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M14 2L4 7V14C4 19.5 8.5 24.5 14 26C19.5 24.5 24 19.5 24 14V7L14 2Z" fill="#6366f1" fillOpacity="0.2" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M10 14L13 17L18 11" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px" }}>SalesGuard</span>
        </div>
        <div style={{ color: "#52525b", fontSize: 14, letterSpacing: "0.5px", textTransform: "uppercase", fontWeight: 500 }}>
          Sales Research Reports · Powered by Linkup
        </div>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 12, maxWidth: 768, margin: "0 auto 56px" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
            color: "#71717a", fontFamily: "Material Symbols Outlined", fontSize: 20 }}>search</span>
          <input value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="Enter company name (e.g. Linkup, Vercel, Anthropic...)"
            style={{ width: "100%", background: "#ffffff04", border: "1px solid #ffffff10",
              borderRadius: 12, padding: "16px 16px 16px 48px", color: "#ededed", fontSize: 15,
              outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#6366f160"; e.currentTarget.style.background = "#ffffff08"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#ffffff10"; e.currentTarget.style.background = "#ffffff04"; }} />
        </div>
        <button onClick={handleSearch} disabled={loading}
          style={{ background: loading ? "#ffffff10" : "#ededed", border: "none", borderRadius: 12,
            padding: "0 24px", color: loading ? "#71717a" : "#0a0a0f", fontSize: 14, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 0.2s", whiteSpace: "nowrap" }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 12,
          padding: "16px 20px", color: "#fca5a5", marginBottom: 32, fontSize: 14,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button onClick={handleSearch} style={{ background: "#ef4444", border: "none", borderRadius: 6,
            padding: "8px 16px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ height: 160, borderRadius: 16,
              background: "linear-gradient(90deg, #ffffff04 25%, #ffffff0a 50%, #ffffff04 75%)",
              backgroundSize: "200% 100%", animation: "shimmer 2s infinite" }} />
          ))}
          <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

          {/* Company Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <CompanyLogo logo={data.logo} company={data.company} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", marginBottom: 4 }}>{data.company}</div>
                <div style={{ display: "flex", gap: 12 }}>
                  {data.homepage && (
                    <a href={data.homepage} target="_blank" rel="noreferrer"
                      style={{ color: "#a1a1aa", textDecoration: "none", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}
                      onMouseEnter={e => e.currentTarget.style.color = "#ededed"}
                      onMouseLeave={e => e.currentTarget.style.color = "#a1a1aa"}>
                      <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 14 }}>link</span> Website
                    </a>
                  )}
                  {data.linkedin && (
                    <a href={data.linkedin} target="_blank" rel="noreferrer"
                      style={{ color: "#a1a1aa", textDecoration: "none", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}
                      onMouseEnter={e => e.currentTarget.style.color = "#ededed"}
                      onMouseLeave={e => e.currentTarget.style.color = "#a1a1aa"}>
                      <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 14 }}>business</span> LinkedIn
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setChatOpen(o => !o)}
                style={{ background: chatOpen ? "#6366f120" : "#ffffff05",
                  border: `1px solid ${chatOpen ? "#6366f140" : "#ffffff10"}`,
                  borderRadius: 8, padding: "10px 16px", color: chatOpen ? "#6366f1" : "#ededed",
                  fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#6366f120"}
                onMouseLeave={e => e.currentTarget.style.background = chatOpen ? "#6366f120" : "#ffffff05"}>
                <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 16 }}>smart_toy</span>
                Ask AI
              </button>
              <button onClick={() => downloadPDF(data)}
                style={{ background: "#ffffff05", border: "1px solid #ffffff10", borderRadius: 8,
                  padding: "10px 16px", color: "#ededed", fontSize: 13, fontWeight: 500,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#ffffff0a"; e.currentTarget.style.borderColor = "#ffffff20"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#ffffff05"; e.currentTarget.style.borderColor = "#ffffff10"; }}>
                <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 16 }}>download</span>
                Export PDF
              </button>
            </div>
          </div>

          {/* Bento Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 24 }}>
            <div style={{ gridColumn: "span 4", background: "#0f0f1a", border: "1px solid #ffffff0a",
              borderRadius: 16, padding: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RiskRing score={data.analysis.risk_score} />
            </div>
            <div style={{ gridColumn: "span 8", background: "#0f0f1a", border: "1px solid #ffffff0a", borderRadius: 16, padding: 32 }}>
              <div style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, letterSpacing: "0.5px", marginBottom: 16, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 16 }}>notes</span> Executive Summary
              </div>
              <div style={{ color: "#d4d4d8", fontSize: 15, lineHeight: 1.8 }}>{data.analysis.risk_summary}</div>
            </div>
            <div style={{ gridColumn: "span 12", background: "linear-gradient(180deg, rgba(99,102,241,0.03) 0%, #0f0f1a 100%)",
              border: "1px solid #ffffff0a", borderTopColor: "rgba(99,102,241,0.2)", borderRadius: 16, padding: 32 }}>
              <div style={{ color: "#6366f1", fontSize: 12, fontWeight: 600, letterSpacing: "0.5px", marginBottom: 24, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 16 }}>lightbulb</span> Strategic Outreach Paths
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
                {data.analysis.suggestions.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start",
                    background: "#ffffff03", border: "1px solid #ffffff05", padding: "20px", borderRadius: 12, transition: "background 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#ffffff06"}
                    onMouseLeave={e => e.currentTarget.style.background = "#ffffff03"}>
                    <span style={{ color: "#6366f1", fontSize: 13, fontWeight: 600, fontFamily: "monospace", opacity: 0.8, flexShrink: 0 }}>0{i+1}</span>
                    <span style={{ color: "#d4d4d8", fontSize: 14, lineHeight: 1.6, flex: 1 }}>{s}</span>
                    <button onClick={() => copyToClipboard(s, i)}
                      style={{ background: "transparent", border: "none", cursor: "pointer", flexShrink: 0, padding: 0,
                        fontFamily: "Material Symbols Outlined", fontSize: 16, color: copied === i ? "#22c55e" : "#71717a" }}
                      onMouseEnter={e => e.currentTarget.style.color = copied === i ? "#22c55e" : "#ededed"}
                      onMouseLeave={e => e.currentTarget.style.color = copied === i ? "#22c55e" : "#71717a"}>
                      {copied === i ? "check" : "content_copy"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {data.results?.length > 0 && (
              <div style={{ gridColumn: "span 12", background: "#0f0f1a", border: "1px solid #ffffff0a", borderRadius: 16, padding: 32 }}>
                <div style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, letterSpacing: "0.5px", marginBottom: 20, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 16 }}>article</span> Recent Signals & Sources
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {data.results.map((item, i) => <NewsCard key={i} item={item} />)}
                </div>
              </div>
            )}
          </div>

          {/* About / Story */}
          <div style={{ background: "#0f0f1a", border: "1px solid #ffffff0a", borderRadius: 16, padding: 40 }}>
            <div style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, letterSpacing: "0.5px", marginBottom: 32, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 16 }}>auto_stories</span> The Story Behind SalesGuard
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 32 }}>
              {[
                {
                  icon: "problem",
                  title: "The Problem",
                  text: "Sales reps waste 30-45 minutes researching a company before every call. They open 5 tabs, scan LinkedIn, search for news, and still walk in underprepared. No fast, free tool existed for the individual rep. SalesGuard was built to fix that in under 30 seconds."
                },
                {
                  icon: "search",
                  title: "The Research",
                  text: "I explored what tools existed — all expensive, all built for enterprise teams with big budgets. Nothing for the individual rep who just needs a quick brief. I asked: what if I could automate a researcher's 45-minute job into one search?"
                },
                {
                  icon: "build",
                  title: "How I Built It",
                  text: "Discovered Linkup's API during the hackathon — deep search that actually returns real, recent content. Built a LangGraph 3-node pipeline connecting Linkup search, custom risk scoring, and Groq's LLM for analysis. One developer. FastAPI backend, React frontend, shipped end to end."
                },
                {
                  icon: "rocket_launch",
                  title: "What's Next",
                  text: "Batch search to analyze entire pipeline lists at once. Search history to revisit past briefs. Slack and email alerts when a prospect makes news. And a mobile app so reps can get briefed on the go, right before walking into a meeting."
                }
              ].map((item, i) => (
                <div key={i}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 18, color: "#6366f1" }}>{item.icon}</span>
                    <div style={{ color: "#ededed", fontSize: 15, fontWeight: 500 }}>{item.title}</div>
                  </div>
                  <div style={{ color: "#71717a", fontSize: 14, lineHeight: 1.8 }}>{item.text}</div>
                </div>
              ))}
            </div>

            {/* Tech Stack */}
            <div style={{ padding: "20px 24px", background: "#ffffff03", borderRadius: 12, border: "1px solid #ffffff08", marginBottom: 24 }}>
              <div style={{ color: "#a1a1aa", fontSize: 12, fontWeight: 600, letterSpacing: "0.5px", marginBottom: 16, textTransform: "uppercase", textAlign: "center" }}>Tech Stack</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                {["Linkup API (Deep Search)", "Groq llama-3.3-70b", "LangGraph", "FastAPI", "React + Vite", "jsPDF"].map(t => (
                  <span key={t} style={{ background: "#ffffff08", border: "1px solid #ffffff10", borderRadius: 6,
                    padding: "4px 12px", color: "#a1a1aa", fontSize: 12 }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Disclaimer */}
            <div style={{ padding: "16px 20px", background: "#ffffff03", borderRadius: 12, border: "1px solid #ffffff08" }}>
              <div style={{ color: "#52525b", fontSize: 12, lineHeight: 1.8 }}>
                <span style={{ color: "#71717a", fontWeight: 500 }}>⚠️ Disclaimer — </span>
                SalesGuard is an AI-powered research tool. Risk scores, summaries, and suggestions are auto-generated and may not be accurate. Nothing here constitutes professional financial, legal, or business advice. Always verify independently before making decisions. AI chat responses are generated by Groq's LLM and do not represent the views of the developer.
              </div>
            </div>
          </div>

          {/* Notify */}
          <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.05) 0%, #0f0f1a 100%)",
            border: "1px solid rgba(99,102,241,0.15)", borderRadius: 16, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#ededed", marginBottom: 8 }}>Get notified when new features drop</div>
            <div style={{ color: "#71717a", fontSize: 14, margin: "0 auto 24px", maxWidth: 400 }}>
              Batch search, search history, mobile app and more — coming soon.
            </div>
            <a href="https://tally.so/r/RGkZl9" target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#ededed",
                border: "none", borderRadius: 10, padding: "12px 24px", color: "#0a0a0f",
                fontSize: 14, fontWeight: 600, textDecoration: "none", transition: "all 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
              <span style={{ fontFamily: "Material Symbols Outlined", fontSize: 18 }}>notifications</span>
              Notify Me
            </a>
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center", color: "#3f3f46", fontSize: 13, paddingTop: 24, paddingBottom: 8, borderTop: "1px solid #ffffff0a" }}>
            Powered by{" "}
            <a href="https://linkup.so" target="_blank" rel="noreferrer"
              style={{ color: "#71717a", textDecoration: "none", fontWeight: 500 }}
              onMouseEnter={e => e.target.style.color = "#ededed"}
              onMouseLeave={e => e.target.style.color = "#71717a"}>Linkup</a>
            {" "}· Built by{" "}
            <a href="https://github.com/aryabuwa" target="_blank" rel="noreferrer"
              style={{ color: "#71717a", textDecoration: "none", fontWeight: 500 }}
              onMouseEnter={e => e.target.style.color = "#ededed"}
              onMouseLeave={e => e.target.style.color = "#71717a"}>Arya</a>
            {" "}· Linkup Async Hackathon 2026
          </div>
        </div>
      )}

      {/* Empty State */}
      {!data && !loading && !error && (
        <div style={{ maxWidth: 640, margin: "80px auto 0", textAlign: "center" }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ color: "#3f3f46", fontSize: 13, fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 16 }}>How it works</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
              {[
                { icon: "search", step: "01", title: "Search", desc: "Enter any company name" },
                { icon: "analytics", step: "02", title: "Analyze", desc: "AI scores risk from live news" },
                { icon: "call", step: "03", title: "Act", desc: "Get outreach strategies instantly" }
              ].map((s, i) => (
                <div key={i} style={{ background: "#0f0f1a", border: "1px solid #ffffff0a", borderRadius: 12, padding: 24 }}>
                  <div style={{ fontFamily: "Material Symbols Outlined", fontSize: 24, color: "#6366f1", marginBottom: 12 }}>{s.icon}</div>
                  <div style={{ color: "#3f3f46", fontSize: 11, fontWeight: 600, letterSpacing: "1px", marginBottom: 6 }}>{s.step}</div>
                  <div style={{ color: "#ededed", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{s.title}</div>
                  <div style={{ color: "#71717a", fontSize: 13 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ color: "#52525b", fontSize: 14 }}>Enter a company above to generate your first intelligence brief</div>
        </div>
      )}

      {data && <ChatPanel data={data} open={chatOpen} onClose={() => setChatOpen(false)} />}
    </div>
  );
}