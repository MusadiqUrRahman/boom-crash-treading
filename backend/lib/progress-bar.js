class ProgressBar {
  constructor(label, width) {
    this.label = label;
    this.width = width || 30;
  }

  show(current, total) {
    const pct = Math.min(1, current / total);
    const filled = Math.round(this.width * pct);
    const empty = this.width - filled;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
    const line =
      `\r${this.label}: ${current.toLocaleString()} / ${total.toLocaleString()} ticks (${(pct * 100).toFixed(0)}%) ${bar}`;
    process.stdout.write(line);
  }

  done() {
    process.stdout.write('\n');
  }
}

module.exports = ProgressBar;
