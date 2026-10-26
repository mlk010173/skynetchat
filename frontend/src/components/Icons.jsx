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
export const IconInstagram = (props) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#fd5"/><stop offset=".5" stopColor="#ff543e"/><stop offset="1" stopColor="#c837ab"/></linearGradient></defs>
    <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#ig)"/>
    <rect x="6" y="6" width="12" height="12" rx="3.5" fill="none" stroke="#fff" strokeWidth="1.8"/>
    <circle cx="12" cy="12" r="2.8" fill="none" stroke="#fff" strokeWidth="1.8"/>
    <circle cx="16.2" cy="7.8" r=".9" fill="#fff"/>
  </svg>
);
