import type { ReactElement } from 'react';

const SIZE = 28;

function IconFrame({ children }: { children: ReactElement | ReactElement[] }) {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function OrdersTileIcon() {
  return (
    <IconFrame>
      <path
        d="M4 2h8v11.5l-1.3-.9-1.2.9-1.2-.9-1.3.9-1.2-.9-1.2.9-1.3-.9V2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M6 5.5h4M6 8h4M6 10.5h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </IconFrame>
  );
}

export function ProductRequestsTileIcon() {
  return (
    <IconFrame>
      <path
        d="M5.2 2.5h5.6c.7 0 1.2.5 1.2 1.2v9.6c0 .7-.5 1.2-1.2 1.2H5.2c-.7 0-1.2-.5-1.2-1.2V3.7c0-.7.5-1.2 1.2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M6.2 1.8h3.6v1.4H6.2V1.8Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path
        d="M8 6.2l.35 1.05h1.1l-.9.65.35 1.05L8 8.35l-.9.65.35-1.05-.9-.65h1.1L8 6.2Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </IconFrame>
  );
}

export function LibraryStockTileIcon() {
  return (
    <IconFrame>
      <rect x="2" y="2.5" width="12" height="9.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.4" cy="5.6" r="1.1" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M3.2 10.8 6.6 7.6a1 1 0 0 1 1.3 0l1.5 1.4M10 8.4l1.1-1a1 1 0 0 1 1.3 0l1.4 1.3"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconFrame>
  );
}

export function AccessoryStockTileIcon() {
  return (
    <IconFrame>
      <path
        d="M2.5 5.2 8 2.5l5.5 2.7v6.1L8 14l-5.5-2.7V5.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M2.5 5.2 8 8l5.5-2.8M8 8v6" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </IconFrame>
  );
}

export function NailAvailabilityTileIcon() {
  return (
    <IconFrame>
      <path
        d="M4.2 13.2c0-2.4 1.2-4.4 2.6-5.5.5-.4 1.1-.4 1.6 0 1.4 1.1 2.6 3.1 2.6 5.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.4 5.2c.3-1.4 1-2.6 1.6-2.6s1.3 1.2 1.6 2.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M5.2 10.2h5.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </IconFrame>
  );
}

export function UserLibraryStockTileIcon() {
  return (
    <IconFrame>
      <circle cx="6" cy="5" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M2.5 12.5c.4-2 1.8-3 3.5-3s3.1 1 3.5 3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M10.2 4.2h3.3v3.3h-3.3V4.2Zm0 4.5h3.3v3.3h-3.3V8.7Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </IconFrame>
  );
}

export function CartRulesTileIcon() {
  return (
    <IconFrame>
      <path
        d="M3 3.5h6.2l3.8 3.8v5.2c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2v-7.8c0-.7.5-1.2 1.2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="5.8" cy="6.5" r="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M7.8 10.8 10.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8.2" cy="8.2" r="0.7" fill="currentColor" />
      <circle cx="10.1" cy="10.6" r="0.7" fill="currentColor" />
    </IconFrame>
  );
}

export function LoyaltyTileIcon() {
  return (
    <IconFrame>
      <circle cx="8" cy="8.5" r="4.2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.2 12.8c.5-2.2 2-3.4 3.8-3.4s3.3 1.2 3.8 3.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M11.2 4.8h2.2v2.2M12.3 3.7v4.4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </IconFrame>
  );
}

export function GiftTileIcon() {
  return (
    <IconFrame>
      <rect x="3" y="5.5" width="10" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 8.2h10" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 5.5v8M6.2 5.5c0-1.2.8-2.2 1.8-2.2s1.8 1 1.8 2.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </IconFrame>
  );
}

export function ReviewsTileIcon() {
  return (
    <IconFrame>
      <path
        d="M8 2.6l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 10.8l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5L8 2.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </IconFrame>
  );
}

export function VouchersTileIcon() {
  return (
    <IconFrame>
      <path
        d="M2.5 5.2c0-.7.5-1.2 1.2-1.2h8.6c.7 0 1.2.5 1.2 1.2v1.2a1.2 1.2 0 0 0 0 2.4v1.2c0 .7-.5 1.2-1.2 1.2H3.7c-.7 0-1.2-.5-1.2-1.2V8.8a1.2 1.2 0 0 0 0-2.4V5.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 4.5v7"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeDasharray="1.4 1.4"
        strokeLinecap="round"
      />
    </IconFrame>
  );
}

export function ChatsTileIcon() {
  return (
    <IconFrame>
      <path
        d="M3.2 3.2h9.6c.7 0 1.2.5 1.2 1.2v5.4c0 .7-.5 1.2-1.2 1.2H7.2L4 13.2v-2.2H3.2c-.7 0-1.2-.5-1.2-1.2V4.4c0-.7.5-1.2 1.2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M5 6.5h6M5 9h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </IconFrame>
  );
}

export function UsersTileIcon() {
  return (
    <IconFrame>
      <circle cx="5.5" cy="5.3" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M2.3 13c.35-2 1.65-3.1 3.2-3.1S8.35 11 8.7 13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="11.1" cy="6.2" r="1.55" stroke="currentColor" strokeWidth="1.15" />
      <path
        d="M9.05 12.8c.25-1.55 1.22-2.45 2.45-2.45 1.05 0 1.9.6 2.2 1.7"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </IconFrame>
  );
}

export function DocsTileIcon() {
  return (
    <IconFrame>
      <path
        d="M4 2.5h6.5L12.5 5v8.5H4V2.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M10.2 2.6V5h2.2M6 8h4.5M6 10.5h3" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </IconFrame>
  );
}

export function PluginsTileIcon() {
  return (
    <IconFrame>
      <rect x="2.5" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="8.5" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2.5" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 10.5h3M9.5 12.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </IconFrame>
  );
}

export function PreferencesTileIcon() {
  return (
    <IconFrame>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 2.2v1.4M8 12.4v1.4M2.2 8h1.4M12.4 8h1.4M3.9 3.9l1 1M11.1 11.1l1 1M12.1 3.9l-1 1M4.9 11.1l-1 1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </IconFrame>
  );
}

export function ActivityTileIcon() {
  return (
    <IconFrame>
      <rect x="3" y="2.5" width="10" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </IconFrame>
  );
}

export function ApiLogTileIcon() {
  return (
    <IconFrame>
      <path
        d="M5.2 4.2 2.5 8l2.7 3.8M10.8 4.2 13.5 8l-2.7 3.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 3.2 7 12.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </IconFrame>
  );
}

export function EmailLogTileIcon() {
  return (
    <IconFrame>
      <rect x="2.4" y="3.6" width="11.2" height="8.8" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M3 4.4 8 8.2 13 4.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconFrame>
  );
}

export function CronLogsTileIcon() {
  return (
    <IconFrame>
      <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5.2v3.2l2.1 1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </IconFrame>
  );
}

export function ImpersonateTileIcon() {
  return (
    <IconFrame>
      <circle cx="5.2" cy="5" r="1.8" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M2.2 12c.3-1.7 1.5-2.6 3-2.6s2.7.9 3 2.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="11" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8.8 12c.3-1.4 1.2-2.1 2.4-2.1s2.1.7 2.4 2.1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M8.2 3.2h1.4M8.9 2.5v1.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </IconFrame>
  );
}

export function VocabularyTileIcon() {
  return (
    <IconFrame>
      <path d="M3 4.2h10M3 8h10M3 11.8h6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </IconFrame>
  );
}

export function RolesTileIcon() {
  return (
    <IconFrame>
      <path
        d="M8 2.2 3.2 4v3.6c0 3 2.1 5.4 4.8 6.2 2.7-.8 4.8-3.2 4.8-6.2V4L8 2.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="m5.9 8 1.5 1.5 2.8-3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconFrame>
  );
}
