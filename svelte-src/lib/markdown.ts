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
  emoji: string;
};

export const REACTION_ICONS: ReactionDef[] = [
  { id: "thumbsup", label: "Thumbs Up", emoji: "👍" },
  { id: "heart", label: "Heart", emoji: "❤️" },
  { id: "laugh", label: "Laugh", emoji: "😂" },
  { id: "fire", label: "Fire", emoji: "🔥" },
  { id: "check", label: "Check", emoji: "✅" },
  { id: "cross", label: "Cross", emoji: "❌" },
  { id: "star", label: "Star", emoji: "⭐" },
  { id: "rocket", label: "Rocket", emoji: "🚀" },
  { id: "eyes", label: "Eyes", emoji: "👀" },
  { id: "clap", label: "Clap", emoji: "👏" },
  { id: "100", label: "100", emoji: "💯" },
  { id: "thinking", label: "Thinking", emoji: "🤔" },
  { id: "party", label: "Party", emoji: "🎉" },
  { id: "sad", label: "Sad", emoji: "😢" },
  { id: "angry", label: "Angry", emoji: "😡" },
  { id: "cool", label: "Cool", emoji: "😎" },
  { id: "skull", label: "Skull", emoji: "💀" },
  { id: "thumbdown", label: "Thumbs Down", emoji: "👎" },
  { id: "pray", label: "Pray", emoji: "🙏" },
  { id: "muscle", label: "Muscle", emoji: "💪" },
  { id: "wave", label: "Wave", emoji: "👋" },
  { id: "mindblown", label: "Mind Blown", emoji: "🤯" },
  { id: "sob", label: "Sobbing", emoji: "😭" },
  { id: "heart_eyes", label: "Heart Eyes", emoji: "😍" },
  { id: "poop", label: "Poop", emoji: "💩" },
  { id: "ghost", label: "Ghost", emoji: "👻" },
  { id: "alien", label: "Alien", emoji: "👽" },
  { id: "unicorn", label: "Unicorn", emoji: "🦄" },
  { id: "crown", label: "Crown", emoji: "👑" },
  { id: "gem", label: "Gem", emoji: "💎" },
  { id: "music", label: "Music", emoji: "🎵" },
  { id: "guitar", label: "Guitar", emoji: "🎸" },
  { id: "drum", label: "Drum", emoji: "🥁" },
  { id: "microphone", label: "Mic", emoji: "🎤" },
  { id: "headphones", label: "Headphones", emoji: "🎧" },
  { id: "pizza", label: "Pizza", emoji: "🍕" },
  { id: "beer", label: "Beer", emoji: "🍺" },
  { id: "coffee", label: "Coffee", emoji: "☕" },
  { id: "sparkles", label: "Sparkles", emoji: "✨" },
  { id: "rainbow", label: "Rainbow", emoji: "🌈" },
];

export const QUICK_EMOJIS = REACTION_ICONS.map(r => r.id);
