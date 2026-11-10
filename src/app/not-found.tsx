import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-6xl font-bold text-neutral-200">404</p>
      <h1 className="mt-4 text-2xl font-bold text-neutral-800">页面不存在</h1>
      <p className="mt-3 text-sm text-neutral-500">
        您访问的页面可能已被移动或删除。姓氏资料与族谱页面需要通过站内导航或搜索访问。
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          返回首页
        </Link>
        <Link
          href="/surnames"
          className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          浏览姓氏
        </Link>
        <Link
          href="/search"
          className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          站内搜索
        </Link>
      </div>
    </div>
  );
}
