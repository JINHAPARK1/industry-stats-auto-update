// Design Ref: §2 흐름 A — 수집 API(`app/api/collect/`)가 돌려주는 값의 모양. 화면과 API가 같은 모양을 쓰도록 한 곳에 둔다.
// 모양만 정의한 파일이라 서버·화면 어디서든 가져다 쓸 수 있다. (route.ts에는 내보내기를 둘 수 없어서 따로 뺐다)

/** 수치 한 건의 상태. (DESIGN §1 상태 칸) */
export type ItemState =
  | "unconfirmed" // 가져왔고 아직 확정 전
  | "not-published" // 고른 달의 값이 아직 공표되지 않음
  | "failed"; // 수집 실패 (빈칸 + 사유)

export interface VariationView {
  /** 비교한 전년 기준시점 */
  basePeriod: string | null;
  /** 전년(동월) 대비 변동률(%). 계산할 수 없으면 null */
  changePercent: number | null;
  /** 전년(동월) 대비 %포인트 차이. 계산할 수 없으면 null */
  changePoint: number | null;
  /** 화면에 보여줄 값: percent = 변동률(%), point = %포인트 차이 */
  measure: "percent" | "point";
  /** 이 지표의 이상치 기준 크기 */
  threshold: number;
  /** 이상치 표시 여부. 표시만 하며 값은 바꾸지 않는다. */
  isOutlier: boolean;
  /** 계산 결과 또는 계산하지 못한 이유 */
  reason: string;
}

/** 수집에 실패한 사유 */
export interface FailureView {
  kind: string;
  /** KOSIS가 준 오류 번호. 없으면 undefined */
  errorCode?: string;
  /** 화면에 그대로 보여줄 쉬운 문구 */
  message: string;
  /** true면 앞선 실패(키 문제·호출 제한 등) 때문에 호출하지 않았다. */
  skipped: boolean;
}

export interface CollectItem {
  code: string;
  name: string;
  field: string;
  frequency: "M" | "Y";
  state: ItemState;
  /** 기준시점. 수치가 없으면(공표 전·실패) null */
  period: string | null;
  /** 수치. 수치가 없으면 null이며, 다른 달 값으로 채우지 않는다. */
  value: number | null;
  unit: string | null;
  /** 출처: "통계표명(번호)" */
  source: string | null;
  /** KOSIS에서 마지막으로 수정된 날짜 */
  lastChangedAt: string | null;
  variation: VariationView | null;
  /** 공표 전일 때 KOSIS에 마지막으로 올라온 기준시점 (참고용, 수치는 붙이지 않는다) */
  latestPublishedPeriod: string | null;
  /** 화면에 보여줄 쉬운 문구. 정상이면 null */
  message: string | null;
  /** 수집 실패 사유. 실패가 아니면 null */
  failure: FailureView | null;
}

/** 수집 API의 정상 응답 */
export interface CollectResponse {
  targetMonth: string | null;
  referenceMonth: string | null;
  collectedAt: string;
  unconfirmedCount: number;
  notPublishedCount: number;
  failedCount: number;
  outlierCount: number;
  /** 수집 결과를 저장했는지. 저장소가 정해지기 전에는 항상 false */
  saved: boolean;
  items: CollectItem[];
}

/** 수집 API의 오류 응답 */
export interface ApiErrorBody {
  error: { code: string; message: string };
}
