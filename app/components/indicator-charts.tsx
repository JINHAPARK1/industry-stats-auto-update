// Design Ref: §1 화면 구성 — 지표 상세 페이지의 시계열 그래프. 지표마다 알맞은 형식(선·막대·영역)으로 값의 흐름을 그리고, 아래에 전년(동월) 대비 증감 막대를 둔다.
// 그래프 도구(라이브러리)를 새로 설치하지 않고 SVG로 직접 그린다.
// 확정된 수치는 속이 찬 모양, 확정 전 수치는 점선·속이 빈 모양으로 구분한다. (색만으로 구분하지 않는다)
import type { ChartKind } from "@/lib/indicators";
import { formatPeriod, formatValue } from "./format";

/** 값 그래프의 점 하나 */
export interface LevelPoint {
  period: string;
  value: number;
  confirmed: boolean;
  /** 사람이 고친 값인지 */
  edited: boolean;
}

/** 증감 그래프의 막대 하나. 계산할 수 없으면 change가 null이다. */
export interface ChangePoint {
  period: string;
  change: number | null;
  confirmed: boolean;
}

const WIDTH = 760;
const PAD = { left: 64, right: 72, top: 20, bottom: 40 };
const TEXT = "fill-zinc-600 text-[11px] dark:fill-zinc-400";
const GRID = "stroke-zinc-200 dark:stroke-zinc-700";

/** 눈금 간격을 보기 좋은 값(1·2·5 × 10의 거듭제곱)으로 고른다. */
function niceStep(range: number, count: number): number {
  const raw = range / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

/** min~max를 덮는 눈금들을 만든다. */
function makeTicks(min: number, max: number): { ticks: number[]; lo: number; hi: number } {
  const step = niceStep(max - min || 1, 4);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toFixed(6)));
  return { ticks, lo, hi };
}

const tickText = (n: number) => formatValue(Number(n.toFixed(2)));

interface LevelChartProps {
  points: LevelPoint[];
  kind: ChartKind;
  unit: string;
  /** 기준선(예: 지수 100). 없으면 그리지 않는다. */
  baseline?: number;
  label: string;
}

/** 값의 흐름 그래프: 선(line)·막대(bar)·영역(area) */
export function LevelChart({ points, kind, unit, baseline, label }: LevelChartProps) {
  const height = 320;
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (baseline !== undefined) {
    min = Math.min(min, baseline);
    max = Math.max(max, baseline);
  }
  if (kind === "bar") min = Math.min(min, 0); // 막대는 0에서 시작해야 크기를 바르게 비교할 수 있다.
  const { ticks, lo, hi } = makeTicks(min, max);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const band = innerW / points.length;
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;
  const bottomY = y(Math.max(lo, 0) === 0 && lo < 0 ? 0 : lo);

  const coords = points.map((p, i) => ({ x: x(i), y: y(p.value), p }));
  // 이웃한 두 점이 모두 확정이면 실선, 하나라도 확정 전이면 점선으로 잇는다.
  const segments = coords.slice(1).map((c, i) => ({ from: coords[i], to: c, solid: coords[i].p.confirmed && c.p.confirmed }));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label={`${label} ${kind === "bar" ? "막대" : kind === "area" ? "영역" : "선"} 그래프. ${formatPeriod(points[0].period)}부터 ${formatPeriod(points[points.length - 1].period)}까지 ${points.length}개`}
      className="h-auto w-full"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} className={GRID} strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={TEXT}>
            {tickText(t)}
          </text>
        </g>
      ))}
      <text x={PAD.left - 8} y={12} textAnchor="end" className={TEXT}>
        {unit}
      </text>

      {baseline !== undefined && (
        <g>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(baseline)} y2={y(baseline)} strokeDasharray="6 4" strokeWidth={1.5} className="stroke-zinc-500 dark:stroke-zinc-400" />
          <text x={WIDTH - PAD.right + 6} y={y(baseline) + 4} textAnchor="start" className={TEXT}>
            기준 {baseline}
          </text>
        </g>
      )}

      {kind === "area" && (
        <polygon
          points={`${coords[0].x},${bottomY} ${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")} ${coords[coords.length - 1].x},${bottomY}`}
          className="fill-blue-600/15 dark:fill-blue-400/20"
        />
      )}

      {kind === "bar" &&
        coords.map((c) => {
          const zero = y(Math.max(lo, Math.min(0, hi)));
          const barY = Math.min(c.y, zero);
          return (
            <rect
              key={c.p.period}
              x={c.x - band * 0.3}
              width={band * 0.6}
              y={barY}
              height={Math.max(1, Math.abs(zero - c.y))}
              rx={2}
              strokeWidth={2}
              strokeDasharray={c.p.confirmed ? undefined : "4 3"}
              className={
                c.p.confirmed
                  ? "fill-blue-600 stroke-blue-600 dark:fill-blue-400 dark:stroke-blue-400"
                  : "fill-zinc-200 stroke-zinc-500 dark:fill-zinc-700 dark:stroke-zinc-400"
              }
            >
              <title>
                {formatPeriod(c.p.period)}: {formatValue(c.p.value)}
                {unit} ({c.p.confirmed ? (c.p.edited ? "확정, 고친 값" : "확정") : "미확정"})
              </title>
            </rect>
          );
        })}

      {kind !== "bar" && (
        <>
          {segments.map((s) => (
            <line
              key={s.to.p.period}
              x1={s.from.x}
              y1={s.from.y}
              x2={s.to.x}
              y2={s.to.y}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={s.solid ? undefined : "5 4"}
              className={s.solid ? "stroke-blue-600 dark:stroke-blue-400" : "stroke-zinc-500 dark:stroke-zinc-400"}
            />
          ))}
          {coords.map((c) => (
            <circle
              key={c.p.period}
              cx={c.x}
              cy={c.y}
              r={4.5}
              strokeWidth={2}
              className={
                c.p.confirmed && !c.p.edited
                  ? "fill-blue-600 stroke-blue-600 dark:fill-blue-400 dark:stroke-blue-400"
                  : c.p.confirmed
                    ? "fill-white stroke-blue-600 dark:fill-zinc-900 dark:stroke-blue-400"
                    : "fill-white stroke-zinc-500 dark:fill-zinc-900 dark:stroke-zinc-400"
              }
            >
              <title>
                {formatPeriod(c.p.period)}: {formatValue(c.p.value)}
                {unit} ({c.p.confirmed ? (c.p.edited ? "확정, 고친 값" : "확정") : "미확정"})
              </title>
            </circle>
          ))}
        </>
      )}

      {/* 막대·점 위에 값 표시 */}
      {coords.map((c) => (
        <text key={`v-${c.p.period}`} x={c.x} y={c.y - 9} textAnchor="middle" className={`${TEXT} tabular-nums`}>
          {formatValue(c.p.value)}
        </text>
      ))}

      {coords.map((c) => (
        <text key={`x-${c.p.period}`} x={c.x} y={height - 14} textAnchor="middle" className={`${TEXT} tabular-nums`}>
          {formatPeriod(c.p.period)}
        </text>
      ))}
    </svg>
  );
}

interface ChangeChartProps {
  points: ChangePoint[];
  /** "%" 또는 "%p" */
  suffix: string;
  /** 이상치 기준 크기. 점선으로 ±기준을 그린다. */
  threshold: number;
  label: string;
}

/** 전년(동월) 대비 증감 막대 그래프. 0을 기준으로 위(증가)·아래(감소)로 그린다. */
export function ChangeChart({ points, suffix, threshold, label }: ChangeChartProps) {
  const height = 230;
  const numbers = points.flatMap((p) => (p.change === null ? [] : [Math.abs(p.change)]));
  const limit = Math.max(threshold, ...numbers) * 1.15;
  const { ticks, lo, hi } = makeTicks(-limit, limit);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const band = innerW / points.length;
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;
  const zero = y(0);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label={`${label} 전년 대비 증감 막대 그래프`}
      className="h-auto w-full"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} className={GRID} strokeWidth={t === 0 ? 0 : 1} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={TEXT}>
            {tickText(t)}
          </text>
        </g>
      ))}
      <text x={PAD.left - 8} y={12} textAnchor="end" className={TEXT}>
        {suffix}
      </text>

      {[threshold, -threshold].map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} strokeDasharray="6 4" strokeWidth={1.5} className="stroke-orange-600 dark:stroke-orange-400" />
          {t > 0 && (
            <text x={WIDTH - PAD.right + 6} y={y(t) + 4} textAnchor="start" className="fill-orange-700 text-[11px] dark:fill-orange-400">
              기준 ±{threshold}
              {suffix}
            </text>
          )}
        </g>
      ))}
      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={zero} y2={zero} strokeWidth={1.5} className="stroke-zinc-700 dark:stroke-zinc-300" />

      {points.map((p, i) => {
        if (p.change === null) {
          return (
            <text key={p.period} x={x(i)} y={zero - 6} textAnchor="middle" className={TEXT}>
              -
            </text>
          );
        }
        const top = Math.min(y(p.change), zero);
        const outlier = Math.abs(p.change) >= threshold;
        return (
          <g key={p.period}>
            <rect
              x={x(i) - band * 0.3}
              width={band * 0.6}
              y={top}
              height={Math.max(1, Math.abs(zero - y(p.change)))}
              rx={2}
              strokeWidth={2}
              strokeDasharray={p.confirmed ? undefined : "4 3"}
              className={
                p.confirmed
                  ? p.change >= 0
                    ? "fill-blue-600 stroke-blue-600 dark:fill-blue-400 dark:stroke-blue-400"
                    : "fill-rose-600 stroke-rose-600 dark:fill-rose-400 dark:stroke-rose-400"
                  : p.change >= 0
                    ? "fill-blue-100 stroke-blue-600 dark:fill-blue-950 dark:stroke-blue-400"
                    : "fill-rose-100 stroke-rose-600 dark:fill-rose-950 dark:stroke-rose-400"
              }
            >
              <title>
                {formatPeriod(p.period)}: {p.change > 0 ? "+" : ""}
                {p.change}
                {suffix} ({p.confirmed ? "확정" : "미확정"}
                {outlier ? ", 이상치" : ""})
              </title>
            </rect>
            <text x={x(i)} y={p.change >= 0 ? top - 5 : top + Math.abs(zero - y(p.change)) + 13} textAnchor="middle" className={`${outlier ? "fill-orange-700 font-semibold dark:fill-orange-400" : "fill-zinc-600 dark:fill-zinc-400"} text-[11px] tabular-nums`}>
              {p.change > 0 ? "+" : ""}
              {p.change}
              {outlier ? " ⚠" : ""}
            </text>
          </g>
        );
      })}

      {points.map((p, i) => (
        <text key={`x-${p.period}`} x={x(i)} y={height - 14} textAnchor="middle" className={`${TEXT} tabular-nums`}>
          {formatPeriod(p.period)}
        </text>
      ))}
    </svg>
  );
}
