import { deploymentProblems } from "../lib/deployment/config.ts";

const problems = deploymentProblems(process.env);
if (Number(process.versions.node.split(".")[0]) < 24)
  problems.push("Node.js 24 or newer is required");

if (problems.length) {
  console.error("Deployment configuration is incomplete:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log("Deployment environment check passed. No credential values were printed.");
  console.log("Still verify Atlas permissions, deployed Eve Workflow and the browser smoke test.");
}
