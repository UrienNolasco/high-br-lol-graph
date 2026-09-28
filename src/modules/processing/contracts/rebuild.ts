export interface RebuildUseCase {
  run(
    resume?: boolean,
    progress?: (completed: number) => void,
  ): Promise<number>;
}

export const REBUILD_USE_CASE = Symbol('processing.rebuild');
