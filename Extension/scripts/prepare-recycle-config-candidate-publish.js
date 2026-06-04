#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const VALIDATOR_SCRIPT = path.join(__dirname, "validate-recycle-config-fixture.js");
const REVIEW_SCRIPT = path.join(__dirname, "review-recycle-config-candidate.js");
const MAX_CANDIDATE_BYTES = 1024 * 1024;
const CONFIG_CATALOG_GIT_PATH = "config/recycle-device-catalog.json";
const CONFIG_CATALOG_PATH = path.join("config", "recycle-device-catalog.json");
const PUBLIC_VALIDATOR_GIT_PATH = ".github/validate-static-package.js";
const PUBLIC_VALIDATOR_PATH = path.join(".github", "validate-static-package.js");

function fail(message, details) {
  console.error(`ERROR: ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    inputPath: "",
    configRepo: "",
    acceptReviewRequired: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail("--input requires a candidate JSON file");
      options.inputPath = value;
      index += 1;
    } else if (arg === "--config-repo") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail("--config-repo requires a path to oss-assistant-config");
      options.configRepo = value;
      index += 1;
    } else if (arg === "--accept-review-required") {
      options.acceptReviewRequired = true;
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  if (!options.inputPath || !options.configRepo) {
    fail("Usage: node Extension/scripts/prepare-recycle-config-candidate-publish.js --input <candidate.json> --config-repo <path/to/oss-assistant-config> [--accept-review-required]");
  }

  options.inputPath = path.resolve(process.cwd(), options.inputPath);
  options.configRepo = path.resolve(process.cwd(), options.configRepo);
  return options;
}

function normalizePath(filePath) {
  return path.normalize(filePath);
}

function toDisplayPath(filePath) {
  const relative = path.relative(REPO_ROOT, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.split(path.sep).join("/")
    : filePath;
}

function isSameOrInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function realPath(filePath) {
  return fs.realpathSync.native ? fs.realpathSync.native(filePath) : fs.realpathSync(filePath);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: "utf8",
    shell: false,
    maxBuffer: options.maxBuffer || 1024 * 1024 * 16
  });

  return {
    status: result.status,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error ? result.error.message : ""
  };
}

function runRequiredCommand(command, args, options = {}) {
  const result = runCommand(command, args, options);
  if (result.error) {
    fail(`Cannot run ${command}: ${result.error}`);
  }
  if (result.status !== 0) {
    fail(options.failureMessage || `${command} ${args.join(" ")} failed with exit code ${result.status}`, formatCommandOutput(result));
  }
  return result;
}

function formatCommandOutput(result) {
  const sections = [];
  if (result.stdout.trim()) sections.push(result.stdout.trim());
  if (result.stderr.trim()) sections.push(result.stderr.trim());
  return sections.join("\n");
}

function validateCandidatePath(inputPath, configRepo) {
  if (!fs.existsSync(inputPath)) fail(`Candidate file does not exist: ${inputPath}`);
  const candidateStat = fs.statSync(inputPath);
  if (!candidateStat.isFile()) fail(`Candidate path is not a file: ${inputPath}`);
  if (path.extname(inputPath).toLowerCase() !== ".json") fail("Candidate file must use a .json extension");
  if (candidateStat.size > MAX_CANDIDATE_BYTES) fail(`Candidate file is larger than ${MAX_CANDIDATE_BYTES} bytes`);

  try {
    JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    fail(`Candidate file is not valid JSON: ${error.message}`);
  }

  const candidateRealPath = realPath(inputPath);
  const repoRealPath = realPath(REPO_ROOT);
  const configRepoRealPath = realPath(configRepo);
  if (isSameOrInside(repoRealPath, candidateRealPath)) {
    fail("Candidate file must be outside the private extension repo");
  }
  if (isSameOrInside(configRepoRealPath, candidateRealPath)) {
    fail("Candidate file must be outside the oss-assistant-config repo");
  }
}

function validateConfigRepo(configRepo) {
  if (!fs.existsSync(configRepo) || !fs.statSync(configRepo).isDirectory()) {
    fail(`Config repo path is not a directory: ${configRepo}`);
  }

  const topLevel = runRequiredCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd: configRepo,
    failureMessage: "Config repo path is not a git repository"
  }).stdout.trim();

  if (normalizePath(realPath(topLevel)) !== normalizePath(realPath(configRepo))) {
    fail(`--config-repo must point to the oss-assistant-config repository root: ${configRepo}`);
  }

  const catalogPath = path.join(configRepo, CONFIG_CATALOG_PATH);
  const publicValidatorPath = path.join(configRepo, PUBLIC_VALIDATOR_PATH);
  if (!fs.existsSync(catalogPath)) fail(`Missing ${CONFIG_CATALOG_GIT_PATH} in config repo`);
  if (!fs.existsSync(publicValidatorPath)) fail(`Missing ${PUBLIC_VALIDATOR_GIT_PATH} in config repo`);

  const origin = runRequiredCommand("git", ["remote", "get-url", "origin"], {
    cwd: configRepo,
    failureMessage: "Config repo must have an origin remote"
  }).stdout.trim();

  if (!origin.includes("oss-assistant/oss-assistant-config")) {
    fail(`Config repo origin must point to oss-assistant/oss-assistant-config, got: ${origin}`);
  }

  const status = runRequiredCommand("git", ["status", "--short"], {
    cwd: configRepo,
    failureMessage: "Cannot read config repo status"
  }).stdout.trim();

  if (status) {
    fail("Config repo must be clean before copying candidate", status);
  }
}

function runPrivateValidation(inputPath) {
  const result = runCommand(process.execPath, [VALIDATOR_SCRIPT, "--input", inputPath], { cwd: REPO_ROOT });
  if (result.error) fail(`Cannot run candidate validator: ${result.error}`);
  if (result.status !== 0) {
    fail("Candidate validator failed before copy", formatCommandOutput(result));
  }
  return result;
}

function runPrivateReview(inputPath, acceptReviewRequired) {
  const result = runCommand(process.execPath, [REVIEW_SCRIPT, "--input", inputPath], { cwd: REPO_ROOT });
  if (result.error) fail(`Cannot run candidate review: ${result.error}`);

  const output = formatCommandOutput(result);
  const pass = result.status === 0 && result.stdout.includes("Result: PASS");
  const reviewRequired = result.status !== 0 && result.stdout.includes("Result: REVIEW_REQUIRED");

  if (pass) {
    return { result, status: "PASS", acceptedReviewRequired: false };
  }

  if (reviewRequired) {
    if (!acceptReviewRequired) {
      fail("Candidate review returned REVIEW_REQUIRED. Human review is required before copying. Re-run with --accept-review-required only after explicit acceptance.", output);
    }
    return { result, status: "REVIEW_REQUIRED", acceptedReviewRequired: true };
  }

  fail("Candidate review failed unexpectedly before copy", output);
}

function copyCandidate(inputPath, configRepo) {
  const targetPath = path.join(configRepo, CONFIG_CATALOG_PATH);
  fs.copyFileSync(inputPath, targetPath);
  return targetPath;
}

function runPublicChecks(configRepo) {
  const publicValidator = runRequiredCommand(process.execPath, [path.join(configRepo, PUBLIC_VALIDATOR_PATH)], {
    cwd: configRepo,
    failureMessage: "Public static package validator failed"
  });

  const diffStat = runRequiredCommand("git", ["diff", "--stat"], {
    cwd: configRepo,
    failureMessage: "git diff --stat failed"
  });
  const diffCheck = runRequiredCommand("git", ["diff", "--check"], {
    cwd: configRepo,
    failureMessage: "git diff --check failed"
  });
  const catalogDiff = runRequiredCommand("git", ["diff", "--", CONFIG_CATALOG_GIT_PATH], {
    cwd: configRepo,
    failureMessage: `git diff -- ${CONFIG_CATALOG_GIT_PATH} failed`
  });
  const changedFiles = runRequiredCommand("git", ["diff", "--name-only"], {
    cwd: configRepo,
    failureMessage: "git diff --name-only failed"
  }).stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const unexpectedChanges = changedFiles.filter(filePath => filePath !== CONFIG_CATALOG_GIT_PATH);
  if (unexpectedChanges.length) {
    fail(`Unexpected content changes after copy: ${unexpectedChanges.join(", ")}`);
  }

  return { publicValidator, diffStat, diffCheck, catalogDiff, changedFiles };
}

function printSection(title, content) {
  console.log("");
  console.log(`${title}:`);
  const text = String(content || "").trim();
  console.log(text || "- none");
}

function main() {
  const options = parseArgs(process.argv);
  validateConfigRepo(options.configRepo);
  validateCandidatePath(options.inputPath, options.configRepo);

  console.log("Prepare recycle config candidate publish");
  console.log("");
  console.log(`Mode: no-commit/no-push`);
  console.log(`Candidate: ${options.inputPath}`);
  console.log(`Config repo: ${options.configRepo}`);

  const validation = runPrivateValidation(options.inputPath);
  console.log("");
  console.log("Candidate validator: PASS");

  const review = runPrivateReview(options.inputPath, options.acceptReviewRequired);
  console.log(`Candidate review: ${review.status}${review.acceptedReviewRequired ? " (accepted by flag)" : ""}`);

  const targetPath = copyCandidate(options.inputPath, options.configRepo);
  console.log(`Copied candidate to: ${toDisplayPath(targetPath)}`);

  const publicChecks = runPublicChecks(options.configRepo);
  console.log("Public static package validator: PASS");

  const publishNeeded = publicChecks.changedFiles.length > 0;
  console.log("");
  console.log(`Changed files: ${publishNeeded ? publicChecks.changedFiles.join(", ") : "(none)"}`);
  console.log(`Publish needed: ${publishNeeded ? "yes" : "no"}`);

  printSection("git diff --stat", publicChecks.diffStat.stdout);
  printSection(`git diff -- ${CONFIG_CATALOG_GIT_PATH}`, publicChecks.catalogDiff.stdout);

  if (publishNeeded) {
    console.log("");
    console.log("Next manual commands:");
    console.log(`git add ${CONFIG_CATALOG_GIT_PATH}`);
    console.log(`git commit -m "Update recycle device catalog"`);
    console.log(`git push origin main`);
  } else {
    console.log("");
    console.log("No content diff was produced. No publish is needed.");
  }

  // Keep these references visible for debugging when output is redirected.
  void validation;
  void review;
}

main();
