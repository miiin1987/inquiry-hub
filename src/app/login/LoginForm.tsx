"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2 px-4 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "ログイン中..." : "ログイン"}
    </button>
  );
}

interface Props {
  initialError?: string;
}

export default function LoginForm({ initialError }: Props) {
  const initial: LoginState = initialError ? { error: initialError } : null;
  const [state, formAction] = useActionState(login, initial);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 w-full max-w-sm shadow-sm">
      <h1 className="text-xl font-bold text-gray-900 mb-1">管理者ログイン</h1>
      <p className="text-sm text-gray-500 mb-6">マルチチャネル通知＋AI自動分類</p>

      <form action={formAction} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            name="email"
            required
            autoComplete="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            パスワード
          </label>
          <input
            id="password"
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        {state?.error && (
          <p
            role="alert"
            className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-md"
          >
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>
    </div>
  );
}
