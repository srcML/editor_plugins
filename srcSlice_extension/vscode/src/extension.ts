// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// spawn system process to run srcML and srcSlice
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// xml parser
import { parseStringPromise } from 'xml2js';

// run srcSlice on the srcML input file and return the path of the output JSON file
async function srcSlice(srcMLInput: string): Promise<string> {
    // check if srcslice is installed
    await new Promise<void>((resolve, reject) => {
        const check = spawn('srcslice', ['-h']);

        check.on('error', (err) => {
            vscode.window.showErrorMessage('srcSlice not installed!');
            reject(new Error('srcSlice not installed!'));
        });

        check.on('close', (code) => {
            if (code === 0) resolve();
            else {
                reject(new Error('srcSlice not installed!'));
            }
        });
    });

    
    const srcSliceOutput = srcMLInput.slice(0, -3) + 'json';

    // good for handling multiple updates
    const status = vscode.window.setStatusBarMessage('Running srcSlice...');
    
    // run srcSlice against the input and generate JSON output file
    await new Promise<void>((resolve, reject) => {
        const proc = spawn('srcslice', ['-i', srcMLInput, '-o', srcSliceOutput]);

        // read stdout/stderr to prevent hanging
        proc.stdout.on('data', (data) => {});
        proc.stderr.on('data', (data) => {});

        proc.on('error', (err) => reject(err));

        proc.on('close', (code) => {
            if (code === 0) {
                console.log("srcSlice ran successfully!");
                resolve();
            } else reject(new Error(`srcSlice failed with exit code ${code}`));
        });
    });

    console.log(`srcSlice output → ${srcSliceOutput}`);
    vscode.window.setStatusBarMessage(`srcSlice output → ${srcSliceOutput}`);

    return srcSliceOutput;
}

// copy the current file into /tmp and pass it into srcML if installed
async function srcML(srcFile: string): Promise<[boolean,[string,string]]> {
    // check if srcML is installed
    await new Promise<void>((resolve, reject) => {
        const srcMLCheck = spawn('srcml', ['--version']);

        srcMLCheck.on("error", (err) => {
            // show error message if not installed
            vscode.window.showErrorMessage('srcML not installed!');
            reject(new Error('srcML not installed!'));
            return [false,["",""]];
        });

        srcMLCheck.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error('srcML not installed!'));
                return [false,["",""]];
            }
        });
    });

    const status = vscode.window.setStatusBarMessage('srcML located!');

    // copy file
    const fileName = path.basename(srcFile);
    const tmpFilePath = path.join('/tmp', fileName);
    const srcMLOutput = `${tmpFilePath}.xml`;

    try {
        // Copy to /tmp
        await fs.promises.copyFile(srcFile, tmpFilePath);
        vscode.window.setStatusBarMessage(`Copied ${fileName} → ${tmpFilePath}`);

        await new Promise<void>((resolve, reject) => {
            // srcML the file
            const process = spawn('srcml', [tmpFilePath, '-o', srcMLOutput, '--position', '--hash']);

            // error occured
            process.on("error", (err) => {
                vscode.window.setStatusBarMessage('Error occured running srcML!');
                reject(new Error('Error occured running srcML!'));
                return [false,["",""]];
            });

            // successful exit
            process.on('close', async (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    vscode.window.setStatusBarMessage('srcML failed!');
                    reject(new Error('srcML failed!'));
                    return [false,["",""]];
                }
            });
        });

        return [true, [tmpFilePath, srcMLOutput]]
    } catch (err: any) {
        vscode.window.setStatusBarMessage(`Error: ${err.message}`);
        console.error(`Error: ${err.message}`);
        return [false,["",""]];
    }
}

// use current functionality to get the line where a variable is defined
async function getDefinitionLocation(): Promise<vscode.Location[] | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const position = editor.selection.active; // cursor position
    const document = editor.document;

    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        document.uri,
        position
    );

    return locations;
}

// extract the hash attribute from the srcML unit tag
async function getHash(srcMLFile: string): Promise<string> {
    try {
        // get XML contents
        const fileContent = fs.readFileSync(srcMLFile, 'utf-8');

        // parse for hash attribute in the unit tag
        const result = await parseStringPromise(fileContent, { explicitArray: false });
        return result.unit.$.hash || ""; // attributes are under "$"
    } catch (err: any) {
        vscode.window.showErrorMessage(`Error: ${err.message}`);
        console.error(`Error: ${err.message}`);
        return "";
    }
}

// find specific slice from srcSlice output
async function extractSlice(variableName: string, line: number,
                        hash: string, srcSliceOutput: string): Promise<string> {
    if (variableName === "" || hash === "") {
        vscode.window.setStatusBarMessage('Invalid arguments passed!');
        return "";
    }

    // parse the JSON and locate the slice blob
    vscode.window.setStatusBarMessage('Locating Slice...');
    const fileContent = fs.readFileSync(srcSliceOutput, 'utf-8'); // synchronous-read
    const slices = JSON.parse(fileContent);
    console.log(slices);

    // extract using the key based on arguments
    const key = `${variableName}-${line}-${hash}`;
    const slice = slices[key];
    
    if (slice) {
        console.log(slice);
        // convert JSON to string
        return JSON.stringify(slice);
    } else {
        return "";
    }
}

async function generateFlowLines(sliceString: string, line: number): Promise<number[]> {
    const slice = JSON.parse(sliceString);
    
    const uses: number[] = slice['use'] || [];
    const defs: number[] = slice['definition'] || [];
    const calls = slice['calls'] || [];

    let lines: number[] = [];
    
    try {
        if (calls.length === 0) {
            // the flow of the slice if there are no calls is we start at the init decl
            // and move through the uses and redefs in ascending order excluding init decl
    
            // union of uses and defs, excluding `line`
            const useDefUnion = [...new Set([...uses, ...defs])].filter(l => l !== line);
            lines = [line, ...useDefUnion];
            return lines;
        } else {
            // the flow follows most of the prior but when we have calls we need the uses
            // and defs passed from interprocedural to follow after the line of the call
            // ie: init, ..., 10, 1, 2, 3, ..., 25, 31, ...
            return lines;
        }
    } catch (err: any) {
        console.error(`Error: ${err}`);
        return lines;
    }
}

export async function stepThroughLines(lines: number[]) {
    if (!lines.length) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    let currentIndex = 0;

    // Generate an in-memory SVG arrow as a data URI
    const arrowSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
            <polygon points="0,0 10,5 0,10" fill="orange"/>
        </svg>
    `;
    const arrowDataUri = `data:image/svg+xml;base64,${Buffer.from(arrowSvg).toString('base64')}`;

    const arrowDecoration = vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.parse(arrowDataUri),
        gutterIconSize: 'contain',
    });

    const revealLine = (index: number) => {
        const lineNumber = lines[index] - 1; // 0-based
        const range = new vscode.Range(lineNumber, 0, lineNumber, 0);

        editor.selection = new vscode.Selection(range.start, range.start);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

        editor.setDecorations(arrowDecoration, [range]);
    };

    const pick = async () => {
        const choice = await vscode.window.showQuickPick(
            ['Previous', 'Next', 'Close'],
            { placeHolder: `Line ${lines[currentIndex]} (${currentIndex + 1}/${lines.length})` }
        );

        if (!choice || choice === 'Close') {
            arrowDecoration.dispose();
            highlightDecoration.dispose();
            return;
        }

        currentIndex = choice === 'Next'
            ? (currentIndex + 1) % lines.length
            : (currentIndex - 1 + lines.length) % lines.length;

        revealLine(currentIndex);
        pick();
    };

    revealLine(currentIndex);
    pick();
}

// highlight the lines
const highlightDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255,215,0,0.3)', // light gold highlight
    isWholeLine: true,
});

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "srcslice-extension" is now active!');
    vscode.window.showInformationMessage("srcSlice extension active!");

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    /*
    const disposable = vscode.commands.registerCommand('srcslice-extension.showMessage', () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        vscode.window.showInformationMessage('I am showing a information message!');
    });
    context.subscriptions.push(disposable);
    */

    let findSlice = vscode.commands.registerCommand("srcslice-extension.findSlice",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);

            if (!selectedText) return;

            // see if the variable we want to slice is defined in the current file
            const locations = await getDefinitionLocation();
            if (locations && locations.length > 0) {
                const loc = locations[0]; // first definition
                const line = loc.range.start.line + 1; // line numbers are 0-based
                
                // log line where it is defined
                console.log(`${selectedText} defined on line ${line}`);
                
                // get current file
                const filePath = editor.document.uri.fsPath;
    
                // (tuple) files = [tmpFilePath, srcMLOutput]
                const [ok, files] = await srcML(filePath); // tuple deconstruct
    
                // if srcML ran successfully attempt to run srcSlice
                if (ok) {
                    const [tmpFilePath, srcMLOutput] = files;
    
                    vscode.window.setStatusBarMessage(`srcML output → ${tmpFilePath}`);
                    const srcSliceOutput = await srcSlice(srcMLOutput);
                    
                    console.log('Attempting to extract the unit hash...');
                    const hash = await getHash(srcMLOutput);

                    console.log('Attempting to mark program slice name...');
                    const variableName = selectedText;

                    console.log('Attempting to extract the slice...');
                    const sliceString = await extractSlice(variableName, line, hash, srcSliceOutput);
                    if (sliceString !== "") {
                        console.log('Attempting to gather slice step-lines...');
                        // generate the lines that follow the flow of the variable from start to end
                        const lines = await generateFlowLines(sliceString, line);
                        console.log(`Generated slice step-lines | ${lines}`);

                        // convert number[] into vscode.Range[]
                        const ranges: vscode.Range[] = lines.map(line => {
                            // VS Code uses 0-based line numbers
                            const lineIndex = line-1;
                            return new vscode.Range(lineIndex, 0, lineIndex, Number.MAX_VALUE);
                        });

                        // apply highlights
                        editor.setDecorations(highlightDecoration, ranges);

                        // store where we can pop it later
                        context.subscriptions.push(highlightDecoration);
                        await stepThroughLines(lines);
                        
                        // clean-up
                        try {
                            vscode.window.setStatusBarMessage('Cleaning Up...');
            
                            // delete from /tmp
                            await fs.promises.unlink(tmpFilePath); // remove copied source file
                            vscode.window.setStatusBarMessage(`Removed ${tmpFilePath}`);
            
                            await fs.promises.unlink(srcMLOutput); // remove srcML output file
                            vscode.window.setStatusBarMessage(`Removed ${srcMLOutput}`);
            
                            if (srcSliceOutput !== "") {
                                await fs.promises.unlink(srcSliceOutput); // remove srcSlice output file
                                vscode.window.setStatusBarMessage(`Removed ${srcSliceOutput}`);
                            }
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Error: ${err.message}`);
                            console.error(`Error: ${err.message}`);
                        }
                    }
                }
            }
            
        }
    );
    context.subscriptions.push(findSlice);
}

// This method is called when your extension is deactivated
export function deactivate() { }
