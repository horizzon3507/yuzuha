export class TransactionQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(job: () => Promise<T>): Promise<T> {
    const next = this.tail.then(job);
    this.tail = next.catch(() => {});
    return next;
  }
}
