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
  
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  
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
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
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
  }
];

// New reactions use SVG icon IDs. Legacy reactions stored as Unicode emojis
// will fall back to displaying the raw emoji text if no matching SVG is found.
export const QUICK_EMOJIS = REACTION_ICONS.map(r => r.id);
