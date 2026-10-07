// How core reads files without doing I/O itself. packages/git implements this over a working tree, a ref
// such as hub-state, or a team clone; tests use memorySource.

export interface FileSource {
  /** The text of a repository-relative file, or undefined when it does not exist. */
  read(path: string): string | undefined;
  /** Every file under a directory prefix (no trailing slash), as repository-relative paths, sorted. */
  list(prefix: string): string[];
  /** The git author of the commit that last changed the path, when known. */
  author?(path: string): string | undefined;
}

export function memorySource(files: Record<string, string>, authors: Record<string, string> = {}): FileSource {
  const paths = Object.keys(files).sort();
  return {
    read: (path) => files[path],
    list: (prefix) => paths.filter((p) => p.startsWith(prefix === "" ? "" : `${prefix}/`)),
    author: (path) => authors[path],
  };
}
