/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent, net } from "electron";

import { isSupportedLanguage, parseTranslation, translationUrl } from "./translation";

export async function translateDescription(_: IpcMainInvokeEvent, text: string, targetLanguage: string): Promise<string> {
    if (typeof text !== "string" || !text.trim() || text.length > 12000 || !isSupportedLanguage(targetLanguage))
        throw new Error("Invalid translation request");
    const response = await net.fetch(translationUrl(text, targetLanguage), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Google Translate: HTTP ${response.status}`);
    return parseTranslation(await response.json());
}
