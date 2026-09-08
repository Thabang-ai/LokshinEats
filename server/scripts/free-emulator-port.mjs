/**
 * Release the emulator ports before starting a new run.
 *
 * `firebase emulators:exec` stops the emulators by sending SIGINT. On Windows
 * the Firestore emulator's JVM frequently survives that, so the next run
 * fails with "port taken" and the suite appears broken on every second
 * invocation.
 *
 * This kills only a process it has positively identified as a Firebase
 * emulator, by reading its command line. Anything else listening on the port
 * — a dev server, another database — is reported and left alone, because
 * silently killing whatever holds a common port like 8080 is far worse than a
 * failed test run.
 *
 * Usage: node scripts/free-emulator-port.mjs 8080 9099
 */

import { execFileSync } from 'node:child_process';

const PORTS = process.argv
  .slice(2)
  .map((value) => Number(value))
  .filter((port) => Number.isInteger(port) && port > 0);

if (PORTS.length === 0) PORTS.push(8080);

/**
 * A command line must match one of these to be considered an emulator.
 *
 * The Firestore emulator is a JVM running a named jar. The Auth emulator runs
 * inside the firebase-tools CLI process, which has no jar to look for, so it
 * is matched on the CLI's own emulator invocation instead. Both patterns are
 * specific enough that an unrelated process will not match by accident.
 */
const EMULATOR_PATTERNS = [
  /cloud-firestore-emulator/i,
  /firebase.*emulators:(exec|start)/i,
];

/** Run a command and return stdout, or null if it fails. */
function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/** Process ids listening on `port`. */
function findListeners(port) {
  if (process.platform === 'win32') {
    const output = run('netstat', ['-ano', '-p', 'TCP']) ?? '';
    const pids = new Set();

    for (const line of output.split(/\r?\n/)) {
      // "  TCP    127.0.0.1:8080   0.0.0.0:0   LISTENING   1234"
      const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
      if (match && Number(match[1]) === port) pids.add(Number(match[2]));
    }

    return [...pids];
  }

  const output = run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']) ?? '';
  return output
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

/** The full command line for a pid, so we can confirm what it is. */
function commandLineFor(pid) {
  if (process.platform === 'win32') {
    const output = run('powershell', [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | ` +
        'Select-Object -ExpandProperty CommandLine',
    ]);
    return output ?? '';
  }

  return run('ps', ['-p', String(pid), '-o', 'command=']) ?? '';
}

function kill(pid) {
  if (process.platform === 'win32') {
    run('taskkill', ['/PID', String(pid), '/F']);
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

// One process can serve several emulator ports, so track what we have already
// killed rather than reporting it again for the next port.
const killed = new Set();

for (const port of PORTS) {
  for (const pid of findListeners(port)) {
    if (killed.has(pid)) continue;

    const commandLine = commandLineFor(pid);

    if (EMULATOR_PATTERNS.some((pattern) => pattern.test(commandLine))) {
      console.log(
        `Releasing port ${port}: killing orphaned Firebase emulator (pid ${pid}).`,
      );
      kill(pid);
      killed.add(pid);
      continue;
    }

    console.warn(
      `Port ${port} is held by pid ${pid}, which is not a Firebase emulator. ` +
        'Leaving it alone — stop it yourself, or change the emulator port in ' +
        'firebase.json.',
    );
  }
}
