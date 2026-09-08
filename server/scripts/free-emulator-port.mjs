/**
 * Release the Firestore emulator port before starting a new run.
 *
 * `firebase emulators:exec` stops the emulator by sending SIGINT. On Windows
 * the JVM frequently survives that, so the next run fails with "port taken"
 * and the suite appears broken on every second invocation.
 *
 * This kills only a process it has positively identified as a Firestore
 * emulator, by reading its command line and looking for the emulator jar.
 * Anything else listening on the port — a dev server, another database — is
 * reported and left alone, because silently killing whatever holds a common
 * port like 8080 is far worse than a failed test run.
 */

import { execFileSync } from 'node:child_process';

const PORT = Number(process.argv[2] ?? 8080);
const EMULATOR_MARKER = 'cloud-firestore-emulator';

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

/** Process ids listening on PORT. */
function findListeners() {
  if (process.platform === 'win32') {
    const output = run('netstat', ['-ano', '-p', 'TCP']) ?? '';
    const pids = new Set();

    for (const line of output.split(/\r?\n/)) {
      // "  TCP    127.0.0.1:8080   0.0.0.0:0   LISTENING   1234"
      const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
      if (match && Number(match[1]) === PORT) pids.add(Number(match[2]));
    }

    return [...pids];
  }

  const output = run('lsof', ['-ti', `tcp:${PORT}`, '-sTCP:LISTEN']) ?? '';
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

const listeners = findListeners();

if (listeners.length === 0) {
  process.exit(0);
}

for (const pid of listeners) {
  const commandLine = commandLineFor(pid);

  if (commandLine.includes(EMULATOR_MARKER)) {
    console.log(
      `Releasing port ${PORT}: killing orphaned Firestore emulator (pid ${pid}).`,
    );
    kill(pid);
    continue;
  }

  console.warn(
    `Port ${PORT} is held by pid ${pid}, which is not a Firestore emulator. ` +
      'Leaving it alone — stop it yourself, or change the emulator port in ' +
      'firebase.json.',
  );
}
