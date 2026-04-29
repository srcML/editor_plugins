/**
SPDX-License-Identifier: GPL-3.0-only

@file utils.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

import * as vscode from 'vscode';

import * as path from 'path';

import { SliceProfile, LinePosition } from "./collections";
import { createLineRange } from "./generate";
import { create } from 'domain';

/**
 * Custom Sleep function
 * 
 * @param ms wait length in milliseconds
 * @returns 
 */
export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Produce a random string of a given length
 * 
 * @param length output string length
 * @returns 
 */
export function randomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Produce a collection of position start,end ranges of where
 * the given profile is being referenced
 * 
 * @param profile Slice Profile
 */
export async function generateSlines(profile:SliceProfile): Promise<Array<[string, LinePosition, LinePosition]>> {
    let slines: Array<[string, LinePosition, LinePosition]> = [];
    const lineGroups = new Map<string, Set<string>>();

    if (profile) {
        const { use, definition } = profile.sliceData;
        for (const line of [...use, ...definition]) {
            const fpath = line.split(':')[0];
            if (!lineGroups.has(fpath)) {
                lineGroups.set(fpath, new Set<string>());
            }
            lineGroups.get(fpath)?.add(line);
        }

        const lines = [...(lineGroups.get(profile.getFile()) || [])];
        lines.sort((a, b) => {
            const [, aLine, aCol] = a.split(':').map(Number);
            const [, bLine, bCol] = b.split(':').map(Number);
            return aLine !== bLine ? aLine - bLine : aCol - bCol;
        });

        const callMap = new Map<string, string>();
        for (const call of profile.sliceData.calls) {
            const [invokeFile, invokeLine, invokeCol] = call.invoke.split(':');
            // Find the closest line at or after the invoke position
            const match = lines.find(line => {
                const [lineFile, lineNum, colNum] = line.split(':');
                
                if (lineFile === invokeFile) {
                    if (Number(lineNum) > Number(invokeLine)) {
                        return true;
                    } else if (Number(lineNum) == Number(invokeLine)) {
                        return Number(colNum) > Number(invokeCol);
                    }
                }
                return false;
            });
        }

        // prevent
        const visited: Set<string> = new Set<string>();

        const insertCallLines = (invokeLine: string) => {
            const func = profile.sliceData.calls.find(c => c.invoke === invokeLine);
            if (!func) return [];
            
            const call_sline_start = profile.sliceData.use.find(line => {
                const [lineFile, lineNum] = line.split(':');
                const [funcFile, funcLine] = func.definitionPosition.split(':');
                return lineFile === funcFile && Number(lineNum) >= Number(funcLine);
            });
            
            if (!call_sline_start) return [];

            // collect a list of slines between a given start and end
            const findLines = (start: string) => {
                const [file, endLine, endCol] = func.endOfFunction.split(':');
                const lines = lineGroups.get(file);
                const group: Array<string> = [start];

                const [, s_line, s_col] = start.split(':').map(Number);
                const [e_line, e_col] = [endLine, endCol].map(Number);

                lines?.forEach(sline => {
                    const [, line, col] = sline.split(':').map(Number);

                    const afterStart =
                        line > s_line ||
                        (line === s_line && col > s_col);

                    const beforeEnd =
                        line < e_line ||
                        (line === e_line && col < e_col);

                    if (afterStart && beforeEnd) {
                        group.push(sline);

                        // test if a given sline we are adding may also be
                        // a call line
                        const callLine = callMap.get(sline);
                        if (callLine && !visited.has(callLine)) {
                            visited.add(callLine);

                            const result = insertCallLines(callLine);
                            group.push(... result);
                            group.push(sline);
                        }
                    }
                });

                return group;
            };

            return findLines(call_sline_start);
        };

        const sortedLines: string[] = [];
        let insert = false;
        for (const line of lines) {
            if (line === profile.sliceData.decl) {
                insert = true;
            }
            if (!insert) continue;
            sortedLines.push(line);

            const callLine = callMap.get(line);
            if (callLine && !visited.has(callLine)) {
                visited.add(callLine);

                const result = insertCallLines(callLine);
                
                sortedLines = sortedLines.concat(result);
                sortedLines.push(line);
            }
        }
        
        // convert array of strings into acceptable format
        for (const line of sortedLines) {
            slines.push( await createLineRange(line) );
        }
    }
    return slines;
}

/**
 * Produce a set of lines a slice is contained in with corresponding filename
 * 
 * @param profile Slice Profile
 */
export async function generateLines(profile:SliceProfile): Promise<Set<[string,number]>> {
    let lines:Set<[string,number]> = new Set<[string,number]>();
    
    if (profile) {
        const { use, definition } = profile.sliceData;
        for (const item of use) {
            if (!item) continue;
            
            const [file, line, column] = item.split(":");
            if (line) lines.add([file, Number(line)]);
        }

        for (const item of definition) {
            if (!item) continue;

            const [file, line, column] = item.split(":");
            if (line) lines.add([file, Number(line)]);
        }
    }
    
    return lines;
}

/**
 * 
 * @param slice slice profile object
 * @param data text editor reference or fsPath based off an editor
 * @returns if a the fsPath of an active editor is within the contained file listing of a slice
 */
export function canApplyHighLight(slice:SliceProfile, data: string|vscode.TextEditor): boolean {
    if (!slice) return false;
    const tabFilePath = (typeof data === "string") ? data : data.document.uri.fsPath;
    return slice.containedFiles.has(tabFilePath);
}

/**
 * Given all SliceProfiles and slice-keys, produce display identifiers
 * 
 * @param profiles Array of SliceProfiles
 * @param sliceKeys Array of slice-key strings
 * @returns updated SliceProfiles collection
 */
export async function generateIdentifiers(
    profiles: Array<SliceProfile>,
    sliceKeys: Array<string>): Promise<Array<SliceProfile>> {
    const identifiers: Array<string> = [];
    const indices: Array<number> = [];

    // initialize identifiers and links to SliceProfiles incase updates are needed
    for (const sliceId of sliceKeys) {
        const profileIndex = profiles.findIndex(profile => {
            return profile.sliceId === sliceId;
        });

        if (profileIndex === -1) continue;

        indices.push(profileIndex);

        const sp:SliceProfile = profiles[profileIndex];
        const fileBase:string = path.basename(sp.getFile());

        identifiers.push(fileBase);
    }

    const prependDir = (identifier:string, profile:SliceProfile) => {
        const fullPath:string = profile.getFile();

        const length = fullPath.length - identifier.length;
        if (length <= 0) return identifier;

        const unusedPath = fullPath.slice(0, length);
        const parentDir = path.basename(unusedPath);

        return path.join(parentDir,"/",identifier);
    };

    const checkIdentifiers = async () => {
        for (let i = 0; i < identifiers.length; ++i) {
            for (let k = 0; k < identifiers.length; ++k) {
                if (i === k) continue;
                if (profiles[indices[i]].getFileHash() === profiles[indices[k]].getFileHash()) continue;

                // if identifiers i and k are the same but the profiles have different file-hashes
                // theyre not unique and need dirname prepended to make them distinct
                if (identifiers[i] === identifiers[k]) {
                    return false;
                }
            }
        }
        return true;
    };

    // multiple keys with the same file-name base
    // append directories until strings are unique
    let allUnique:boolean = false;
    let iterations = 0;
    while (!allUnique && iterations < 5) {
        allUnique = await checkIdentifiers();
        if (!allUnique) {
            // prepend the contained directory to all elements and check again
            for (let i = 0; i < identifiers.length; ++i) {
                identifiers[i] = prependDir(identifiers[i], profiles[indices[i]]);
            }
        }
        ++iterations;
    }

    // set the identifiers to the slice profiles
    for (let i = 0; i < identifiers.length; ++i) {
        profiles[indices[i]].identifier = identifiers[i];
    }

    return profiles;
}

/**
 * 
 * @param doc vscode text document
 * @returns associated vscode.TextEditor if one exists otherwise undefined
 */
export function fetchEditorFromDoc(doc: vscode.TextDocument|undefined): vscode.TextEditor | undefined {
    console.log(`[!] doc: ${doc?.uri.toString()}`);
    if (!doc) return;
    return vscode.window.visibleTextEditors.find(editor => {
        console.log(` |___ ${editor.document.uri.toString()}`)
        return editor.document === doc;
    });
};

/**
 * 
 * @param doc vscode text document
 * @returns associated vscode.TextEditor if one exists otherwise undefined
 */
export function fetchEditorFromPath(p: string|undefined): vscode.TextEditor | undefined {
    if (!p) return;
    return vscode.window.visibleTextEditors.find(editor => {
        return editor.document.uri.fsPath === p;
    });
};

/**
 * 
 * @param t_uri 
 * @returns whether or not a given uri is within the tab group
 */
export function isInTabs(t_uri: vscode.Uri): boolean {
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (!(tab.input instanceof vscode.TabInputText)) continue;

            const tabUri = (tab.input as vscode.TabInputText).uri;
            if (tabUri.toString() === t_uri.toString()) {
                return true;
            }
        }
    }
    return false;
}

export function isInView(t_uri: vscode.Uri) {
    return vscode.window.visibleTextEditors.some(editor => 
        editor.document.uri.toString() === t_uri.toString()
    );
}