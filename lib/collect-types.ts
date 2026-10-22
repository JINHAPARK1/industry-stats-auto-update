// Design Ref: §2 흐름 A·B — 수집 API(`app/api/collect/`)와 저장된 값 조회·확정 API가 돌려주는 값의 모양. 화면과 API가 같은 모양을 쓰도록 한 곳에 둔다.
// 모양만 정의한 파일이라 서버·화면 어디서든 가져다 쓸 수 있다. (route.ts에는 내보내기를 둘 수 없어서 따로 뺐다)

/** 수치 한 건의 상태. (DESIGN §1 상태 칸) */
export type ItemState =
  | "unconfirmed" // 가져왔고 아직 확정 전
  | "confirmed" // 사람이 확인해 확정함
  | "not-published" // 고른 달의 값이 아직 공표되지 않음
  | "failed" // 수집 실패 (빈칸 + 사유)
  | "not-collected"; // 아직 가져오지 않음

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

/** 사람이 확정한 내용 */
export interface ConfirmedInfo {
  /** 확정된 수치. 고치지 않았다면 KOSIS 값과 같다. */
  value: number;
  /** 사람이 고친 값인지 */
  edited: boolean;
  /** 고친 사유. 고치지 않았다면 null */
  reason: string | null;
  /** 이상치를 원 통계표와 대조했다고 확인했는지 */
  checkedAgainstSource: boolean;
  /** 확정한 시각 (ISO 형식) */
  confirmedAt: string;
}

/** 확정한 뒤에 다시 가져온 KOSIS 값이 확정 당시 값과 달라진 경우의 기록 */
export interface KosisChange {
  /** 새로 가져온 KOSIS 값 */
  value: number | null;
  /** KOSIS에서 마지막으로 수정된 날짜 */
  lastChangedAt: string;
  /** 달라진 것을 알아챈 시각 (ISO 형식) */
  detectedAt: string;
}

export interface CollectItem {
  code: string;
  name: string;
  field: string;
  frequency: "M" | "Y";
  state: ItemState;
  /** 기준시점. 수치가 없으면(공표 전·실패·미수집) null */
  period: string | null;
  /** 화면에 보여줄 수치. 확정된 값이 있으면 확정 값, 아니면 KOSIS에서 가져온 값. 수치가 없으면 null이며 다른 달 값으로 채우지 않는다. */
  value: number | null;
  /** KOSIS에서 가져온 원래 값. 확정 값과 비교할 때 쓴다. */
  originalValue: number | null;
  unit: string | null;
  /** 출처: "통계표명(번호)" */
  source: string | null;
  /** KOSIS에서 마지막으로 수정된 날짜 */
  lastChangedAt: string | null;
  variation: VariationView | null;
  /** 확정한 내용. 확정 전이면 null */
  confirmed: ConfirmedInfo | null;
  /** 확정 뒤 KOSIS 값이 바뀐 경우의 기록. 없으면 null */
  kosisChanged: KosisChange | null;
  /** 공표 전일 때 KOSIS에 마지막으로 올라온 기준시점 (참고용, 수치는 붙이지 않는다) */
  latestPublishedPeriod: string | null;
  /** 화면에 보여줄 쉬운 문구. 정상이면 null */
  message: string | null;
  /** 수집 실패 사유. 실패가 아니면 null */
  failure: FailureView | null;
}

/** 수치 한 건의 수정 이력 한 줄 */
export interface HistoryEntry {
  /** 일어난 시각 (ISO 형식) */
  at: string;
  type: "collected" | "confirmed" | "unconfirmed" | "kosis-changed";
  /** KOSIS에서 가져온 원래 값 */
  originalValue: number | null;
  /** 이 시점의 값. 확정이면 확정된 값 */
  value: number | null;
  /** 사람이 고쳤다면 그 사유 */
  reason: string | null;
  /** 짧은 설명. 화면에 그대로 보여줄 수 있다. */
  note: string;
}

/** 수집 API·저장값 조회 API의 정상 응답 */
export interface CollectResponse {
  targetMonth: string | null;
  referenceMonth: string | null;
  collectedAt: string;
  confirmedCount: number;
  unconfirmedCount: number;
  notPublishedCount: number;
  failedCount: number;
  outlierCount: number;
  /** 수집 결과를 저장했는지 */
  saved: boolean;
  /** 저장하지 못했을 때의 쉬운 문구. 저장했으면 null */
  saveError: string | null;
  /** 저장소에 저장돼 있는 월간 기준시점들(최신 순). 지난 달 조회에 쓴다. */
  storedMonths: string[];
  items: CollectItem[];
}

/** 확정·확정 취소 API의 정상 응답 */
export interface ConfirmResponse {
  item: CollectItem;
}

/** 수정 이력 API의 정상 응답 */
export interface HistoryResponse {
  code: string;
  period: string;
  entries: HistoryEntry[];
}

/** 그래프에 그릴 확정된 수치 한 점 */
export interface SeriesPoint {
  /** 기준시점. 월간은 "202608", 연간은 "2024" */
  period: string;
  value: number;
  unit: string;
  /** 출처: "통계표명(번호)" */
  source: string;
  /** 사람이 고친 값인지 */
  edited: boolean;
}

/** 지표 하나의 확정된 수치들. 확정되지 않은 수치는 들어 있지 않다. */
export interface SeriesIndicator {
  code: string;
  name: string;
  field: string;
  frequency: "M" | "Y";
  unit: string;
  /** 기준시점이 오래된 것부터 */
  points: SeriesPoint[];
}

/** 그래프 API의 정상 응답. 지표 10개가 지표 정의 순서대로 들어 있다. */
export interface SeriesResponse {
  indicators: SeriesIndicator[];
}

/** 지표 검색 API의 정상 응답. 확정된 최신 수치만 들어 있다. */
export interface SearchResponse {
  query: string;
  items: CollectItem[];
}

/** 12개월 화면에 쓰는 지표 하나의 기간별 수치(최신 순). 확정 전 값도 "미확정"으로 들어 있다. */
export interface MonthsIndicator {
  code: string;
  name: string;
  field: string;
  frequency: "M" | "Y";
  unit: string;
  items: CollectItem[];
}

/** 12개월 API의 정상 응답. 지표 10개가 지표 정의 순서대로 들어 있다. */
export interface MonthsResponse {
  indicators: MonthsIndicator[];
}

/** API의 오류 응답 */
export interface ApiErrorBody {
  error: { code: string; message: string };
}
