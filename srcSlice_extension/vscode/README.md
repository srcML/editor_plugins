# srcSlice for Visual Studio Code

This extension uses [srcSlice](https://github.com/srcML/srcSlice) to calculate the slice of a desired variable and visualize information regarding where it is used through out a system.

## Install Dependencies
This is a srcML tool extension, if you do not have srcML installed you must install it.
You can download the system installer [here](https://www.srcml.org/#download).
You will also need to install srcSlice, go [here](https://github.com/srcML/srcSlice/tree/develop?tab=readme-ov-file#srcslice) for srcSlice installation instructions.
Finally you will need to install npm to allow compilation and installation of the extension, go [here](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) for npm install instructions.

## Compile Extension
If you have npm, srcML, and srcSlice installed on your system do the following
```bash
# creates a .vsix file
npm install -g @vscode/vsce
# compile the extension
vsce package
# installation
code --install-extension VSIX_FILE
```

## Keyboard Bindings
```
Find Slice
    Windows/Linux: Ctrl + Alt + F
    macOS: Cmd + Alt + F

Hide Slice
    Windows/Linux: Ctrl + Alt + H
    macOS: Cmd + Alt + H

Hide Profile Entries (Primary Bar)
    Windows/Linux: Alt + K

Show Profile Entries (Primary Bar)
    Windows/Linux: Alt + L

Get Editor Slices (Slice only from editor tabls)
    Windows/Linux: Ctrl + Alt + E
    macOS: Cmd + Alt + E

Get All Slices (Slice the entire workspace)
    Windows/Linux: Ctrl + Alt + A
    macOS: Cmd + Alt + A
```
