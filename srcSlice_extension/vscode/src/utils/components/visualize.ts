/**
SPDX-License-Identifier: GPL-3.0-only

@file visualize.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

import * as vscode from 'vscode';

import { Pos2Range, fromFileTable } from '../generate';
import { ColorToggle, HighLight, SliceProfile } from "../collections";
import { isInView, isInTabs, sleep } from '../utils';

import Previewer from './previewer';

export default class Visualizer {
    private ctx: vscode.ExtensionContext;

    private sliceColors: Map<string, Array<HighLight>> = new Map<string, Array<HighLight>>();

    private lineGroups: Map<vscode.TextEditor, Set<number>> = new Map<vscode.TextEditor, Set<number>>();
    private lineBackgrounds: Map<vscode.TextEditor, HighLight> = new Map<vscode.TextEditor, HighLight>();

    private overlapGroups: Array<Set<HighLight>> = new Array<Set<HighLight>>();
    private rangeIntersections: Array<Set<vscode.Range>> = new Array<Set<vscode.Range>>();
    private swappers: Array<ColorToggle> = [];

    private sendAlert: boolean = true;
    private periodAlert: NodeJS.Timeout|undefined;
    
    private previewer:Previewer = new Previewer();

    constructor(context: vscode.ExtensionContext) {
        this.ctx = context;
    }

    ResetPreviewer() {
        this.previewer.reset();
    }

    async ResetVisuals() {
        this.sliceColors.forEach((v,k) => {
            v.forEach(h => h.dtor());
        });
        this.sliceColors.clear();

        this.lineGroups.clear();

        this.lineBackgrounds.forEach((v,k) => {
            v.dtor();
        });
        this.lineBackgrounds.clear();
        
        this.overlapGroups.forEach(s => s.forEach(h => h.dtor()));
        this.overlapGroups = [];

        this.rangeIntersections = [];

        this.swappers.forEach(s => s.dtor());
        this.swappers = [];
    }

    async CheckOverlaps() {
        this.createOverlapSets();
    }

    /**
     * Cancel the setInterval action
     * when a user recomputes slices
     */
    ResetNotify() {
        this.periodAlert?.close();
        this.sendAlert = true;
    }
    async SendEditNotify() {
        if (!this.sendAlert) return;
        this.sendAlert = false;

        const getMilli = (seconds:number) => {
            return seconds * 60 * 1000;
        };

        const setPeriodic = () => {
            console.log("[*] Info-Box Cooldown");

            // set a cooldown before sending the alert again
            // as a periodic reminder
            this.periodAlert = setInterval(() => { this.sendAlert = true; }, getMilli(5));
        }

        const notifyBox = vscode.window.showInformationMessage(
            "Edits may invalidate slices, slice recomputation may be needed",
            "Ok"
        );
        notifyBox.then(result => {
            setPeriodic();
        });
    }
    
    // used to clear the current state
    async ClearHighlights() {
        // remove slice markups
        for (const highLightCollection of this.sliceColors.values()) {
            while (highLightCollection.length > 0) {
                const highlight = highLightCollection.pop();
                highlight?.dtor();
            }
        }
        
        // remove background decoration information
        this.lineGroups.clear();
        for (const [editor, background] of this.lineBackgrounds) {
            // ensure the decoration is disposed before clearing
            background?.dtor();
        }
        this.lineBackgrounds.clear();
    }

//-----------------------------------------------------------------------------

    async CreateSliceMarkup(slice:SliceProfile, highLightColor:string) {
        // check to see if we already have a line-decorator
        // using the given color to avoid stacking the same
        // color
        const colorPresent = this.sliceColors.has(highLightColor);

        if (!colorPresent) {
            await this.ApplySliceMarkup(highLightColor, slice);
        } else {
            console.log("[!] Reapplying Highlights");
            const sliceHighLights = this.sliceColors.get(highLightColor);
            sliceHighLights?.forEach(highLight => {
                vscode.window.visibleTextEditors.forEach(async (editor) => {
                    const isReadOnly = editor.document.uri.scheme === "slice-preview";

                    // fetch workspace-based path from read-only editor
                    const t_file = this.previewer.findBaseUri(editor.document.uri.fsPath);

                    // when the user is viewing the read-only that is
                    // associated with the given highlight, reapply it
                    if (isReadOnly && highLight.fileTarget === t_file) {
                        highLight.reApply(editor);
                    }
                });
            });
        }
        await this.createOverlapSets();
    }

    async RemoveSliceMarkup(color:string) {
        if (this.sliceColors.has(color)) {
            // clear individual line decorations
            let highLights = this.sliceColors.get(color);
            highLights?.forEach( h => {
                // remove the background line decoration
                this.RemoveLineMarkups(h);
                h.dtor();
            });

            this.sliceColors.delete(color);
            await this.createOverlapSets();
        }
    }

    /**
     * 
     * @param color highlight color
     * @param slines slines for a SliceProfile
     * @returns 
     */
    private async ApplySliceMarkup(
        color:string,
        slice:SliceProfile
    ) {
        if (!slice) return;

        // files in this set are in the context of the editor workspace
        slice.containedFiles.forEach(async (file) => {
            // create a highlight for this slice per file its contained in
            const highLight = new HighLight(color, false);
            highLight.fileTarget = file;
            let ranges: Array<vscode.Range> = [];

            for (const sline of slice.slines) {
                const [tmpFile, start, end] = sline;

                // file check to ensure highlight ranges
                // are sorted by file
                if (file === fromFileTable(tmpFile)) {
                    // convert LinePosition start and end into vscode ranges
                    const range = Pos2Range(start, end);
                    ranges.push(range);
                }
            }

            // Apply highlight to an active editor
            // if it can be applied
            const dec = highLight.getDecoration();
            if (dec) {
                try {
                    // fetch readonly from original
                    const readOnlyEditor = await this.previewer.getSnapshot(file);
                    if (readOnlyEditor && (isInView(readOnlyEditor.textDoc.uri) || !isInTabs(readOnlyEditor.textDoc.uri))) {
                        // apply decorations to readonly
                        const t_editor = await vscode.window.showTextDocument(readOnlyEditor.textDoc, { preview: false, preserveFocus: true });
                        t_editor.setDecorations(dec, ranges);
                        highLight.setRecentEditor(t_editor);
                    }
                } catch (e) {
                    console.error(`[VISUALIZE] ${e}`);
                }
                
                // save reference to ranges to be used if reapplication is needed
                highLight.setRanges(ranges);
            }

            // initialize new highlight collection based on color
            if (!this.sliceColors.has(color)) {
                this.sliceColors.set(color, []);
            }
            this.sliceColors.get(color)?.push(highLight);
        });
    }

//-----------------------------------------------------------------------------

    private async RemoveLineMarkups(highLight: HighLight) {
        if (!highLight) return;

        const editor = highLight.getRecentEditor();
        if (!editor) return;

        const ranges = highLight.getRanges();
        for (const range of ranges) {
            this.lineGroups.get(editor)?.delete(range.start.line);
        }
    }

    private async CreateBackgroundLines() {
        // clear existing state of the map
        this.lineGroups.clear();

        // loop through this.sliceColors to create the set of lines slices
        // are used in
        for (const sliceHighLights of this.sliceColors.values()) {
            for (const sliceHighLight of sliceHighLights) {
                const editor = sliceHighLight.getRecentEditor();
                if (!editor) continue;
                
                for (const range of sliceHighLight.getRanges()) {
                    const line = range.start.line;

                    // ensure an entry for the editor to apply the backgrounds exists
                    if (!this.lineGroups.has(editor)) {
                        this.lineGroups.set(editor, new Set<number>());
                    }

                    // insert line into the set
                    this.lineGroups.get(editor)?.add(line);
                }
            }
        }
    }

    async RenderBackgrounds() {
        // create background highlights based on active slice highlights
        await this.CreateBackgroundLines();

        // dispose backgrounds that are no longer needed
        for (const [editor, background] of this.lineBackgrounds) {
            if (!this.lineGroups.has(editor)) {
                background.dtor();
                this.lineBackgrounds.delete(editor);
            }
        }

        // iterate over groups to determine if we need to
        // create a new background group for the editor or update
        // the ranges of an existing background group
        for (const [editor, lines] of this.lineGroups) {
            if (this.lineBackgrounds.has(editor)) {
                // update the ranges for existing entry
                const backgroundLine = this.lineBackgrounds.get(editor) || new HighLight();
                backgroundLine.setRecentEditor(editor);
                
                const ranges = new Array<vscode.Range>();
                for (const line of lines) {
                    ranges.push(new vscode.Range(line, 0, line, 0));
                }
                backgroundLine.setRanges(ranges);

                // apply new ranges to the existing decoration
                const dec = backgroundLine.getDecoration();
                if (dec) {
                    editor.setDecorations(dec, ranges);
                    backgroundLine.applyRulerDecoration();
                }

                // if an entry for some reason has no highlight object assigned
                // assign the new object that was created
                if (!this.lineBackgrounds.get(editor)) {
                    this.lineBackgrounds.set(editor, backgroundLine);
                }
            } else {
                // create a new entry for the editor
                const backgroundLine = new HighLight();
                backgroundLine.setRecentEditor(editor);
                
                const ranges = new Array<vscode.Range>();
                for (const line of lines) {
                    ranges.push(new vscode.Range(line, 0, line, 0));
                }
                backgroundLine.setRanges(ranges);

                // apply new decoration instance
                const dec = backgroundLine.getDecoration();
                if (dec) {
                    // this.ctx.subscriptions.push(dec);
                    editor.setDecorations(dec, ranges);
                    backgroundLine.applyRulerDecoration();
                }

                this.lineBackgrounds.set(editor, backgroundLine);
            }
        }
    }

//-----------------------------------------------------------------------------

    private async createOverlapSets() {
        console.log("[!] Creating Overlappings");
        // added delay to reduce misses
        await sleep(100);

        // remove existing groups
        this.overlapGroups = [];
        this.rangeIntersections = [];

        await this.stopJobs();

        // reset all highlight range states
        this.sliceColors.forEach((sliceHighLights, sliceColor) => {
            sliceHighLights.forEach(h => {
                h.revert();
            });
        });

        const generateOverlaps = async () => {
            // map highlights to the editor
            const highLightGroups: Map<string, HighLight[]> = new Map<string, HighLight[]>();
            this.sliceColors.forEach((v,k) => {
                v.forEach(h => {
                    if (!highLightGroups.has(h.fileTarget)) {
                        // create new editor uri path entry
                        highLightGroups.set(h.fileTarget, []);
                    }
                    // append highlight associated with editor uri path
                    highLightGroups.get(h.fileTarget)?.push(h);
                });
            });

            const hasIntersection = (a: HighLight, b: HighLight): boolean => {
                for (const a_r of a.getRanges()) {
                    for (const b_r of b.getRanges()) {
                        // return true at the first matching range discovered
                        if (a_r.isEqual(b_r))
                            return true;
                    }
                }
                return false;
            };

            const intersectsAll = (S: Set<HighLight>, a: HighLight): boolean => {
                for (const b of S) {
                    // if any highlight pair (a,b) do not intersect
                    // return false
                    if (!hasIntersection(a, b)) return false;
                }
                // a shares an intersection with all elements of set S
                return true;
            };

            const isUniqueGroup = (g: Set<HighLight>): boolean => {
                for (const G of this.overlapGroups) {
                    if (g === G) return false;
                }
                return true;
            };

            Array.from(highLightGroups.values()).forEach((highLights) => {
                highLights.forEach(h1 => {
                    highLights.forEach(h2 => {
                        if (h1 !== h2 && hasIntersection(h1,h2)) {
                            if (this.overlapGroups.length > 0) {
                                // see if h2 can be inserted into an existing set
                                // where it shares intersections with all elements
                                let inserted = false;
                                this.overlapGroups.forEach(G => {
                                    if (intersectsAll(G, h2)) {
                                        G.add(h2);
                                        inserted = true;
                                    }
                                });

                                // if h2 could not be inserted into an existing set
                                // then it gets its own set containing h1,h2
                                if (!inserted) {
                                    // check that S_n is not already within the groups collection
                                    const S_n = new Set<HighLight>([h1,h2]);
                                    if (isUniqueGroup(S_n)) {
                                        this.overlapGroups.push(S_n);
                                    }
                                }
                            } else {
                                this.overlapGroups.push(new Set<HighLight>([h1,h2]));
                            }
                        }
                    });
                });
            });
        };
        await generateOverlaps();

        const generateIntersections = () => {
            this.overlapGroups.forEach(group => {
                const highlights = Array.from(group.values());
                if (highlights.length < 2) {
                    this.rangeIntersections.push(new Set<vscode.Range>());
                    return;
                }

                let S = highlights[0].getRanges();

                for (let i = 1; i < highlights.length; i++) {
                    const nextRanges = highlights[i].getRanges();
                    const newIntersections: vscode.Range[] = [];

                    for (const r1 of S) {
                        for (const r2 of nextRanges) {
                            const intersection = r1.intersection(r2);
                            if (intersection) {
                                newIntersections.push(intersection);
                            }
                        }
                    }

                    if (newIntersections.length === 0) {
                        S = [];
                        break;
                    }

                    S = newIntersections;
                }

                this.rangeIntersections.push(new Set<vscode.Range>(S));
            });
        }
        generateIntersections();

        // create a new set of highlight color toggling workers
        this.handleJobs();
    }

    /**
     * kill any active interval jobs
     */
    private async stopJobs() {
        while (this.swappers.length > 0) {
            const swapper = this.swappers.pop();
            swapper?.dtor();
        }
    }

    private handleJobs() {
        console.log(`[*] Total Overlap Groups: ${this.overlapGroups.length}`);
        for (let i = 0; i < this.overlapGroups.length; i++) {
            const group = this.overlapGroups[i];
            const intersection = this.rangeIntersections[i];
            if (!intersection) continue;

            this.swappers.push(
                new ColorToggle(group, intersection)
            );
        }
    }
};