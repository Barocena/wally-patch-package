const { program } = require('commander');


function Patch(packageName) {
	console.log(`PackageName: ${packageName}`)
	console.log(process.cwd())
};

program
	.name("Wally-Patch-Package")
	.version('0.0.1')
	.description('A CLI tool to patch Wally packages')
	.argument('<package>',"Name of Package to patch",Patch)

program.parse(process.argv);
