import { program } from "commander";
import { createPatch } from "./createPatch.js";
import { applyPatch } from "./applyPatch.js";

program
  .name("Wally-Patch-Package")
  .version("0.0.1")
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
  .parse(process.argv);
