// Host words, in one place (CLAUDE.md: "Keep host words in one adapter").

export interface HostWords {
  name: string;
  changeRequest: string;
  changeRequests: string;
  sign: string;
  namespace: string;
  cli: string;
  pipeline: string;
}

export const WORDS: Record<"gitlab" | "github", HostWords> = {
  gitlab: { name: "GitLab", changeRequest: "merge request", changeRequests: "merge requests", sign: "!", namespace: "group", cli: "glab", pipeline: "pipeline" },
  github: { name: "GitHub", changeRequest: "pull request", changeRequests: "pull requests", sign: "#", namespace: "organization", cli: "gh", pipeline: "workflow run" },
};
