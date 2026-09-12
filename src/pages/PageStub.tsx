// Shared stub for pages implemented by page agents.
export default function PageStub({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-16 text-center">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.01em]">{title}</h1>
      <p className="mt-2 text-sm font-medium text-ink-muted">{note ?? 'Раздел в разработке'}</p>
    </div>
  );
}
