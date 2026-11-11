export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse px-4 py-8" aria-busy="true" aria-label="页面加载中">
      <div className="h-8 w-64 rounded bg-neutral-200" />
      <div className="mt-4 h-4 w-96 max-w-full rounded bg-neutral-200" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 rounded-lg bg-neutral-100" />
        ))}
      </div>
    </div>
  );
}
