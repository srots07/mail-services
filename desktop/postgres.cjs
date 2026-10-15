// Runs the bundled PostgreSQL binaries (initdb / pg_ctl) against a data folder in %APPDATA%.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const DB_NAME = "ecm";
const DB_USER = "postgres";

function run(bin, args, { log, okCodes = [0] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, env: { ...process.env, LC_MESSAGES: "C" } });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", reject);
    // "exit", not "close": `pg_ctl start` leaves postgres holding the inherited pipes open.
    child.on("exit", (code) => {
      child.stdout.destroy();
      child.stderr.destroy();
      if (log && output.trim()) log(output.trim());
      if (okCodes.includes(code)) resolve({ code, output });
      else reject(new Error(`${path.basename(bin)} exited with code ${code}: ${output.trim().slice(-800)}`));
    });
  });
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

class LocalPostgres {
  constructor({ binDir, dataDir, port, password, log }) {
    this.bin = (name) => path.join(binDir, `${name}.exe`);
    this.dataDir = dataDir;
    this.port = port;
    this.password = password;
    this.log = log ?? (() => {});
    this.logFile = path.join(path.dirname(dataDir), "postgres.log");
  }

  get connectionString() {
    return `postgresql://${DB_USER}:${encodeURIComponent(this.password)}@127.0.0.1:${this.port}/${DB_NAME}?sslmode=disable`;
  }

  async ensureInitialised() {
    if (fs.existsSync(path.join(this.dataDir, "PG_VERSION"))) return false;
    fs.mkdirSync(this.dataDir, { recursive: true });
    const pwFile = path.join(os.tmpdir(), `ecm-pw-${process.pid}-${Date.now()}`);
    fs.writeFileSync(pwFile, this.password, { mode: 0o600 });
    try {
      await run(this.bin("initdb"), ["-D", this.dataDir, "-U", DB_USER, `--pwfile=${pwFile}`, "-A", "scram-sha-256", "-E", "UTF8", "--locale=C"], { log: this.log });
    } finally {
      fs.rmSync(pwFile, { force: true });
    }
    return true;
  }

  async isRunning() {
    // pg_ctl status: 0 = running, 3 = not running, 4 = no data directory.
    const { code } = await run(this.bin("pg_ctl"), ["status", "-D", this.dataDir], { okCodes: [0, 3, 4] });
    return code === 0;
  }

  async start() {
    await this.ensureInitialised();
    // A previous app session that crashed may have left the server running; reuse it.
    if (await this.isRunning()) return;
    if (!(await portFree(this.port))) {
      throw new Error(`Port ${this.port} is used by another program, so the local database cannot start.`);
    }
    await run(
      this.bin("pg_ctl"),
      ["start", "-D", this.dataDir, "-l", this.logFile, "-w", "-t", "90", "-o", `-p ${this.port} -c listen_addresses=127.0.0.1`],
      { log: this.log },
    );
  }

  async stop() {
    if (!(await this.isRunning())) return;
    await run(this.bin("pg_ctl"), ["stop", "-D", this.dataDir, "-m", "fast", "-w", "-t", "60"], { log: this.log });
  }

  /** Creates the app database on first run. `pg` is the server bundle's node-postgres module. */
  async ensureDatabase(pg) {
    const client = new pg.Client({ host: "127.0.0.1", port: this.port, user: DB_USER, password: this.password, database: "postgres" });
    await client.connect();
    try {
      const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
      if (!rowCount) await client.query(`CREATE DATABASE ${DB_NAME}`);
    } finally {
      await client.end();
    }
  }
}

module.exports = { LocalPostgres, portFree };
