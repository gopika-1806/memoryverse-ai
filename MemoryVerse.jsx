import React, { useState, useRef, useMemo } from "react";
import {
  Upload, Search, Sparkles, FolderTree, Clock, Network,
  FileText, Award, Briefcase, GraduationCap, Code2, Trophy,
  Link2, Loader2, X, ChevronRight, Plus
} from "lucide-react";

/* ---------------------------------------------------------------
   MemoryVerse AI — Digital Identity System
   A single student's scattered files (certs, projects, resumes,
   internship letters) go in. An AI layer organizes, connects,
   times, and retrieves them. Nothing is ever re-filed by hand.
------------------------------------------------------------------*/

const CATEGORY_META = {
  Projects:      { icon: Code2,          color: "#4FD1C5" },
  Skills:        { icon: Sparkles,       color: "#F6C453" },
  Certifications:{ icon: Award,          color: "#C792EA" },
  Internships:   { icon: Briefcase,      color: "#7FB3FF" },
  Achievements:  { icon: Trophy,         color: "#FF8C69" },
  Academics:     { icon: GraduationCap,  color: "#7CE38B" },
};
const CATS = Object.keys(CATEGORY_META);

async function callClaude(system, userText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  const data = await res.json();
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
  return text;
}

function safeParseJSON(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

const SEED_ITEMS = [
  {
    id: "s1", title: "Python for Data Science Certification",
    category: "Certifications", year: 2023,
    skills: ["Python", "Pandas", "Data Analysis"],
    summary: "Completed a certification covering core Python and data-analysis libraries.",
    connections: [], raw: "Certificate: Python for Data Science, issued 2023.",
  },
  {
    id: "s2", title: "Data Science Club Lead",
    category: "Achievements", year: 2024,
    skills: ["Leadership", "Data Science", "Python"],
    summary: "Led the campus Data Science Club, organizing workshops and projects.",
    connections: ["s1"], raw: "Elected lead of the Data Science Club, 2024.",
  },
  {
    id: "s3", title: "ML Internship at XYZ Analytics",
    category: "Internships", year: 2025,
    skills: ["Machine Learning", "Python", "SQL"],
    summary: "Three-month internship building ML pipelines for customer churn prediction.",
    connections: ["s1", "s2"], raw: "Internship offer letter, XYZ Analytics, Summer 2025.",
  },
  {
    id: "s4", title: "AI/ML Capstone Portfolio",
    category: "Projects", year: 2026,
    skills: ["Machine Learning", "NLP", "Portfolio"],
    summary: "A capstone portfolio of AI/ML projects built across the final year.",
    connections: ["s3"], raw: "GitHub portfolio repo: AI/ML capstone projects, 2026.",
  },
];

export default function MemoryVerse() {
  const [items, setItems] = useState(SEED_ITEMS);
  const [view, setView] = useState("categories");
  const [draft, setDraft] = useState({ title: "", type: "Certificate", text: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const fileInputRef = useRef(null);

  const grouped = useMemo(() => {
    const g = {};
    CATS.forEach((c) => (g[c] = []));
    items.forEach((it) => {
      if (!g[it.category]) g[it.category] = [];
      g[it.category].push(it);
    });
    return g;
  }, [items]);

  const byYear = useMemo(() => {
    const g = {};
    items.forEach((it) => {
      const y = it.year || "Undated";
      g[y] = g[y] || [];
      g[y].push(it);
    });
    return Object.entries(g).sort((a, b) => (a[0] > b[0] ? 1 : -1));
  }, [items]);

  const idToTitle = useMemo(() => {
    const m = {};
    items.forEach((it) => (m[it.id] = it.title));
    return m;
  }, [items]);

  async function handleFileRead(file) {
    if (!file) return;
    if (file.type.startsWith("text/") || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
      const text = await file.text();
      setDraft((d) => ({ ...d, title: d.title || file.name, text: text.slice(0, 4000) }));
    } else {
      setDraft((d) => ({
        ...d,
        title: d.title || file.name,
        text: `${d.text}\n\n[Attached file: ${file.name}, type: ${file.type || "unknown"}. Treat this as a ${d.type.toLowerCase()} document with that filename as context.]`,
      }));
    }
  }

  async function addItem() {
    if (!draft.title.trim() && !draft.text.trim()) {
      setError("Give it a title or paste some content first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const existingTitles = items.map((it) => `- (${it.id}) ${it.title} [${it.category}, ${it.year}]`).join("\n") || "(none yet)";
      const system = `You are the classification engine inside MemoryVerse AI, a digital-identity system for students. 
Given one new uploaded document, respond with ONLY a JSON object, no prose, no markdown fences:
{
  "title": "short clean title",
  "category": one of ${JSON.stringify(CATS)},
  "year": four-digit year as a number (best guess from content, else current year 2026),
  "skills": ["short skill tags", ...max 5],
  "summary": "one sentence, plain language, what this document represents",
  "connections": ["id1","id2", ...ids from the EXISTING ITEMS list below that this new item is clearly related to, e.g. a certification that led to a skill, a skill used in a project, a project that led to an internship. Return [] if nothing connects."]
}
EXISTING ITEMS:
${existingTitles}`;
      const userText = `Document type hint: ${draft.type}\nTitle hint: ${draft.title}\nContent:\n${draft.text || "(no text content, rely on title/type)"}`;
      const raw = await callClaude(system, userText);
      const parsed = safeParseJSON(raw);
      if (!parsed) throw new Error("Could not parse AI response");
      const newItem = {
        id: "item-" + Date.now(),
        title: parsed.title || draft.title || "Untitled",
        category: CATS.includes(parsed.category) ? parsed.category : "Academics",
        year: Number(parsed.year) || 2026,
        skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 5) : [],
        summary: parsed.summary || "",
        connections: Array.isArray(parsed.connections) ? parsed.connections.filter((id) => items.some((it) => it.id === id)) : [],
        raw: draft.text,
      };
      setItems((prev) => [...prev, newItem]);
      setDraft({ title: "", type: "Certificate", text: "" });
      setShowUpload(false);
    } catch (e) {
      setError("Couldn't classify that automatically — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function runSearch() {
    if (!query.trim()) return;
    setSearchBusy(true);
    setSearchResults(null);
    try {
      const catalog = items.map((it) => `(${it.id}) [${it.category}, ${it.year}] ${it.title} — ${it.summary} — skills: ${it.skills.join(", ")}`).join("\n");
      const system = `You are the Smart Retrieval System inside MemoryVerse AI. A user asks a natural-language question about their own stored items. 
Respond with ONLY JSON, no prose:
{"matches": ["id1","id2", ...ids of relevant items, best first, empty array if nothing matches], "answer": "one short sentence directly answering the user in plain language"}`;
      const userText = `User's items:\n${catalog}\n\nUser's request: "${query}"`;
      const raw = await callClaude(system, userText);
      const parsed = safeParseJSON(raw);
      const matchIds = parsed && Array.isArray(parsed.matches) ? parsed.matches : [];
      const matches = matchIds.map((id) => items.find((it) => it.id === id)).filter(Boolean);
      setSearchResults({ matches, answer: (parsed && parsed.answer) || "" });
    } catch {
      setSearchResults({ matches: [], answer: "Search failed — try again." });
    } finally {
      setSearchBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0B0E14", color: "#EDEFF4", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500..700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .mv-display { font-family: 'Fraunces', serif; }
        .mv-mono { font-family: 'JetBrains Mono', monospace; }
        .mv-card { background: #12161F; border: 1px solid #1F2531; border-radius: 14px; }
        .mv-btn { transition: all .15s ease; cursor: pointer; }
        .mv-btn:hover { transform: translateY(-1px); }
        .mv-tab { transition: all .15s ease; cursor: pointer; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #2A3140; border-radius: 4px; }
        @keyframes pulse-glow { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
        .mv-node { animation: pulse-glow 3s ease-in-out infinite; }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: "1px solid #1F2531", padding: "28px 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="mv-mono" style={{ color: "#F6C453", fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>MEMORYVERSE AI · DIGITAL IDENTITY SYSTEM</div>
            <h1 className="mv-display" style={{ fontSize: 32, fontWeight: 600, margin: 0 }}>Your journey, organized by itself.</h1>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="mv-btn"
            style={{ display: "flex", alignItems: "center", gap: 8, background: "#F6C453", color: "#0B0E14", border: "none", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14 }}
          >
            <Plus size={18} /> Add to my identity
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px" }}>
        {/* Search */}
        <div className="mv-card" style={{ padding: 20, marginBottom: 28 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Search size={18} color="#7FB3FF" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder='Ask anything — "show all my certificates", "what AI projects have I done?"'
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#EDEFF4", fontSize: 15 }}
            />
            <button onClick={runSearch} disabled={searchBusy} className="mv-btn" style={{ background: "#7FB3FF", color: "#0B0E14", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              {searchBusy ? <Loader2 size={14} className="animate-spin" /> : null} Search
            </button>
          </div>
          {searchResults && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1F2531" }}>
              <div style={{ fontSize: 14, color: "#9AA4B8", marginBottom: 10 }}>{searchResults.answer}</div>
              {searchResults.matches.length === 0 ? (
                <div style={{ fontSize: 13, color: "#5A637A" }}>Nothing matched — try a broader question.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {searchResults.matches.map((it) => <ResultRow key={it.id} item={it} />)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* View tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[
            { id: "categories", label: "Categories", icon: FolderTree },
            { id: "timeline", label: "Journey Timeline", icon: Clock },
            { id: "relations", label: "Relationships", icon: Network },
          ].map((t) => (
            <div
              key={t.id}
              onClick={() => setView(t.id)}
              className="mv-tab"
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10,
                background: view === t.id ? "#1B2130" : "transparent",
                border: view === t.id ? "1px solid #F6C453" : "1px solid #1F2531",
                color: view === t.id ? "#F6C453" : "#9AA4B8", fontSize: 14, fontWeight: 500,
              }}
            >
              <t.icon size={16} /> {t.label}
            </div>
          ))}
        </div>

        {view === "categories" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {CATS.map((cat) => {
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              const catItems = grouped[cat] || [];
              return (
                <div key={cat} className="mv-card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: meta.color + "22", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={17} color={meta.color} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{cat}</div>
                    <div className="mv-mono" style={{ marginLeft: "auto", fontSize: 12, color: "#5A637A" }}>{catItems.length}</div>
                  </div>
                  {catItems.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#4A5268" }}>Nothing here yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {catItems.map((it) => <ResultRow key={it.id} item={it} compact /> )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {view === "timeline" && (
          <div style={{ position: "relative", paddingLeft: 28 }}>
            <div style={{ position: "absolute", left: 8, top: 8, bottom: 8, width: 2, background: "#1F2531" }} />
            {byYear.map(([year, yearItems]) => (
              <div key={year} style={{ marginBottom: 28, position: "relative" }}>
                <div style={{ position: "absolute", left: -28, top: 2, width: 14, height: 14, borderRadius: "50%", background: "#F6C453", border: "3px solid #0B0E14" }} />
                <div className="mv-display" style={{ fontSize: 20, marginBottom: 10, color: "#F6C453" }}>{year}</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {yearItems.map((it) => <ResultRow key={it.id} item={it} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "relations" && (
          <div className="mv-card" style={{ padding: 24 }}>
            <div style={{ fontSize: 13, color: "#9AA4B8", marginBottom: 20 }}>Auto-detected links between certifications, skills, projects, and internships.</div>
            <div style={{ display: "grid", gap: 14 }}>
              {items.filter((it) => it.connections.length > 0).map((it) => (
                <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ background: CATEGORY_META[it.category].color + "22", color: CATEGORY_META[it.category].color, padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500 }}>{it.title}</span>
                  {it.connections.map((cid) => (
                    <React.Fragment key={cid}>
                      <ChevronRight size={14} color="#5A637A" />
                      <span style={{ background: "#1B2130", color: "#9AA4B8", padding: "6px 12px", borderRadius: 8, fontSize: 13 }}>{idToTitle[cid] || cid}</span>
                    </React.Fragment>
                  ))}
                </div>
              ))}
              {items.every((it) => it.connections.length === 0) && (
                <div style={{ fontSize: 13, color: "#5A637A" }}>No relationships detected yet — add more items so the AI can connect them.</div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Upload modal */}
      {showUpload && (
        <div style={{ position: "fixed", inset: 0, background: "#000A", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
          <div className="mv-card" style={{ width: "100%", maxWidth: 520, padding: 24, background: "#12161F" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div className="mv-display" style={{ fontSize: 20 }}>Add a document</div>
              <X size={20} style={{ cursor: "pointer", color: "#9AA4B8" }} onClick={() => setShowUpload(false)} />
            </div>

            <div
              onDrop={(e) => { e.preventDefault(); handleFileRead(e.dataTransfer.files[0]); }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: "1px dashed #2A3140", borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer", marginBottom: 14 }}
            >
              <Upload size={22} color="#7FB3FF" style={{ margin: "0 auto 8px" }} />
              <div style={{ fontSize: 13, color: "#9AA4B8" }}>Drop a file here, or click to choose one</div>
              <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => handleFileRead(e.target.files[0])} />
            </div>

            <label style={{ fontSize: 12, color: "#5A637A" }}>Document type</label>
            <select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
              style={{ width: "100%", background: "#1B2130", border: "1px solid #1F2531", borderRadius: 8, padding: "8px 10px", color: "#EDEFF4", marginBottom: 12, marginTop: 4 }}>
              {["Certificate", "Resume", "Project Report", "Internship Letter", "Portfolio Link", "Other"].map((t) => <option key={t}>{t}</option>)}
            </select>

            <label style={{ fontSize: 12, color: "#5A637A" }}>Title (optional — AI can infer it)</label>
            <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              style={{ width: "100%", background: "#1B2130", border: "1px solid #1F2531", borderRadius: 8, padding: "8px 10px", color: "#EDEFF4", marginBottom: 12, marginTop: 4 }} />

            <label style={{ fontSize: 12, color: "#5A637A" }}>Paste content / description</label>
            <textarea value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} rows={5}
              style={{ width: "100%", background: "#1B2130", border: "1px solid #1F2531", borderRadius: 8, padding: "8px 10px", color: "#EDEFF4", marginTop: 4, marginBottom: 14, resize: "vertical", fontFamily: "inherit" }} />

            {error && <div style={{ color: "#FF8C69", fontSize: 13, marginBottom: 10 }}>{error}</div>}

            <button onClick={addItem} disabled={busy} className="mv-btn" style={{ width: "100%", background: "#F6C453", color: "#0B0E14", border: "none", borderRadius: 8, padding: "12px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {busy ? <><Loader2 size={16} className="animate-spin" /> Classifying with AI…</> : <>Classify & Add <Sparkles size={16} /></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({ item, compact }) {
  const meta = CATEGORY_META[item.category] || CATEGORY_META.Academics;
  const Icon = meta.icon;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", background: "#0F131B", borderRadius: 10, border: "1px solid #1B2130" }}>
      <Icon size={16} color={meta.color} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{item.title}</div>
        {!compact && item.summary && <div style={{ fontSize: 12.5, color: "#8891A5", marginTop: 2 }}>{item.summary}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {item.skills.slice(0, 4).map((s) => (
            <span key={s} className="mv-mono" style={{ fontSize: 10.5, color: "#5A637A", background: "#1B2130", padding: "2px 7px", borderRadius: 5 }}>{s}</span>
          ))}
        </div>
      </div>
      <div className="mv-mono" style={{ marginLeft: "auto", fontSize: 11, color: "#4A5268", flexShrink: 0 }}>{item.year}</div>
    </div>
  );
}
