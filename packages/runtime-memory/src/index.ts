export interface RuntimeMemorySection {
  readonly sectionId: string;
  readonly generatedAt: string;
  readonly sourceFingerprint: string;
}

export interface LongTermMemoryScope {
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
}

export const runtimeMemoryStatus = "mempalace-derived-index-adapter-v1";
