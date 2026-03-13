import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import { toPng } from "html-to-image";
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import ForceGraph2D from "react-force-graph-2d";

const API = "http://127.0.0.1:8050";

// ── Scenario presets ──────────────────────────────────────────────────────
const SCENARIOS = [
  { id: "baseline",             label: "Baseline",                     why: "Balanced recommendation settings. Useful as the reference case.",                                                                         params: {} },
  { id: "high_engagement",      label: "High Engagement Optimization",  why: "Pushes highly engaging content more strongly. This can increase attention, sensationalism, and misinformation.",                         params: { engagement_weight: 0.7, similarity_weight: 0.5, diversity_weight: 0.05, credibility_weight: 0.1, misinformation_penalty: 0.2 } },
  { id: "personalization_bias", label: "Strong Personalization Bias",   why: "Shows users more belief-aligned content. This can strengthen echo chambers and reduce viewpoint diversity.",                             params: { similarity_weight: 0.6, diversity_weight: 0.02, exploration_rate: 0.02, engagement_weight: 0.5 } },
  { id: "diversity_injection",  label: "Diversity Injection",          why: "Intentionally mixes in credible cross-cutting content. This can reduce ideological isolation.",                                            params: { diversity_injection_rate: 0.3, exploration_rate: 0.3, diversity_weight: 0.4, similarity_weight: 0.1 } },
];

const SPEED_OPTIONS = [
  { label: "Slow", ms: 1200 },
  { label: "Med",  ms: 500  },
  { label: "Fast", ms: 150  },
];

// ── Pure helper ───────────────────────────────────────────────────────────
function snapshotMetrics(data) {
  if (!data?.metrics) return null;
  return {
    step: data.step ?? 0,
    polarization_index: data.metrics.polarization_index ?? 0,
    misinformation_prevalence: data.metrics.misinformation_prevalence ?? 0,
    average_engagement: data.metrics.average_engagement ?? 0,
    average_exposure_diversity: data.metrics.average_exposure_diversity ?? 0,
  };
}

// ── Theme tokens ─────────────────────────────────────────────────────────
const C = {
  bg:        "#0f1117",
  surface:   "#1a1d27",
  card:      "#21253a",
  border:    "#2e3250",
  accent:    "#5b8dee",
  accentAlt: "#a78bfa",
  danger:    "#f87171",
  muted:     "#8892b0",
  text:      "#e2e8f0",
};

// ── Reusable components ───────────────────────────────────────────────────

function MetricCard({ label, value, unit = "", color = C.accent }) {
  const formatted =
    value === undefined || value === null
      ? "—"
      : typeof value === "number"
      ? value.toFixed(4)
      : String(value);
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "14px 18px",
      minWidth: 140,
      flex: "1 1 140px",
    }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>
        {formatted}
        {unit && <span style={{ fontSize: 13, color: C.muted, marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function MiniChart({ title, data, dataKey, color, height = 180 }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px 6px", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 2, right: 8, bottom: 2, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="step" tick={{ fontSize: 9, fill: C.muted }} stroke={C.border} />
            <YAxis tick={{ fontSize: 9, fill: C.muted }} stroke={C.border} width={38} />
            <Tooltip
              contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, color: C.text }}
              labelStyle={{ color: C.muted }}
              itemStyle={{ color }}
            />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: color }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function beliefColor(belief) {
  if (belief < -0.2) return "#5b8dee";
  if (belief > 0.2) return "#f87171";
  return "#8892b0";
}

const CREATOR_COLOR = "#facc15"; // yellow-gold — visually distinct from belief colors

// Draw equilateral triangle centered at (x, y) with half-size s
function drawTriangle(ctx, x, y, s, fill, stroke, lw) {
  const h = s * Math.sqrt(3);
  ctx.beginPath();
  ctx.moveTo(x,       y - h * 0.65);
  ctx.lineTo(x - s,  y + h * 0.35);
  ctx.lineTo(x + s,  y + h * 0.35);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// ── Hover tooltip ─────────────────────────────────────────────────────────
function NodeTooltip({ node, nodeMap }) {
  if (!node) return null;
  const live = nodeMap.get(node.id);
  if (!live) return null;
  const isCreator = live.type === "creator";
  const belief = isCreator ? "n/a" : (live.belief_score ?? live.ideology_position ?? 0).toFixed(3);
  const openness = live.openness != null ? live.openness.toFixed(3) : "—";
  const susceptibility = live.susceptibility_to_misinfo ?? live.susceptibility ?? null;
  const susText = susceptibility != null ? susceptibility.toFixed(3) : "—";
  const color = isCreator ? CREATOR_COLOR : beliefColor(live.belief_score ?? live.ideology_position ?? 0);

  return (
    <div style={{
      position: "absolute", top: 10, right: 10,
      background: "rgba(15,17,23,0.95)", border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "10px 14px",
      pointerEvents: "none", minWidth: 165, zIndex: 10, backdropFilter: "blur(4px)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
        {live.type ?? "user"} #{node.id}
      </div>
      {[
        ["Belief Score",     belief,   color   ],
        ["Openness",         openness, C.accent ],
        ["Misinfo Suscept.", susText,  C.danger ],
      ].map(([label, val, col]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: C.muted }}>{label}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: col }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

// ── Clicked node details panel ────────────────────────────────────────────
function NodeDetails({ node, nodeMap, links, onClose }) {
  if (!node) return null;
  const live = nodeMap.get(node.id);
  if (!live) return null;
  const isCreator = live.type === "creator";
  const belief = isCreator ? "n/a" : (live.belief_score ?? live.ideology_position ?? 0).toFixed(4);
  const openness = live.openness != null ? live.openness.toFixed(4) : "—";
  const sus = live.susceptibility_to_misinfo ?? live.susceptibility ?? null;
  const susText = sus != null ? sus.toFixed(4) : "—";
  const color = isCreator ? CREATOR_COLOR : beliefColor(live.belief_score ?? live.ideology_position ?? 0);
  const connections = links.filter(l => {
    const s = typeof l.source === "object" ? l.source?.id : l.source;
    const t = typeof l.target === "object" ? l.target?.id : l.target;
    return s === node.id || t === node.id;
  }).length;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${color}`, borderRadius: 10,
      padding: "12px 14px", marginTop: 8, position: "relative",
    }}>
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 8, right: 10, background: "none",
          border: "none", color: C.muted, cursor: "pointer", fontSize: 14,
          lineHeight: 1, padding: 0,
        }}
        title="Close"
      >✕</button>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
        {isCreator ? "▲ Creator" : "● User"} #{node.id}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
        {[
          ["Type",          live.type ?? "user",  C.text   ],
          ["Connections",   connections,           C.accent ],
          ["Belief Score",  belief,                color    ],
          ["Openness",      openness,              C.accent ],
          ["Misinfo Susc.", susText,               C.danger ],
        ].map(([label, val, col]) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: col }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetworkGraph({ nodes, links = [], step, agentCount }) {
  const fgRef = useRef(null);
  const nodeMapRef = useRef(new Map());
  const [hoveredNode, setHoveredNode] = useState(null);
  const [clickedNode, setClickedNode] = useState(null);
  const graphDataRef = useRef({ nodes: [], links: [] });
  const [showClusters, setShowClusters] = useState(true);
  const showClustersRef = useRef(true);

  // Keep a fast id→node lookup without triggering graph rebuilds
  useEffect(() => {
    nodeMapRef.current = new Map((nodes ?? []).map((n) => [n.id, n]));
  }, [nodes]);

  // Only rebuild the force simulation when topology (node IDs) changes
  const topoKey = useMemo(() => (nodes ?? []).map((n) => n.id).join(","), [nodes]);

  const graphData = useMemo(() => {
    if (!nodes || nodes.length === 0) {
      const d = { nodes: [], links: [] };
      graphDataRef.current = d;
      return d;
    }
    const d = {
      nodes: nodes.map((n) => ({ id: n.id })),
      links: Array.isArray(links) ? links.map((l) => ({ ...l })) : [],
    };
    graphDataRef.current = d;
    return d;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topoKey, links]);

  // Draw cluster highlight regions behind nodes — one per belief group
  const clusterPainter = useCallback((ctx) => {
    if (!showClustersRef.current) return;
    const gNodes = graphDataRef.current.nodes;
    if (!gNodes || gNodes.length === 0) return;

    const groups = { negative: [], neutral: [], positive: [] };
    for (const n of gNodes) {
      if (n.x == null || n.y == null) continue;
      const live = nodeMapRef.current.get(n.id);
      if (!live || live.type === "creator") continue;
      const belief = live.belief_score ?? live.ideology_position ?? 0;
      if (belief < -0.2) groups.negative.push(n);
      else if (belief > 0.2) groups.positive.push(n);
      else groups.neutral.push(n);
    }

    const clusterDefs = [
      { key: "negative", rgb: [91, 141, 238] },
      { key: "neutral",  rgb: [136, 146, 176] },
      { key: "positive", rgb: [248, 113, 113] },
    ];

    for (const { key, rgb } of clusterDefs) {
      const pts = groups[key];
      if (pts.length < 4) continue; // require meaningful cluster size
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      let maxR = 0;
      for (const p of pts) {
        const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
        if (dist > maxR) maxR = dist;
      }
      const r = maxR + 40;
      const [R, G, B] = rgb;

      // Strong radial fill
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0,   `rgba(${R},${G},${B},0.30)`);
      grad.addColorStop(0.45, `rgba(${R},${G},${B},0.18)`);
      grad.addColorStop(0.75, `rgba(${R},${G},${B},0.08)`);
      grad.addColorStop(1,   `rgba(${R},${G},${B},0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.fillStyle = grad;
      ctx.fill();

      // Dashed boundary ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 14, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgba(${R},${G},${B},0.45)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 7]);
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  // Canvas painter: creators = triangles, users = circles
  const nodeCanvasObject = useCallback((node, ctx) => {
    const live = nodeMapRef.current.get(node.id);
    const isCreator = live?.type === "creator";
    const belief = live?.belief_score ?? live?.ideology_position ?? 0;
    const absB = Math.abs(belief);
    const isHovered = hoveredNode?.id === node.id;
    const isClicked = clickedNode?.id === node.id;
    const isExtreme = absB > 0.65;

    if (isCreator) {
      const s = 4.5;
      // Glow for hover/click
      if (isHovered || isClicked) {
        drawTriangle(ctx, node.x, node.y, s + 2.5, CREATOR_COLOR + "33", null, 0);
      }
      drawTriangle(ctx, node.x, node.y, s, CREATOR_COLOR, isClicked ? "#fff" : CREATOR_COLOR + "bb", isClicked ? 1.2 : 0.6);
    } else {
      const r = 2.5 + Math.min(absB * 8, 7);
      const color = beliefColor(belief);
      // Glow ring
      if (isExtreme || isHovered || isClicked) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + (isHovered || isClicked ? 3.5 : 2.5), 0, 2 * Math.PI);
        ctx.fillStyle = color + (isHovered || isClicked ? "55" : "30");
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.strokeStyle = isClicked ? "#fff" : isHovered ? "#ffffffaa" : color + "aa";
      ctx.lineWidth = isClicked || isHovered ? 1.2 : 0.5;
      ctx.stroke();
    }
  }, [hoveredNode, clickedNode]);

  const nodePointerAreaPaint = useCallback((node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 11, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const handleNodeHover = useCallback((node) => setHoveredNode(node ?? null), []);
  const handleNodeClick = useCallback((node) => {
    setClickedNode((prev) => (prev?.id === node?.id ? null : node ?? null));
  }, []);

  const handleRecenter = () => {
    if (fgRef.current) fgRef.current.zoomToFit(400, 30);
  };

  if (!nodes || nodes.length === 0) {
    return (
      <div style={{
        flex: 1, minHeight: 340, background: C.surface,
        border: `1px dashed ${C.border}`, borderRadius: 14,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", color: C.muted, gap: 10,
      }}>
        <svg width={48} height={48} viewBox="0 0 48 48" fill="none">
          <circle cx={24} cy={24} r={23} stroke={C.border} strokeWidth={2}/>
          <circle cx={24} cy={14} r={4} fill={C.accent} opacity={0.8}/>
          <circle cx={14} cy={34} r={4} fill={C.accentAlt} opacity={0.8}/>
          <circle cx={34} cy={34} r={4} fill={C.accent} opacity={0.6}/>
          <line x1={24} y1={14} x2={14} y2={34} stroke={C.border} strokeWidth={1.5}/>
          <line x1={24} y1={14} x2={34} y2={34} stroke={C.border} strokeWidth={1.5}/>
          <line x1={14} y1={34} x2={34} y2={34} stroke={C.border} strokeWidth={1.5}/>
        </svg>
        <div style={{ fontSize: 13 }}>Initialize the model to see the social graph</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Toolbar row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <button
          onClick={() => {
            setShowClusters((v) => {
              showClustersRef.current = !v;
              return !v;
            });
          }}
          style={{
            background: showClusters ? C.accent : C.card,
            border: `1px solid ${showClusters ? C.accent : C.border}`,
            color: showClusters ? "#fff" : C.muted,
            borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 600,
            cursor: "pointer", letterSpacing: 0.3, transition: "all 0.18s",
          }}
          title="Toggle echo chamber cluster highlights"
        >
          {showClusters ? "◉ Echo Chambers On" : "◎ Echo Chambers Off"}
        </button>
        <button
          onClick={handleRecenter}
          style={{
            background: C.card, border: `1px solid ${C.border}`, color: C.muted,
            borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 600,
            cursor: "pointer", letterSpacing: 0.3,
          }}
          title="Zoom to fit the full network"
        >
          ⌖ Re-center Network
        </button>
      </div>

      {/* Graph canvas */}
      <div style={{
        flex: 1, minHeight: 260, background: C.surface,
        borderRadius: 14, overflow: "hidden", position: "relative",
        border: `1px solid ${C.border}`,
      }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          backgroundColor={C.surface}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          linkColor={() => "#3a4060"}
          linkOpacity={0.45}
          linkWidth={0.7}
          cooldownTicks={180}
          warmupTicks={80}
          d3VelocityDecay={0.55}
          d3AlphaDecay={0.03}
          d3AlphaMin={0.001}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          onRenderFramePre={clusterPainter}
        />

        {/* Hover tooltip */}
        {!clickedNode && <NodeTooltip node={hoveredNode} nodeMap={nodeMapRef.current} />}

        {/* Step count badge */}
        <div style={{
          position: "absolute", top: 10, left: 12, fontSize: 10, fontWeight: 700,
          color: C.muted, background: "rgba(15,17,23,0.75)", borderRadius: 5,
          padding: "3px 8px", pointerEvents: "none", letterSpacing: 0.5,
        }}>
          {agentCount} nodes · step {step}
        </div>

        {/* Legend (bottom-left) */}
        <div style={{
          position: "absolute", bottom: 10, left: 12, pointerEvents: "none",
          display: "flex", flexDirection: "column", gap: 4,
          background: "rgba(15,17,23,0.82)", borderRadius: 7, padding: "7px 10px",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Legend</div>
          {/* Node types */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#8892b0", flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: 10, color: C.muted }}>● User node</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: CREATOR_COLOR, fontWeight: 700 }}>▲</span>
            <span style={{ fontSize: 10, color: C.muted }}>Creator node</span>
          </div>
          {/* Belief colors */}
          {[
            { color: "#5b8dee", label: "Neg. belief  (< −0.2)" },
            { color: "#8892b0", label: "Neutral belief" },
            { color: "#f87171", label: "Pos. belief  (> 0.2)"  },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: 10, color: C.muted }}>{label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 9, color: C.muted }}>◉</span>
            <span style={{ fontSize: 10, color: C.muted }}>Larger / glow = more extreme</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 1, background: "#3a4060", display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: C.muted }}>Social connection</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: "rgba(91,141,238,0.35)",
              border: "1.5px dashed rgba(91,141,238,0.6)",
              display: "inline-block", flexShrink: 0,
            }} />
            <span style={{ fontSize: 10, color: C.muted }}>Glow region = echo chamber</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 9, color: C.accentAlt, lineHeight: 1.4, maxWidth: 148 }}>
            Colored glow regions indicate emerging belief clusters
          </div>
        </div>

        {/* Click hint bottom-right */}
        <div style={{
          position: "absolute", bottom: 10, right: 12, fontSize: 9,
          color: C.muted, pointerEvents: "none", opacity: 0.6,
        }}>
          Click a node for details
        </div>
      </div>

      {/* Clicked node details panel */}
      {clickedNode && (
        <NodeDetails
          node={clickedNode}
          nodeMap={nodeMapRef.current}
          links={links}
          onClose={() => setClickedNode(null)}
        />
      )}

      {/* Explanatory caption */}
      <div style={{ padding: "6px 4px 0", fontSize: 11, color: C.muted, lineHeight: 1.55 }}>
        <span style={{ color: "#8892b0", fontWeight: 600 }}>●</span> Users (circles) and{" "}
        <span style={{ color: CREATOR_COLOR, fontWeight: 600 }}>▲</span> Creators (triangles) form a social network.
        Node <span style={{ color: "#5b8dee", fontWeight: 600 }}>color</span> shows ideological position — clusters of similar colors may indicate{" "}
        <span style={{ color: C.accentAlt, fontWeight: 600 }}>echo chambers</span>.
      </div>
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary" }) {
  const base = {
    padding: "9px 18px",
    borderRadius: 7,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    fontSize: 13,
    transition: "opacity 0.15s",
    opacity: disabled ? 0.45 : 1,
    letterSpacing: 0.3,
    width: "100%",
  };
  const variants = {
    primary:   { background: C.accent,   color: "#fff" },
    secondary: { background: C.card,     color: C.text,    border: `1px solid ${C.border}` },
    danger:    { background: "#3d1515",  color: C.danger,  border: `1px solid #5a2020` },
    active:    { background: "#1a3320",  color: "#4ade80", border: `1px solid #2d6040` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
}

// ── InfoCard (shared by HowItWorksTab) ────────────────────────────────────
function InfoCard({ title, accentColor, children }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 10,
      padding: "20px 22px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

// ── How It Works tab ─────────────────────────────────────────────────────
function HowItWorksTab() {
  return (
    <div style={{ overflowY: "auto", padding: "28px 40px", background: C.bg, height: "100%" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: C.text }}>
          How the Echo Chamber Simulation Works
        </h2>
        <p style={{ margin: "0 0 24px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          A Mesa 3 agent-based model studying AI-driven recommendation, misinformation spread, and ideological polarization on social networks.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>

          {/* Problem Definition */}
          <InfoCard title="Problem Definition" accentColor={C.accent}>
            <p style={{ margin: 0, color: C.muted }}>
              This simulation studies how social media recommendation systems can create echo chambers,
              amplify misinformation, and increase polarization.
            </p>
          </InfoCard>

          {/* Agents */}
          <InfoCard title="Agents" accentColor={C.accentAlt}>
            {[
              { label: "Users",     desc: "Consume, engage with, and share content; beliefs can shift over time",                            color: C.accent    },
              { label: "Creators",  desc: "Generate content that may be more credible, sensational, or extreme",                             color: C.accentAlt },
              { label: "Algorithm", desc: "Ranks content using engagement, similarity, credibility, and diversity logic",                    color: "#4ade80"   },
            ].map(({ label, desc, color }) => (
              <div key={label} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                <span style={{ background: color + "22", color, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap", marginTop: 2 }}>
                  {label}
                </span>
                <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.55 }}>{desc}</span>
              </div>
            ))}
          </InfoCard>

          {/* Environment */}
          <InfoCard title="Environment" accentColor="#4ade80">
            {[
              "A social network graph where nodes are users",
              "Edges represent social connections between users",
            ].map((txt, i) => (
              <div key={i} style={{ display: "flex", gap: 9, marginBottom: 9, alignItems: "flex-start" }}>
                <span style={{ color: "#4ade80", marginTop: 1 }}>▸</span>
                <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.55 }}>{txt}</span>
              </div>
            ))}
          </InfoCard>

          {/* Simulation Workflow */}
          <InfoCard title="Simulation Workflow" accentColor="#facc15">
            {[
              "Creators generate content",
              "The algorithm ranks content for each user",
              "Users consume and engage with content",
              "User beliefs update based on consumed content",
              "Metrics and network state are recorded",
            ].map((txt, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 9, alignItems: "flex-start" }}>
                <span style={{ color: "#facc15", fontWeight: 700, fontSize: 12, minWidth: 18, textAlign: "right" }}>{i + 1}.</span>
                <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.55 }}>{txt}</span>
              </div>
            ))}
          </InfoCard>

          {/* Visual Encoding */}
          <InfoCard title="Visual Encoding" accentColor={C.accent}>
            {[
              { color: "#5b8dee", label: "Blue nodes",  desc: "negative belief  (< −0.2)"    },
              { color: "#8892b0", label: "Gray nodes",  desc: "neutral belief   (−0.2 to 0.2)" },
              { color: "#f87171", label: "Red nodes",   desc: "positive belief  (> 0.2)"      },
            ].map(({ color, label, desc }) => (
              <div key={label} style={{ display: "flex", gap: 10, marginBottom: 9, alignItems: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                <span style={{ color, fontWeight: 600, fontSize: 12, minWidth: 82 }}>{label}</span>
                <span style={{ color: C.muted, fontSize: 12 }}>{desc}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 9, marginTop: 4, alignItems: "center" }}>
              <span style={{ color: C.muted }}>▸</span>
              <span style={{ color: C.muted, fontSize: 12 }}>Larger nodes = more extreme beliefs</span>
            </div>
          </InfoCard>

          {/* Controls */}
          <InfoCard title="Controls" accentColor="#f97316">
            {[
              { label: "Initialize",      desc: "Start the selected scenario" },
              { label: "Play / Pause",    desc: "Continuously advance the simulation step by step" },
              { label: "Step",            desc: "Advance exactly one simulation step" },
              { label: "Reset",           desc: "Restart the simulation from scratch" },
              { label: "Speed controls",  desc: "Adjust the autoplay step interval (100 ms – 2 s)" },
            ].map(({ label, desc }) => (
              <div key={label} style={{ display: "flex", gap: 10, marginBottom: 9, alignItems: "flex-start" }}>
                <span style={{ background: C.surface, border: `1px solid ${C.border}`, color: "#f97316", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap", marginTop: 1 }}>
                  {label}
                </span>
                <span style={{ color: C.muted, fontSize: 12, lineHeight: 1.55 }}>{desc}</span>
              </div>
            ))}
          </InfoCard>

        </div>
    </div>
  );
}

// ── Scenario reference data ───────────────────────────────────────────────
const SCENARIO_DETAILS = [
  {
    label: "Baseline",
    accentColor: "#5b8dee",
    description: "Uses balanced, default recommendation settings with no special weighting toward any single factor.",
    changes: "Default weights: equal balance of engagement, similarity, credibility, and diversity signals.",
    effects: [
      { metric: "Polarization",   value: "Moderate",  dir: "→", color: "#facc15" },
      { metric: "Misinformation", value: "Moderate",  dir: "→", color: "#facc15" },
      { metric: "Engagement",     value: "Moderate",  dir: "→", color: "#facc15" },
      { metric: "Diversity",      value: "Moderate",  dir: "→", color: "#facc15" },
    ],
  },
  {
    label: "High Engagement Optimization",
    accentColor: "#f97316",
    description: "Prioritizes highly engaging content more strongly, mimicking platforms optimised for user time-on-site at the expense of accuracy.",
    changes: "Raised engagement_weight (0.7) and similarity_weight (0.5); reduced credibility_weight and misinformation_penalty.",
    effects: [
      { metric: "Polarization",   value: "Higher",           dir: "↑",  color: "#f87171" },
      { metric: "Misinformation", value: "More prevalent",   dir: "↑",  color: "#f87171" },
      { metric: "Engagement",     value: "Higher",           dir: "↑",  color: "#4ade80" },
      { metric: "Diversity",      value: "Lower",            dir: "↓",  color: "#f87171" },
    ],
  },
  {
    label: "Strong Personalization Bias",
    accentColor: "#a78bfa",
    description: "Prioritises belief-aligned content much more strongly, creating tight ideological filter bubbles and reduced exposure to alternative views.",
    changes: "Raised similarity_weight (0.6); reduced diversity_weight (0.02) and exploration_rate (0.02).",
    effects: [
      { metric: "Polarization",   value: "Echo chambers",      dir: "↑↑", color: "#f87171" },
      { metric: "Misinformation", value: "Moderate to high",   dir: "↑",  color: "#f87171" },
      { metric: "Engagement",     value: "High (in clusters)", dir: "↑",  color: "#4ade80" },
      { metric: "Diversity",      value: "Much lower",         dir: "↓↓", color: "#f87171" },
    ],
  },
  {
    label: "Diversity Injection",
    accentColor: "#4ade80",
    description: "Deliberately includes cross-cutting credible content to counteract echo chamber formation and expose users to wider viewpoints.",
    changes: "Raised diversity_injection_rate (0.3), exploration_rate (0.3), diversity_weight (0.4); reduced similarity_weight (0.1).",
    effects: [
      { metric: "Polarization",   value: "Lower growth",      dir: "↓",  color: "#4ade80" },
      { metric: "Misinformation", value: "Lower prevalence",  dir: "↓",  color: "#4ade80" },
      { metric: "Engagement",     value: "Slightly lower",    dir: "↓",  color: "#facc15" },
      { metric: "Diversity",      value: "Much higher",       dir: "↑↑", color: "#4ade80" },
    ],
  },
];

// ── Scenarios tab ─────────────────────────────────────────────────────────
function ScenariosTab() {
  return (
    <div style={{ overflowY: "auto", padding: "28px 40px", background: C.bg, height: "100%" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: C.text }}>
          Simulation Scenarios
        </h2>
        <p style={{ margin: "0 0 24px", color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          Each scenario adjusts the recommendation algorithm's weights to simulate a different platform design choice.
          Select a scenario in the <strong style={{ color: C.accent }}>Simulation</strong> tab and click <strong style={{ color: C.accent }}>Initialize</strong> to run it.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16 }}>
          {SCENARIO_DETAILS.map(({ label, accentColor, description, changes, effects }) => (
            <div key={label} style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${accentColor}`,
              borderRadius: 10,
              padding: "20px 22px",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: accentColor, marginBottom: 8 }}>{label}</div>
              <p style={{ margin: "0 0 10px", color: C.text, fontSize: 12, lineHeight: 1.6 }}>{description}</p>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600 }}>Parameter changes: </span>{changes}
              </div>

              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Expected Effects</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {effects.map(({ metric, value, dir, color }) => (
                  <div key={metric} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 11px" }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{metric}</div>
                    <div style={{ fontSize: 13, color, fontWeight: 700 }}>
                      {dir}&nbsp;{value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
    </div>
  );
}

// ── Live commentary message generator ────────────────────────────────────
// ── Simulation summary text generator ───────────────────────────────────
function buildSummaryText(metrics, scenarioId, step) {
  if (!metrics) return [];
  const pol   = metrics.polarization_index          ?? 0;
  const mis   = metrics.misinformation_prevalence   ?? 0;
  const eng   = metrics.average_engagement          ?? 0;
  const div   = metrics.average_exposure_diversity  ?? 0;

  const sentences = [];

  // Polarization sentence
  if (pol > 0.6)
    sentences.push("Users became strongly divided into opposing belief groups, showing clear echo chamber formation.");
  else if (pol > 0.35)
    sentences.push("Users gradually drifted into distinct belief clusters, with moderate polarization across the network.");
  else
    sentences.push("Beliefs stayed relatively spread out, with no strong ideological divide forming in this run.");

  // Misinformation sentence
  if (mis > 0.55)
    sentences.push("Misinformation spread widely — a large share of users were exposed to false or misleading content.");
  else if (mis > 0.25)
    sentences.push("Some misinformation circulated in the network, but it did not fully dominate what users saw.");
  else
    sentences.push("Misinformation remained limited, meaning most content users encountered was relatively credible.");

  // Scenario-specific or diversity sentence
  if (scenarioId === "diversity_injection") {
    sentences.push(div > 0.45
      ? "The diversity injection strategy worked — users were exposed to a wider range of viewpoints than in baseline conditions."
      : "Diversity injection had some effect, but belief clustering still emerged over time.");
  } else if (scenarioId === "high_engagement") {
    sentences.push(eng > 0.6
      ? "High engagement optimization kept users actively interacting, though this came at the cost of accuracy and balance."
      : "Despite engagement-focused recommendations, user activity remained moderate throughout the run.");
  } else if (scenarioId === "personalization_bias") {
    sentences.push(div < 0.3
      ? "Strong personalization narrowed what users saw significantly, reinforcing their existing beliefs."
      : "Personalization pushed users toward similar content, though some cross-cutting exposure still occurred.");
  } else {
    sentences.push(div > 0.45
      ? "Content diversity remained healthy, with users seeing a reasonable mix of different viewpoints."
      : "Exposure diversity dropped over time — users increasingly saw content similar to what they already believed.");
  }

  return sentences;
}

// ── Simulation Summary modal ──────────────────────────────────────────────
function SimulationSummary({ summary, onClose, onRunAgain }) {
  if (!summary) return null;
  const { scenarioLabel, step, metrics, scenarioId } = summary;
  const sentences = buildSummaryText(metrics, scenarioId, step);
  const rows = [
    { label: "Scenario",                value: scenarioLabel,                                          color: C.accentAlt },
    { label: "Steps completed",         value: step,                                                   color: C.accent },
    { label: "Final polarization",      value: (metrics.polarization_index          ?? 0).toFixed(3),  color: "#f97316" },
    { label: "Misinformation level",    value: (metrics.misinformation_prevalence   ?? 0).toFixed(3),  color: C.danger },
    { label: "Average engagement",      value: (metrics.average_engagement          ?? 0).toFixed(3),  color: "#4ade80" },
    { label: "Exposure diversity",      value: (metrics.average_exposure_diversity  ?? 0).toFixed(3),  color: C.accentAlt },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(10,11,18,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: "28px 32px",
          width: 480,
          maxWidth: "92vw",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Simulation Complete</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>Simulation Summary</h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 7, width: 30, height: 30, cursor: "pointer", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
            title="Close"
          >✕</button>
        </div>

        {/* Metrics grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {rows.map(({ label, value, color }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Explanation */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.accentAlt, textTransform: "uppercase", letterSpacing: 0.9, marginBottom: 10 }}>What happened in this run?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {sentences.map((s, i) => (
              <div key={i} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
                <span style={{ color: C.accentAlt, marginRight: 6 }}>›</span>{s}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onRunAgain}
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 12, cursor: "pointer" }}
          >
            ↺ Run Again
          </button>
          <button
            onClick={onClose}
            style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 8, padding: "9px 22px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Comparison key findings ──────────────────────────────────────────────
function buildKeyFindings(a, b, idA, idB) {
  // a and b are metrics objects; idA/idB are scenario ids
  const findings = [];
  const pol  = (m) => m.polarization_index         ?? 0;
  const mis  = (m) => m.misinformation_prevalence  ?? 0;
  const eng  = (m) => m.average_engagement         ?? 0;
  const div  = (m) => m.average_exposure_diversity ?? 0;

  const polDiff = pol(b) - pol(a);
  const misDiff = mis(b) - mis(a);
  const divDiff = div(b) - div(a);
  const engDiff = eng(b) - eng(a);
  const lblB = SCENARIOS.find((s) => s.id === idB)?.label ?? idB;
  const lblA = SCENARIOS.find((s) => s.id === idA)?.label ?? idA;

  if (Math.abs(polDiff) > 0.04)
    findings.push(polDiff > 0
      ? `${lblB} produced higher polarization — users diverged into stronger belief clusters.`
      : `${lblB} kept polarization lower — the network stayed more ideologically mixed.`);

  if (Math.abs(misDiff) > 0.04)
    findings.push(misDiff > 0
      ? `Misinformation spread more under ${lblB} — lower-credibility content reached more users.`
      : `${lblB} saw less misinformation — content credibility was better maintained.`);

  if (Math.abs(divDiff) > 0.04)
    findings.push(divDiff > 0
      ? `${lblB} delivered greater exposure diversity — users encountered a wider range of viewpoints.`
      : `Exposure diversity dropped more under ${lblB} — echo chamber risk was higher.`);

  if (Math.abs(engDiff) > 0.04)
    findings.push(engDiff > 0
      ? `Engagement was higher in ${lblB}, meaning users interacted more actively with content.`
      : `${lblA} kept engagement higher throughout the run.`);

  if (findings.length === 0)
    findings.push("The two scenarios produced similar outcomes across all measured metrics.");

  return findings;
}

// ── Compare Tab ───────────────────────────────────────────────────────────
function CompareTab({ savedRuns }) {
  const ids = SCENARIOS.map((s) => s.id);
  const [selA, setSelA] = useState(ids[0]);
  const [selB, setSelB] = useState(ids[1]);

  const runA = savedRuns[selA];
  const runB = savedRuns[selB];
  const canCompare = runA && runB;
  const findings = canCompare ? buildKeyFindings(runA.metrics, runB.metrics, selA, selB) : [];

  const METRIC_ROWS = [
    { key: "polarization_index",        label: "Polarization Index",      color: "#f97316", higher: "worse" },
    { key: "misinformation_prevalence", label: "Misinformation Level",    color: C.danger,  higher: "worse" },
    { key: "average_engagement",        label: "Average Engagement",      color: "#4ade80", higher: "better" },
    { key: "average_exposure_diversity",label: "Exposure Diversity",      color: C.accentAlt, higher: "better" },
  ];

  const selectStyle = {
    background: C.card, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: 7, padding: "7px 10px", fontSize: 12, outline: "none",
    cursor: "pointer", width: "100%",
  };

  return (
    <div style={{ padding: "24px 28px", overflowY: "auto", maxWidth: 860, margin: "0 auto", width: "100%" }}>
      <SectionTitle>Scenario Comparison</SectionTitle>
      <p style={{ fontSize: 12.5, color: C.muted, marginTop: 2, marginBottom: 20, lineHeight: 1.6 }}>
        Compare the final metrics from two saved simulation runs. Run and reset each scenario to save its results.
      </p>

      {/* Scenario selectors */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
        {[{ sel: selA, setSel: setSelA, label: "Scenario A" }, { sel: selB, setSel: setSelB, label: "Scenario B" }].map(({ sel, setSel, label }) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{label}</div>
            <select value={sel} onChange={(e) => setSel(e.target.value)} style={selectStyle}>
              {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            {!savedRuns[sel] && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#f97316", display: "flex", alignItems: "center", gap: 5 }}>
                <span>⚠</span> No saved run yet — run this scenario and click Reset to save it.
              </div>
            )}
            {savedRuns[sel] && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#4ade80" }}>
                ✓ Saved — {savedRuns[sel].step} steps
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Comparison table */}
      {canCompare ? (
        <>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", background: C.card, padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Metric</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.accentAlt, textTransform: "uppercase", letterSpacing: 0.8 }}>A · {SCENARIOS.find((s) => s.id === selA)?.label}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8 }}>B · {SCENARIOS.find((s) => s.id === selB)?.label}</div>
            </div>
            {METRIC_ROWS.map(({ key, label, color, higher }) => {
              const vA = runA.metrics[key] ?? 0;
              const vB = runB.metrics[key] ?? 0;
              const diff = vB - vA;
              const better = higher === "better" ? diff > 0.01 : diff < -0.01;
              const worse  = higher === "better" ? diff < -0.01 : diff > 0.01;
              return (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", padding: "11px 16px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color }}>{vA.toFixed(3)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color }}>{vB.toFixed(3)}</span>
                    {Math.abs(diff) > 0.01 && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                        background: better ? "rgba(74,222,128,0.15)" : worse ? "rgba(248,113,113,0.15)" : "transparent",
                        color: better ? "#4ade80" : worse ? C.danger : C.muted }}>
                        {diff > 0 ? "+" : ""}{diff.toFixed(3)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Key Findings */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.accentAlt, textTransform: "uppercase", letterSpacing: 0.9, marginBottom: 12 }}>Key Findings</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {findings.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span style={{ color: C.accentAlt, flexShrink: 0, marginTop: 1 }}>›</span>
                  <span style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12, padding: "32px 24px", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Run both selected scenarios and click <strong style={{ color: C.accent }}>Reset</strong> after each to save their results, then compare here.
        </div>
      )}
    </div>
  );
}

function buildCommentaryMessage(metrics, scenarioId, stepNum) {
  if (!metrics) return null;
  const pol    = metrics.polarization_index          ?? 0;
  const misinfo = metrics.misinformation_prevalence  ?? 0;
  const eng    = metrics.average_engagement          ?? 0;
  const div    = metrics.average_exposure_diversity  ?? 0;
  const v = stepNum % 4; // rotate through 4 observation angles

  const pool = [
    // Angle 0 — polarization
    pol > 0.5  ? { color: "#f87171", text: "Beliefs are drifting further apart — polarisation is strengthening." }
    : pol > 0.28 ? { color: "#f97316", text: "Mild polarisation is forming as user beliefs start to diverge." }
               : { color: "#4ade80", text: "Beliefs remain balanced — no significant polarisation yet." },

    // Angle 1 — misinformation
    misinfo > 0.45 ? { color: "#f87171", text: "Misinformation is spreading — low-credibility content is dominating feeds." }
    : misinfo > 0.25 ? { color: "#f97316", text: "Some misinformation is circulating through social connections." }
                   : { color: "#4ade80", text: "Content credibility is holding steady this step." },

    // Angle 2 — exposure diversity
    div < 0.2  ? { color: "#f87171", text: "Users are seeing very little variety in their feeds." }
    : div < 0.4 ? { color: "#f97316", text: "Feed diversity is declining — echo chambers may be forming." }
               : { color: "#4ade80", text: "Exposure diversity is healthy — users are encountering varied viewpoints." },

    // Angle 3 — engagement or scenario-specific
    eng > 0.65
      ? { color: "#facc15", text: "Engagement is staying high — users are actively interacting with content." }
      : scenarioId === "high_engagement"      ? { color: "#f97316",  text: "The algorithm is favoring engaging content over accuracy." }
      : scenarioId === "personalization_bias" ? { color: "#a78bfa",  text: "Users are being steered toward content matching their existing beliefs." }
      : scenarioId === "diversity_injection"  ? { color: "#4ade80",  text: "Diversity injection is helping surface cross-cutting viewpoints." }
      : { color: C.muted, text: "Creators posted new content and the algorithm updated user feeds." },
  ];

  return pool[v];
}

function App() {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chartHistory, setChartHistory] = useState([]);
  const [commentary, setCommentary] = useState([]);
  const chartsRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(500);
  const [scenario, setScenario] = useState("baseline");
  const [tab, setTab] = useState("simulation");
  const [summary, setSummary] = useState(null);
  const [savedRuns, setSavedRuns] = useState({});

  const steppingRef = useRef(false);
  const scenarioRef = useRef("baseline");
  useEffect(() => { scenarioRef.current = scenario; }, [scenario]);

  // ── Autoplay ────────────────────────────────────────────────────────
  const autoStep = useCallback(async () => {
    if (steppingRef.current) return;
    steppingRef.current = true;
    try {
      const res = await axios.post(`${API}/step`, {});
      setState(res.data);
      const snap = snapshotMetrics(res.data);
      if (snap) setChartHistory((prev) => [...prev, snap]);
      setMessage(`Step ${res.data.step}`);
      setError("");
      const msg = buildCommentaryMessage(res.data.metrics, scenarioRef.current, res.data.step);
      if (msg) setCommentary((prev) => [{ step: res.data.step, ...msg }, ...prev].slice(0, 6));
    } catch (e) {
      setPlaying(false);
      setError(e?.response?.data?.detail || e?.message || "Step failed during autoplay");
      setMessage("Autoplay stopped");
    } finally {
      steppingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(autoStep, speedMs);
    return () => clearInterval(id);
  }, [playing, speedMs, autoStep]);

  // ── Handlers ────────────────────────────────────────────────────────
  const clearError = () => setError("");

  const initModel = async () => {
    setPlaying(false);
    try {
      setLoading(true);
      clearError();
      setMessage("Initializing model...");
      const scenarioParams = SCENARIOS.find((s) => s.id === scenario)?.params ?? {};
      await axios.post(`${API}/init`, {
        num_users: 100,
        num_creators: 20,
        simulation_steps: 200,
        ...scenarioParams,
      });
      // Fetch full state immediately so network renders right away
      const stateRes = await axios.get(`${API}/state`);
      setState(stateRes.data);
      setChartHistory([]);
      setCommentary([]);
      setMessage("Model initialized");
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Init failed");
      setMessage("Request failed");
    } finally {
      setLoading(false);
    }
  };

  const stepOnce = async () => {
    if (steppingRef.current) return;
    steppingRef.current = true;
    try {
      setLoading(true);
      clearError();
      setMessage("Stepping...");
      const res = await axios.post(`${API}/step`, {});
      setState(res.data);
      const snap = snapshotMetrics(res.data);
      if (snap) setChartHistory((prev) => [...prev, snap]);
      setMessage(`Step ${res.data.step}`);
      const msg = buildCommentaryMessage(res.data.metrics, scenarioRef.current, res.data.step);
      if (msg) setCommentary((prev) => [{ step: res.data.step, ...msg }, ...prev].slice(0, 6));
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Step failed");
      setMessage("Request failed");
    } finally {
      setLoading(false);
      steppingRef.current = false;
    }
  };

  const resetModel = async () => {
    setPlaying(false);
    // Capture summary before clearing state
    if (state?.metrics && (state?.step ?? 0) > 0) {
      const snap = {
        scenarioLabel: SCENARIOS.find((s) => s.id === scenario)?.label ?? scenario,
        scenarioId: scenario,
        step: state.step,
        metrics: state.metrics,
      };
      setSummary(snap);
      setSavedRuns((prev) => ({ ...prev, [scenario]: snap }));
    }
    try {
      setLoading(true);
      clearError();
      setMessage("Resetting...");
      await axios.post(`${API}/reset`, {});
      const stateRes = await axios.get(`${API}/state`);
      setState(stateRes.data);
      setChartHistory([]);
      setCommentary([]);
      setMessage("Model reset");
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Reset failed");
      setMessage("Request failed");
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = () => {
    if (!state) return;
    setPlaying((p) => !p);
  };

  const exportCSV = () => {
    if (chartHistory.length === 0) return;
    const header = ["step", "polarization_index", "misinformation_prevalence", "average_engagement", "average_exposure_diversity", "scenario"];
    const rows = chartHistory.map((r) =>
      [r.step, r.polarization_index.toFixed(4), r.misinformation_prevalence.toFixed(4),
       r.average_engagement.toFixed(4), r.average_exposure_diversity.toFixed(4), scenario].join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echo_chamber_${scenario}_step${chartHistory.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPNG = async () => {
    if (!chartsRef.current) return;
    try {
      const dataUrl = await toPng(chartsRef.current, { backgroundColor: C.surface, pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `echo_chamber_${scenario}_charts.png`;
      a.click();
    } catch (_) { /* silent */ }
  };

  const m = state?.metrics ?? {};
  const agentCount = state?.nodes?.length ?? "—";
  const step = state?.step ?? "—";
  const scenarioLabel = SCENARIOS.find((s) => s.id === scenario)?.label ?? "—";

  // Tab definitions for the nav bar
  const TABS = [
    { id: "simulation",  label: "Simulation"   },
    { id: "how-it-works", label: "How It Works" },
    { id: "scenarios",   label: "Scenarios"    },
    { id: "compare",     label: "Compare"      },
  ];

  return (
    <div style={{
      height: "100vh",
      display: "grid",
      gridTemplateRows: tab === "simulation" ? "48px 1fr 255px" : "48px 1fr",
      background: C.bg,
      color: C.text,
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      overflow: "hidden",
    }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 9, height: 9, borderRadius: "50%", background: C.accent, boxShadow: `0 0 7px ${C.accent}`, flexShrink: 0 }} />
        <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: 0.4, whiteSpace: "nowrap" }}>
          Echo Chamber Simulation
        </h1>

        {/* Tab navigation */}
        <nav style={{ display: "flex", gap: 3, marginLeft: 22 }}>
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: `1px solid ${tab === id ? C.accent : "transparent"}`,
                background: tab === id ? "#1a2540" : "transparent",
                color: tab === id ? C.accent : C.muted,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: 0.3,
                transition: "color 0.15s, background 0.15s, border-color 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>ABM · Mesa 3.5 · FastAPI</span>
        <div
          style={{ width: 8, height: 8, borderRadius: "50%", background: playing ? "#4ade80" : loading ? "#facc15" : state ? C.accent : C.muted, flexShrink: 0, marginLeft: 8 }}
          title={playing ? "Autoplay running" : loading ? "Working…" : state ? "Model ready" : "No model"}
        />
      </header>

      {/* ── Simulation Tab: 3-column middle row ────────────────────────── */}
      {tab === "simulation" && (
        <div style={{ display: "grid", gridTemplateColumns: "210px 1fr 200px", minHeight: 0, overflow: "hidden" }}>

          {/* Left — Controls */}
          <aside style={{ background: C.surface, borderRight: `1px solid ${C.border}`, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>

            <div>
              <SectionTitle>Scenario</SectionTitle>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                disabled={loading || playing}
                style={{
                  width: "100%",
                  background: C.card,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderRadius: 7,
                  padding: "7px 9px",
                  fontSize: 12,
                  cursor: loading || playing ? "not-allowed" : "pointer",
                  outline: "none",
                }}
              >
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              {/* Why this matters card */}
              {(() => {
                const why = SCENARIOS.find((s) => s.id === scenario)?.why;
                const accentMap = {
                  baseline:             C.muted,
                  high_engagement:      "#f97316",
                  personalization_bias: C.accentAlt,
                  diversity_injection:  "#4ade80",
                };
                const accent = accentMap[scenario] ?? C.muted;
                return why ? (
                  <div style={{
                    marginTop: 8,
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${accent}`,
                    borderRadius: 6,
                    padding: "7px 9px",
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>
                      Why this matters
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{why}</div>
                  </div>
                ) : null;
              })()}
            </div>

            <div>
              <SectionTitle>Simulation</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <Btn onClick={initModel} disabled={loading || playing}>Initialize</Btn>
                <Btn onClick={togglePlay} disabled={loading || !state} variant={playing ? "active" : "secondary"}>
                  {playing ? "⏸ Pause" : "▶ Play"}
                </Btn>
                <Btn onClick={stepOnce} disabled={loading || playing || !state} variant="secondary">⏭ Step</Btn>
                <Btn onClick={resetModel} disabled={loading || playing} variant="danger">↺ Reset</Btn>
              </div>
            </div>

            <div>
              <SectionTitle>Speed</SectionTitle>
              <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                {SPEED_OPTIONS.map(({ label, ms }) => (
                  <button
                    key={ms}
                    onClick={() => setSpeedMs(ms)}
                    style={{
                      flex: 1,
                      padding: "5px 0",
                      borderRadius: 6,
                      border: `1px solid ${speedMs === ms ? C.accent : C.border}`,
                      background: speedMs === ms ? "#1a2540" : C.card,
                      color: speedMs === ms ? C.accent : C.muted,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="range" min={100} max={2000} step={50} value={speedMs}
                onChange={(e) => setSpeedMs(Number(e.target.value))}
                style={{ width: "100%", accentColor: C.accent }}
              />
              <div style={{ fontSize: 10, color: C.muted, textAlign: "center", marginTop: 2 }}>{speedMs} ms / step</div>
            </div>

            <div style={{ padding: "9px 11px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, marginTop: "auto" }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Status</div>
              <div style={{ fontSize: 12, color: playing ? "#4ade80" : loading ? "#facc15" : C.accent }}>
                {playing ? `▶ ${message}` : loading ? "Working…" : message}
              </div>
            </div>

            {error && (
              <div style={{ padding: "9px 11px", background: "#2a0f0f", border: `1px solid #5a2020`, borderRadius: 8, fontSize: 12, color: C.danger }}>
                {error}
              </div>
            )}
          </aside>

          {/* Center — Network visualization */}
          <main style={{ padding: "14px 16px", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            <SectionTitle>Network Visualization</SectionTitle>
            <NetworkGraph nodes={state?.nodes} links={state?.links} step={step} agentCount={agentCount} />
          </main>

          {/* Right — Metrics */}
          <aside style={{ background: C.surface, borderLeft: `1px solid ${C.border}`, padding: "18px 14px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
            <SectionTitle>Live Metrics</SectionTitle>

            <MetricCard label="Step"              value={step === "—" ? null : step}   color={C.text} />
            <MetricCard label="Mean Belief"        value={m.mean_belief}                color={C.accent} />
            <MetricCard label="Polarization Index" value={m.polarization_index}         color="#f97316" />
            <MetricCard label="Misinfo Prevalence" value={m.misinformation_prevalence}  color={C.danger} />
            <MetricCard label="Avg Engagement"     value={m.average_engagement}         color="#4ade80" />
            <MetricCard label="Exposure Diversity" value={m.average_exposure_diversity} color={C.accentAlt} />

            <div style={{ padding: "8px 10px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 7 }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Agents</div>
              <div style={{ fontSize: 13, color: C.text }}>{agentCount}</div>
            </div>
            <div style={{ padding: "8px 10px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 7 }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Scenario</div>
              <div style={{ fontSize: 11, color: C.accentAlt }}>{scenarioLabel}</div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Simulation Tab: charts + commentary row ─────────────────────── */}
      {tab === "simulation" && (
        <div style={{
          background: C.surface,
          borderTop: `1px solid ${C.border}`,
          padding: "10px 18px 8px",
          display: "grid",
          gridTemplateColumns: "1fr 230px",
          gap: 14,
          minHeight: 0,
          overflow: "hidden",
        }}>
          {/* Charts column */}
          <div ref={chartsRef} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <SectionTitle style={{ marginBottom: 0 }}>Time-Series Charts</SectionTitle>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={exportCSV}
                  disabled={chartHistory.length === 0}
                  title={chartHistory.length === 0 ? "Run the simulation to enable CSV export" : "Download step-by-step data as CSV"}
                  style={{
                    background: C.card, border: `1px solid ${C.border}`, color: chartHistory.length === 0 ? C.border : C.muted,
                    borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 600,
                    cursor: chartHistory.length === 0 ? "not-allowed" : "pointer", letterSpacing: 0.3,
                  }}
                >
                  ↓ CSV
                </button>
                <button
                  onClick={exportPNG}
                  disabled={chartHistory.length === 0}
                  title={chartHistory.length === 0 ? "Run the simulation to enable PNG export" : "Export charts as PNG image"}
                  style={{
                    background: C.card, border: `1px solid ${C.border}`, color: chartHistory.length === 0 ? C.border : C.muted,
                    borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 600,
                    cursor: chartHistory.length === 0 ? "not-allowed" : "pointer", letterSpacing: 0.3,
                  }}
                >
                  ↓ PNG
                </button>
              </div>
            </div>
            {chartHistory.length === 0 ? (
              <div style={{ flex: 1, background: C.card, border: `1px dashed ${C.border}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13 }}>
                Charts will appear after the model runs
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, flex: 1, minHeight: 0 }}>
                <MiniChart title="Polarization Index"        data={chartHistory} dataKey="polarization_index"         color="#f97316"     height={145} />
                <MiniChart title="Misinformation Prevalence" data={chartHistory} dataKey="misinformation_prevalence"  color={C.danger}    height={145} />
                <MiniChart title="Average Engagement"        data={chartHistory} dataKey="average_engagement"         color="#4ade80"     height={145} />
                <MiniChart title="Exposure Diversity"        data={chartHistory} dataKey="average_exposure_diversity" color={C.accentAlt} height={145} />
              </div>
            )}
          </div>

          {/* Commentary feed column */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <SectionTitle>What's Happening Now</SectionTitle>
            <div style={{
              flex: 1,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "8px 10px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}>
              {commentary.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 12, textAlign: "center", lineHeight: 1.6 }}>
                  Play or step the simulation to see live commentary.
                </div>
              ) : commentary.map(({ step: s, color, text }, i) => (
                <div key={i} style={{
                  background: color + "10",
                  border: `1px solid ${color}30`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 6,
                  padding: "7px 9px",
                  opacity: 1 - i * 0.12,
                }}>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 3, letterSpacing: 0.5, textTransform: "uppercase" }}>Step {s}</div>
                  <div style={{ fontSize: 11.5, color: C.text, lineHeight: 1.5 }}>{text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── How It Works tab ───────────────────────────────────────────── */}
      {tab === "how-it-works" && <HowItWorksTab />}

      {/* ── Scenarios tab ──────────────────────────────────────────────── */}
      {tab === "scenarios" && <ScenariosTab />}

      {/* ── Compare tab ────────────────────────────────────────────────── */}
      {tab === "compare" && <CompareTab savedRuns={savedRuns} />}

      {/* ── Simulation Summary modal ───────────────────────────────────── */}
      <SimulationSummary
        summary={summary}
        onClose={() => setSummary(null)}
        onRunAgain={() => { setSummary(null); initModel(); }}
      />

    </div>
  );
}

export default App;
