# EquicordTranslator

A multilingual Equicord user plugin that translates plugin descriptions and visible text on selected Equicord settings pages.

## Features

- Translates descriptions from built-in, disabled, and user plugins.
- Translates the Equicord Settings, Themes, Updater, Changelog, Cloud, Backup & Restore, and Patch Helper pages.
- Offers 68 target languages and detects the source language automatically.
- Re-translates descriptions and the open supported page when the target language changes.
- Keeps a separate local cache for each target language and migrates the old Russian cache.

## Installation

Clone this repository into the Equicord source tree:

```sh
git clone https://github.com/ress1zen/EquicordTranslator.git src/userplugins/equicordTranslator
```

Then build and inject Equicord using its documented workflow. Restart Discord, enable **EquicordTranslator** in Equicord → Plugins, and select a target language in the plugin settings.

## Translation service and privacy

Translations use Google Translate's unofficial endpoint without an API key. The plugin sends plugin descriptions and visible text from the supported Equicord settings pages to Google. It does not read Discord messages, account tokens, or profile data. Translation results are stored locally. The endpoint can rate-limit requests or change without notice.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
