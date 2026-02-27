const AVATAR_COLORS = [
  "#5865f2", // blurple
  "#57f287", // green
  "#fee75c", // yellow
  "#eb459e", // fuchsia
  "#ed4245", // red
  "#3ba55c", // dark green
  "#e67e22", // orange
  "#9b59b6", // purple
  "#1abc9c", // teal
  "#e91e63", // pink
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;

  return `${date.toLocaleDateString([], {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })} ${time}`;
}
