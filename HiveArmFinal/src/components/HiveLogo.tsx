export function HiveLogo({ className = "" }: { className?: string }) {
  return (
    <a href="/" className={`flex items-center gap-2.5 hover:opacity-90 transition ${className}`}>
      <svg width="32" height="32" viewBox="0 0 32 32" className="text-primary">
        <polygon
          points="16,2 28,9 28,23 16,30 4,23 4,9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <polygon
          points="16,8 23,12 23,20 16,24 9,20 9,12"
          fill="currentColor"
          fillOpacity="0.25"
          stroke="currentColor"
          strokeWidth="1"
        />
        <circle cx="16" cy="16" r="2" fill="currentColor" />
      </svg>
      <div className="leading-none">
        <div className="font-display font-bold text-lg tracking-tight">
          Hive<span className="text-primary">Arm</span>
        </div>
        <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground mt-0.5">
          Telemetry v1.0
        </div>
      </div>
    </a>
  );
}
