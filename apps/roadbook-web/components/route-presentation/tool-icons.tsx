import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

function ToolIcon({ children, ...props }: Props) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>{children}</svg>;
}

export const PlusIcon = (props: Props) => <ToolIcon {...props}><path d="M12 5v14M5 12h14"/></ToolIcon>;
export const MinusIcon = (props: Props) => <ToolIcon {...props}><path d="M5 12h14"/></ToolIcon>;
export const LocateIcon = (props: Props) => <ToolIcon {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></ToolIcon>;
