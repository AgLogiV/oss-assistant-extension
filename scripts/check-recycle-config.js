#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPT_DIR = __dirname;

const CHECKS = [
  {
    name: "Catalog sanity",
    script: "validate-recycle-catalog.js",
    args: []
  },
  {
    name: "Fixture compare",
    script: "export-recycle-config-fixture.js",
    args: ["--compare-fixture"]
  },
  {
    name: "Fixture validation",
    script: "validate-recycle-config-fixture.js",
    args: []
  },
  {
    name: "Fixture loader adapter",
    script: "load-recycle-config-fixture.js",
    args: []
  }
];

function runCheck(check) {
  const scriptPath = path.join(SCRIPT_DIR, check.script);
  console.log(`\n== ${check.name} ==`);
  console.log(`node Extension/scripts/${check.script}${check.args.length ? ` ${check.args.join(" ")}` : ""}`);

  const result = spawnSync(process.execPath, [scriptPath, ...check.args], {
    cwd: path.resolve(SCRIPT_DIR, "..", ".."),
    encoding: "utf8"
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error(`\nResult: FAIL`);
    console.error(`${check.name} failed to start: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nResult: FAIL`);
    console.error(`${check.name} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

function main() {
  console.log("Recycle config readiness checks");
  console.log("Mode: dev-only");

  CHECKS.forEach(runCheck);

  console.log("\nRecycle config readiness summary");
  console.log(`Checks passed: ${CHECKS.length}`);
  console.log("Result: PASS");
}

main();
