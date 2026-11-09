const PATHS = {
  chevronLeft: 'M10 3 5 8l5 5',
  chevronRight: 'm6 3 5 5-5 5',
  close: 'M4 4l8 8M12 4l-8 8',
  plus: 'M8 3v10M3 8h10',
  panel: 'M2.5 3.5h11v9h-11zM10 3.5v9',
  sparkle: 'M8 2.5l1.3 3.2L12.5 7 9.3 8.3 8 11.5 6.7 8.3 3.5 7l3.2-1.3z',
  person: 'M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3.5 13.5c.6-2.3 2.4-3.5 4.5-3.5s3.9 1.2 4.5 3.5',
  more: 'M4 8h.01M8 8h.01M12 8h.01',
  trash: 'M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8',
  undo: 'M5.5 4 3 6.5 5.5 9M3 6.5h6a3.5 3.5 0 0 1 0 7H7',
  send: 'M8 13V3M4 7l4-4 4 4',
  repeat: 'M3 7V6a2 2 0 0 1 2-2h7M10 2l2 2-2 2M13 9v1a2 2 0 0 1-2 2H4M6 14l-2-2 2-2',
  chevronDown: 'm4 6 4 4 4-4',
  inbox: 'M2.5 9.5 4 3.5h8l1.5 6M2.5 9.5v3h11v-3M2.5 9.5h3l1 1.5h3l1-1.5h3',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
