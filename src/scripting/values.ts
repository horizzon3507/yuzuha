export function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value) ?? '';
  return String(value);
}

export function truthy(value: unknown): boolean {
  if (typeof value === 'string') {
    const match = /^(.*?)\s*(==|!=|>=|<=|>|<)\s*(.*?)$/.exec(value);
    if (match) {
      const left = match[1]!.trim(), right = match[3]!.trim();
      switch (match[2]) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '>': return Number(left) > Number(right);
        case '<': return Number(left) < Number(right);
        case '>=': return Number(left) >= Number(right);
        case '<=': return Number(left) <= Number(right);
      }
    }
    return !['', 'false', '0', 'null', 'undefined'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}
