/**
SPDX-License-Identifier: GPL-3.0-only

@file generate.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

import * as vscode from 'vscode';
import { randomString } from './utils';
import { LinePosition } from './collections';

// spawn system process to run srcML and srcSlice
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

//#############################################################################
//      srcML Generation
//#############################################################################

let backupPath:string = "";
let recent_srcMLOutput:string = "";

/**
 * [editor_file_path, tmp_file_path]
 */
let SRC_FILE_TABLE: Array<[string,string]> = [];
/**
 * 
 * @param tmpFile temp file path from slice profile
 * @returns respective abs path based from slice
 */
export function fromFileTable(tmpFile:string): string|undefined {
    const file = SRC_FILE_TABLE.find(f => {
        const [srcFile,tFile] = f;
        return tFile === tmpFile;
    });
    return file ? file[0] : undefined;
}

/**
 * Checks if srcML is installed on the system and creates a srcML archive
 * srcSlice uses to generate slice data
 * @param targets array of file paths
 * @returns [ successful:boolean, [ tmp_file_path:str, srcML_content:str ] ]
 */
export async function srcML(
    targets: Array<[string,string]>
): Promise<[boolean,[string,string]]> {
    if (targets.length === 0) {
        return [false, ["",""]];
    };

    // check if srcML is installed
    await new Promise<void>((resolve, reject) => {
        const srcMLCheck = spawn('srcml', ['--version']);

        srcMLCheck.on("error", (err) => {
            // show error message if not installed
            vscode.window.showInformationMessage(
                'srcML not installed!',
                'Download',
                'Maybe Later'
            ).then(selection => {
                if (selection === 'Download') {
                    const url = vscode.Uri.parse('https://www.srcml.org/#download');
                    vscode.env.openExternal(url);
                }
            });

            vscode.window.setStatusBarMessage('Could not locate srcML');
            reject(new Error('srcML not installed!'));
            return [false, ["",""],""];
        });

        srcMLCheck.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error('srcML not installed!'));
                return [false, ["",""],""];
            }
        });
    });

    vscode.window.setStatusBarMessage('srcML located!');

    try {
        const rstring = randomString();
        
        const tmpBase = `/tmp/srcslice_extension/${rstring}`;
        backupPath = tmpBase;

        // create new directory we are copying targets to
        await fs.promises.mkdir(tmpBase, { recursive: true });

        // clear the table
        SRC_FILE_TABLE = [];

        for (const target of targets) {
            const file = target[0];
            const relativePath = target[1];
            
            const tmpFilePath = path.join(tmpBase, relativePath);
            
            // create recursive path if needed
            const recDirPath = path.dirname(tmpFilePath);
            if (recDirPath.length > 1) {
                await fs.promises.mkdir(recDirPath, { recursive: true });
            }

            // copy file
            await fs.promises.copyFile(file, tmpFilePath);

            // track the file links via table
            SRC_FILE_TABLE.push([file, tmpFilePath]);

            vscode.window.setStatusBarMessage(
                `Copied ${file} → ${tmpFilePath}`
            );
        }

        const outfile = `/tmp/srcslice_extension/${rstring}.xml`;

        await new Promise<void>((resolve, reject) => {
            // create srcML archive the tmp area where we copied target files
            // this way if we are slicing multiple-files we srcML all targets
            const process = spawn('srcml', [tmpBase, '-o', outfile, '-r', '--position', '--hash']);

            // error occured
            process.on("error", (err) => {
                vscode.window.setStatusBarMessage('Error occured running srcML!');
                reject(new Error('Error occured running srcML!'));
                return [false,["",""],""];
            });

            // successful exit
            process.on('close', async (code) => {
                if (code === 0) {
                    recent_srcMLOutput = outfile;
                    resolve();
                } else {
                    vscode.window.setStatusBarMessage('srcML failed!');
                    reject(new Error('srcML failed!'));
                    return [false,["",""],""];
                }
            });
        });

        return [true, [tmpBase, outfile]];
    } catch (err: any) {
        vscode.window.setStatusBarMessage(`Error: ${err.message}`);
        console.error(`Error: ${err.message}`);
        return [false,["",""]];
    }
}

// xml parser
import { parseStringPromise } from 'xml2js';
export async function getFileHash(
    srcMLFile: string,
    targetUnitPath: string
): Promise<string> {
    try {
        const fileContent = fs.readFileSync(srcMLFile, 'utf-8');

        const result = await parseStringPromise(fileContent, {
            explicitArray: false
        });

        function findUnit(unit: any): string | null {
            if (!unit) return null;

            // if the unit tag contains attributes
            // look into the values
            if (unit.$) {
                if (
                    unit.$.filename === targetUnitPath &&
                    unit.$.hash
                ) {
                    return unit.$.hash;
                }
            }

            // nested unit check
            if (unit.unit) {
                if (Array.isArray(unit.unit)) {
                    for (const child of unit.unit) {
                        const found = findUnit(child);
                        if (found) return found;
                    }
                } else {
                    return findUnit(unit.unit);
                }
            }

            return null;
        }

        const hash = findUnit(result.unit);
        return hash || "";

    } catch (err: any) {
        console.error(`Error: ${err.message}`);
        return "";
    }
}

/**
 * 
 * @returns file path of recent srcML output file
 */
export function getRecentSrcML() { return recent_srcMLOutput; }

/**
 * 
 * @returns directory of recent workspace backup within tmp
 */
export function getBackupPath() { return backupPath; }

//#############################################################################
//      srcSlice Generation
//#############################################################################

/**
 * runs srcSlice against the input file and produces JSON output file containing slice profiles
 * @param srcMLInput srcML input file
 * @returns srcSlice output file path
 */
export async function srcSlice(srcMLInput: string): Promise<[boolean, string]> {
    // check if srcslice is installed
    await new Promise<void>((resolve, reject) => {
        const check = spawn('srcslice', ['-h']);

        check.on('error', (err) => {
            vscode.window.showInformationMessage(
                'srcSlice not installed!',
                'Download',
                'Maybe Later'
            ).then(selection => {
                if (selection === 'Download') {
                    const url = vscode.Uri.parse('https://github.com/srcML/srcSlice');
                    vscode.env.openExternal(url);
                }
            });
            vscode.window.setStatusBarMessage('Could not locate srcSlice');
            reject(new Error('srcSlice not installed!'));
            return [false, ""];
        });

        check.on('close', (code) => {
            if (code === 0) { resolve(); }
            else {
                reject(new Error('srcSlice not installed!'));
                return [false, ""];
            }
        });
    });
    
    const srcSliceOutput = srcMLInput.slice(0, -3) + 'json';

    // good for handling multiple updates
    vscode.window.setStatusBarMessage('Running srcSlice...');
    
    // run srcSlice against the input and generate JSON output file
    await new Promise<void>((resolve, reject) => {
        const proc = spawn('srcslice', [srcMLInput, '-o', srcSliceOutput]);

        // read stdout/stderr to prevent hanging
        proc.stdout.on('data', (data) => {});
        proc.stderr.on('data', (data) => {});

        proc.on('error', (err) => {
            reject(err);
            return [false, ""];
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`srcSlice failed with exit code ${code}`));
                return [false, ""];
            }
        });
    });

    vscode.window.setStatusBarMessage(`srcSlice output → ${srcSliceOutput}`);

    return [true, srcSliceOutput];
}

//#############################################################################
//      General Generation
//#############################################################################

async function getEndPosition(
    uri: vscode.Uri, line: number, column: number
): Promise<[number, number] | null> {
    // Load the file in memory only
    const doc = await vscode.workspace.openTextDocument(uri);

    // VS Code positions are 0-based
    const startPos = new vscode.Position(line - 1, column - 1);

    const text = doc.getText();
    let offset = doc.offsetAt(startPos);

    const validChar = /[a-zA-Z0-9_]/;

    while (offset < text.length && validChar.test(text[offset])) {
        offset++;
    }

    // Convert offset back to Position
    const endPos = doc.positionAt(offset);

    // Return 1-based line and column
    return [endPos.line + 1, endPos.character + 1];
}

/**
 * Takes Line Position data and converts to vscode.Range
 * for sub-string highlighting
 * 
 * @param start Starting Line Position
 * @param end Ending Line Position
 * @returns 
 */
export function Pos2Range(start:LinePosition, end:LinePosition): vscode.Range {
    // convert LinePositions into vscode Positions
    const startPos = new vscode.Position(start.line - 1, start.column - 1);
    const endPos = new vscode.Position(end.line - 1, end.column - 1);

    return new vscode.Range(startPos, endPos);
}

/**
 * 
 * @param posStr line:col string of where the variable name starts
 * @returns [filename, start of variable name, end of variable name]
 */
export async function createLineRange(posStr:string): Promise<[string, LinePosition,LinePosition]> {
    if (!posStr) {
        vscode.window.showWarningMessage('Position string not defined');
        return ["", new LinePosition(), new LinePosition()];
    }

    const [file, line, column] = posStr.split(":");
    
    const startPos:LinePosition = new LinePosition(
        Number(line), Number(column)
    );

    const uri = vscode.Uri.file(file);
    const endData = await getEndPosition(
        uri, startPos.line, startPos.column
    );
    const endPos:LinePosition = (endData) ? new LinePosition(endData[0], endData[1]) : new LinePosition();

    return [file, startPos, endPos];
}