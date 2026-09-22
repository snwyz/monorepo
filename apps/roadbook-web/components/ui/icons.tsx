import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export const RouteIcon = (props: IconProps) => (
  <IconBase {...props}><circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v3c0 2.2 1.8 4 4 4h4c2.2 0 4 1.8 4 4v-1"/></IconBase>
);
export const PlusIcon = (props: IconProps) => <IconBase {...props}><path d="M12 5v14M5 12h14"/></IconBase>;
export const SearchIcon = (props: IconProps) => <IconBase {...props}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></IconBase>;
export const ChevronDownIcon = (props: IconProps) => <IconBase {...props}><path d="m7 9.5 5 5 5-5"/></IconBase>;
export const ChevronUpIcon = (props: IconProps) => <IconBase {...props}><path d="m7 14.5 5-5 5 5"/></IconBase>;
export const MoreIcon = (props: IconProps) => <IconBase {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></IconBase>;
export const CloseIcon = (props: IconProps) => <IconBase {...props}><path d="m6 6 12 12M18 6 6 18"/></IconBase>;
export const TrashIcon = (props: IconProps) => <IconBase {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></IconBase>;
export const LocateIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></IconBase>;
export const UndoIcon = (props: IconProps) => <IconBase {...props}><path d="m9 7-5 5 5 5"/><path d="M4 12h9a6 6 0 0 1 6 6"/></IconBase>;
export const LayersIcon = (props: IconProps) => <IconBase {...props}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></IconBase>;
export const NavigationIcon = (props: IconProps) => <IconBase {...props}><path d="m20 4-7.2 16-2.1-6.7L4 11.2 20 4Z"/><path d="m10.7 13.3 3.6-3.6"/></IconBase>;
export const MountainIcon = (props: IconProps) => <IconBase {...props}><path d="m3 19 6.5-11 3.2 5 2.2-3 6.1 9H3Z"/></IconBase>;
export const ClockIcon = (props: IconProps) => <IconBase {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></IconBase>;
export const DistanceIcon = (props: IconProps) => <IconBase {...props}><path d="M5 6h14M5 18h14M8 3 5 6l3 3M16 15l3 3-3 3"/></IconBase>;
export const TrafficIcon = (props: IconProps) => <IconBase {...props}><rect x="7" y="3" width="10" height="18" rx="3"/><circle cx="12" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="16" r="1"/></IconBase>;
export const ExternalIcon = (props: IconProps) => <IconBase {...props}><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></IconBase>;
export const CheckIcon = (props: IconProps) => <IconBase {...props}><path d="m5 12 4 4L19 6"/></IconBase>;
export const AlertIcon = (props: IconProps) => <IconBase {...props}><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/></IconBase>;
