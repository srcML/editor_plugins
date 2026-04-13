/**
SPDX-License-Identifier: GPL-3.0-only

@file utils.js

@copyright Copyright (C) 2013-2024 srcML, LLC. (www.srcML.org)
*/

// Only one instance of this is allowed (cannot be acquired in multiple files)
export const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : undefined;

/**
 * [ slideId:string, color:string ]
 */
let selectedProfiles = [];
const alphaValue = "75";
let profileColors = [
    "#4c9aff",
    "#f6ff4d",
    "#00BFA6",
    "#FFB020",
    "#E57373"
];
const unselectedColor = "#6666667e";

// webview listens for input from vscode
if (vscode) {
    window.addEventListener('message', event => {
        const msg = event.data;
        console.log(msg);
        if (msg.command) {
            if (msg.command === "auto-select") {
                // short-cut endpoint to find a slice
                if (selectedProfiles.length < profileColors.length) {
                    AddSelected(msg.sliceId);
                }
                ShowSelected();
            } else if (msg.command === "hide") {
                if (msg.sliceId) {
                    const index = selectedProfiles.findIndex(s => {
                        return s[0] === msg.sliceId;
                    });

                    if (index !== -1) {
                        console.log("Attempting to Hide Selected");

                        const hideTarget = selectedProfiles[index];
                        const highlightColor = hideTarget[1] + alphaValue;

                        // remove selected item
                        selectedProfiles.splice(index, 1);

                        GreyFill(highlightColor, msg.sliceId);
                    }
                }
            } else if (msg.command === "reload") {
                HighlightSelected();
            } else if (msg.command === "refresh") {
                RefreshVisuals();
            } else if (msg.command === "update-find") {
                if (msg.findTarget) {
                    const bottomBar = document.querySelector('.bottom-bar');
                    const findDisplay = document.getElementById('find_target_display');

                    console.log(bottomBar ? "Bottom Bar Found" : "Unknown Bottom Bar");
                    console.log(findDisplay ? "Find Display Found" : "Unknown Find Display");

                    if (bottomBar) {
                        bottomBar.style.display = 'block'; // display it
                        if (findDisplay) {
                            findDisplay.textContent = msg.findTarget;
                        }
                        bottomBar?.focus();
                    }
                }
            } else if (msg.command === "hide-find") {
                const bottomBar = document.querySelector('.bottom-bar');
                const findDisplay = document.getElementById('find_target_display');

                if (bottomBar) {
                    bottomBar.style.display = 'none'; // hide it
                    if (findDisplay) {
                        findDisplay.textContent = "";
                    }
                }
            }
        }
    });

    // inform the extension the panel is listening
    SendMessage({
        command: 'listener-ready'
    });
} else {
    console.error("vscode undefined")
}

/**
 * Send payload data to vscode api using postMessage
 * 
 * @param {JSON} data 
 */
export function SendMessage(data) {
    vscode?.postMessage(data);
}

/**
 * Send highlight signals to color all active profiles
 */
function HighlightSelected() {
    // send a highlight signal passing all active items
    for (const item of selectedProfiles) {
        const li = document.querySelector(
            `#slice-list li[data-profile="${CSS.escape(item[0])}"]`
        );
        const circle = li?.querySelector("svg circle");
        circle?.setAttribute("fill", item[1]);
        
        ToggleEntry(li);

        const highLightColor = item[1] + alphaValue;
        // signals vscode api from webview panel
        SendMessage({
            command: 'highlight',
            sliceId: item[0],
            color: highLightColor
        });
    }
}

/**
 * Find the svg associated with a selected sliceId and grey-fill
 * to show deselection
 * 
 * @param {*} highlightColor 
 * @param {*} sliceId 
 */
function GreyFill(highlightColor, sliceId) {
    // signals vscode api from webview panel
    SendMessage({
        command: 'rmHighlight',
        color: highlightColor
    });

    // change the fill color of the html elements svg to show unselected feedback
    // note that, the original color persists in the selectedProfiles list
    const li = document.querySelector(
        `#slice-list li[data-profile="${CSS.escape(sliceId)}"]`
    );
    const circle = li.querySelector("svg circle");
    circle?.setAttribute("fill", unselectedColor);
}

function FindUnusedColor() {
    // make a copy of allowed high-light colors
    let colors = [...profileColors];

    for (const item of selectedProfiles) {
        const index = colors.findIndex(c => {
            return c === item[1];
        });

        if (index !== -1) {
            colors.splice(index, 1);
        }
    }
    return colors.at(0);
}

/**
 * Append a new selected profile entry into collection
 * 
 * @param {*} sliceId 
 */
function AddSelected(sliceId) {
    // check if sliceId is already in selectedProfiles
    if (selectedProfiles.find(s => { return s[0] === sliceId})) return;

    // push the new entry using the unused color
    const color = FindUnusedColor();
    if (color) {
        console.log("NEW SELECTION");
        selectedProfiles.push([sliceId, color]);
    }
};

/**
 * Toggle whether an element is rendered in the HTML panel
 * 
 * @param {Element} entry 
 * @returns 
 */
function ToggleEntry(entry) {
    if (!entry) return;
    entry.style.display = '';
}

function ShowSelected() {
    try {
        if (!selectedProfiles) return;

        const [sliceid, color] = selectedProfiles.at(-1);
        if (!sliceid || !color) return;

        const li = document.querySelector(
            `#slice-list li[data-profile="${CSS.escape(sliceid)}"]`
        );
        const circle = li?.querySelector("svg circle");
        circle?.setAttribute("fill", color);

        ToggleEntry(li);

        const highLightColor = color + alphaValue;
        // signals vscode api from webview panel
        SendMessage({
            command: 'highlight',
            sliceId: sliceid,
            color: highLightColor
        });
    } catch (e) {
        console.error(`[-] ${e}`);
    }
}

let unselected = undefined;
export function SelectSlice(sliceId, ctrlDown) {
    // pop helper method
    const PopItem = (t) => {
        const i = selectedProfiles.findIndex(s => { return s === t});
        if (i !== -1) {
            selectedProfiles.splice(i, 1);
        }
    };

    /**
     * Remove a selected item from the selectedProfiles collection
     * 
     * Update the attached svg fill color to unselected color value
     * 
     * @param {*} t selected item
     * @return newly unselected profile or undefined
     */
    const UnselectItem = (t) => {
        if (!t) return undefined;

        console.log("UNSELECTING");

        // remove newly unselected from active list
        PopItem(t);

        const highlightColor = t[1] + alphaValue;

        GreyFill(highlightColor, t[0]);

        return t;
    };

    /**
     * Swap Highlight color values between a selectedProfile t and an unselected
     * 
     * @param {*} t profile swap target
     */
    const SwapColors = (t) => {
        if (!unselected) return;

        // keep a copy of the color of the unselected item to apply to its swap target
        const tmpColor = unselected[1];

        // change the values of the elements directly
        unselected[1] = t[1];

        const targetIndex = selectedProfiles.findIndex(s => { return s === t});
        selectedProfiles[targetIndex][1] = tmpColor;

        // refresh the state to ensure all changes
        // are displayed on the extension side
        HighlightSelected();
    }

    const target = selectedProfiles.find(s => { return s[0] === sliceId });
    if (unselected) {
        if (selectedProfiles.includes(target)) {
            if (ctrlDown) {
                // swap
                SwapColors(target);
                // reinsert unselected into collection
                selectedProfiles.push(unselected);
            } else {
                unselected = UnselectItem(target);
            }
        } else {
            // drop the recently unselected item
            // and add a new selection to the collection
            unselected = undefined;
            AddSelected(sliceId);
        }
    } else {
        if (selectedProfiles.includes(target)) {
            unselected = UnselectItem(target);
        } else if (selectedProfiles.length < profileColors.length) {
            AddSelected(sliceId);
        }
    }

    // show interaction feedback (selected/unselected)
    ShowSelected();
}

export function GetNextOccurrance() {
    SendMessage({ command: 'nextOccurrance' });
}

export function GetLastOccurrance() {
    SendMessage({ command: 'lastOccurrance' });
}

export function ManageEntries(entries, isVisible) {
    if (!entries) return;
    entries.forEach(li => {
        const circle = li.querySelector("svg circle");
        const fillColor = circle?.getAttribute("fill");

        // keep selected profiles visible
        if (circle && fillColor !== unselectedColor) {
            return;
        }

        li.style.display = isVisible ? '' : 'none';
    });
}

export function RefreshVisuals() {
    console.log(`[!] Signaling Visualizer to Refresh`);
    SendMessage({ command: 'refreshVisuals' });
    setTimeout(() => { HighlightSelected() }, 100);
}