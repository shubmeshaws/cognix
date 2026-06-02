export class ClusterNotFoundError extends Error {
  constructor() {
    super("Cluster not found");
    this.name = "ClusterNotFoundError";
  }
}

export class ClusterDuplicateNameError extends Error {
  constructor(name: string) {
    super(
      `A cluster named "${name}" is already connected. Remove it first or use a different name.`,
    );
    this.name = "ClusterDuplicateNameError";
  }
}
