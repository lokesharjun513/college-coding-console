// Shared initials helper for admin identity cells (avatar + name).
export function getInitials(name) {
  if (!name) return '';
  const parts = String(name).trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default getInitials;