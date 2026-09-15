/**
 * Dropped folders arrive as FileSystemEntry trees, not flat File lists. Walk
 * them into Files. Typed structurally so tests can pass plain fakes.
 */

export interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface FileEntryLike extends EntryLike {
  file: (success: (file: File) => void, error?: (err: unknown) => void) => void;
}

interface DirectoryEntryLike extends EntryLike {
  createReader: () => {
    readEntries: (
      success: (entries: EntryLike[]) => void,
      error?: (err: unknown) => void,
    ) => void;
  };
}

const readAllEntries = (directory: DirectoryEntryLike): Promise<EntryLike[]> => {
  const reader = directory.createReader();
  const all: EntryLike[] = [];
  return new Promise((resolve, reject) => {
    const readBatch = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        readBatch();
      }, reject);
    readBatch();
  });
};

export const filesFromEntries = async (entries: EntryLike[]): Promise<File[]> => {
  const files: File[] = [];
  for (const entry of entries) {
    if (entry.isFile) {
      files.push(
        await new Promise<File>((resolve, reject) =>
          (entry as FileEntryLike).file(resolve, reject),
        ),
      );
    } else if (entry.isDirectory) {
      files.push(
        ...(await filesFromEntries(await readAllEntries(entry as DirectoryEntryLike))),
      );
    }
  }
  return files;
};

export const filesFromDataTransfer = async (
  dataTransfer: DataTransfer,
): Promise<File[]> => {
  // DataTransfer items become unusable after the first await — collect entries now.
  const entries = Array.from(dataTransfer.items ?? [])
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length > 0) {
    return filesFromEntries(entries as unknown as EntryLike[]);
  }
  return Array.from(dataTransfer.files);
};
