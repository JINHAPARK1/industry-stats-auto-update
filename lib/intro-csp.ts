// 로그인 전 소개 화면(/intro)에만 붙이는 내용 보안 정책(CSP). next.config.ts에서 읽는다.
// 화면 안의 스크립트·스타일은 직접 쓴 것이라 인라인을 허용하되, 그 밖의 주소로 나가는 요청(글꼴·이미지·통신)은 모두 막는다.
// (설정 파일의 공통 머리글과 같은 이름이면 뒤에 오는 값이 이기므로, 공통 규칙 뒤에 이 주소만 따로 둔다.)
export const INTRO_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");
