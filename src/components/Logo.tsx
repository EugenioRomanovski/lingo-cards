// App icon as an inline mark: the iOS-style squircle crop of public/icon.svg.
export default function Logo({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icon.svg`}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{ borderRadius: '23%', boxShadow: '0 1px 3px rgba(40, 30, 120, 0.25)' }}
    />
  );
}
