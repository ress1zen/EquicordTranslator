/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Local User
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings, migratePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { React, showToast } from "@webpack/common";

import Plugins from "~plugins";

import { isSupportedLanguage, LANGUAGES, parseTranslation, type TranslationLanguage,translationUrl } from "./translation";

const logger = new Logger("EquicordTranslator");
const CACHE_KEY = "EquicordTranslator.cache.v2";
const LEGACY_CACHE_KEY = "RussianPluginDescriptions.cache.v1";
const PAGE_TITLES = new Set([
    "Equicord Settings",
    "Themes",
    "Equicord Updater",
    "Changelog",
    "Equicord Cloud",
    "Backup & Restore",
    "Patch Helper"
]);
const originals = new Map<string, string>();
const applied = new Map<string, string>();
const translatedPageNodes = new Map<Text, { original: string; translated: string; }>();
const pendingPageNodes = new Map<Text, string>();
const failedPageNodes = new Map<Text, string>();
const inFlightTranslations = new Map<string, Promise<string>>();
const pageRoots = new Map<HTMLElement, MutationObserver>();
const listeners = new Set<() => void>();
const cache: Record<string, string> = Object.create(null);
let cacheLoad: Promise<void> | undefined;
let cacheWrite = Promise.resolve();
let generation = 0;
let pageGeneration = 0;
let active = false;
let running = false;
let pageDiscoveryObserver: MutationObserver | undefined;
let pageScanTimer: ReturnType<typeof setTimeout> | undefined;
let pageQueue: Array<{ node: Text; source: string; token: number; }> = [];
let pageWorkers = 0;
let status = "Translation has not started.";
let pageStatus = "Equicord settings pages will be translated automatically when opened.";

migratePluginSettings("EquicordTranslator", "RussianPluginDescriptions");

const settings = definePluginSettings({
    targetLanguage: {
        type: OptionType.SELECT,
        displayName: "Translation Language",
        description: "Language used for plugin descriptions and Equicord settings pages. Translations refresh automatically when you change it.",
        options: LANGUAGES,
        onChange: targetLanguageChanged
    }
});

function getTargetLanguage(): TranslationLanguage {
    const language = settings.store.targetLanguage;
    return typeof language === "string" && isSupportedLanguage(language) ? language : "ru";
}

function languageLabel(language: TranslationLanguage) {
    return LANGUAGES.find(option => option.value === language)?.label ?? "Russian";
}

function cacheKey(source: string, language: TranslationLanguage) {
    return JSON.stringify([language, source]);
}

function notify() {
    listeners.forEach(listener => listener());
}

function report(text: string) {
    status = text;
    notify();
}

function reportPage(text: string) {
    pageStatus = text;
    notify();
}

async function translate(text: string, language: TranslationLanguage): Promise<string> {
    if (!IS_WEB) {
        const native = VencordNative.pluginHelpers.EquicordTranslator as PluginNative<typeof import("./native")>;
        return native.translateDescription(text, language);
    }
    const response = await fetch(translationUrl(text, language), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Google Translate: HTTP ${response.status}`);
    return parseTranslation(await response.json());
}

function loadCache() {
    if (!cacheLoad) {
        cacheLoad = Promise.all([
            DataStore.get<unknown>(CACHE_KEY),
            DataStore.get<unknown>(LEGACY_CACHE_KEY)
        ]).then(([saved, legacy]) => {
            if (saved && typeof saved === "object" && !Array.isArray(saved)) {
                for (const [key, value] of Object.entries(saved)) {
                    if (typeof value === "string" && value.trim()) cache[key] = value;
                }
            }
            let migrated = false;
            if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
                for (const [source, value] of Object.entries(legacy)) {
                    if (typeof value === "string" && value.trim()) {
                        cache[cacheKey(source, "ru")] ??= value;
                        migrated = true;
                    }
                }
            }
            if (migrated) return saveCache();
        }).catch(error => {
            cacheLoad = undefined;
            throw error;
        });
    }
    return cacheLoad;
}

function saveCache() {
    const snapshot = { ...cache };
    cacheWrite = cacheWrite.catch(() => undefined).then(() => DataStore.set(CACHE_KEY, snapshot)).catch(error => {
        logger.warn("Could not save translation cache", error);
    });
    return cacheWrite;
}

async function getTranslation(source: string, language: TranslationLanguage): Promise<string> {
    const key = cacheKey(source, language);
    if (cache[key]) return cache[key];

    let request = inFlightTranslations.get(key);
    if (!request) {
        request = translate(source, language).then(result => {
            cache[key] = result;
            void saveCache();
            return result;
        }).finally(() => inFlightTranslations.delete(key));
        inFlightTranslations.set(key, request);
    }
    return request;
}

function isAlreadyTargetLanguage(text: string, language: TranslationLanguage) {
    return language === "ru" && /[а-яё]/i.test(text) && !/[a-z]{3}/i.test(text);
}

async function run(token: number) {
    let completed = 0;
    let consecutiveFailures = 0;
    const language = getTargetLanguage();
    const entries = Object.entries(Plugins).filter(([, plugin]) => plugin.description?.trim());
    try {
        await loadCache();
        if (token !== generation) return;

        for (const [name, plugin] of entries) {
            if (!originals.has(name)) originals.set(name, plugin.description);
            const source = originals.get(name)!;
            const cached = cache[cacheKey(source, language)];
            if (cached) {
                plugin.description = cached;
                applied.set(name, cached);
                completed++;
            }
        }
        for (const [name, plugin] of entries) {
            if (token !== generation) return;
            const source = originals.get(name)!;
            if (applied.has(name)) continue;
            if (isAlreadyTargetLanguage(source, language)) {
                plugin.description = source;
                applied.set(name, source);
                completed++;
                continue;
            }

            const cached = cache[cacheKey(source, language)];
            if (cached) {
                plugin.description = cached;
                applied.set(name, cached);
                completed++;
                continue;
            }
            report(`Translated ${completed} of ${entries.length} into ${languageLabel(language)}. Current plugin: ${name}`);
            try {
                const result = await getTranslation(source, language);
                if (token !== generation) return;
                plugin.description = result;
                applied.set(name, result);
                completed++;
                consecutiveFailures = 0;
            } catch (error) {
                if (token !== generation) return;
                consecutiveFailures++;
                logger.warn(`Could not translate ${name}`, error);
                if (consecutiveFailures >= 5) break;
            }
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        if (token !== generation) return;
        report(`Translated ${completed} of ${entries.length} into ${languageLabel(language)}. ${completed < entries.length ? "You can retry the remaining descriptions with the button below." : "Done."} Close and reopen the plugin list.`);
        showToast(completed === entries.length
            ? `Descriptions translated into ${languageLabel(language)}. Reopen the plugin list.`
            : `Translated ${completed}/${entries.length}. Check your connection and retry in the plugin settings.`,
        completed === entries.length ? "success" : "failure");
    } catch (error) {
        if (token === generation) {
            logger.error("Translation failed", error);
            report("Could not load the translation cache. Please try again.");
        }
    } finally {
        if (token === generation) {
            running = false;
            notify();
        }
    }
}

function begin() {
    if (running) return;
    running = true;
    report("Loading the translation cache…");
    void run(++generation);
}

function isSupportedSettingsPage(root: HTMLElement) {
    const text = root.textContent ?? "";
    return (text.includes("Quick Actions") && text.includes("Client Settings"))
        || text.includes("Theme Management")
        || text.includes("Themes Not Supported")
        || text.includes("Update Preferences")
        || text.includes("Fetch Changes")
        || text.includes("Cloud Integration")
        || (text.includes("Import Settings") && text.includes("Export Settings"))
        || text.includes("Full Patch");
}

function isVisibleTextNode(node: Text) {
    const element = node.parentElement;
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
        && rect.top < window.innerHeight && rect.bottom > 0
        && rect.left < window.innerWidth && rect.right > 0;
}

function translatedValue(source: string, result: string) {
    const leading = source.match(/^\s*/)?.[0] ?? "";
    const trailing = source.match(/\s*$/)?.[0] ?? "";
    return leading + result + trailing;
}

function applyPageTranslation(node: Text, source: string, result: string) {
    if (!node.isConnected || node.nodeValue !== source) return;
    const translated = translatedValue(source, result);
    translatedPageNodes.set(node, { original: source, translated });
    node.nodeValue = translated;
}

function queuePageNode(textNode: Text, token: number) {
    const source = textNode.nodeValue ?? "";
    const trimmed = source.trim();
    const language = getTargetLanguage();
    if (!trimmed || isAlreadyTargetLanguage(trimmed, language)) return;
    if (textNode.parentElement?.closest("script, style, code, pre, textarea, input, [data-russian-translate-ignore]")) return;
    if (!isVisibleTextNode(textNode)) return;
    const prior = translatedPageNodes.get(textNode);
    if (prior?.translated === source || pendingPageNodes.get(textNode) === source || failedPageNodes.get(textNode) === source) return;

    const cached = cache[cacheKey(trimmed, language)];
    if (cached) {
        applyPageTranslation(textNode, source, cached);
        return;
    }
    pendingPageNodes.set(textNode, source);
    pageQueue.push({ node: textNode, source, token });
}

function queuePageText(root: HTMLElement, token: number) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) queuePageNode(node as Text, token);

    for (let parent = root.parentElement, depth = 0; parent && depth < 5; parent = parent.parentElement, depth++) {
        const title = Array.from(parent.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]"))
            .find(heading => !root.contains(heading) && PAGE_TITLES.has(heading.textContent?.trim() ?? ""));
        if (title) {
            const titleWalker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
            let titleNode: Node | null;
            while ((titleNode = titleWalker.nextNode())) queuePageNode(titleNode as Text, token);
            break;
        }
    }
    drainPageQueue();
}

function updatePageStatus() {
    const failures = failedPageNodes.size;
    const fragments = translatedPageNodes.size;
    reportPage(`Equicord pages: ${fragments} items translated${failures ? `, ${failures} failed. Click “Retry page translation.”` : "."}`);
}

function drainPageQueue() {
    while (pageWorkers < 2 && pageQueue.length) {
        const task = pageQueue.shift()!;
        pageWorkers++;
        void (async () => {
            try {
                await loadCache();
                if (task.token !== pageGeneration || task.node.nodeValue !== task.source || !task.node.isConnected) return;
                const source = task.source.trim();
                const result = await getTranslation(source, getTargetLanguage());
                if (task.token !== pageGeneration) return;
                applyPageTranslation(task.node, task.source, result);
                updatePageStatus();
            } catch (error) {
                if (task.token === pageGeneration) {
                    failedPageNodes.set(task.node, task.source);
                    logger.warn("Could not translate Equicord settings text", error);
                    updatePageStatus();
                }
            } finally {
                if (pendingPageNodes.get(task.node) === task.source) pendingPageNodes.delete(task.node);
                pageWorkers--;
                if (pageQueue.length) setTimeout(drainPageQueue, 180);
            }
        })();
    }
}

function watchPageRoot(root: HTMLElement, token: number) {
    if (pageRoots.has(root)) return;
    const observer = new MutationObserver(() => queuePageText(root, token));
    pageRoots.set(root, observer);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    queuePageText(root, token);
    updatePageStatus();
}

function inspectAddedNode(node: Node, token: number) {
    const element = node instanceof Element ? node : node.parentElement;
    if (!element) return;

    const containingRoot = element.closest<HTMLElement>(".vc-settings-tab");
    if (containingRoot && (pageRoots.has(containingRoot) || isSupportedSettingsPage(containingRoot))) {
        watchPageRoot(containingRoot, token);
    }
    for (const root of element.querySelectorAll<HTMLElement>(".vc-settings-tab")) {
        if (isSupportedSettingsPage(root)) watchPageRoot(root, token);
    }
}

function schedulePageScan() {
    clearTimeout(pageScanTimer);
    pageScanTimer = setTimeout(() => {
        for (const root of pageRoots.keys()) queuePageText(root, pageGeneration);
    }, 150);
}

function startPageTranslation() {
    if (typeof document === "undefined" || !document.body) return;
    const token = ++pageGeneration;
    for (const root of document.querySelectorAll<HTMLElement>(".vc-settings-tab")) {
        if (isSupportedSettingsPage(root)) watchPageRoot(root, token);
    }
    document.addEventListener("scroll", schedulePageScan, true);
    pageDiscoveryObserver = new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) inspectAddedNode(node, token);
        }
        for (const [root, observer] of pageRoots) {
            if (!root.isConnected) {
                observer.disconnect();
                pageRoots.delete(root);
            }
        }
    });
    pageDiscoveryObserver.observe(document.body, { childList: true, subtree: true });
    if (!pageRoots.size) reportPage("Open a supported Equicord settings page to translate it automatically.");
}

function retryPageTranslation() {
    failedPageNodes.clear();
    for (const root of pageRoots.keys()) queuePageText(root, pageGeneration);
    reportPage("Retrying page translation…");
}

function stopPageTranslation() {
    pageGeneration++;
    document.removeEventListener("scroll", schedulePageScan, true);
    clearTimeout(pageScanTimer);
    pageScanTimer = undefined;
    pageDiscoveryObserver?.disconnect();
    pageDiscoveryObserver = undefined;
    for (const observer of pageRoots.values()) observer.disconnect();
    pageRoots.clear();
    pageQueue = [];
    pendingPageNodes.clear();
    failedPageNodes.clear();
    for (const [node, translation] of translatedPageNodes) {
        if (node.nodeValue === translation.translated) node.nodeValue = translation.original;
    }
    translatedPageNodes.clear();
    reportPage("Equicord page translation is disabled.");
}

function restoreDescriptions() {
    for (const [name, original] of originals) {
        const plugin = Plugins[name];
        if (plugin && plugin.description === applied.get(name)) plugin.description = original;
    }
}

function targetLanguageChanged() {
    if (!active) return;
    generation++;
    running = false;
    restoreDescriptions();
    applied.clear();
    begin();
    stopPageTranslation();
    startPageTranslation();
}

function Status() {
    const text = React.useSyncExternalStore(callback => {
        listeners.add(callback);
        return () => { listeners.delete(callback); };
    }, () => `${running}\0${status}\0${pageStatus}`);
    const [, descriptionStatus, currentPageStatus] = text.split("\0");
    const language = languageLabel(getTargetLanguage());

    return <div>
        <p>{descriptionStatus}</p>
        <p>Translation Language: {language}. В Google отправляются описания плагинов и видимый текст страниц Equicord. Переводы сохраняются локально.</p>
        <Button disabled={running} onClick={begin}>Retry Description Translation</Button>
        <p>{currentPageStatus}</p>
        <Button onClick={retryPageTranslation}>Retry Page Translation</Button>
    </div>;
}

export default definePlugin({
    name: "EquicordTranslator",
    description: "Translates plugin descriptions and Equicord settings pages into the selected language.",
    authors: [{ name: "Local User", id: 0n }],
    tags: ["Utility"],
    settings,
    settingsAboutComponent: Status,
    start() {
        active = true;
        begin();
        startPageTranslation();
    },
    stop() {
        active = false;
        generation++;
        running = false;
        stopPageTranslation();
        restoreDescriptions();
        originals.clear();
        applied.clear();
        report("Translation is disabled. Reopen the plugin list.");
    }
});
