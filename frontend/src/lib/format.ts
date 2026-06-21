export function formatCurrency(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '---';
  const sign = value >= 0 ? '' : '-';
  return `${sign}$${Math.abs(value).toFixed(decimals)}`;
}

export function formatPnL(value: number | null | undefined): string {
  if (value == null) return '---';
  const sign = value >= 0 ? '+' : '-';
  const decimals = Math.abs(value) >= 1 ? 2 : 4;
  return `${sign}$${Math.abs(value).toFixed(decimals)}`;
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

export function formatPercentValue(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTimestamp(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString('en-US', { hour12: false });
}

export function formatDateTime(epoch: number): string {
  return new Date(epoch * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeAgo(epoch: number): string {
  const diff = Date.now() / 1000 - epoch;
  if (diff < 1) return 'now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function timeAgoMs(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 1000) return 'now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

export function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}
