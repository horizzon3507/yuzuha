import { CLONE_TARGET, cloneValue } from '../../shared/clone.js';
import { StoreError } from '../../shared/errors.js';
import type { State } from '../../domain/state.js';
import {
  isPlainRecord,
  validateCases,
  validateCasesForGuild,
  validateExpiration,
  validateScheduleHistory,
  validateScheduleHistoryEntry,
  validateScheduleRecord,
  validateSchedules,
  validateVariableExpirations,
  validateVariables,
  validateVariableValue,
} from '../../domain/state-validation.js';

export const DRAFT_NODE = Symbol('yuzuha.draftNode');

type ObjectNode = {
  kind: 'object';
  base: Record<PropertyKey, unknown>;
  overlay: Record<PropertyKey, unknown>;
  deleted: Set<PropertyKey>;
  children: Map<PropertyKey, DraftNode>;
  dirty: boolean;
  dirtyKeys: Set<PropertyKey>;
  protoChanged: boolean;
  customProto: object | null;
  parent: DraftNode | undefined;
  parentKey: PropertyKey | undefined;
  proxy: Record<PropertyKey, unknown>;
};

type ArrayNode = {
  kind: 'array';
  base: unknown[];
  copy: unknown[] | undefined;
  children: Map<PropertyKey, DraftNode>;
  dirty: boolean;
  dirtyKeys: Set<PropertyKey>;
  protoChanged: boolean;
  parent: DraftNode | undefined;
  parentKey: PropertyKey | undefined;
  proxy: unknown[];
};

export type DraftNode = ObjectNode | ArrayNode;

export interface SlicePatch {
  updates: Map<string, unknown>;
  deletes: Set<string>;
  protoChanged: boolean;
  customProto: object | null;
}

export interface PendingCommit {
  topUpdates: Map<string, unknown>;
  topDeletes: Set<string>;
  protoChanged: boolean;
  customProto: object | null;
  mapPatches: Map<'variables' | 'variableExpirations' | 'cases', SlicePatch>;
  arrayItemPatches: Map<'schedules' | 'scheduleHistory', Map<number, unknown>>;
}

export interface UndoRecord {
  topPrev: Map<string, { had: boolean; value: unknown }>;
  protoPrev?: object | null;
  sliceEntries: Map<'variables' | 'variableExpirations' | 'cases', {
    slice: Record<string, unknown>;
    entries: Map<string, { had: boolean; value: unknown }>;
    protoChanged?: boolean;
    prevProto?: object | null;
  }>;
  arrayEntries: Map<'schedules' | 'scheduleHistory', {
    array: unknown[];
    entries: Map<number, unknown>;
  }>;
}

function invalidStateError(): StoreError {
  return new StoreError('STORE_INVALID', 'A transação produziu estado inválido; nenhuma alteração foi salva.');
}

export function getDraftNode(value: unknown): DraftNode | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return (value as { [DRAFT_NODE]?: DraftNode })[DRAFT_NODE];
}

function detachChild(node: ObjectNode, prop: PropertyKey): void {
  const existing = node.children.get(prop);
  if (existing) {
    existing.parent = undefined;
    existing.parentKey = undefined;
    node.children.delete(prop);
  }
}

function markDirty(node: DraftNode, key?: PropertyKey): void {
  if (key !== undefined) node.dirtyKeys.add(key);
  let curr: DraftNode | undefined = node;
  while (curr) {
    curr.dirty = true;
    if (curr.parent && curr.parentKey !== undefined) {
      curr.parent.dirtyKeys.add(curr.parentKey);
    }
    curr = curr.parent;
  }
}

function getObjectProto(node: ObjectNode): object | null {
  return node.protoChanged ? node.customProto : Object.getPrototypeOf(node.base);
}

function hasOwnInObjectDraft(node: ObjectNode, prop: PropertyKey): boolean {
  if (Object.hasOwn(node.overlay, prop)) return true;
  if (node.deleted.has(prop)) return false;
  return Object.hasOwn(node.base, prop);
}

function draftOwnKeys(node: ObjectNode): (string | symbol)[] {
  const overlayKeys = Reflect.ownKeys(node.overlay);
  if (node.deleted.size === 0 && overlayKeys.length === 0) {
    return Reflect.ownKeys(node.base);
  }
  const seen = new Set<string | symbol>();
  for (const k of Reflect.ownKeys(node.base)) {
    if (!node.deleted.has(k)) seen.add(k);
  }
  for (const k of overlayKeys) seen.add(k);
  return [...seen];
}

function getOrCreateChildProxy(parent: DraftNode, key: PropertyKey, raw: object): unknown {
  const existing = parent.children.get(key);
  if (existing) return existing.proxy;
  const child = createDraftNode(raw, parent, key);
  parent.children.set(key, child);
  return child.proxy;
}

function ensureArrayCopy(node: ArrayNode): unknown[] {
  if (node.copy !== undefined) return node.copy;
  const copy = node.base.slice();
  for (const [key, child] of node.children) {
    if (Object.hasOwn(copy, key)) {
      Reflect.set(copy, key, child.proxy);
    }
  }
  node.children.clear();
  node.copy = copy;
  return copy;
}

function createObjectNode(base: Record<PropertyKey, unknown>, parent?: DraftNode, parentKey?: PropertyKey): ObjectNode {
  const node: ObjectNode = {
    kind: 'object',
    base,
    overlay: Object.create(null) as Record<PropertyKey, unknown>,
    deleted: new Set(),
    children: new Map(),
    dirty: false,
    dirtyKeys: new Set(),
    protoChanged: false,
    customProto: null,
    parent,
    parentKey,
    proxy: undefined as unknown as Record<PropertyKey, unknown>,
  };

  node.proxy = new Proxy(base, {
    getPrototypeOf() {
      return getObjectProto(node);
    },
    setPrototypeOf(_target, proto) {
      node.protoChanged = true;
      node.customProto = proto;
      markDirty(node);
      return true;
    },
    has(target, prop) {
      if (Object.hasOwn(node.overlay, prop)) return true;
      if (node.deleted.has(prop)) return false;
      if (Object.hasOwn(target, prop)) return true;
      const proto = getObjectProto(node);
      return proto !== null && Reflect.has(proto, prop);
    },
    get(target, prop, receiver) {
      if (prop === DRAFT_NODE) return node;
      if (prop === CLONE_TARGET) return () => materializeReturnValue(node.proxy);
      if (Object.hasOwn(node.overlay, prop)) {
        return Reflect.get(node.overlay, prop, receiver);
      }
      if (node.deleted.has(prop)) {
        const proto = getObjectProto(node);
        return proto === null ? undefined : Reflect.get(proto, prop, receiver);
      }
      if (Object.hasOwn(target, prop)) {
        const raw = Reflect.get(target, prop, target);
        if (raw !== null && typeof raw === 'object') {
          return getOrCreateChildProxy(node, prop, raw);
        }
        return raw;
      }
      const proto = getObjectProto(node);
      return proto === null ? undefined : Reflect.get(proto, prop, receiver);
    },
    set(_target, prop, value, receiver) {
      if (receiver !== node.proxy) {
        return Reflect.defineProperty(receiver as object, prop, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      if (prop === '__proto__' && !hasOwnInObjectDraft(node, '__proto__') && getObjectProto(node) === Object.prototype) {
        if (value === null || typeof value === 'object') {
          node.protoChanged = true;
          node.customProto = value;
          markDirty(node);
        }
        return true;
      }
      if (Object.hasOwn(node.overlay, prop)) {
        const desc = Object.getOwnPropertyDescriptor(node.overlay, prop)!;
        if ('set' in desc || 'get' in desc) {
          if (desc.set) {
            desc.set.call(receiver, value);
            markDirty(node, prop);
            return true;
          }
          return false;
        }
        if (!desc.writable) return false;
        Object.defineProperty(node.overlay, prop, { ...desc, value });
        detachChild(node, prop);
        markDirty(node, prop);
        return true;
      }
      detachChild(node, prop);
      node.deleted.delete(prop);
      Object.defineProperty(node.overlay, prop, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      markDirty(node, prop);
      return true;
    },
    defineProperty(_target, prop, descriptor) {
      const ok = Reflect.defineProperty(node.overlay, prop, descriptor);
      if (ok) {
        detachChild(node, prop);
        node.deleted.delete(prop);
        markDirty(node, prop);
      }
      return ok;
    },
    deleteProperty(target, prop) {
      const desc = Object.hasOwn(node.overlay, prop) ? Object.getOwnPropertyDescriptor(node.overlay, prop) : undefined;
      if (desc && !desc.configurable) return false;
      Reflect.deleteProperty(node.overlay, prop);
      detachChild(node, prop);
      if (Object.hasOwn(target, prop)) node.deleted.add(prop);
      markDirty(node, prop);
      return true;
    },
    ownKeys() {
      return draftOwnKeys(node);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (Object.hasOwn(node.overlay, prop)) {
        return Object.getOwnPropertyDescriptor(node.overlay, prop);
      }
      if (node.deleted.has(prop)) return undefined;
      if (!Object.hasOwn(target, prop)) return undefined;
      const desc = Object.getOwnPropertyDescriptor(target, prop)!;
      if ('value' in desc && desc.value !== null && typeof desc.value === 'object') {
        return { ...desc, value: getOrCreateChildProxy(node, prop, desc.value as object) };
      }
      return desc;
    },
  });

  return node;
}

function createArrayNode(base: unknown[], parent?: DraftNode, parentKey?: PropertyKey): ArrayNode {
  const node: ArrayNode = {
    kind: 'array',
    base,
    copy: undefined,
    children: new Map(),
    dirty: false,
    dirtyKeys: new Set(),
    protoChanged: false,
    parent,
    parentKey,
    proxy: undefined as unknown as unknown[],
  };

  node.proxy = new Proxy(base, {
    getPrototypeOf(target) {
      return Reflect.getPrototypeOf(node.copy ?? target);
    },
    setPrototypeOf(_target, proto) {
      const copy = ensureArrayCopy(node);
      const ok = Reflect.setPrototypeOf(copy, proto);
      if (ok) {
        node.protoChanged = true;
        markDirty(node);
      }
      return ok;
    },
    has(target, prop) {
      return Reflect.has(node.copy ?? target, prop);
    },
    get(target, prop, receiver) {
      if (prop === DRAFT_NODE) return node;
      if (prop === CLONE_TARGET) return () => materializeReturnValue(node.proxy);
      if (node.copy !== undefined) {
        if (typeof prop === 'string' && prop !== 'length' && Object.hasOwn(node.copy, prop)) {
          const val = Reflect.get(node.copy, prop, node.copy);
          const idx = Number(prop);
          if (val !== null && typeof val === 'object'
            && Number.isInteger(idx) && idx >= 0 && String(idx) === prop
            && idx < node.base.length && val === node.base[idx] && !getDraftNode(val)) {
            const child = createDraftNode(val, node, prop);
            node.copy[idx] = child.proxy;
            return child.proxy;
          }
          return val;
        }
        return Reflect.get(node.copy, prop, receiver);
      }
      if (typeof prop === 'string' && prop !== 'length' && Object.hasOwn(target, prop)) {
        const raw = Reflect.get(target, prop, target);
        if (raw !== null && typeof raw === 'object') {
          return getOrCreateChildProxy(node, prop, raw);
        }
        return raw;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(_target, prop, value, receiver) {
      if (receiver !== node.proxy) {
        return Reflect.defineProperty(receiver as object, prop, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      const copy = ensureArrayCopy(node);
      const ok = Reflect.set(copy, prop, value, copy);
      if (ok) markDirty(node);
      return ok;
    },
    defineProperty(_target, prop, descriptor) {
      const copy = ensureArrayCopy(node);
      const ok = Reflect.defineProperty(copy, prop, descriptor);
      if (ok) markDirty(node);
      return ok;
    },
    deleteProperty(_target, prop) {
      const copy = ensureArrayCopy(node);
      const ok = Reflect.deleteProperty(copy, prop);
      if (ok) markDirty(node);
      return ok;
    },
    ownKeys(target) {
      return Reflect.ownKeys(node.copy ?? target);
    },
    getOwnPropertyDescriptor(target, prop) {
      const active = node.copy ?? target;
      const desc = Reflect.getOwnPropertyDescriptor(active, prop);
      if (!desc || prop === 'length' || !('value' in desc) || desc.value === null || typeof desc.value !== 'object') {
        return desc;
      }
      if (node.copy === undefined) {
        return { ...desc, value: getOrCreateChildProxy(node, prop, desc.value as object) };
      }
      const idx = typeof prop === 'string' ? Number(prop) : -1;
      if (typeof prop === 'string' && Number.isInteger(idx) && idx >= 0 && String(idx) === prop
        && idx < node.base.length && desc.value === node.base[idx] && !getDraftNode(desc.value)) {
        const child = createDraftNode(desc.value as object, node, prop);
        node.copy[idx] = child.proxy;
        return { ...desc, value: child.proxy };
      }
      return desc;
    },
  });

  return node;
}

function createDraftNode(raw: object, parent?: DraftNode, parentKey?: PropertyKey): DraftNode {
  if (Array.isArray(raw)) return createArrayNode(raw, parent, parentKey);
  return createObjectNode(raw as Record<PropertyKey, unknown>, parent, parentKey);
}

/** Creates a copy-on-write snapshot/draft view over a State object. */
export function createStateDraft(state: State): { root: ObjectNode; draft: State } {
  const root = createObjectNode(state as unknown as Record<PropertyKey, unknown>);
  return { root, draft: root.proxy as unknown as State };
}

function materializeDraftArray(node: ArrayNode, deep: boolean, visited: Map<object, unknown>): unknown[] {
  const source = node.copy ?? node.base;
  const out = new Array<unknown>(source.length);
  const proto = Object.getPrototypeOf(source);
  if (proto !== Array.prototype) Object.setPrototypeOf(out, proto);
  visited.set(node.proxy, out);

  for (const key of Reflect.ownKeys(source)) {
    if (key === 'length') continue;
    const desc = Object.getOwnPropertyDescriptor(source, key);
    if (!desc) continue;
    let raw: unknown;
    if ('value' in desc) {
      if (node.copy === undefined && node.children.has(key)) {
        raw = node.children.get(key)!.proxy;
      } else {
        raw = desc.value;
      }
      const nextVal = materializeInternal(raw, deep, visited);
      Object.defineProperty(out, key, { ...desc, value: nextVal });
    } else {
      Object.defineProperty(out, key, desc);
    }
  }
  return out;
}

function materializeDraftObject(node: ObjectNode, deep: boolean, visited: Map<object, unknown>): Record<PropertyKey, unknown> {
  const proto = getObjectProto(node);
  const out: Record<PropertyKey, unknown> = proto === Object.prototype ? {} : Object.create(proto);
  visited.set(node.proxy, out);

  for (const key of draftOwnKeys(node)) {
    let desc: PropertyDescriptor | undefined;
    if (Object.hasOwn(node.overlay, key)) {
      desc = Object.getOwnPropertyDescriptor(node.overlay, key);
    } else if (!node.deleted.has(key) && Object.hasOwn(node.base, key)) {
      desc = Object.getOwnPropertyDescriptor(node.base, key);
      if (desc && 'value' in desc && node.children.has(key)) {
        desc = { ...desc, value: node.children.get(key)!.proxy };
      }
    }
    if (!desc) continue;
    if ('value' in desc) {
      const nextVal = materializeInternal(desc.value, deep, visited);
      Object.defineProperty(out, key, { ...desc, value: nextVal });
    } else {
      Object.defineProperty(out, key, desc);
    }
  }
  return out;
}

function materializeInternal(value: unknown, deep: boolean, visited: Map<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') return value;

  const draftNode = getDraftNode(value);
  if (draftNode) {
    if (visited.has(value)) return visited.get(value);
    if (!deep && !draftNode.dirty) return draftNode.base;
    if (draftNode.kind === 'array') return materializeDraftArray(draftNode, deep, visited);
    return materializeDraftObject(draftNode, deep, visited);
  }

  if (visited.has(value)) return visited.get(value);

  if (Array.isArray(value)) {
    const out = new Array<unknown>(value.length);
    const proto = Object.getPrototypeOf(value);
    if (proto !== Array.prototype) Object.setPrototypeOf(out, proto);
    visited.set(value, out);
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') continue;
      const desc = Object.getOwnPropertyDescriptor(value, key);
      if (!desc) continue;
      if ('value' in desc) {
        Object.defineProperty(out, key, { ...desc, value: materializeInternal(desc.value, deep, visited) });
      } else {
        Object.defineProperty(out, key, desc);
      }
    }
    return out;
  }

  if (isPlainRecord(value)) {
    const proto = Object.getPrototypeOf(value);
    const out: Record<PropertyKey, unknown> = proto === Object.prototype ? {} : Object.create(proto);
    visited.set(value, out);
    for (const key of Reflect.ownKeys(value)) {
      const desc = Object.getOwnPropertyDescriptor(value, key);
      if (!desc) continue;
      if ('value' in desc) {
        Object.defineProperty(out, key, { ...desc, value: materializeInternal(desc.value, deep, visited) });
      } else {
        Object.defineProperty(out, key, desc);
      }
    }
    return out;
  }

  // Non-plain objects (Date, Map, RegExp, etc.): preserve as-is so read() can return them and validation rejects them.
  return value;
}

/**
 * Materializes any COW draft proxies reachable in a read/update return value into plain cloned JS objects/arrays.
 * Non-plain objects (Map, Set, Date, functions, custom classes) are left untouched outside draft nodes.
 */
export function materializeReturnValue<T>(value: T, visited = new Map<object, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;
  const draftNode = getDraftNode(value);
  if (draftNode) return materializeInternal(value, true, visited) as T;

  if (visited.has(value)) return visited.get(value) as T;

  if (Array.isArray(value)) {
    let changed = false;
    const out = new Array<unknown>(value.length);
    visited.set(value, out);
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) continue;
      const item = value[i];
      const next = materializeReturnValue(item, visited);
      if (next !== item) changed = true;
      out[i] = next;
    }
    if (!changed) {
      visited.delete(value);
      return value;
    }
    return out as unknown as T;
  }

  if (isPlainRecord(value)) {
    let changed = false;
    const proto = Object.getPrototypeOf(value);
    const out: Record<PropertyKey, unknown> = proto === Object.prototype ? {} : Object.create(proto);
    visited.set(value, out);
    for (const key of Reflect.ownKeys(value)) {
      const desc = Object.getOwnPropertyDescriptor(value, key);
      if (!desc) continue;
      if ('value' in desc) {
        const next = materializeReturnValue(desc.value, visited);
        if (next !== desc.value) changed = true;
        Object.defineProperty(out, key, { ...desc, value: next });
      } else {
        Object.defineProperty(out, key, desc);
      }
    }
    if (!changed) {
      visited.delete(value);
      return value;
    }
    return out as T;
  }

  return value;
}

function detachForCommit(value: unknown): unknown {
  return materializeInternal(value, false, new Map());
}

function readNodeRawValue(node: ObjectNode, key: string): unknown {
  if (Object.hasOwn(node.overlay, key)) return Reflect.get(node.overlay, key, node.proxy);
  if (node.deleted.has(key)) return undefined;
  if (node.children.has(key)) return node.children.get(key)!.proxy;
  if (Object.hasOwn(node.base, key)) return node.base[key];
  return undefined;
}

function buildMapSlicePatch(
  sliceNode: DraftNode,
  validateEntry: (key: string, value: unknown) => boolean,
): SlicePatch {
  if (sliceNode.kind !== 'object') throw invalidStateError();
  if (sliceNode.protoChanged && sliceNode.customProto !== Object.prototype && sliceNode.customProto !== null) {
    throw invalidStateError();
  }
  const updates = new Map<string, unknown>();
  const deletes = new Set<string>();
  for (const dirtyKey of sliceNode.dirtyKeys) {
    if (typeof dirtyKey !== 'string') continue;
    if (sliceNode.deleted.has(dirtyKey)) {
      deletes.add(dirtyKey);
      continue;
    }
    if (Object.hasOwn(sliceNode.overlay, dirtyKey)) {
      const mat = detachForCommit(Reflect.get(sliceNode.overlay, dirtyKey, sliceNode.proxy));
      if (!validateEntry(dirtyKey, mat)) throw invalidStateError();
      updates.set(dirtyKey, mat);
    } else if (sliceNode.children.has(dirtyKey)) {
      const child = sliceNode.children.get(dirtyKey)!;
      if (!child.dirty) continue;
      const mat = detachForCommit(child.proxy);
      if (!validateEntry(dirtyKey, mat)) throw invalidStateError();
      updates.set(dirtyKey, mat);
    }
  }
  return {
    updates,
    deletes,
    protoChanged: sliceNode.protoChanged,
    customProto: sliceNode.customProto,
  };
}

/**
 * Validates only the mutated slices/keys of the transaction draft and produces a rollback-safe PendingCommit.
 * Throws StoreError('STORE_INVALID') on any schema violation without mutating the underlying State.
 */
export function validateAndBuildCommit(root: ObjectNode): PendingCommit {
  if (root.protoChanged && root.customProto !== Object.prototype && root.customProto !== null) {
    throw invalidStateError();
  }
  if (root.deleted.has('schema') || root.deleted.has('variables')
    || root.deleted.has('cases') || root.deleted.has('schedules')) {
    throw invalidStateError();
  }

  const pending: PendingCommit = {
    topUpdates: new Map(),
    topDeletes: new Set(),
    protoChanged: root.protoChanged,
    customProto: root.customProto,
    mapPatches: new Map(),
    arrayItemPatches: new Map(),
  };

  for (const dirtyKey of root.dirtyKeys) {
    if (typeof dirtyKey !== 'string') continue;

    if (dirtyKey === 'schema') {
      const schemaVal = readNodeRawValue(root, 'schema');
      if (schemaVal !== 2) throw invalidStateError();
      pending.topUpdates.set('schema', 2);
      continue;
    }

    if (dirtyKey === 'variables') {
      if (Object.hasOwn(root.overlay, 'variables')) {
        const mat = detachForCommit(Reflect.get(root.overlay, 'variables', root.proxy));
        if (!validateVariables(mat)) throw invalidStateError();
        pending.topUpdates.set('variables', mat);
      } else if (root.children.has('variables')) {
        const sliceNode = root.children.get('variables')!;
        if (sliceNode.dirty) {
          pending.mapPatches.set('variables', buildMapSlicePatch(sliceNode, (_k, v) => validateVariableValue(v)));
        }
      }
      continue;
    }

    if (dirtyKey === 'variableExpirations') {
      if (root.deleted.has('variableExpirations')) {
        pending.topDeletes.add('variableExpirations');
      } else if (Object.hasOwn(root.overlay, 'variableExpirations')) {
        const mat = detachForCommit(Reflect.get(root.overlay, 'variableExpirations', root.proxy));
        if (!validateVariableExpirations(mat)) throw invalidStateError();
        pending.topUpdates.set('variableExpirations', mat);
      } else if (root.children.has('variableExpirations')) {
        const sliceNode = root.children.get('variableExpirations')!;
        if (sliceNode.dirty) {
          pending.mapPatches.set('variableExpirations', buildMapSlicePatch(sliceNode, (_k, v) => validateExpiration(v)));
        }
      }
      continue;
    }

    if (dirtyKey === 'cases') {
      if (Object.hasOwn(root.overlay, 'cases')) {
        const mat = detachForCommit(Reflect.get(root.overlay, 'cases', root.proxy));
        if (!validateCases(mat)) throw invalidStateError();
        pending.topUpdates.set('cases', mat);
      } else if (root.children.has('cases')) {
        const sliceNode = root.children.get('cases')!;
        if (sliceNode.dirty) {
          pending.mapPatches.set('cases', buildMapSlicePatch(sliceNode, (guildID, v) => validateCasesForGuild(guildID, v)));
        }
      }
      continue;
    }

    if (dirtyKey === 'schedules') {
      if (Object.hasOwn(root.overlay, 'schedules')) {
        const mat = detachForCommit(Reflect.get(root.overlay, 'schedules', root.proxy));
        if (!validateSchedules(mat)) throw invalidStateError();
        pending.topUpdates.set('schedules', mat);
      } else if (root.children.has('schedules')) {
        const schedNode = root.children.get('schedules')!;
        if (!schedNode.dirty) continue;
        if (schedNode.kind !== 'array') throw invalidStateError();
        if (schedNode.copy !== undefined || schedNode.protoChanged) {
          const mat = detachForCommit(schedNode.proxy);
          if (!validateSchedules(mat)) throw invalidStateError();
          pending.topUpdates.set('schedules', mat);
        } else {
          const items = new Map<number, unknown>();
          for (const idxKey of schedNode.dirtyKeys) {
            if (typeof idxKey !== 'string') continue;
            const child = schedNode.children.get(idxKey);
            if (!child || !child.dirty) continue;
            const idx = Number(idxKey);
            const matItem = detachForCommit(child.proxy);
            if (!validateScheduleRecord(matItem)) throw invalidStateError();
            items.set(idx, matItem);
          }
          if (items.size > 0) pending.arrayItemPatches.set('schedules', items);
        }
      }
      continue;
    }

    if (dirtyKey === 'scheduleHistory') {
      if (root.deleted.has('scheduleHistory')) {
        pending.topDeletes.add('scheduleHistory');
      } else if (Object.hasOwn(root.overlay, 'scheduleHistory')) {
        const mat = detachForCommit(Reflect.get(root.overlay, 'scheduleHistory', root.proxy));
        if (!validateScheduleHistory(mat)) throw invalidStateError();
        pending.topUpdates.set('scheduleHistory', mat);
      } else if (root.children.has('scheduleHistory')) {
        const histNode = root.children.get('scheduleHistory')!;
        if (!histNode.dirty) continue;
        if (histNode.kind !== 'array') throw invalidStateError();
        if (histNode.copy !== undefined || histNode.protoChanged) {
          const mat = detachForCommit(histNode.proxy);
          if (!validateScheduleHistory(mat)) throw invalidStateError();
          pending.topUpdates.set('scheduleHistory', mat);
        } else {
          const items = new Map<number, unknown>();
          for (const idxKey of histNode.dirtyKeys) {
            if (typeof idxKey !== 'string') continue;
            const child = histNode.children.get(idxKey);
            if (!child || !child.dirty) continue;
            const idx = Number(idxKey);
            const matItem = detachForCommit(child.proxy);
            if (!validateScheduleHistoryEntry(matItem)) throw invalidStateError();
            items.set(idx, matItem);
          }
          if (items.size > 0) pending.arrayItemPatches.set('scheduleHistory', items);
        }
      }
      continue;
    }

    if (root.deleted.has(dirtyKey)) {
      pending.topDeletes.add(dirtyKey);
    } else {
      const mat = detachForCommit(readNodeRawValue(root, dirtyKey));
      if (!validateVariableValue(mat)) throw invalidStateError();
      pending.topUpdates.set(dirtyKey, mat);
    }
  }

  return pending;
}

/** Creates an empty undo record for batch rollbacks. */
export function createUndoRecord(): UndoRecord {
  return {
    topPrev: new Map(),
    sliceEntries: new Map(),
    arrayEntries: new Map(),
  };
}

function recordTopUndo(stateRecord: Record<string, unknown>, key: string, undo?: UndoRecord): void {
  if (!undo || undo.topPrev.has(key)) return;
  undo.topPrev.set(key, {
    had: Object.hasOwn(stateRecord, key),
    value: Object.hasOwn(stateRecord, key) ? stateRecord[key] : undefined,
  });
}

/** Applies a validated PendingCommit to the target State in O(mutated entries). */
export function applyPendingCommit(state: State, pending: PendingCommit, undo?: UndoRecord): void {
  const stateRecord = state as unknown as Record<string, unknown>;

  if (pending.protoChanged) {
    if (undo && undo.protoPrev === undefined) undo.protoPrev = Object.getPrototypeOf(state);
    Object.setPrototypeOf(state, pending.customProto);
  }

  for (const key of pending.topDeletes) {
    recordTopUndo(stateRecord, key, undo);
    delete stateRecord[key];
  }

  for (const [key, value] of pending.topUpdates) {
    recordTopUndo(stateRecord, key, undo);
    Object.defineProperty(stateRecord, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  for (const [sliceName, patch] of pending.mapPatches) {
    const slice = stateRecord[sliceName] as Record<string, unknown>;
    let sliceUndo = undo?.sliceEntries.get(sliceName);
    if (undo && !sliceUndo) {
      sliceUndo = { slice, entries: new Map() };
      undo.sliceEntries.set(sliceName, sliceUndo);
    }
    if (patch.protoChanged) {
      if (sliceUndo && !sliceUndo.protoChanged) {
        sliceUndo.protoChanged = true;
        sliceUndo.prevProto = Object.getPrototypeOf(slice);
      }
      Object.setPrototypeOf(slice, patch.customProto);
    }
    for (const key of patch.deletes) {
      if (sliceUndo && !sliceUndo.entries.has(key)) {
        sliceUndo.entries.set(key, {
          had: Object.hasOwn(slice, key),
          value: Object.hasOwn(slice, key) ? slice[key] : undefined,
        });
      }
      delete slice[key];
    }
    for (const [key, value] of patch.updates) {
      if (sliceUndo && !sliceUndo.entries.has(key)) {
        sliceUndo.entries.set(key, {
          had: Object.hasOwn(slice, key),
          value: Object.hasOwn(slice, key) ? slice[key] : undefined,
        });
      }
      Object.defineProperty(slice, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }

  for (const [arrayName, items] of pending.arrayItemPatches) {
    const arr = stateRecord[arrayName] as unknown[];
    let arrUndo = undo?.arrayEntries.get(arrayName);
    if (undo && !arrUndo) {
      arrUndo = { array: arr, entries: new Map() };
      undo.arrayEntries.set(arrayName, arrUndo);
    }
    for (const [idx, value] of items) {
      if (arrUndo && !arrUndo.entries.has(idx)) {
        arrUndo.entries.set(idx, arr[idx]);
      }
      arr[idx] = value;
    }
  }
}

/** Restores State using an UndoRecord when a batched commit fails. */
export function rollbackUndoRecord(state: State, undo: UndoRecord): void {
  const stateRecord = state as unknown as Record<string, unknown>;

  if (undo.protoPrev !== undefined) {
    Object.setPrototypeOf(state, undo.protoPrev);
  }
  for (const [key, prev] of undo.topPrev) {
    if (!prev.had) {
      delete stateRecord[key];
    } else {
      Object.defineProperty(stateRecord, key, {
        value: prev.value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  for (const [, sliceUndo] of undo.sliceEntries) {
    const { slice, entries, protoChanged, prevProto } = sliceUndo;
    if (protoChanged) {
      Object.setPrototypeOf(slice, prevProto ?? Object.prototype);
    }
    for (const [key, prev] of entries) {
      if (!prev.had) {
        delete slice[key];
      } else {
        Object.defineProperty(slice, key, {
          value: prev.value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }
  }
  for (const [, arrUndo] of undo.arrayEntries) {
    for (const [idx, prev] of arrUndo.entries) {
      arrUndo.array[idx] = prev;
    }
  }
}

function createSliceCommitView(base: Record<string, unknown>, patch: SlicePatch): Record<string, unknown> {
  return new Proxy(base, {
    getPrototypeOf(target) {
      return patch.protoChanged ? patch.customProto : Object.getPrototypeOf(target);
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        if (patch.updates.has(prop)) return true;
        if (patch.deletes.has(prop)) return false;
      }
      return Reflect.has(target, prop);
    },
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        if (patch.updates.has(prop)) return patch.updates.get(prop);
        if (patch.deletes.has(prop)) {
          const proto = patch.protoChanged ? patch.customProto : Object.getPrototypeOf(target);
          return proto === null ? undefined : Reflect.get(proto, prop, receiver);
        }
      }
      return Reflect.get(target, prop, target);
    },
    ownKeys(target) {
      const seen = new Set<string | symbol>();
      for (const k of Reflect.ownKeys(target)) {
        if (typeof k !== 'string' || !patch.deletes.has(k)) seen.add(k);
      }
      for (const k of patch.updates.keys()) seen.add(k);
      return [...seen];
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === 'string') {
        if (patch.updates.has(prop)) {
          return { value: patch.updates.get(prop), writable: true, enumerable: true, configurable: true };
        }
        if (patch.deletes.has(prop)) return undefined;
      }
      return Object.getOwnPropertyDescriptor(target, prop);
    },
  });
}

function createArrayCommitView(base: unknown[], patches: Map<number, unknown>): unknown[] {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop !== 'length') {
        const idx = Number(prop);
        if (Number.isInteger(idx) && idx >= 0 && String(idx) === prop && patches.has(idx)) {
          return patches.get(idx);
        }
      }
      return Reflect.get(target, prop, receiver);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === 'string' && prop !== 'length') {
        const idx = Number(prop);
        if (Number.isInteger(idx) && idx >= 0 && String(idx) === prop && patches.has(idx)) {
          return { value: patches.get(idx), writable: true, enumerable: true, configurable: true };
        }
      }
      return Object.getOwnPropertyDescriptor(target, prop);
    },
  });
}

/** Creates an O(1) read-only Proxy view of the post-transaction State for subclasses overriding commit(). */
export function createCommitView(state: State, pending: PendingCommit): State {
  const base = state as unknown as Record<string, unknown>;
  const sliceViews = new Map<string, unknown>();

  const getPatchedSlice = (prop: string): unknown => {
    if (prop === 'variables' || prop === 'variableExpirations' || prop === 'cases') {
      const patch = pending.mapPatches.get(prop);
      if (!patch) return undefined;
      let cached = sliceViews.get(prop);
      if (!cached) {
        cached = createSliceCommitView(base[prop] as Record<string, unknown>, patch);
        sliceViews.set(prop, cached);
      }
      return cached;
    }
    if (prop === 'schedules' || prop === 'scheduleHistory') {
      const patch = pending.arrayItemPatches.get(prop);
      if (!patch) return undefined;
      let cached = sliceViews.get(prop);
      if (!cached) {
        cached = createArrayCommitView(base[prop] as unknown[], patch);
        sliceViews.set(prop, cached);
      }
      return cached;
    }
    return undefined;
  };

  const view: Record<string, unknown> = new Proxy(base, {
    getPrototypeOf(target) {
      return pending.protoChanged ? pending.customProto : Object.getPrototypeOf(target);
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        if (pending.topUpdates.has(prop)) return true;
        if (pending.topDeletes.has(prop)) return false;
      }
      return Reflect.has(target, prop);
    },
    get(target, prop, receiver) {
      if (prop === CLONE_TARGET) return () => cloneValue(materializeCommitState(state, pending));
      if (typeof prop === 'string') {
        if (pending.topUpdates.has(prop)) return pending.topUpdates.get(prop);
        if (pending.topDeletes.has(prop)) {
          const proto = pending.protoChanged ? pending.customProto : Object.getPrototypeOf(target);
          return proto === null ? undefined : Reflect.get(proto, prop, receiver);
        }
        const patched = getPatchedSlice(prop);
        if (patched !== undefined) return patched;
      }
      return Reflect.get(target, prop, target);
    },
    ownKeys(target) {
      const seen = new Set<string | symbol>();
      for (const k of Reflect.ownKeys(target)) {
        if (typeof k !== 'string' || !pending.topDeletes.has(k)) seen.add(k);
      }
      for (const k of pending.topUpdates.keys()) seen.add(k);
      return [...seen];
    },
    getOwnPropertyDescriptor(target, prop): PropertyDescriptor | undefined {
      if (typeof prop === 'string') {
        if (pending.topUpdates.has(prop)) {
          return { value: pending.topUpdates.get(prop), writable: true, enumerable: true, configurable: true };
        }
        if (pending.topDeletes.has(prop)) return undefined;
        const patched = getPatchedSlice(prop);
        if (patched !== undefined) {
          return {
            value: patched,
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
      }
      return Object.getOwnPropertyDescriptor(target, prop);
    },
  });

  return view as unknown as State;
}

function materializeCommitState(state: State, pending: PendingCommit): State {
  const cloned = structuredClone(state);
  applyPendingCommit(cloned, pending);
  return cloned;
}
