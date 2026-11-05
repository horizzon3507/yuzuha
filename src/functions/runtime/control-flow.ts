const frames = new WeakMap<object, object>();

export function loopFrame(context: object): object | undefined { return frames.get(context); }
export function setLoopFrame(context: object, frame: object | undefined): void {
  if (frame) frames.set(context, frame);
  else frames.delete(context);
}

export class LoopControl extends Error {
  constructor(readonly frame: object, readonly action: 'break' | 'continue') {
    super(action);
  }
}
