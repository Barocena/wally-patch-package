import { program } from "commander";
import createPatch from "./createPatch.js";
import applyPatch from "./applyPatch.js";

program
  .name("Wally-Patch-Package")
  .version("1.0.0")
  .description("CLI tool for patching Wally packages")
  .arguments("[libraryname]")
  .action((libraryname) => {
    if (libraryname) {
      createPatch(libraryname);
    } else {
      applyPatch();
    }
  })
  .option("-d, --debug", "output extra debugging")
  .option("--registry <url>", "set the base url of registry")
  .option("--patch <path>", "apply specific patch file")
  .parse(process.argv);
