import { MishiruLogo } from "./brand/MishiruLogo";

export function BrandMark({ className = "" }: { className?: string }) {
  return <MishiruLogo variant="horizontal" className={`brand-mark ${className}`} />;
}
