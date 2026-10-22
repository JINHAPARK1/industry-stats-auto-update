// 지표 상세 페이지 (`/indicators/[code]`) — 지표 하나의 시계열 그래프(지표에 맞는 형식)와 기간별 수치 표.
import { notFound } from "next/navigation";
import { Suspense } from "react";
import AppHeader from "../../components/app-header";
import IndicatorDetail from "../../components/indicator-detail";
import { INDICATORS, getIndicator } from "@/lib/indicators";

/** 지표 10개의 주소를 미리 정해 둔다. (그 외 주소는 404) */
export function generateStaticParams() {
  return INDICATORS.map((indicator) => ({ code: indicator.code }));
}

/** 주소의 지표 이름표를 읽어 확인한다. 주소를 읽는 부분은 Suspense 안에 둔다. */
async function Detail({ params }: { params: PageProps<"/indicators/[code]">["params"] }) {
  const { code } = await params;
  if (!getIndicator(code)) notFound();
  return <IndicatorDetail code={code} />;
}

export default function IndicatorPage(props: PageProps<"/indicators/[code]">) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <AppHeader current="indicator" />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <Suspense fallback={<p className="text-lg text-zinc-500 dark:text-zinc-400">불러오는 중입니다.</p>}>
          <Detail params={props.params} />
        </Suspense>
      </main>
    </div>
  );
}
