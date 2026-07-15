export type MishiruLogoVariant = "horizontal" | "compact" | "monochrome" | "light-background" | "dark-background";

export function MishiruLogo({ variant = "horizontal", className = "" }: { variant?: MishiruLogoVariant; className?: string }) {
  return <span className={`mishiru-logo mishiru-logo--${variant} ${className}`} aria-label="MISHIRU みしる">
    <img src="/assets/brand/mishiru-logo.png" alt="" aria-hidden="true" />
  </span>;
}
