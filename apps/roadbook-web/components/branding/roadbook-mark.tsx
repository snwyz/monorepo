import type { SVGProps } from "react";

type RoadbookMarkProps = SVGProps<SVGSVGElement>;

export function RoadbookMark(props: RoadbookMarkProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      fill="none"
      {...props}
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M17 13c15-4 31-1 33 9 2 9-6 12-16 15-3 1 4 10 15 16"
          stroke="#30D158"
          strokeWidth="10"
        />
        <path
          d="M34 37c-9 2-15 7-19 16"
          stroke="#00C7BE"
          strokeWidth="10"
        />
        <path
          d="M17 11.8c15-3.6 29-.5 31.2 8.7"
          stroke="white"
          strokeOpacity="0.58"
          strokeWidth="1.25"
        />
        <path
          d="M34 35.8c-9 2-16 8-20 17"
          stroke="white"
          strokeOpacity="0.34"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}
