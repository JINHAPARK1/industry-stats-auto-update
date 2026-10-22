// Design Ref: §1 화면 구성 3) 그래프 화면 — 확정된 수치를 선 그래프로 그린다. 기준시점은 항상 함께 보인다.
// 그래프 도구(라이브러리)를 새로 설치하지 않고 SVG로 직접 그린다. (CLAUDE.md: 다른 라이브러리는 꼭 필요할 때만)
import type { SeriesPoint } from "@/lib/collect-types";
import { formatPeriod, formatValue } from "./format";

interface LineChartProps {
  points: SeriesPoint[];
  frequency: "M" | "Y";
  /** 스크린리더에 읽어 줄 설명 (지표 이름) */
  label: string;
}

const WIDTH = 360;
const HEIGHT = 170;
const PAD = { left: 52, right: 16, top: 14, bottom: 30 };

/** 기준시점을 가로 위치 계산용 숫자로 바꾼다. 월간은 "연도*12+월", 연간은 연도. 빠진 달이 있으면 간격이 그만큼 벌어진다. */
function toNumber(period: string, frequency: "M" | "Y"): number {
  if (frequency === "M") return Number(period.slice(0, 4)) * 12 + Number(period.slice(4));
  return Number(period);
}

export default function LineChart({ points, frequency, label }: LineChartProps) {
  const values = points.map((point) => point.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    // 값이 모두 같으면 선이 가운데에 그려지게 위아래로 조금 벌린다.
    min -= 1;
    max += 1;
  }
  const numbers = points.map((point) => toNumber(point.period, frequency));
  const xMin = Math.min(...numbers);
  const xMax = Math.max(...numbers);

  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (n: number) => (xMax === xMin ? PAD.left + innerWidth / 2 : PAD.left + ((n - xMin) / (xMax - xMin)) * innerWidth);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * innerHeight;

  const coords = points.map((point, index) => ({ x: x(numbers[index]), y: y(point.value), point }));
  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${label} 확정 수치 그래프. ${formatPeriod(first.period)}부터 ${formatPeriod(last.period)}까지 ${points.length}개`}
      className="h-auto w-full max-w-md"
    >
      {/* 가로 기준선: 가장 큰 값과 가장 작은 값 */}
      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(max)} y2={y(max)} className="stroke-zinc-200 dark:stroke-zinc-700" strokeWidth={1} />
      <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(min)} y2={y(min)} className="stroke-zinc-200 dark:stroke-zinc-700" strokeWidth={1} />
      <text x={PAD.left - 6} y={y(max) + 4} textAnchor="end" className="fill-zinc-600 text-[11px] dark:fill-zinc-400">
        {formatValue(max)}
      </text>
      <text x={PAD.left - 6} y={y(min) + 4} textAnchor="end" className="fill-zinc-600 text-[11px] dark:fill-zinc-400">
        {formatValue(min)}
      </text>

      {points.length > 1 && (
        <polyline points={polyline} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-blue-600 dark:stroke-blue-400" />
      )}
      {coords.map((c) => (
        <circle
          key={c.point.period}
          cx={c.x}
          cy={c.y}
          r={4}
          strokeWidth={2}
          // 사람이 고친 값은 속이 빈 점으로 구분한다.
          className={`stroke-blue-600 dark:stroke-blue-400 ${c.point.edited ? "fill-white dark:fill-zinc-900" : "fill-blue-600 dark:fill-blue-400"}`}
        >
          <title>
            {formatPeriod(c.point.period)}: {formatValue(c.point.value)}
            {c.point.unit}
            {c.point.edited ? " (고친 값)" : ""}
          </title>
        </circle>
      ))}

      {/* 가로 눈금: 가장 오래된 기준시점과 가장 최근 기준시점 */}
      <text x={x(xMin)} y={HEIGHT - 8} textAnchor={points.length > 1 ? "start" : "middle"} className="fill-zinc-600 text-[11px] dark:fill-zinc-400">
        {formatPeriod(first.period)}
      </text>
      {points.length > 1 && (
        <text x={x(xMax)} y={HEIGHT - 8} textAnchor="end" className="fill-zinc-600 text-[11px] dark:fill-zinc-400">
          {formatPeriod(last.period)}
        </text>
      )}
    </svg>
  );
}
