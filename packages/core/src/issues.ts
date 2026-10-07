// Problems are values, never thrown, so the site can show "ignored malformed record" and keep working.

export type IssueLevel = "error" | "warning";

export interface Issue {
  level: IssueLevel;
  /** Repository-relative path of the file the issue is about. */
  file: string;
  /** 1-based line, when the issue can be placed. */
  line?: number;
  /** Dotted path inside the file, such as `teams.0.id`. */
  path?: string;
  message: string;
}

export interface Result<T> {
  /** Present when the input is usable. Warnings may still be listed. */
  value?: T;
  issues: Issue[];
}

export const hasErrors = (issues: readonly Issue[]): boolean => issues.some((i) => i.level === "error");
