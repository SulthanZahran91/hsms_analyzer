#!/usr/bin/env bun
// End-to-end smoke test: upload → meta → window → search
// Usage: bun run scripts/smoke_e2e.ts http://localhost:8080 fixtures/event_flood.ndjson

const [, , base, filePath] = process.argv;

if (!base || !filePath) {
  console.error("Usage: bun run scripts/smoke_e2e.ts <base_url> <fixture_path>");
  process.exit(1);
}

console.log("Starting E2E smoke test...\n");

try {
  // 1. Upload file
  console.log("1. Uploading file:", filePath);
  const file = Bun.file(filePath);
  const fileBuffer = await file.arrayBuffer();
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), filePath.split("/").pop() || "file");

  let resp = await fetch(`${base}/sessions`, {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) {
    console.error(`✗ Upload failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }

  const { session_id } = await resp.json();
  console.log(`   ✓ Session created: ${session_id}\n`);

  // 2. Get metadata
  console.log("2. Fetching metadata");
  resp = await fetch(`${base}/sessions/${session_id}/meta`);

  if (!resp.ok) {
    console.error(`✗ Meta fetch failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }

  const meta = await resp.json();
  console.log("   ✓ Metadata:", JSON.stringify(meta, null, 2), "\n");

  // 3. Get messages window
  console.log("3. Fetching messages window");
  resp = await fetch(`${base}/sessions/${session_id}/messages.arrow?limit=50000`, {
    headers: { Accept: "application/vnd.apache.arrow.stream" },
  });

  if (!resp.ok) {
    console.error(`✗ Messages fetch failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }

  const windowBytes = (await resp.arrayBuffer()).byteLength;
  console.log(`   ✓ Window bytes: ${windowBytes}\n`);

  // 4. Search with filter
  console.log("4. Searching with filter (s=[6], f=[11])");
  resp = await fetch(`${base}/sessions/${session_id}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ s: [6], f: [11], dir: 0, ceid: [] }),
  });

  if (!resp.ok) {
    console.error(`✗ Search failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }

  const searchBytes = (await resp.arrayBuffer()).byteLength;
  console.log(`   ✓ Search result bytes: ${searchBytes}\n`);

  // 5. Get a payload
  if (meta.row_count > 0) {
    console.log("5. Fetching payload for row_id=0");
    resp = await fetch(`${base}/sessions/${session_id}/payload/0`);

    if (!resp.ok) {
      console.error(`✗ Payload fetch failed: ${resp.status} ${await resp.text()}`);
      process.exit(1);
    }

    const payload = await resp.json();
    console.log("   ✓ Payload:", JSON.stringify(payload, null, 2).substring(0, 200), "...\n");
  }

  // 6. Delete session
  console.log("6. Deleting session");
  resp = await fetch(`${base}/sessions/${session_id}`, {
    method: "DELETE",
  });

  if (!resp.ok) {
    console.error(`✗ Delete failed: ${resp.status} ${await resp.text()}`);
    process.exit(1);
  }

  console.log("   ✓ Session deleted\n");

  console.log("✓✓✓ All smoke tests passed! ✓✓✓");
} catch (error) {
  console.error("✗ Error:", error);
  process.exit(1);
}

