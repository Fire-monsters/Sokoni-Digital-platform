const icons: Record<string, string> = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  truck: "M3 6h11v11H3zM14 10h4l3 3v4h-7zM7 20a2 2 0 1 0 0-4M17 20a2 2 0 1 0 0-4",
  check: "M4 12l5 5L20 6",
  card: "M3 6h18v12H3zM3 10h18",
  refund: "M9 7H4V2M4 7a8 8 0 1 1-1 8",
  wallet: "M3 6h18v14H3zM3 6l14-3v3M16 12h5v4h-5z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.87",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10M9 12l2 2 4-5",
  settings:
    "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
};
export function Icon({ name }: { name: string }) {
  return (
    <svg aria-hidden="true" className="icon" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path
        d={icons[name] ?? icons.grid}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
