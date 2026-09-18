import { LoaderIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<typeof LoaderIcon>) {
  return (
    <LoaderIcon
      aria-hidden="true"
      className={cn("size-4 animate-spin", className)}
      data-slot="spinner"
      {...props}
    />
  );
}

export { Spinner };
