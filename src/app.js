import { program } from "commander";
import createPatch from "./createPatch.js";
import applyPatch from "./applyPatch.js";

program
  .name("Wally-Patch-Package")
  .version("1.2.2")
  .description("CLI tool for patching Wally packages")
  .arguments("[libraryname]")
  .action(async (libraryname) => {
    if (libraryname) {
      await createPatch(libraryname);
    } else {
      await applyPatch();
    }
  })
  .option("-d, --debug", "output extra debugging")
  .option("--registry <url>", "set the base url of registry")
  .option("--patch <path>", "apply specific patch file");

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
