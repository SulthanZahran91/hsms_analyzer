#!/usr/bin/env bun
// Verify Arrow response from backend
// Usage: bun run scripts/verify_arrow.ts http://localhost:8080 <session_id>

import { tableFromIPC } from "apache-arrow";

const [, , base, sid] = process.argv;

if (!base || !sid) {
  console.error("Usage: bun run scripts/verify_arrow.ts <base_url> <session_id>");
  process.exit(1);
}

const url = `${base}/sessions/${sid}/messages.arrow?limit=50000`;
console.log(`Fetching: ${url}`);

try {
  const resp = await fetch(url, {
    headers: { Accept: "application/vnd.apache.arrow.stream" },
  });

  if (!resp.ok) {
    console.error(`HTTP ${resp.status}: ${await resp.text()}`);
    process.exit(1);
  }

  const buf = new Uint8Array(await resp.arrayBuffer());
  const table = tableFromIPC(buf);

  console.log("✓ Arrow data received");
  console.log(`  Rows: ${table.numRows}`);
  console.log(`  Columns: ${table.schema.fields.map((f) => f.name).join(", ")}`);

  // Display first few rows
  if (table.numRows > 0) {
    console.log("\nFirst 3 rows:");
    for (let i = 0; i < Math.min(3, table.numRows); i++) {
      const row = table.get(i);
      console.log(`  Row ${i}:`, row?.toJSON());
    }
  }

  console.log("\n✓ verify_arrow.ts completed successfully");
} catch (error) {
  console.error("✗ Error:", error);
  process.exit(1);
}

