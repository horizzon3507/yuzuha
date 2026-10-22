export class YuzuhaError extends Error {
  constructor(public readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'YuzuhaError';
  }
}

export class ScriptError extends YuzuhaError {
  constructor(code: string, message: string, public readonly source: string,
    public readonly offset: number, public readonly file = '<script>', options?: ErrorOptions) {
    super(code, message, options);
    this.name = 'ScriptError';
  }
  get line(): number { return this.source.slice(0, this.offset).split('\n').length; }
  get column(): number { return this.offset === 0 ? 1 : this.offset - this.source.lastIndexOf('\n', this.offset - 1); }
  format(): string {
    const line = this.source.split('\n')[this.line - 1] ?? '';
    return `${this.file}:${this.line}:${this.column} [${this.code}] ${this.message}\n${line}\n${' '.repeat(this.column - 1)}^`;
  }
}

export class GuardError extends YuzuhaError {
  constructor(message: string) { super('GUARD', message); }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new GuardError(message);
}
export class StopExecution extends Error {}

export class PartialModerationError extends YuzuhaError {
  constructor(public readonly action: string, public readonly targetID: string, cause: unknown) {
    super('MODERATION_PARTIAL', `A ação ${action} foi realizada, mas o caso não foi salvo. Não repita a ação.`, { cause });
  }
}
