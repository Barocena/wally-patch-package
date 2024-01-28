import { program } from "commander";
import chalk from "chalk";
import which from "which";

export function log(...args) {
  var Options = program.opts();
  if (Options.debug) {
    console.log(chalk.blueBright(...args));
  }
}
export function error(...args) {
  console.log(chalk.red.bold(...args));
}
export function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function hasGit() {
  which("git", (error) => {
    if (error) {
      console.error("❌ Git is not installed on your system.");
      process.exit(1); // Exit with an error code
    }
  });
}
