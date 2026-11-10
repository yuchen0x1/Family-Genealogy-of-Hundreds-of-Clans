"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-neutral-800">页面出错了</h1>
      <p className="mt-3 text-sm text-neutral-500">
        加载过程中遇到问题，可能是网络波动或服务暂时不可用。
        {error.digest ? `（错误编号：${error.digest}）` : ""}
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2"
        >
          重新加载
        </button>
        <Link
          href="/"
          className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
