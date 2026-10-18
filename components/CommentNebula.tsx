"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedComment } from "@/lib/comments-feed";
import type { NebulaTerm } from "@/lib/comment-nebula";

type Node3 = {
  term: NebulaTerm;
  x: number;
  y: number;
  z: number;
  phase: number;
};

function colorFor(term: NebulaTerm, alpha = 1) {
  // 小红书偏玫瑰，ASC 偏青，情绪暖/冷微调
  const r =
    Math.round(255 * (0.55 + 0.35 * (1 - term.platformBias))) +
    Math.round(40 * Math.max(0, term.sentiment));
  const g =
    Math.round(180 * (0.35 + 0.45 * term.platformBias)) +
    Math.round(30 * Math.max(0, -term.sentiment));
  const b =
    Math.round(220 * (0.4 + 0.55 * term.platformBias)) +
    Math.round(20 * Math.max(0, -term.sentiment));
  return `rgba(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)},${alpha})`;
}

function seedNodes(terms: NebulaTerm[]): Node3[] {
  const n = Math.max(1, terms.length);
  // Same shell for everyone so rotation carries large + small together.
  // Only the *initial* slot differs: heavy tags get front-center angles.
  const dirs = Array.from({ length: n }, (_, i) => {
    const y = 1 - (i / Math.max(1, n - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = Math.PI * (3 - Math.sqrt(5)) * i;
    const x = Math.cos(theta) * ring;
    const z = Math.sin(theta) * ring;
    // Higher = closer to initial view center (front, low |x|/|y|)
    const centrality = z * 1.35 - (x * x + y * y);
    return { x, y, z, centrality };
  }).sort((a, b) => b.centrality - a.centrality);

  const byWeight = [...terms].sort(
    (a, b) => b.weight - a.weight || b.count - a.count
  );
  const shell = 1.12;

  return byWeight.map((term, rank) => {
    const d = dirs[rank] || dirs[0];
    return {
      term,
      x: d.x * shell * 0.95,
      y: d.y * shell * 1.18,
      z: d.z * shell * 0.95,
      phase: rank * 0.37,
    };
  });
}

export default function CommentNebula({
  comments: _comments,
  compact = false,
  terms: termsProp,
  sourceLabel: _sourceLabel,
}: {
  comments: FeedComment[];
  /** 左栏靠边：更矮、去掉底部词条 */
  compact?: boolean;
  /** LLM tags only — no regex fallback */
  terms?: NebulaTerm[];
  sourceLabel?: string;
}) {
  void _comments;
  void _sourceLabel;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Tags are LLM-only — never fall back to regex extraction
  const terms = useMemo(() => termsProp || [], [termsProp]);
  const nodesRef = useRef<Node3[]>([]);
  const [hover, setHover] = useState<NebulaTerm | null>(null);
  const [dragging, setDragging] = useState(false);
  /** 水平 / 垂直旋转角 */
  const angleYRef = useRef(0);
  const angleXRef = useRef(0.18);
  /** 惯性速度（拖拽松手后继续转） */
  const velYRef = useRef(0);
  const velXRef = useRef(0);
  const dragRef = useRef({
    active: false,
    lastX: 0,
    lastY: 0,
    lastT: 0,
  });
  const projectedRef = useRef<
    { nx: number; ny: number; r: number; term: NebulaTerm; depth: number }[]
  >([]);

  useEffect(() => {
    nodesRef.current = seedNodes(terms);
  }, [terms]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || terms.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let alive = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // 背景星尘
    const dust = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: 0.4 + Math.random() * 1.4,
      a: 0.15 + Math.random() * 0.45,
    }));

    const draw = (t: number) => {
      if (!alive) return;
      const { width, height } = wrap.getBoundingClientRect();
      const cx = width / 2;
      const cy = height / 2;
      // Anisotropic projection — spread out but keep top/bottom margin
      const scaleX = Math.min(width, height) * 0.36;
      const scaleY = Math.min(width, height) * 0.42;
      const scale = (scaleX + scaleY) / 2; // used for link distance / mist

      // 自动慢转 + 拖拽惯性
      if (!dragRef.current.active) {
        angleYRef.current += 0.0032;
        angleYRef.current += velYRef.current;
        angleXRef.current += velXRef.current;
        velYRef.current *= 0.96;
        velXRef.current *= 0.96;
        if (Math.abs(velYRef.current) < 0.0002) velYRef.current = 0;
        if (Math.abs(velXRef.current) < 0.0002) velXRef.current = 0;
      }
      // 限制俯仰，避免翻倒
      angleXRef.current = Math.max(-0.85, Math.min(0.85, angleXRef.current));

      const ay = angleYRef.current;
      const ax = angleXRef.current;
      const cosY = Math.cos(ay);
      const sinY = Math.sin(ay);
      const cosX = Math.cos(ax);
      const sinX = Math.sin(ax);

      // 深空底
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 2.2);
      bg.addColorStop(0, "rgba(18, 28, 48, 0.95)");
      bg.addColorStop(0.45, "rgba(8, 12, 22, 0.98)");
      bg.addColorStop(1, "rgba(3, 5, 12, 1)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // 星尘
      for (const d of dust) {
        ctx.fillStyle = `rgba(220,235,255,${d.a})`;
        ctx.beginPath();
        ctx.arc(d.x * width, d.y * height, d.s, 0, Math.PI * 2);
        ctx.fill();
      }

      // 中心星云雾
      const mist = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.1);
      mist.addColorStop(0, "rgba(56, 189, 248, 0.10)");
      mist.addColorStop(0.4, "rgba(244, 63, 94, 0.06)");
      mist.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = mist;
      ctx.fillRect(0, 0, width, height);

      const projected: typeof projectedRef.current = [];
      for (const n of nodesRef.current) {
        const pulse = 1 + 0.04 * Math.sin(t * 0.0018 + n.phase);
        // Yaw then pitch
        let x = n.x * cosY - n.z * sinY;
        let z = n.x * sinY + n.z * cosY;
        let y = n.y * cosX - z * sinX;
        z = n.y * sinX + z * cosX;
        const depth = (z + 1.4) / 2.4;
        const px = cx + x * scaleX * pulse;
        // Canvas +y is downward — compress the bottom half only; leave the top alone
        const yAdj = y > 0 ? y * 0.84 : y;
        const py = cy + yAdj * scaleY * pulse;
        const r = (5 + n.term.weight * 22) * (0.55 + depth * 0.7);
        projected.push({
          nx: px,
          ny: py,
          r,
          term: n.term,
          depth,
        });
      }
      projected.sort((a, b) => a.depth - b.depth);
      projectedRef.current = projected;

      // 连线（近邻）
      ctx.lineWidth = 0.7;
      for (let i = 0; i < projected.length; i++) {
        const a = projected[i];
        let links = 0;
        for (let j = i + 1; j < projected.length && links < 3; j++) {
          const b = projected[j];
          const dx = a.nx - b.nx;
          const dy = a.ny - b.ny;
          const dist = Math.hypot(dx, dy);
          if (dist > scale * 0.55) continue;
          const alpha =
            (1 - dist / (scale * 0.55)) * 0.22 * Math.min(a.depth, b.depth);
          ctx.strokeStyle = colorFor(a.term, alpha);
          ctx.beginPath();
          ctx.moveTo(a.nx, a.ny);
          ctx.lineTo(b.nx, b.ny);
          ctx.stroke();
          links += 1;
        }
      }

      // 节点光晕 + 标签
      for (const p of projected) {
        const col = colorFor(p.term, 0.95);
        const glow = ctx.createRadialGradient(p.nx, p.ny, 0, p.nx, p.ny, p.r * 2.8);
        glow.addColorStop(0, colorFor(p.term, 0.55 * p.depth));
        glow.addColorStop(0.35, colorFor(p.term, 0.18 * p.depth));
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.nx, p.ny, p.r * 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 12 * p.depth;
        const coreR = Math.max(2.2, p.r * 0.32);
        ctx.beginPath();
        ctx.arc(p.nx, p.ny, coreR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Dot sits top-center of the tag (中上), label centered under the node
        const fontSize = Math.max(9, Math.round(10 + p.term.weight * 9 * p.depth));
        ctx.font = `${p.term.weight > 0.55 ? 600 : 400} ${fontSize}px "SF Pro Display", "PingFang SC", system-ui, sans-serif`;
        const label = p.term.text;
        const tw = ctx.measureText(label).width;
        const labelY = p.ny + coreR + 4;
        const padX = 5;
        const padY = 2.5;
        const chipH = fontSize + padY * 2;
        // Soft chip behind text so overlapping labels stay readable
        ctx.fillStyle = `rgba(6, 10, 18, ${0.35 + p.depth * 0.35})`;
        const chipX = p.nx - tw / 2 - padX;
        const chipY = labelY - padY;
        const chipW = tw + padX * 2;
        const rr = Math.min(8, chipH / 2);
        ctx.beginPath();
        ctx.moveTo(chipX + rr, chipY);
        ctx.arcTo(chipX + chipW, chipY, chipX + chipW, chipY + chipH, rr);
        ctx.arcTo(chipX + chipW, chipY + chipH, chipX, chipY + chipH, rr);
        ctx.arcTo(chipX, chipY + chipH, chipX, chipY, rr);
        ctx.arcTo(chipX, chipY, chipX + chipW, chipY, rr);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = `rgba(240,245,255,${0.42 + p.depth * 0.55})`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(label, p.nx, labelY);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [terms]);

  const hitTest = (mx: number, my: number) => {
    let hit: NebulaTerm | null = null;
    let best = 36;
    for (const p of projectedRef.current) {
      // Prefer the glowing core; also accept the label band under the dot
      const dCore = Math.hypot(p.nx - mx, p.ny - my);
      const dLabel = Math.hypot(p.nx - mx, p.ny + p.r * 0.55 + 10 - my);
      const d = Math.min(dCore, dLabel * 1.05);
      if (d < best) {
        best = d;
        hit = p.term;
      }
    }
    return hit;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: performance.now(),
    };
    velYRef.current = 0;
    velXRef.current = 0;
    setDragging(true);
    setHover(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragRef.current.active) {
      const now = performance.now();
      const dt = Math.max(8, now - dragRef.current.lastT);
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      // 灵敏度：拖得越快转得越快
      const sens = 0.0075;
      angleYRef.current += dx * sens;
      angleXRef.current += dy * sens;
      velYRef.current = (dx * sens) / (dt / 16);
      velXRef.current = (dy * sens) / (dt / 16);
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      dragRef.current.lastT = now;
      return;
    }

    setHover(hitTest(mx, my));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setDragging(false);
    try {
      wrapRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // 放大松手惯性 → 「快速旋转」手感
    velYRef.current *= 1.35;
    velXRef.current *= 1.35;
    velYRef.current = Math.max(-0.12, Math.min(0.12, velYRef.current));
    velXRef.current = Math.max(-0.08, Math.min(0.08, velXRef.current));
  };

  if (terms.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500 ${
          compact ? "h-full min-h-[280px]" : "h-44"
        }`}
      >
        Waiting for LLM tags…
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-[#05070f] ${
        compact ? "flex h-full min-h-[280px] flex-col" : ""
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
        <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          Comment nebula
        </p>
      </div>

      <div
        ref={wrapRef}
        className={
          compact
            ? `relative min-h-0 w-full flex-1 touch-none ${
                dragging ? "cursor-grabbing" : "cursor-grab"
              }`
            : `relative h-[220px] w-full touch-none sm:h-[260px] ${
                dragging ? "cursor-grabbing" : "cursor-grab"
              }`
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          if (!dragRef.current.active) setHover(null);
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[9px] text-zinc-600">
          Drag to spin · release for inertia
        </p>
      </div>

      {!compact && (
        <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-3 py-2">
          {terms.slice(0, 8).map((t) => (
            <span
              key={t.text}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-zinc-400"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: colorFor(t, 1) }}
              />
              {t.text}
              <span className="tabular-nums text-zinc-600">{t.count}</span>
            </span>
          ))}
        </div>
      )}

      {hover && (
        <div className="pointer-events-none absolute bottom-12 left-3 right-3 z-10 rounded-lg border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-md sm:left-auto sm:right-3 sm:w-64">
          <p className="text-sm text-zinc-100">{hover.text}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            Seen {hover.count}× ·{" "}
            {hover.platformBias < 0.35
              ? "Skews Xiaohongshu"
              : hover.platformBias > 0.65
                ? "Skews App Store"
                : "Both channels"}
          </p>
          {hover.samples[0] && (
            <p className="mt-1.5 line-clamp-4 text-[11px] leading-snug text-zinc-300">
              “{hover.samples[0]}”
            </p>
          )}
        </div>
      )}
    </div>
  );
}
