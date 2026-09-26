export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  /** Stable machine-readable code, e.g. `undefined-ref`. */
  code: string;
  message: string;
  /** Macro the diagnostic belongs to, if any. */
  macro?: string;
  /** Path into the DSL document, e.g. `['macros', 'heal', 'fields', 'title']`. */
  path?: (string | number)[];
  /** Character offsets into the DSL source (filled in by the loader when known). */
  from?: number;
  to?: number;
  /** 1-based line / column of `from`. */
  line?: number;
  col?: number;
}
