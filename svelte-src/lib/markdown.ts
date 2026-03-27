// Simple markdown parser for Discord-like formatting
export function parseMarkdown(text: string): string {
  if (!text) return '';
  
  // Escape HTML
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Code blocks (```...```)
  result = result.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
  
  // Images (![alt](url)) - Specifically for GIFs
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match: string, alt: string, url: string) => {
    const safeUrl = url.replace(/"/g, '&quot;');
    const safeAlt = alt.replace(/"/g, '&quot;');
    return `<img src="${safeUrl}" alt="${safeAlt}" class="rounded-xl max-w-full max-h-[300px] object-contain my-2 bg-black/20 select-none" style="touch-action: none; user-select: none; -webkit-user-select: none; pointer-events: auto;" loading="lazy" draggable="false" />`;
  });
  
  // Inline code (`...`)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Bold (**...** or __...__) 
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  
  // Italic (*...* or _..._)
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  result = result.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Strikethrough (~~...~~)
  result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  
  // Links (only allow http/https URLs to prevent javascript: XSS)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match: string, text: string, url: string) => {
    const trimmed = url.trim().toLowerCase();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const safeUrl = url.replace(/"/g, '&quot;');
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
    return text;
  });
  
  // Mentions (@username)
  result = result.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  
  // Channels (#channel)
  result = result.replace(/#([\w-]+)/g, '<span class="channel-ref">#$1</span>');
  
  return result;
}

export type ReactionDef = {
  id: string;
  label: string;
  svg: string;
};

export const REACTION_ICONS: ReactionDef[] = [
  {
    id: "thumbsup",
    label: "Thumbs Up",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 22V11l5-9a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 1.9l-.8 7A2 2 0 0 1 18.7 19H7"/><path d="M2 13v6a2 2 0 0 0 2 2h1V11H4a2 2 0 0 0-2 2z"/></svg>`
  },
  {
    id: "heart",
    label: "Heart",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
  },
  {
    id: "laugh",
    label: "Laugh",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`
  },
  {
    id: "fire",
    label: "Fire",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-3.6 0-8-2.4-8-7.7 0-3.3 2-6.1 3.4-7.9l.4-.5c.4-.5 1.2-.4 1.4.2.5 1.2 1.4 2.2 2.4 2.7.1-1.2.5-3.2 2-5.5.3-.5 1-.6 1.4-.2C17 6.1 20 9.8 20 15.3 20 20.6 15.6 23 12 23z"/></svg>`
  },
  {
    id: "check",
    label: "Check",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
  },
  {
    id: "cross",
    label: "Cross",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  },
  {
    id: "star",
    label: "Star",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
  },
  {
    id: "rocket",
    label: "Rocket",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`
  },
  {
    id: "eyes",
    label: "Eyes",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
  },
  {
    id: "clap",
    label: "Clap",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 14.4a4 4 0 0 0-.8-7.6l-2-1.2a4 4 0 0 0-5.6 1.2l-1.2 2a4 4 0 0 0 1.2 5.6"/><path d="M12.4 3.2l-1.2 2a4 4 0 0 0 1.2 5.6l2 1.2a4 4 0 0 0 5.6-1.2l1.2-2"/><path d="M4 19.5a2.5 2.5 0 0 0 5 0v-5a2.5 2.5 0 0 0-5 0z"/></svg>`
  },
  {
    id: "100",
    label: "100",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm1 8c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`
  },
  {
    id: "thinking",
    label: "Thinking",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  },
  {
    id: "party",
    label: "Party",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`
  },
  {
    id: "sad",
    label: "Sad",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`
  },
  {
    id: "angry",
    label: "Angry",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="8" y1="8" x2="8.01" y2="8"/><line x1="16" y1="8" x2="16.01" y2="8"/><path d="M7.5 14.5l2-2"/><path d="M14.5 14.5l2-2"/></svg>`
  },
  {
    id: "cool",
    label: "Cool",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 14l-2 2"/><path d="M16 14l-2 2"/><path d="M9 9h.01"/><path d="M15 9h.01"/></svg>`
  },
  {
    id: "skull",
    label: "Skull",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-3.5 0-7 2.5-7 7 0 2.5 1.5 4.5 3 5.5v1.5c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V14.5c1.5-1 3-3 3-5.5 0-4.5-3.5-7-7-7zm-2 9c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-2 4c-1.1 0-2 .67-2 1.5V17h4v-.5c0-.83-.9-1.5-2-1.5z"/></svg>`
  },
  {
    id: "thumbdown",
    label: "Thumbs Down",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 11V3l-5 9a2 2 0 0 1-2 2H2"/><path d="M2 13v6a2 2 0 0 0 2 2h1v-4H4a2 2 0 0 2z"/></svg>`
  },
  {
    id: "pray",
    label: "Pray",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v6l-2 4v6h12v-6l-2-4V6a4 4 0 0 0-4-4z"/><path d="M8 14a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/></svg>`
  },
  {
    id: "muscle",
    label: "Muscle",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/></svg>`
  },
  {
    id: "wave",
    label: "Wave",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`
  },
  {
    id: "bell",
    label: "Bell",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`
  },
  {
    id: "bellslash",
    label: "Bell Slash",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
  },
  {
    id: "pin",
    label: "Pin",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 4v6l-4 6v4H6v-4l-4-6V4h6.5a3.5 3.5 0 0 1 0 7H16zm-3-2h3l1 1.5V6h-4v1.5L13 2zM7 20a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm10 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>`
  },
  {
    id: "bookmark",
    label: "Bookmark",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`
  },
  {
    id: "flag",
    label: "Flag",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`
  },
  {
    id: "location",
    label: "Location",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`
  },
  {
    id: "call",
    label: "Call",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`
  },
  {
    id: "mail",
    label: "Mail",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`
  },
  {
    id: "calendar",
    label: "Calendar",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`
  },
  {
    id: "clock",
    label: "Clock",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
  },
  {
    id: "lightbulb",
    label: "Lightbulb",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`
  },
  {
    id: "tada",
    label: "Tada",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>`
  },
  {
    id: "guitar",
    label: "Guitar",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 17.6c-.5 1.4-2.6 2.4-5.2 2.4H9c-2.6 0-4.7-1-5.2-2.4L2 12V5c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v7l-1.8 2.6z"/><path d="M9 8V3"/><path d="M15 8V3"/><circle cx="19" cy="17" r="2"/></svg>`
  },
  {
    id: "piano",
    label: "Piano",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8v8"/><path d="M10 8v8"/><path d="M14 8v8"/><path d="M18 8v8"/><path d="M6 12h12"/></svg>`
  },
  {
    id: "drums",
    label: "Drums",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`
  },
  {
    id: "mic",
    label: "Microphone",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`
  },
  {
    id: "sax",
    label: "Saxophone",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M8 22h8"/><path d="M4 15c0-3 2-5 4-5s4 2 4 5"/><path d="M16 10c2-3 4-3 4-3v8s-2 0-4-3c-1-1.5-2-2.5-4-2.5"/></svg>`
  },
  {
    id: "violin",
    label: "Violin",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l-3 3-3-3"/><path d="M14 6l3 3 3-3"/><path d="M17 9l-3 3-3-3"/><path d="M14 12l3 3 3-3"/><path d="M17 15l-3 3-3-3"/><path d="M8 18v3"/><path d="M16 18v3"/><path d="M12 21v3"/></svg>`
  },
  {
    id: "trumpet",
    label: "Trumpet",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16v4"/><path d="M3 12c0-1 1-2 3-2 3 0 5 1 7 3 2 2 4 3 6 3s4-1 6-3c2-2 4-3 7-3 2 0 3 1 3 2v4"/><path d="M6 8h.01"/></svg>`
  },
  {
    id: "headphones",
    label: "Headphones",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`
  },
  {
    id: "music",
    label: "Music Note",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
  },
  {
    id: "speaker",
    label: "Speaker",
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`
  }
];

// New reactions use SVG icon IDs. Legacy reactions stored as Unicode emojis
// will fall back to displaying the raw emoji text if no matching SVG is found.
export const QUICK_EMOJIS = REACTION_ICONS.map(r => r.id);
