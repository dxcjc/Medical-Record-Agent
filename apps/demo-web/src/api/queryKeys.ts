const medicalQueryRoot = ["medical-record-agent"] as const;

export const medicalQueryKeys = {
  all: medicalQueryRoot,
  dashboard: {
    all: () => [...medicalQueryRoot, "dashboard"] as const,
    runtime: (baseUrl: string) => [...medicalQueryRoot, "dashboard", "runtime", baseUrl] as const
  },
  recognition: {
    all: () => [...medicalQueryRoot, "recognition"] as const,
    jobs: () => [...medicalQueryRoot, "recognition", "jobs"] as const,
    job: (jobId: string) => [...medicalQueryRoot, "recognition", "jobs", jobId] as const,
    result: (jobId: string) => [...medicalQueryRoot, "recognition", "results", jobId] as const
  },
  schema: {
    all: () => [...medicalQueryRoot, "schema"] as const,
    versions: () => [...medicalQueryRoot, "schema", "versions"] as const,
    compare: (schemaKey: string, left: string, right: string) =>
      [...medicalQueryRoot, "schema", "compare", schemaKey, left, right] as const
  },
  operations: {
    providers: () => [...medicalQueryRoot, "operations", "providers"] as const,
    writebackEligible: (limit: number) => [...medicalQueryRoot, "operations", "writeback", "eligible", limit] as const,
    audit: () => [...medicalQueryRoot, "operations", "audit"] as const
  },
  evaluation: {
    datasets: () => [...medicalQueryRoot, "evaluation", "datasets"] as const,
    runs: (datasetId?: string) => [...medicalQueryRoot, "evaluation", "runs", datasetId ?? "all"] as const,
    metrics: (runId: string) => [...medicalQueryRoot, "evaluation", "metrics", runId] as const
  }
};

export type MedicalQueryKeys = typeof medicalQueryKeys;
