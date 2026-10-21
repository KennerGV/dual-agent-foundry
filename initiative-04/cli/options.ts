export interface CliOptions {
  configPath?: string;
  format?: "json" | "markdown" | "all";
  outputDir?: string;
}

export function parseCliArgs(args: string[] = process.argv.slice(2)): CliOptions {
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--config" || arg === "-c") {
      const next = args[++i];
      if (next) {
        options.configPath = next;
      }
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.substring("--config=".length);
    } else if (arg === "--format" || arg === "-f") {
      const next = args[++i];
      if (next === "json" || next === "markdown" || next === "all") {
        options.format = next;
      }
    } else if (arg.startsWith("--format=")) {
      const val = arg.substring("--format=".length);
      if (val === "json" || val === "markdown" || val === "all") {
        options.format = val;
      }
    } else if (arg === "--output-dir" || arg === "-o") {
      const next = args[++i];
      if (next) {
        options.outputDir = next;
      }
    } else if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.substring("--output-dir=".length);
    }
  }

  return options;
}
