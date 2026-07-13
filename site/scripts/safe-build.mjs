import { runSafeBuild, SafeBuildError } from "./safe-build-lib.mjs";

try {
  runSafeBuild();
  console.log("Standalone runtime-data gate passed.");
} catch (error) {
  console.error(`Build rejected: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = error instanceof SafeBuildError ? error.exitCode : 1;
}
