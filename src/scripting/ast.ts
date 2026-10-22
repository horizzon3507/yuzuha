export interface TextNode { kind: 'text'; value: string; offset: number }
export interface CallNode { kind: 'call'; name: string; args: Node[][]; offset: number }
export type Node = TextNode | CallNode;
export interface Program { source: string; file: string; nodes: Node[] }
