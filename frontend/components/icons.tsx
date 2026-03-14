import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

export const Camera = (props: IconProps) => <BaseIcon {...props}><path d="M4 7h3l2-2h6l2 2h3v12H4z" /><circle cx="12" cy="13" r="4" /></BaseIcon>;
export const Mic = (props: IconProps) => <BaseIcon {...props}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v4" /><path d="M8 21h8" /></BaseIcon>;
export const MicOff = (props: IconProps) => <BaseIcon {...props}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 12 4" /><path d="M12 17v4" /><path d="M8 21h8" /><path d="M3 3l18 18" /></BaseIcon>;
export const WifiOff = (props: IconProps) => <BaseIcon {...props}><path d="M12 20h.01" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M2 8.8a16 16 0 0 1 13.8-2.8" /><path d="M19 12.3a9.6 9.6 0 0 1 3 2.2" /><path d="m2 2 20 20" /></BaseIcon>;
export const Radio = (props: IconProps) => <BaseIcon {...props}><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4" /><path d="M7.8 16.2a6 6 0 0 1 0-8.4" /><path d="M19 5a10 10 0 0 1 0 14" /><path d="M5 19A10 10 0 0 1 5 5" /></BaseIcon>;
export const ScrollText = (props: IconProps) => <BaseIcon {...props}><path d="M8 6h8" /><path d="M8 10h8" /><path d="M8 14h5" /><path d="M6 2h9l3 3v17H6z" /></BaseIcon>;
export const Clock = (props: IconProps) => <BaseIcon {...props}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></BaseIcon>;
export const Play = (props: IconProps) => <BaseIcon {...props}><polygon points="8 5 19 12 8 19 8 5" /></BaseIcon>;
export const Pause = (props: IconProps) => <BaseIcon {...props}><rect x="7" y="5" width="4" height="14" /><rect x="13" y="5" width="4" height="14" /></BaseIcon>;
export const SkipBack = (props: IconProps) => <BaseIcon {...props}><polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" /></BaseIcon>;
export const SkipForward = (props: IconProps) => <BaseIcon {...props}><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></BaseIcon>;
export const Volume2 = (props: IconProps) => <BaseIcon {...props}><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" /><path d="M15 9a5 5 0 0 1 0 6" /><path d="M18 6a9 9 0 0 1 0 12" /></BaseIcon>;
export const VolumeX = (props: IconProps) => <BaseIcon {...props}><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5" /><path d="M16 9l5 5" /><path d="M21 9l-5 5" /></BaseIcon>;
export const X = (props: IconProps) => <BaseIcon {...props}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></BaseIcon>;
export const Heart = (props: IconProps) => <BaseIcon {...props}><path d="M12 21s-7-4.4-9-8.8C1.2 8.6 3.3 5 7 5c2 0 3.3 1 5 3 1.7-2 3-3 5-3 3.7 0 5.8 3.6 4 7.2C19 16.6 12 21 12 21z" /></BaseIcon>;
export const MoreHorizontal = (props: IconProps) => <BaseIcon {...props}><circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></BaseIcon>;
export const ListMusic = (props: IconProps) => <BaseIcon {...props}><path d="M3 6h11" /><path d="M3 12h11" /><path d="M3 18h7" /><path d="M16 6v10a2 2 0 1 0 2 2V8l4-1V5z" /></BaseIcon>;
export const BarChart2 = (props: IconProps) => <BaseIcon {...props}><line x1="18" x2="18" y1="20" y2="10" /><line x1="12" x2="12" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="14" /></BaseIcon>;
export const Plus = (props: IconProps) => <BaseIcon {...props}><path d="M12 5v14" /><path d="M5 12h14" /></BaseIcon>;
export const Trash2 = (props: IconProps) => <BaseIcon {...props}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></BaseIcon>;
export const Save = (props: IconProps) => <BaseIcon {...props}><path d="M5 3h12l2 2v16H5z" /><path d="M8 3v6h8" /><rect x="8" y="13" width="8" height="6" /></BaseIcon>;
export const Share2 = (props: IconProps) => <BaseIcon {...props}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.7 10.7l6.6-3.4" /><path d="M8.7 13.3l6.6 3.4" /></BaseIcon>;
export const Music = (props: IconProps) => <BaseIcon {...props}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></BaseIcon>;
export const Users = (props: IconProps) => <BaseIcon {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></BaseIcon>;
export const Keyboard = (props: IconProps) => <BaseIcon {...props}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01" /><path d="M10 10h.01" /><path d="M14 10h.01" /><path d="M18 10h.01" /><path d="M6 14h12" /></BaseIcon>;
export const Headphones = (props: IconProps) => <BaseIcon {...props}><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><rect x="3" y="13" width="4" height="8" rx="2" /><rect x="17" y="13" width="4" height="8" rx="2" /></BaseIcon>;
export const Library = (props: IconProps) => <BaseIcon {...props}><path d="M4 4h4v16H4z" /><path d="M10 4h4v16h-4z" /><path d="M16 4h4v16h-4z" /></BaseIcon>;
export const Search = (props: IconProps) => <BaseIcon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></BaseIcon>;
export const User = (props: IconProps) => <BaseIcon {...props}><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></BaseIcon>;
export const Settings = (props: IconProps) => <BaseIcon {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h.1a1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" /></BaseIcon>;
export const Info = (props: IconProps) => <BaseIcon {...props}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></BaseIcon>;
export const HelpCircle = (props: IconProps) => <BaseIcon {...props}><circle cx="12" cy="12" r="10" /><path d="M9 9a3 3 0 1 1 6 0c0 2-3 2-3 4" /><path d="M12 17h.01" /></BaseIcon>;
export const LogOut = (props: IconProps) => <BaseIcon {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></BaseIcon>;
