/** Ícones SVG (stroke) no estilo do site: 24x24, traço 1.6, cor via currentColor. */
const base = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round",
};
const make = (paths) => (props) => (
  <svg {...base} {...props} aria-hidden="true">{paths}</svg>
);
export const IconEdit = make(<><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 8 16l1.2-4z"/></>);
export const IconGift = make(<><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></>);
export const IconMoney = make(<><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M12 7v10M9.5 9.5C9.5 8.5 10.7 8 12 8s2.5.6 2.5 1.7-1 1.5-2.5 1.8-2.5.7-2.5 1.8S10.7 15 12 15s2.5-.5 2.5-1.5"/></>);
export const IconBell = make(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>);
export const IconImage = make(<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="M21 15l-5-5L5 21"/></>);
export const IconUsers = make(<><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.2 3.2 0 0 1 0 6.2M18 14.3c2 .8 3.5 2.8 3.5 5.7"/></>);
export const IconCode = make(<><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></>);
export const IconFolder = make(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>);
export const IconHistory = make(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>);
export const IconBook = make(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></>);
export const IconChat = make(<><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/></>);
export const IconLife = make(<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/></>);
export const IconUser = make(<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></>);
export const IconTheme = make(<><path d="M20 15A8 8 0 1 1 9 4a6.5 6.5 0 0 0 11 11z"/></>);
export const IconGlobe = make(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>);
export const IconBrain = make(<><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/></>);
export const IconMic = make(<><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>);
export const IconPlus = make(<><path d="M12 5v14M5 12h14"/></>);
export const IconClose = make(<><path d="M6 6l12 12M18 6L6 18"/></>);
export const IconMenu = make(<><path d="M4 8h16M4 16h10"/></>);
export const IconChevron = make(<><path d="M6 9l6 6 6-6"/></>);
export const IconWave = make(<><path d="M5 10v4M9 6v12M13 3v18M17 8v8M21 11v2"/></>);
export const IconPlug = make(<><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8H6a2 2 0 0 0-2 2v3a6 6 0 0 0 12 0v-3a2 2 0 0 0-2-2z"/></>);
export const IconMail = make(<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>);
export const IconDatabase = make(<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>);
export const IconServer = make(<><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>);
export const IconInstagram = (props) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#fd5"/><stop offset=".5" stopColor="#ff543e"/><stop offset="1" stopColor="#c837ab"/></linearGradient></defs>
    <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#ig)"/>
    <rect x="6" y="6" width="12" height="12" rx="3.5" fill="none" stroke="#fff" strokeWidth="1.8"/>
    <circle cx="12" cy="12" r="2.8" fill="none" stroke="#fff" strokeWidth="1.8"/>
    <circle cx="16.2" cy="7.8" r=".9" fill="#fff"/>
  </svg>
);

export const IconClock = make(<><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/></>);
export const IconZap = make(<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>);
export const IconCheck = make(<path d="M20 6L9 17l-5-5"/>);
export const IconSpark = make(<><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></>);
export const IconWrench = make(<><path d="M14.7 6.3a4.5 4.5 0 0 0 5.9 5.9l-8.4 8.4a2.6 2.6 0 0 1-3.7 0l-2.1-2.1a2.6 2.6 0 0 1 0-3.7z"/><path d="M14.7 6.3L18 3l3 3-3.3 3.3"/></>);
export const IconSearch = make(<><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></>);
export const IconStop = make(<rect x="6" y="6" width="12" height="12" rx="2.5"/>);
export const IconArrowUp = make(<><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></>);
export const IconCopy = make(<><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a2 2 0 0 0-2 2v8.5A2.5 2.5 0 0 0 6.5 16"/></>);
export const IconDownload = make(<><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></>);
export const IconSpeaker = make(<><path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7"/><path d="M19 6a8 8 0 0 1 0 12"/></>);
export const IconSun = make(<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></>);
export const IconMoon = make(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>);
export const IconChatPlus = make(<><path d="M21 11.5a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 11.5z"/><path d="M12 8.5v6M9 11.5h6"/></>);
export const IconPaperclip = make(<path d="M20 11.5l-8.2 8.2a4.6 4.6 0 0 1-6.5-6.5l8.5-8.5a3.1 3.1 0 0 1 4.4 4.4l-8.5 8.5a1.6 1.6 0 0 1-2.2-2.2l7.8-7.8"/>);
export const IconTools = make(<><path d="M4 20l6-6"/><path d="M14.7 6.3a4.5 4.5 0 0 0 5.9 5.9l-8.4 8.4a2.6 2.6 0 0 1-3.7 0l-2.1-2.1a2.6 2.6 0 0 1 0-3.7z"/></>);
