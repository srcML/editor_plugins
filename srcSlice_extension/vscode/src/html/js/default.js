/**
SPDX-License-Identifier: GPL-3.0-only

@file default.js

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

// Only one instance of this is allowed (cannot be acquired in multiple files)
export const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : undefined;

/**
 * Send payload data to vscode api using postMessage
 * 
 * @param {JSON} data 
 */
export function SendMessage(data) {
    vscode?.postMessage(data);
}

const workspaceSliceBtn = document.getElementById('sw-action');
workspaceSliceBtn?.addEventListener('click', () => {
    SendMessage({ "command":"sliceWorkspace" });
});

const editorSliceBtn = document.getElementById('se-action');
editorSliceBtn?.addEventListener('click', () => {
    SendMessage({ "command":"sliceEditors" });
});