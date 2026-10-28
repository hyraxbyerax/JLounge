type IconProps = { className?: string };

export function LockIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
