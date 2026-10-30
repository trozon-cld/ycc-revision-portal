// Browser only: hands a built zip to the browser as a download.
export function saveFile(fileName: string, zip: Uint8Array) {
  const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked a moment later so the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
