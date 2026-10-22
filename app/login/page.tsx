// Design Ref: §1 화면 구성 1) 비밀번호 화면 — 가운데에 앱 이름, 비밀번호 입력칸, 「들어가기」 버튼만 보인다.
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-900">
        <h1 className="text-center text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          산업통계 자동 업데이트 시스템
        </h1>
        <p className="mt-3 text-center text-base text-zinc-600 dark:text-zinc-400">
          산업경제과 직원만 사용할 수 있습니다.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
