/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const LANGUAGES = [
    { label: "Afrikaans", value: "af" },
    { label: "Albanian (Shqip)", value: "sq" },
    { label: "Amharic (አማርኛ)", value: "am" },
    { label: "Arabic (العربية)", value: "ar" },
    { label: "Armenian (Հայերեն)", value: "hy" },
    { label: "Azerbaijani (Azərbaycanca)", value: "az" },
    { label: "Basque (Euskara)", value: "eu" },
    { label: "Belarusian (Беларуская)", value: "be" },
    { label: "Bengali (বাংলা)", value: "bn" },
    { label: "Bosnian (Bosanski)", value: "bs" },
    { label: "Bulgarian (Български)", value: "bg" },
    { label: "Catalan (Català)", value: "ca" },
    { label: "Chinese, Simplified (简体中文)", value: "zh-CN" },
    { label: "Chinese, Traditional (繁體中文)", value: "zh-TW" },
    { label: "Croatian (Hrvatski)", value: "hr" },
    { label: "Czech (Čeština)", value: "cs" },
    { label: "Danish (Dansk)", value: "da" },
    { label: "Dutch (Nederlands)", value: "nl" },
    { label: "English", value: "en" },
    { label: "Estonian (Eesti)", value: "et" },
    { label: "Filipino", value: "tl" },
    { label: "Finnish (Suomi)", value: "fi" },
    { label: "French (Français)", value: "fr" },
    { label: "Galician (Galego)", value: "gl" },
    { label: "Georgian (ქართული)", value: "ka" },
    { label: "German (Deutsch)", value: "de" },
    { label: "Greek (Ελληνικά)", value: "el" },
    { label: "Gujarati (ગુજરાતી)", value: "gu" },
    { label: "Hebrew (עברית)", value: "he" },
    { label: "Hindi (हिन्दी)", value: "hi" },
    { label: "Hungarian (Magyar)", value: "hu" },
    { label: "Icelandic (Íslenska)", value: "is" },
    { label: "Indonesian (Bahasa Indonesia)", value: "id" },
    { label: "Irish (Gaeilge)", value: "ga" },
    { label: "Italian (Italiano)", value: "it" },
    { label: "Japanese (日本語)", value: "ja" },
    { label: "Kannada (ಕನ್ನಡ)", value: "kn" },
    { label: "Kazakh (Қазақша)", value: "kk" },
    { label: "Khmer (ខ្មែរ)", value: "km" },
    { label: "Korean (한국어)", value: "ko" },
    { label: "Latvian (Latviešu)", value: "lv" },
    { label: "Lithuanian (Lietuvių)", value: "lt" },
    { label: "Macedonian (Македонски)", value: "mk" },
    { label: "Malay (Bahasa Melayu)", value: "ms" },
    { label: "Malayalam (മലയാളം)", value: "ml" },
    { label: "Marathi (मराठी)", value: "mr" },
    { label: "Mongolian (Монгол)", value: "mn" },
    { label: "Nepali (नेपाली)", value: "ne" },
    { label: "Norwegian (Norsk)", value: "no" },
    { label: "Persian (فارسی)", value: "fa" },
    { label: "Polish (Polski)", value: "pl" },
    { label: "Portuguese (Português)", value: "pt" },
    { label: "Punjabi (ਪੰਜਾਬੀ)", value: "pa" },
    { label: "Romanian (Română)", value: "ro" },
    { label: "Russian (Русский)", value: "ru", default: true },
    { label: "Serbian (Српски)", value: "sr" },
    { label: "Slovak (Slovenčina)", value: "sk" },
    { label: "Slovenian (Slovenščina)", value: "sl" },
    { label: "Spanish (Español)", value: "es" },
    { label: "Swahili (Kiswahili)", value: "sw" },
    { label: "Swedish (Svenska)", value: "sv" },
    { label: "Tamil (தமிழ்)", value: "ta" },
    { label: "Telugu (తెలుగు)", value: "te" },
    { label: "Thai (ไทย)", value: "th" },
    { label: "Turkish (Türkçe)", value: "tr" },
    { label: "Ukrainian (Українська)", value: "uk" },
    { label: "Urdu (اردو)", value: "ur" },
    { label: "Vietnamese (Tiếng Việt)", value: "vi" }
] as const;

export type TranslationLanguage = typeof LANGUAGES[number]["value"];

export function isSupportedLanguage(language: string): language is TranslationLanguage {
    return LANGUAGES.some(option => option.value === language);
}

export function translationUrl(text: string, targetLanguage: TranslationLanguage): string {
    return "https://translate.googleapis.com/translate_a/single?" + new URLSearchParams({
        client: "gtx", sl: "auto", tl: targetLanguage, dt: "t", q: text
    });
}

export function parseTranslation(data: unknown): string {
    if (!Array.isArray(data) || !Array.isArray(data[0]))
        throw new Error("Unexpected translation response");
    const segments = data[0];
    if (!segments.length || segments.some(segment => !Array.isArray(segment) || typeof segment[0] !== "string"))
        throw new Error("Invalid translation segments");
    const result = segments.map(segment => segment[0]).join("").trim();
    if (!result) throw new Error("Empty translation");
    return result;
}
