/**
 * Reads the server's settings from environment variables. The app was called
 * AppShots before it became Breezel, so the old APPSHOTS_ names still work
 * (with a warning) and existing deployments keep their data dir and password.
 */

export interface ServerConfig {
  dataDir: string;
  distDir: string;
  port: number;
  password: string | null;
  /** Problems worth logging at startup. */
  warnings: string[];
}

type Env = Record<string, string | undefined>;

const DEFAULT_PORT = 80;

export const readServerConfig = (env: Env): ServerConfig => {
  const warnings: string[] = [];

  const read = (name: string): string | undefined => {
    const current = env[`BREEZEL_${name}`];
    if (current !== undefined) return current;
    const legacy = env[`APPSHOTS_${name}`];
    if (legacy !== undefined) {
      warnings.push(`APPSHOTS_${name} is deprecated; rename it to BREEZEL_${name}.`);
    }
    return legacy;
  };

  const dataDir = read("DATA_DIR") ?? "/data";
  const distDir = read("DIST_DIR") ?? "dist";
  const password = read("PASSWORD")?.trim() || null;

  const rawPort = env.PORT;
  const parsedPort = rawPort === undefined ? DEFAULT_PORT : Number.parseInt(rawPort, 10);
  const valid = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535;
  const port = valid ? parsedPort : DEFAULT_PORT;
  if (rawPort !== undefined && port !== parsedPort) {
    warnings.push(`Ignoring invalid PORT ${JSON.stringify(rawPort)}; using ${DEFAULT_PORT}.`);
  }

  return { dataDir, distDir, port, password, warnings };
};
