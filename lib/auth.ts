// Design Ref: §3 기본 Next.js — 비밀번호 문지기는 proxy.ts가 1차로 확인하고, 각 API가 이 파일의 함수로 접속 상태를 다시 확인한다.
// Design Ref: §4 보안 — 공용 비밀번호 1개, 비밀번호는 `.env`, 비밀번호 전에는 어떤 통계 화면·API도 열리지 않는다.
// Plan SC: PLAN 8번 — 로그인·로그아웃, 서명된 쿠키와 만료 시간, 비밀번호를 바꾸면 기존 접속이 끊기게 한다.
//
// 아직 하지 않는 것: 비밀번호를 여러 번 틀렸을 때 잠그는 기능. 틀린 횟수를 기록할 저장소가 정해지지 않았다. (DESIGN §6의 1번)
import "server-only";

/** 접속 상태를 담는 쿠키 이름 */
export const SESSION_COOKIE = "app_session";

/** 한 번 로그인하면 접속이 유지되는 시간(초). 12시간. 지나면 다시 비밀번호를 입력한다. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/** 비밀번호 입력칸에서 받는 글자 수의 상한. 터무니없이 긴 값을 막는다. */
export const MAX_PASSWORD_LENGTH = 200;

/** 쿠키 서명용 값의 최소 길이. 짧으면 추측하기 쉬워서 설정으로 인정하지 않는다. */
const MIN_SECRET_LENGTH = 32;

const NO_STORE = { "Cache-Control": "no-store" } as const;
const encoder = new TextEncoder();

/** 접속 확인에 필요한 설정(`.env`)이 모두 있는지. 하나라도 없으면 아무도 들어올 수 없게 닫아 둔다. */
export function isAuthConfigured(): boolean {
  const password = process.env.APP_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? "";
  return password.length > 0 && secret.length >= MIN_SECRET_LENGTH;
}

/** 서명용 값으로 메시지의 HMAC(위조 방지 서명)을 만든다. */
async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 걸리는 시간이 값에 따라 달라지지 않는 비교. (비교 시간으로 값을 추측하지 못하게) */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** 입력한 비밀번호가 맞는지 확인한다. 설정이 없으면 항상 false. */
export async function verifyPassword(input: string): Promise<boolean> {
  if (!isAuthConfigured() || input.length === 0 || input.length > MAX_PASSWORD_LENGTH) return false;
  const secret = process.env.SESSION_SECRET as string;
  const expected = await hmac(secret, `login:${process.env.APP_PASSWORD}`);
  const actual = await hmac(secret, `login:${input}`);
  return constantTimeEqual(expected, actual);
}

/**
 * 현재 비밀번호의 지문. 쿠키 서명에 섞어 두어서, 비밀번호를 바꾸면 기존 쿠키가 모두 무효가 된다.
 * (지문에서 비밀번호를 되돌릴 수 없고, 서명용 값 없이는 만들 수 없다)
 */
async function passwordFingerprint(secret: string): Promise<string> {
  return toHex(await hmac(secret, `pw:${process.env.APP_PASSWORD}`));
}

/** 접속 상태 쿠키에 담을 값을 만든다. 형식: "만료시각(초).서명" */
export async function createSessionToken(nowMs: number = Date.now()): Promise<string> {
  const secret = process.env.SESSION_SECRET as string;
  const expiresAt = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_SECONDS;
  const signature = toHex(await hmac(secret, `${expiresAt}.${await passwordFingerprint(secret)}`));
  return `${expiresAt}.${signature}`;
}

/** 쿠키 값이 위조되지 않았고 만료되지 않았으며 현재 비밀번호로 만든 것인지 확인한다. */
export async function verifySessionToken(token: string | null | undefined, nowMs: number = Date.now()): Promise<boolean> {
  if (!token || !isAuthConfigured()) return false;
  const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= Math.floor(nowMs / 1000)) return false;

  const secret = process.env.SESSION_SECRET as string;
  const expected = await hmac(secret, `${expiresAt}.${await passwordFingerprint(secret)}`);
  return constantTimeEqual(expected, hexToBytes(match[2]));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** 요청 머리글의 Cookie에서 접속 상태 쿠키 값을 꺼낸다. */
export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

/** 지금 요청이 로그인된 상태인지. */
export async function isLoggedIn(request: Request): Promise<boolean> {
  return verifySessionToken(readSessionToken(request));
}

/**
 * 접속 쿠키를 심는 Set-Cookie 값.
 * HttpOnly(화면 코드가 읽지 못함), SameSite=Lax(다른 사이트에서 보낸 요청에는 실리지 않음),
 * 배포 환경에서는 Secure(HTTPS에서만 전송)를 붙인다.
 */
export function buildSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

/** 접속 쿠키를 지우는 Set-Cookie 값. (로그아웃) */
export function buildClearCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** 오류 응답을 만든다. 모든 오류 응답은 캐시하지 않는다. */
export function authErrorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

/**
 * API 안에서 접속 상태를 확인한다. (proxy.ts가 놓쳐도 API가 한 번 더 막는다)
 * 통과하면 null, 막으면 돌려줄 응답을 반환한다.
 */
export async function requireLogin(request: Request): Promise<Response | null> {
  if (!isAuthConfigured()) {
    return authErrorResponse(503, "auth-not-configured", "접속 설정이 되어 있지 않습니다. 운영자에게 알려 주세요.");
  }
  if (await isLoggedIn(request)) return null;
  return authErrorResponse(401, "login-required", "먼저 비밀번호를 입력해 주세요.");
}

/** 브라우저가 다른 사이트에서 보낸 요청인지 거른다. Origin 머리글이 있고 주소가 다르면 false. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
