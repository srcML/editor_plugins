/**
SPDX-License-Identifier: GPL-3.0-only

@file profileWalk.ts

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

import * as vscode from 'vscode';

import { LinePosition, SliceProfile } from '../../utils/collections';
import { fromFileTable } from '../generate';

export default class ProfileWalker {
    private slineIndex: number = 0;
    private profileIndex: number = 0;

    private profiles: Array<SliceProfile> = [];

    private lineFocus: vscode.TextEditorDecorationType|undefined;

    constructor() {}
    dtor() {
        this.lineFocus?.dispose();
    }

    pushProfile(sp: SliceProfile, sline: [number, number] | undefined = undefined) {
        // do not insert duplicates
        if (this.profiles.find(p => p === sp)) return;
        console.log('[*] Adding Profile');

        this.profiles.push(sp);
        if (this.slineIndex == 0) {
            // change index focus if the user is not
            // actively looking through the indexed slice
            this.profileIndex = this.profiles.length - 1;
        }
        
        // update index on new push
        if (!sline) return;
        this.slineIndex = sp.slines.findIndex(s => {
            return s[1].ToString() === `${sline[0]}:${sline[1]}`;
        });
    }
    popProfile(sp: SliceProfile|undefined) {
        if (!sp) return;
        console.log('[*] Removing Profile');

        const pos = this.profiles.findIndex(p => p === sp);

        if (pos === -1) return;

        // reference to currently indexed profile
        const current = this.profiles.at(this.profileIndex);

        this.profiles.splice(pos, 1);

        this.profileIndex = 0;
        if (this.profiles.length > 0 && current) {
            // re-index post-removal
            this.profileIndex = this.profiles.findIndex(sp => sp === current);
        }
    }
    activeCount(): number { return this.profiles.length };

    /**
     * Open a read-only editor based on the given
     * source file path
     * 
     * @param srcFile 
     */
    private async changeEditor(srcFile: string) {
        const file = fromFileTable(srcFile);
        const uri = vscode.Uri.from({
            scheme: "slice-preview",
            path: file,
            query: file
        });
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
    }

    private moveCursor(pos: LinePosition|undefined) {
        if (!pos) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        // vscode position has an offset compared to stored position data
        const newCurPos = new vscode.Position(pos.line+1, pos.column+1);

        // show cursor position in the editor
        editor.selection = new vscode.Selection(newCurPos, newCurPos);
        editor.revealRange(
            new vscode.Range(newCurPos, newCurPos),
            vscode.TextEditorRevealType.InCenter
        );

        // dispose existing decoration before creating a new one
        this.lineFocus?.dispose();
        this.lineFocus = vscode.window.createTextEditorDecorationType({
            backgroundColor: "#626262ce",
            isWholeLine: true
        });
        if (this.lineFocus) {
            const p = new vscode.Position(pos.line - 1, pos.column - 1);
            const r = new vscode.Range(p,p);
            editor?.setDecorations(this.lineFocus, [r]);
        }
    };

    /**
     * Move cursor to the next sline
     * 
     * @returns 
     */
    async nextOccurrance() {
        console.log("Find Next Sline");

        ++this.slineIndex;
        if (this.slineIndex >= this.profiles[this.profileIndex].slines.length) {
            this.profileIndex = ++this.profileIndex % this.profiles.length;
            this.slineIndex = 0;
        }

        const sline = this.profiles[this.profileIndex].slines.at(this.slineIndex);
        if (!sline) return;

        const [ file, start, end ] = sline;
        await this.changeEditor(file);
        this.moveCursor(start);
    }

    /**
     * Move cursor to the previous sline
     * 
     * @returns 
     */
    async lastOccurrance() {
        console.log("Find Previous Sline");

        --this.slineIndex;
        if (this.slineIndex < 0) {
            this.profileIndex = (--this.profileIndex + this.profiles.length) % this.profiles.length;
            this.slineIndex = this.profiles[this.profileIndex].slines.length - 1;
        }

        const sline = this.profiles[this.profileIndex].slines.at(this.slineIndex);
        if (!sline) return;
        
        const [ file, start, end ] = sline;
        await this.changeEditor(file);
        this.moveCursor(start);
    }
};