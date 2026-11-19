#!/usr/bin/env node

// `node scripts/vp/run.ts <args…>` is `vp run <args…>` with `VP_RUN_CONCURRENCY_LIMIT` set from the
// machine, and `VITEST_MAX_WORKERS` from that (see concurrency.ts). The root `build`, `test` and
// `clean` scripts go through it.
//
// Spawns `node_modules/vite-plus/bin/vp` under the current `node` directly: `vite-plus` is a root
// devDependency, so it is always there, and this is shell-free (Windows-safe) and skips the ~0.33s of
// `pnpm exec` startup the repo avoids elsewhere (bin-entry.ts). `resolveBinEntry` can't be used for
// it because it keys the `bin` map on the package name, and `vite-plus`'s has no `vite-plus` entry.
//
// Arguments are forwarded verbatim, even when the hosted router build selects a deployment
// config. `--concurrency-limit N` and `--parallel` still work if passed, since vite-task
// gives a flag priority over the env var; in that case the note is suppressed, because it would
// announce a number the run is not using (concurrency.ts).

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { relayTermination } from "../relay-termination.ts";
import { vpRunEnv } from "./concurrency.ts";

// Three hops: scripts/vp → scripts → repo root, where `vite-plus` is a devDependency.
const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const VP = join(ROOT, "node_modules", "vite-plus", "bin", "vp");

const vpArgs = process.argv.slice(2);
const env = vpRunEnv({ vpArgs });

// Workers Builds can override the Worker name, but that leaves the local router's bindings
// in place. The deployment redirect selects the hosted router config for this Worker.
if (vpArgs.at(-1) === "build" && process.env.WRANGLER_CI_OVERRIDE_NAME === "mizanconsult") {
  const deployDir = join(ROOT, ".wrangler", "deploy");
  mkdirSync(deployDir, { recursive: true });
  writeFileSync(join(deployDir, "config.json"),
      JSON.stringify({ configPath: "../../wrangler.mizanconsult.jsonc" }) + "\n");
  console.log("Workers Builds: selected wrangler.mizanconsult.jsonc for mizanconsult.");
  env.VITE_CF_ACCESS_MODE ??= "true";
}

const child = spawn(process.execPath, [VP, "run", ...vpArgs],
    { stdio: "inherit", env });

relayTermination(child);
