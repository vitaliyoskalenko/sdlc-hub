// How core reads files without doing I/O itself. packages/git implements this over a working tree, a ref
// such as hub-state, or a team clone; tests use memorySource.

export interface FileSource {
  /** The text of a repository-relative file, or undefined when it does not exist. */
  read(path: string): string | undefined;
  /** Every file under a directory prefix (no trailing slash), as repository-relative paths, sorted. */
  list(prefix: string): string[];
  /** The git author of the commit that last changed the path, when known. */
  author?(path: string): string | undefined;
  /** How the files got here, when the source is a branch with history: for documents built on an older version. */
  history?: FileHistory;
}

/** The history of a branch, along its first parents: the times its merges landed. */
export interface FileHistory {
  /** When a file, or anything under a folder, last changed, ISO 8601. */
  changedAt(path: string): string | undefined;
  /** The text of a file as it was at a time, or undefined when it did not exist then. */
  readAt(path: string, at: string): string | undefined;
  /** When a file first landed. */
  firstAt(path: string): string | undefined;
}

/** Versions of a set of files in time order, for tests: each version lists the files it changed (null deletes one). */
export function memoryHistory(versions: { at: string; files: Record<string, string | null> }[]): FileHistory {
  const sorted = [...versions].sort((a, b) => a.at.localeCompare(b.at));
  const under = (path: string, p: string) => p === path || p.startsWith(`${path}/`);
  return {
    changedAt: (path) => sorted.filter((v) => Object.keys(v.files).some((p) => under(path, p))).at(-1)?.at,
    firstAt: (path) => sorted.find((v) => path in v.files)?.at,
    readAt(path, at) {
      let text: string | undefined;
      for (const v of sorted) if (v.at <= at && path in v.files) text = v.files[path] ?? undefined;
      return text;
    },
  };
}

export function memorySource(files: Record<string, string>, authors: Record<string, string> = {}): FileSource {
  const paths = Object.keys(files).sort();
  return {
    read: (path) => files[path],
    list: (prefix) => paths.filter((p) => p.startsWith(prefix === "" ? "" : `${prefix}/`)),
    author: (path) => authors[path],
  };
}
