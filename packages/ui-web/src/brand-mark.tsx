// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { cn } from "./lib/utils.js";

/** A white-label's mark: a small ink square beside its name, as on the brand's own site. */
export function BrandMark({ name, className }: { name: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 text-foreground", className)}>
      <span aria-hidden="true" className="block size-3 bg-primary" />
      <span className="text-heading1 leading-none font-medium tracking-[-0.03em]">{name}</span>
    </div>
  );
}
