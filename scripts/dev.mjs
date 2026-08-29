import { spawn } from "node:child_process";

const processes = [
  {
    name: "Next.js",
    child: spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], {
      env: process.env,
      stdio: "inherit",
    }),
  },
  {
    name: "Telegram worker",
    child: spawn(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "worker/main.ts"],
      { env: process.env, stdio: "inherit" },
    ),
  },
];

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const processInfo of processes) {
    if (processInfo.child.exitCode === null) processInfo.child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const exits = processes.map(
  (processInfo) =>
    new Promise((resolve) => {
      processInfo.child.once("exit", (code, signal) => resolve({ ...processInfo, code, signal }));
    }),
);

const firstExit = await Promise.race(exits);
if (!shuttingDown) {
  console.error(`${firstExit.name} kutilmaganda to‘xtadi.`);
  process.exitCode = firstExit.code || 1;
  shutdown("SIGTERM");
}

await Promise.all(exits);
