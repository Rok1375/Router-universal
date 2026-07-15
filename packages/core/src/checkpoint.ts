import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TaskRun } from "../../contracts/src/index.js";
import { TaskRunSchema } from "../../contracts/src/index.js";

export interface CheckpointStore {
  save(run: TaskRun): Promise<void>;
  load(runId: string): Promise<TaskRun | undefined>;
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly runs = new Map<string, TaskRun>();

  async save(run: TaskRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }

  async load(runId: string): Promise<TaskRun | undefined> {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : undefined;
  }
}

export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly directory: string) {}

  async save(run: TaskRun): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const target = join(this.directory, `${run.id}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(run, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }

  async load(runId: string): Promise<TaskRun | undefined> {
    try {
      return TaskRunSchema.parse(JSON.parse(await readFile(join(this.directory, `${runId}.json`), "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
}
