export function MishiruMark({ className = "" }: { className?: string }) {
  return <span className={`mishiru-mark ${className}`} aria-hidden="true"><i>M</i><b>・</b></span>;
}
