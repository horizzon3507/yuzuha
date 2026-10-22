export interface FunctionMetadata {
    name: string;
    aliases?: string[];
    usage: string;
    description: string;
    category: string;
    minArgs: number;
    maxArgs: number;
}
export interface Completion {
    name: string;
    usage: string;
    description: string;
    category: string;
    snippet: string;
    start: number;
    end: number;
}
export declare function complete(source: string, offset: number, definitions: readonly FunctionMetadata[]): Completion[];
export declare function signatureAt(source: string, offset: number, definitions: readonly FunctionMetadata[]): {
    usage: string;
    description: string;
    parameters: string[];
    activeParameter: number;
    start: number;
} | undefined;
export declare function hoverAt(source: string, offset: number, definitions: readonly FunctionMetadata[]): {
    usage: string;
    description: string;
    category: string;
    start: number;
    end: number;
} | undefined;
export interface TextPosition {
    offset: number;
    line: number;
    column: number;
}
export interface ScriptDiagnostic {
    code: 'SYNTAX' | 'UNKNOWN_FUNCTION' | 'ARITY' | 'SOURCE_LIMIT';
    severity: 'error';
    message: string;
    start: number;
    end: number;
    range: {
        start: TextPosition;
        end: TextPosition;
    };
}
export interface ScriptRegion {
    source: string;
    start: number;
    end: number;
    offset: number;
    closed: boolean;
    dynamic: boolean;
    /** Maps decoded UTF-16 boundaries back to the document. */
    offsets: number[];
    holes: {
        start: number;
        end: number;
    }[];
}
/** Tolerant syntax and metadata analysis; no function callbacks are invoked. */
export declare function diagnose(source: string, definitions: readonly FunctionMetadata[]): ScriptDiagnostic[];
/** Extracts JS/TS string contents without importing or running the document. */
export declare function scriptRegions(source: string, language: string): ScriptRegion[];
export declare function scriptRegion(source: string, offset: number, language: string): ScriptRegion | undefined;
export declare function documentOffset(region: ScriptRegion, offset: number): number;
export declare function documentDiagnostics(source: string, language: string, definitions: readonly FunctionMetadata[]): ScriptDiagnostic[];
/** A catalog is JSON data with the shape { version: 1, functions: [...] }. */
export declare function parseFunctionCatalog(source: string): FunctionMetadata[];
export declare function mergeFunctionCatalogs(...catalogs: (readonly FunctionMetadata[])[]): FunctionMetadata[];
//# sourceMappingURL=language.d.ts.map