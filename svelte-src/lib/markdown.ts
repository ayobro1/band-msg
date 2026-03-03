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

export const QUICK_EMOJIS = [
  '👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥',
  '👀', '✅', '❌', '⭐', '💯', '🚀', '💪', '🙏'
];
