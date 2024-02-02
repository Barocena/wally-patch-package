<div align="center">
<h1>
wally-patch-package
</h1>
</div>

### wally-patch-package is a cli tool for patching [wally](https://github.com/UpliftGames/wally) packages 


## Installation

### Requirements
- git

you can install it via [aftman](https://github.com/LPGhatguy/aftman)

`wally-patch-package="Barocena/wally-patch-package@1.1.0"`

or

from [GitHub Releases Page](https://github.com/Barocena/wally-patch-package/releases).

# Usage

https://github.com/Barocena/wally-patch-package/assets/34089907/ec2f2c89-6b67-4488-a33f-553cef9e395c

## Creating Patches

First make changes to the files of a package you want to patch, then run 
### `wally-patch-package <packagename>`
> ##### packagename accepts detailed info of package so `scope/packagename@version`  is also valid</br>for cases like same packages with different versions or 2 package with same name different scope etc..)
it will create *.patch file in the WallyPatches directory

#### For Private Registries
> ##### (this step is not neccessary for public registries)

since the patch tool needs to download original version of package, it needs to know base url for endpoint.</br>
you can provide the base url with `--registry=<base-url>` flag (base url can be found in config.json file in the index)

## Applying Patches

To apply all patches, run</br>
 `wally-patch-package`

to apply specific patch only, run `wally-patch-package --patch=<packagename>` 


