import type { SVGProps } from "react";

export type IconName =
  | "today"
  | "compose"
  | "calendar"
  | "import"
  | "connections"
  | "logs"
  | "logout"
  | "menu"
  | "close"
  | "rocket"
  | "clock"
  | "refresh"
  | "check"
  | "alert"
  | "upload"
  | "image"
  | "video"
  | "plus"
  | "chevronLeft"
  | "chevronRight"
  | "external"
  | "save"
  | "trash"
  | "sparkles"
  | "filter"
  | "copy";

const paths: Record<IconName, React.ReactNode> = {
  today: <><path d="M4 5.5h16v14H4z"/><path d="M8 3v5M16 3v5M4 10h16"/><path d="m9 15 2 2 4-4"/></>,
  compose: <><path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z"/><path d="m14 6 4 4"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
  import: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
  connections: <><path d="M8 12h8"/><path d="M6 16H5a4 4 0 0 1 0-8h3M18 8h1a4 4 0 1 1 0 8h-3"/><circle cx="12" cy="12" r="2"/></>,
  logs: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h7v18h-7"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  rocket: <><path d="M14 4c3-3 6-2 6-2s1 3-2 6l-7 7-5-5Z"/><path d="m9 7-4 1-3 3 6 1M13 15l-1 6 3-3 1-4"/><circle cx="15.5" cy="6.5" r="1.5"/><path d="M6 16c-2 0-3 1-3 3 2 0 3-1 3-3Z"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.8-4M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.8 4M20 20v-5h-5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  alert: <><path d="M12 3 2 21h20Z"/><path d="M12 9v5M12 18h.01"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m3 17 5-5 4 4 2-2 7 6"/></>,
  video: <><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2Z"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  chevronLeft: <path d="m15 18-6-6 6-6"/>,
  chevronRight: <path d="m9 18 6-6-6-6"/>,
  external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6H4V5h6"/></>,
  save: <><path d="M5 3h12l3 3v15H4V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
  sparkles: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8ZM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6Z"/></>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8Z"/>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></>,
};

export function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

