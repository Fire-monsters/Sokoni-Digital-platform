import type { PublicWorkspaceContext } from "@sokoni-digital/domain";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      publicWorkspace?: PublicWorkspaceContext;
    }
  }
}

export type { PublicWorkspaceContext };
