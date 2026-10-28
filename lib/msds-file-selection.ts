// Snapshot the native FileList before resetting the picker. Its contents may
// change when input.value is cleared, while analysis starts asynchronously.
export function takeMsdsFiles(input: Pick<HTMLInputElement, "files" | "value">): File[] {
  const files = Array.from(input.files ?? []);
  input.value = "";
  return files;
}
