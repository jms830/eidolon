================
CODE SNIPPETS
================
TITLE: Bootstrap WXT Project
DESCRIPTION: Initialize a new WXT project using the `init` command. This command is available via PNPM, Bun, NPM, and Yarn. The command will guide you through the setup process.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/installation.md

LANGUAGE: sh
CODE:
```
pnpm dlx wxt@latest init
```

LANGUAGE: sh
CODE:
```
bunx wxt@latest init
```

LANGUAGE: sh
CODE:
```
npx wxt@latest init
```

LANGUAGE: sh
CODE:
```
# Use NPM initially, but select Yarn when prompted
npx wxt@latest init
```

--------------------------------

TITLE: Run WXT Development Server
DESCRIPTION: Start the WXT development server to actively develop and test your browser extension. This command will automatically open a browser window with your extension installed.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/installation.md

LANGUAGE: sh
CODE:
```
pnpm dev
```

LANGUAGE: sh
CODE:
```
bun run dev
```

LANGUAGE: sh
CODE:
```
npm run dev
```

LANGUAGE: sh
CODE:
```
yarn dev
```

--------------------------------

TITLE: Setup WXT with pnpm
DESCRIPTION: Instructions to enable corepack and install WXT dependencies using pnpm.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/CONTRIBUTING.md

LANGUAGE: sh
CODE:
```
corepack enable
pnpm i
```

--------------------------------

TITLE: Vue.js Component Setup
DESCRIPTION: This snippet shows the setup of a Vue.js component using the script setup syntax with TypeScript. It imports a BlogHome component and renders it.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/blog.md

LANGUAGE: vue
CODE:
```
<script lang="ts" setup>
import BlogHome from './.vitepress/components/BlogHome.vue';
</script>

<BlogHome />
```

--------------------------------

TITLE: WXT Configuration Example
DESCRIPTION: A basic example of a WXT configuration file, demonstrating the structure for defining web extension configurations.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/config/browser-startup.md

LANGUAGE: ts
CODE:
```
import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  // ...
});
```

--------------------------------

TITLE: Setup and Develop WXT Vue Template
DESCRIPTION: Navigates into the Vue template directory, installs dependencies using npm (not pnpm), and runs development and build commands for the template.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/CONTRIBUTING.md

LANGUAGE: sh
CODE:
```
cd templates/vue
npm i
npm run dev
npm run build
```

--------------------------------

TITLE: Create Project Directory
DESCRIPTION: Create a new project directory and navigate into it before initializing WXT or installing dependencies. This is a standard step for setting up any new project.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/installation.md

LANGUAGE: sh
CODE:
```
cd my-project
pnpm init
```

LANGUAGE: sh
CODE:
```
cd my-project
bun init
```

LANGUAGE: sh
CODE:
```
cd my-project
npm init
```

LANGUAGE: sh
CODE:
```
cd my-project
yarn init
```

--------------------------------

TITLE: Install Specific Unreleased WXT Package Builds
DESCRIPTION: Demonstrates various ways to install unreleased WXT packages using specific PR numbers, branch names, or commit hashes. Examples include installing `wxt` from a PR, `@wxt-dev/module-react` from the `main` branch, and `@wxt-dev/module-react` from a specific commit.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/CONTRIBUTING.md

LANGUAGE: sh
CODE:
```
# Install the latest build of `wxt` from a PR:
npm i https://pkg.pr.new/wxt@1283

# Install the latest build of `@wxt-dev/module-react` on the `main` branch
npm i https://pkg.pr.new/@wxt-dev/module-react@main

# Install `@wxt-dev/storage` from a specific commit:
npm i https://pkg.pr.new/@wxt-dev/module-react@426f907
```

--------------------------------

TITLE: Install Dependencies
DESCRIPTION: Installs the necessary packages for using webextension-polyfill with WXT.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/webextension-polyfill/README.md

LANGUAGE: sh
CODE:
```
pnpm i @wxt-dev/webextension-polyfill webextension-polyfill
```

--------------------------------

TITLE: GitHub Actions Workflow for WXT Publishing
DESCRIPTION: An example GitHub Actions workflow to automate the building and submission of browser extensions using WXT. It includes steps for checking out code, setting up Node.js and pnpm, installing dependencies, zipping the extensions, and submitting them to various stores using environment variables for authentication.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/publishing.md

LANGUAGE: yml
CODE:
```
name: Release

on:
  workflow_dispatch:

jobs:
  submit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Zip extensions
        run: |
          pnpm zip
          pnpm zip:firefox

      - name: Submit to stores
        run: |
          pnpm wxt submit \
            --chrome-zip .output/*-chrome.zip \
            --firefox-zip .output/*-firefox.zip --firefox-sources-zip .output/*-sources.zip
        env:
          CHROME_EXTENSION_ID: ${{ secrets.CHROME_EXTENSION_ID }}
          CHROME_CLIENT_ID: ${{ secrets.CHROME_CLIENT_ID }}
          CHROME_CLIENT_SECRET: ${{ secrets.CHROME_CLIENT_SECRET }}
          CHROME_REFRESH_TOKEN: ${{ secrets.CHROME_REFRESH_TOKEN }}
          FIREFOX_EXTENSION_ID: ${{ secrets.FIREFOX_EXTENSION_ID }}
          FIREFOX_JWT_ISSUER: ${{ secrets.FIREFOX_JWT_ISSUER }}
          FIREFOX_JWT_SECRET: ${{ secrets.FIREFOX_JWT_SECRET }}
```

--------------------------------

TITLE: WXT Background Entrypoint
DESCRIPTION: Define a background script for your browser extension using WXT. This TypeScript example shows how to export a background definition with a simple console log.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/installation.md

LANGUAGE: ts
CODE:
```
export default defineBackground(() => {
  console.log('Hello world!');
});
```

--------------------------------

TITLE: Background Entrypoint Examples
DESCRIPTION: Illustrates how to structure entrypoints for a 'Background' type, showing both single file and directory configurations.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/entrypoints.md

LANGUAGE: html
CODE:
```
📂 entrypoints/
   📄 background.ts
```

LANGUAGE: html
CODE:
```
📂 entrypoints/
   📂 background/
      📄 index.ts
```

--------------------------------

TITLE: WXT Postinstall Script
DESCRIPTION: Ensures WXT prepares the project after installation by adding the `postinstall` script to `package.json`.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/resources/migrate.md

LANGUAGE: json
CODE:
```
{
  "scripts": {
    "postinstall": "wxt prepare"
  }
}
```

--------------------------------

TITLE: Install SolidJS and WXT Solid Module
DESCRIPTION: Installs the necessary SolidJS library and the WXT Solid module using pnpm.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/module-solid/README.md

LANGUAGE: bash
CODE:
```
pnpm i solid-js
pnpm i -D @wxt-dev/module-solid
```

--------------------------------

TITLE: Install React and WXT React Module
DESCRIPTION: Installs the necessary React libraries and the WXT React module using pnpm.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/module-react/README.md

LANGUAGE: sh
CODE:
```
pnpm i react react-dom
pnpm i -D @wxt-dev/module-react
```

--------------------------------

TITLE: Package.json Scripts for WXT
DESCRIPTION: Example of package.json scripts to integrate WXT build and development commands, including a postinstall script.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/resources/migrate.md

LANGUAGE: json
CODE:
```
{
  "scripts": {
    "dev": "wxt dev",
    "build": "wxt build",
    "postinstall": "wxt postinstall"
    // ... other scripts
  }
}
```

--------------------------------

TITLE: Install WXT Dependency
DESCRIPTION: Install WXT as a development dependency in your project using your preferred package manager. This makes the WXT CLI available for running development and build commands.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/installation.md

LANGUAGE: sh
CODE:
```
pnpm i -D wxt
```

LANGUAGE: sh
CODE:
```
bun i -D wxt
```

LANGUAGE: sh
CODE:
```
npm i -D wxt
```

LANGUAGE: sh
CODE:
```
yarn add --dev wxt
```

--------------------------------

TITLE: Install @wxt-dev/storage
DESCRIPTION: Provides commands to install the @wxt-dev/storage NPM package using various package managers.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/storage/README.md

LANGUAGE: sh
CODE:
```
npm i @wxt-dev/storage
pnpm add @wxt-dev/storage
yarn add @wxt-dev/storage
bun add @wxt-dev/storage
```

--------------------------------

TITLE: Install Framework Modules
DESCRIPTION: Demonstrates how to install and configure WXT modules for React, Vue, Svelte, and Solid by adding them to the defineConfig.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/frontend-frameworks.md

LANGUAGE: ts
CODE:
```
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
});
```

LANGUAGE: ts
CODE:
```
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
});
```

LANGUAGE: ts
CODE:
```
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
});
```

LANGUAGE: ts
CODE:
```
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-solid'],
});
```

--------------------------------

TITLE: Start Docs Website Locally
DESCRIPTION: Command to run the WXT documentation website in local development mode.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/CONTRIBUTING.md

LANGUAGE: sh
CODE:
```
pnpm docs:dev
```

--------------------------------

TITLE: Install Svelte and WXT Svelte Module
DESCRIPTION: Installs the Svelte library and the WXT Svelte module using pnpm.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/module-svelte/README.md

LANGUAGE: sh
CODE:
```
pnpm i svelte
pnpm i -D @wxt-dev/module-svelte
```

--------------------------------

TITLE: WXT Hero Section Configuration
DESCRIPTION: Configuration for the main hero section of the WXT documentation site, including the project name, tagline, logo, and call-to-action buttons for getting started and learning more.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/index.md

LANGUAGE: html
CODE:
```
layout: home
title: Next-gen Web Extension Framework

hero:
  name: WXT
  text: Next-gen Web Extension Framework
  tagline: An open source tool that makes web extension development faster than ever before.
  image:
    src: /hero-logo.svg
    alt: WXT
  actions:
    - theme: brand
      text: Get Started
      link: /guide/installation
    - theme: alt
      text: Learn More
      link: /guide/introduction
```

--------------------------------

TITLE: WXT Storage Installation
DESCRIPTION: Demonstrates how to import the storage module when using WXT with auto-imports and when installing the package separately.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/storage.md

LANGUAGE: ts
CODE:
```
import { storage } from '#imports';
```

LANGUAGE: sh
CODE:
```
npm i @wxt-dev/storage
pnpm add @wxt-dev/storage
yarn add @wxt-dev/storage
bun add @wxt-dev/storage
```

LANGUAGE: ts
CODE:
```
import { storage } from '@wxt/storage';
```

--------------------------------

TITLE: Initialize New WXT Project
DESCRIPTION: This snippet demonstrates the usage of the `wxt init` command to start a new WXT project. It typically involves setting up project files and configurations.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/api/cli/wxt-init.md

LANGUAGE: sh
CODE:
```
#!/bin/bash
wxt init

```

--------------------------------

TITLE: Install @wxt-dev/i18n with WXT
DESCRIPTION: Installs the @wxt-dev/i18n package using pnpm and configures the WXT build process to use it.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/i18n/README.md

LANGUAGE: sh
CODE:
```
pnpm i @wxt-dev/i18n
```

--------------------------------

TITLE: WXT Package.json Scripts
DESCRIPTION: Add essential WXT scripts to your `package.json` file for managing development, building, and packaging your browser extension. This includes commands for different browsers and a `postinstall` hook for preparation.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/installation.md

LANGUAGE: json
CODE:
```
{
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",
    "zip:firefox": "wxt zip -b firefox",
    "postinstall": "wxt prepare"
  }
}
```

--------------------------------

TITLE: Example of Bulk Setting Items in WXT Storage (TypeScript)
DESCRIPTION: Provides a practical example of using `storage.setItems` to efficiently update multiple storage entries. It demonstrates setting values using both direct string keys and previously defined `WxtStorageItem` objects.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/storage.md

LANGUAGE: TypeScript
CODE:
```
const userId = storage.defineItem('local:userId');

await storage.setItems([
  { key: 'local:installDate', value: Date.now() },
  { item: userId, value: generateUserId() },
]);
```

--------------------------------

TITLE: Opening Start URLs
DESCRIPTION: Configures the runner to open specific URLs in new tabs when the browser starts.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/runner/README.md

LANGUAGE: ts
CODE:
```
import { run } from '@wxt-dev/runner';

await run({
  extensionDir: 'path/to/extension',
  chromiumArgs: ['https://example.com'],
  firefoxArgs: ['https://example.com'],
});
```

--------------------------------

TITLE: Recommended IDE Setup for WXT + Vue 3
DESCRIPTION: This section outlines the recommended Integrated Development Environment (IDE) setup for developing Vue 3 applications with WXT. It specifically suggests using Visual Studio Code along with the Volar extension for enhanced Vue development features.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/templates/vue/README.md

LANGUAGE: markdown
CODE:
```
- [VS Code](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar).
```

--------------------------------

TITLE: Bootstrap a New WXT Project
DESCRIPTION: This snippet shows how to quickly initialize a new web extension project using the WXT framework via npm, pnpm, or bun. It installs the latest version of WXT and sets up a basic project structure.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/README.md

LANGUAGE: sh
CODE:
```
# npm
npx wxt@latest init

# pnpm
pnpm dlx wxt@latest init

# bun
bunx wxt@latest init
```

--------------------------------

TITLE: Content Script Migration Example
DESCRIPTION: Shows how to migrate content script code by moving DOM manipulation logic inside the `main` function of `defineContentScript`.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/entrypoints.md

LANGUAGE: ts
CODE:
```
const container = document.createElement('div'); // [!code --]
document.body.append(container); // [!code --]

export default defineContentScript({
  main: function () {
    const container = document.createElement('div'); // [!code ++]
    document.body.append(container); // [!code ++]
  },
});
```

--------------------------------

TITLE: Example WXT Debug Output
DESCRIPTION: This snippet shows an example of the detailed output you can expect when WXT debugging is enabled. It includes user and resolved options, browser arguments, and CDP communication for loading an extension.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/runner/README.md

LANGUAGE: plaintext
CODE:
```
@wxt-dev/runner:options User options: { extensionDir: 'demo-extension', target: undefined }
@wxt-dev/runner:options Resolved options: {
  browserBinary: '/usr/bin/chromium',
  chromiumArgs: [
    '--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,CertificateTransparencyComponentUpdater,AutofillServerCommunication,PrivacySandboxSettings4',
    '--disable-component-extensions-with-background-pages',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-client-side-phishing-detection',
    '--disable-sync',
    '--metrics-recording-only',
    '--disable-default-apps',
    '--no-default-browser-check',
    '--no-first-run',
    '--disable-background-timer-throttling',
    '--disable-ipc-flooding-protection',
    '--password-store=basic',
    '--use-mock-keychain',
    '--force-fieldtrials=*BackgroundTracing/default/',
    '--disable-hang-monitor',
    '--disable-prompt-on-repost',
    '--disable-domain-reliability',
    '--propagate-iph-for-testing',
    '--remote-debugging-port=0',
    '--remote-debugging-pipe',
    '--user-data-dir=/tmp/wxt-runner-pWXLO1',
    '--enable-unsafe-extension-debugging'
  ],
  dataDir: '/tmp/wxt-runner-pWXLO1',
  dataPersistence: 'none',
  chromiumRemoteDebuggingPort: 0,
  extensionDir: '/home/aklinker1/Development/github.com/wxt-dev/wxt/packages/runner/demo-extension',
  firefoxArgs: [
    '--new-instance',
    '--no-remote',
    '--profile',
    '/tmp/wxt-runner-pWXLO1',
    '--remote-debugging-port=0',
    'about:debugging#/runtime/this-firefox'
  ],
  firefoxRemoteDebuggingPort: 0,
  target: 'chrome'
}
@wxt-dev/runner:chrome:stderr DevTools listening on ws://127.0.0.1:38397/devtools/browser/93dc4de5-64cb-4e0b-a9d3-7549527015f0
@wxt-dev/runner:cdp Sending command: {
  id: 1,
  method: 'Extensions.loadUnpacked',
  params: {
    path: '/home/aklinker1/Development/github.com/wxt-dev/wxt/packages/runner/demo-extension'
  }
}
@wxt-dev/runner:cdp Received response: { id: 1, result: { id: 'hckhakegfgenefhikdcfkaaonnclljmf' } }
```

--------------------------------

TITLE: Content Script Context Example
DESCRIPTION: Demonstrates the basic structure of a content script entrypoint using the `defineContentScript` function and accessing the context object.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/content-scripts.md

LANGUAGE: ts
CODE:
```
import { defineContentScript } from 'wxt/client';

export default defineContentScript({
  main(ctx) {
    // Content script logic here
  },
});
```

--------------------------------

TITLE: WXT Firefox Extension Installation via WebDriver BiDi
DESCRIPTION: WXT utilizes the WebDriver BiDi protocol to install extensions in Firefox. This involves establishing a WebSocket connection and exchanging specific messages to facilitate the installation process.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/runner/README.md

LANGUAGE: javascript
CODE:
```
// Connect to the WebDriver BiDi WebSocket endpoint
// Send messages to install the extension
```

--------------------------------

TITLE: Basic WXT Module Structure
DESCRIPTION: Provides the fundamental structure of a WXT module using `defineWxtModule`. The `setup` function is where module logic is implemented, receiving the `wxt` object for interacting with the build process.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/wxt-modules.md

LANGUAGE: ts
CODE:
```
import { defineWxtModule } from 'wxt/modules';

export default defineWxtModule({
  setup(wxt) {
    // Your module code here...
  },
});
```

--------------------------------

TITLE: Defining HTML Entrypoint Manifest Options
DESCRIPTION: Shows how to configure manifest options for HTML entrypoints using `<meta>` tags within the HTML file, using `page_action` for MV2 as an example.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/entrypoints.md

LANGUAGE: html
CODE:
```
<!doctype html>
<html lang="en">
  <head>
    <meta name="manifest.type" content="page_action" />
  </head>
</html>
```

--------------------------------

TITLE: Directory Structure Example
DESCRIPTION: Illustrates the recommended directory structure after the move of public/ and modules/ directories to the project root. If using a custom srcDir, these directories can remain within src/ and be configured accordingly.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/resources/upgrading.md

LANGUAGE: html
CODE:
```
📂 {rootDir}/
   📁 modules/ <!-- [!code ++] -->
   📁 public/ <!-- [!code ++] -->
   📂 src/
      📁 components/
      📁 entrypoints/
      📁 modules/ <!-- [!code --] -->
      📁 public/ <!-- [!code --] -->
      📁 utils/
      📄 app.config.ts
   📄 wxt.config.ts
```

--------------------------------

TITLE: Background Script Migration Example
DESCRIPTION: Illustrates the migration of a background script from an older version (MV2) to the new WXT structure (MV3), showing how to add event listeners within the defineBackground function.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/entrypoints.md

LANGUAGE: ts
CODE:
```
browser.action.onClicked.addListener(() => { // [!code --]
  // ... // [!code --]
}); // [!code --]

export default defineBackground(() => {
  browser.action.onClicked.addListener(() => { // [!code ++]
    // ... // [!code ++]
  }); // [!code ++]
});
```

--------------------------------

TITLE: Install Unreleased WXT Package Template
DESCRIPTION: Provides the general command template for installing unreleased versions of WXT packages. Users need to replace placeholders with specific package names and references (PR number, branch, or commit hash).

SOURCE: https://github.com/wxt-dev/wxt/blob/main/CONTRIBUTING.md

LANGUAGE: sh
CODE:
```
npm i https://pkg.pr.new/[package-name]@[ref]
```

--------------------------------

TITLE: Run Tests for Specific File
DESCRIPTION: Example of running tests for a specific file, 'manifest-contents', using pnpm.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/CONTRIBUTING.md

LANGUAGE: sh
CODE:
```
pnpm test manifest-contents
```

--------------------------------

TITLE: Install @wxt-dev/module-vue
DESCRIPTION: Installs the Vue module for WXT and the Vue.js library using pnpm.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/module-vue/README.md

LANGUAGE: sh
CODE:
```
pnpm i vue
pnpm i -D @wxt-dev/module-vue
```

--------------------------------

TITLE: WXT Configuration Example (Conceptual)
DESCRIPTION: Illustrates how manifest.json content is moved to wxt.config.ts. This is a conceptual representation as the actual config file is not provided.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/resources/migrate.md

LANGUAGE: typescript
CODE:
```
// Conceptual example of wxt.config.ts
// import { defineConfig } from 'wxt'

// export default defineConfig({
//   // manifest.json content moved here
//   manifest: {
//     name: 'My Extension',
//     version: '1.0',
//     permissions: ['storage'],
//     // ... other manifest properties
//   },
//   // ... other WXT configurations
// })
```

--------------------------------

TITLE: Install @wxt-dev/browser
DESCRIPTION: Command to install the `@wxt-dev/browser` package using pnpm, typically used when not working within a WXT project.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/browser/README.md

LANGUAGE: sh
CODE:
```
pnpm install @wxt-dev/browser
```

--------------------------------

TITLE: Configure Browser Binaries
DESCRIPTION: Customize which browser binaries WXT uses during development. This is useful for specifying beta or developer editions, or when browsers are installed in non-standard locations.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/config/browser-startup.md

LANGUAGE: ts
CODE:
```
export default defineWebExtConfig({
  binaries: {
    chrome: '/path/to/chrome-beta', 
    firefox: 'firefoxdeveloperedition', 
    edge: '/path/to/edge'
  },
});
```

--------------------------------

TITLE: Install Unreleased WXT Packages
DESCRIPTION: Install unreleased versions of WXT packages using pkg.pr.new. This allows you to test the latest builds directly from your repository.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/CONTRIBUTING.md

LANGUAGE: sh
CODE:
```
npm i https://pkg.pr.new/[package-name]@[ref]
```

LANGUAGE: sh
CODE:
```
# Install the latest build of `wxt` from a PR:
npm i https://pkg.pr.new/wxt@1283
```

LANGUAGE: sh
CODE:
```
# Install the latest build of `@wxt-dev/module-react` on the `main` branch
npm i https://pkg.pr.new/@wxt-dev/module-react@main
```

LANGUAGE: sh
CODE:
```
# Install `@wxt-dev/storage` from a specific commit:
npm i https://pkg.pr.new/@wxt-dev/module-react@426f907
```

--------------------------------

TITLE: Install @wxt-dev/auto-icons
DESCRIPTION: Installs the @wxt-dev/auto-icons package as a development dependency using various package managers.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/auto-icons/README.md

LANGUAGE: sh
CODE:
```
npm i --save-dev @wxt-dev/auto-icons
```

LANGUAGE: sh
CODE:
```
pnpm i -D @wxt-dev/auto-icons
```

LANGUAGE: sh
CODE:
```
yarn add --dev @wxt-dev/auto-icons
```

LANGUAGE: sh
CODE:
```
bun i -D @wxt-dev/auto-icons
```

--------------------------------

TITLE: Vue Setup Script
DESCRIPTION: This script is part of a Vue.js application, likely used with Vite. It imports data from a local file, presumably containing CLI information, to be used within the Vue component.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/api/cli/wxt.md

LANGUAGE: javascript
CODE:
```
import { data } from '../../.vitepress/loaders/cli.data.ts'
```

--------------------------------

TITLE: Define Background Script (WXT)
DESCRIPTION: Example of defining a background script using WXT's defineBackground utility.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/resources/migrate.md

LANGUAGE: javascript
CODE:
```
// entrypoints/background.js
import { defineBackground } from 'wxt/background'

export default defineBackground({
  main: () => {
    console.log('Background script started')
  },
})

```

--------------------------------

TITLE: Install WXT Analytics Module
DESCRIPTION: Installs the WXT Analytics NPM package and configures it in the wxt.config.ts file.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/analytics/README.md

LANGUAGE: bash
CODE:
```
pnpm i @wxt-dev/analytics
```

LANGUAGE: typescript
CODE:
```
export default defineConfig({
  modules: ['@wxt-dev/analytics/module'],
});
```

--------------------------------

TITLE: Install @wxt-dev/i18n without WXT
DESCRIPTION: Installs the @wxt-dev/i18n package using pnpm for use in projects not utilizing WXT.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/i18n/README.md

LANGUAGE: sh
CODE:
```
pnpm i @wxt-dev/i18n
```

--------------------------------

TITLE: Define Content Script (WXT)
DESCRIPTION: Example of defining a content script using WXT's defineContentScript utility.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/resources/migrate.md

LANGUAGE: javascript
CODE:
```
// entrypoints/content.js
import { defineContentScript } from 'wxt/contentScripts'

export default defineContentScript({
  matches: ['*://*/*'],
  main: () => {
    console.log('Content script injected')
  },
})

```

--------------------------------

TITLE: Install and Create Analytics Instance Without WXT
DESCRIPTION: Installs the WXT Analytics package and creates a standalone analytics instance.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/analytics/README.md

LANGUAGE: bash
CODE:
```
pnpm i @wxt-dev/analytics
```

LANGUAGE: typescript
CODE:
```
// utils/analytics.ts
import { createAnalytics } from '@wxt-dev/analytics';

export const analytics = createAnalytics({
  providers: [
    // ...
  ],
});
```

--------------------------------

TITLE: Install UnoCSS Packages
DESCRIPTION: Installs the necessary UnoCSS packages for WXT extensions using npm, pnpm, yarn, or bun.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/unocss/README.md

LANGUAGE: sh
CODE:
```
npm i --save-dev @wxt-dev/unocss unocss
pnpm i -D @wxt-dev/unocss unocss
yarn add --dev @wxt-dev/unocss unocss
bun i -D @wxt-dev/unocss unocss
```

--------------------------------

TITLE: Vue.js Setup for CLI Data Loading
DESCRIPTION: This snippet shows how to import and use CLI data within a Vue.js component's script setup. It's used to display information related to the `wxt build` command.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/api/cli/wxt-build.md

LANGUAGE: vue
CODE:
```
<script setup>
import { data } from '../../.vitepress/loaders/cli.data.ts'
</script>
```

--------------------------------

TITLE: Add `wxt prepare` to postinstall script
DESCRIPTION: Ensures that TypeScript and editor support for auto-imported variables is available after dependency installation. This is crucial for type checking and autocompletion.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/config/auto-imports.md

LANGUAGE: jsonc
CODE:
```
// package.json
{
  "scripts": {
    "postinstall": "wxt prepare", // [!code ++]
  },
}
```

--------------------------------

TITLE: Add New WXT Project Template
DESCRIPTION: Copies the existing 'vanilla' template to create a new project template, serving as a starting point for new WXT projects within the monorepo.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/CONTRIBUTING.md

LANGUAGE: sh
CODE:
```
cp -r templates/vanilla templates/<new-template-name>
```

--------------------------------

TITLE: Create Integrated UI (Svelte)
DESCRIPTION: Provides an example of creating an integrated UI with Svelte. It mounts a Svelte component into the UI container and handles its destruction.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/content-scripts.md

LANGUAGE: ts
CODE:
```
// entrypoints/example-ui.content/index.ts
import App from './App.svelte';
import { mount, unmount } from 'svelte';

export default defineContentScript({
  matches: ['<all_urls>'],

  main(ctx) {
    const ui = createIntegratedUi(ctx, {
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        // Create the Svelte app inside the UI container
        return mount(App, { target: container });
      },
      onRemove: (app) => {
        // Destroy the app when the UI is removed
        unmount(app);
      },
    });

    // Call mount to add the UI to the DOM
    ui.mount();
  },
});
```

--------------------------------

TITLE: Create Shadow Root UI (Solid)
DESCRIPTION: Provides an example of creating an isolated UI with `createShadowRootUi` using Solid. It covers importing styles, configuring `cssInjectionMode`, rendering a Solid app, and handling its unmount.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/content-scripts.md

LANGUAGE: typescript
CODE:
```
import './style.css';
import { render } from 'solid-js/web';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'example-ui',
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        const unmount = render(() => <div>...</div>, container);
      },
      onRemove: (unmount) => {
        unmount?.();
      },
    });

    ui.mount();
  },
});
```

--------------------------------

TITLE: Handling API Variations (MV2/MV3)
DESCRIPTION: Provides an example of how to handle API variations, such as 'browser.action' vs 'browser.browser_action', to support different manifest versions.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/extension-apis.md

LANGUAGE: ts
CODE:
```
(browser.action ?? browser.browser_action).onClicked.addListener(() => {
  //
});
```

--------------------------------

TITLE: Importing variables in entrypoint options
DESCRIPTION: Example of importing variables from other files to use in entrypoint configurations, enabled by the `vite-node` entrypoint loader.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/resources/upgrading.md

LANGUAGE: ts
CODE:
```
import { GOOGLE_MATCHES } from '~/utils/constants'

export default defineContentScript({
  matches: [GOOGLE_MATCHES],
  main: () => ...
})
```

--------------------------------

TITLE: Plasmo to WXT Migration: Entrypoint Configuration
DESCRIPTION: Conceptual example showing how Plasmo's named exports for entrypoint configuration might be merged into WXT's default export.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/resources/migrate.md

LANGUAGE: javascript
CODE:
```
// Plasmo (conceptual)
// export constприклад = {
//   entrypoints: {
//     popup: 'popup.html'
//   }
// }

// WXT (conceptual)
// import { defineConfig } from 'wxt'
// export default defineConfig({
//   entrypoints: {
//     popup: 'entrypoints/popup.html'
//   }
// })
```

--------------------------------

TITLE: WXT Chrome Extension Installation via CDP
DESCRIPTION: For Chrome, WXT employs the Chrome DevTools Protocol (CDP) with specific flags (`--remote-debugging-pipe` and `--enable-unsafe-extension-debugging`). The extension is installed by sending messages through IO pipes 3 and 4, avoiding the need for a separate chromedriver process.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/runner/README.md

LANGUAGE: javascript
CODE:
```
// Use CDP with --remote-debugging-pipe and --enable-unsafe-extension-debugging
// Send extension installation command via IO pipes 3 and 4
```

--------------------------------

TITLE: Bootstrap a New WXT Project
DESCRIPTION: This snippet shows how to quickly set up a new web extension project using the WXT framework via npm, pnpm, or bun.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/wxt/README.md

LANGUAGE: sh
CODE:
```
# npm
npx wxt@latest init

# pnpm
pnpm dlx wxt@latest init

# bun
bunx wxt@latest init
```

--------------------------------

TITLE: Install WXT Skipping Scripts
DESCRIPTION: Installs the latest version of WXT while ignoring scripts to prevent potential errors during major version upgrades. This is the first step in the upgrade process.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/resources/upgrading.md

LANGUAGE: sh
CODE:
```
pnpm i wxt@latest --ignore-scripts
```

--------------------------------

TITLE: Customizing WXT Directories
DESCRIPTION: Provides examples of how to customize various WXT directory configurations, including `srcDir`, `modulesDir`, `outDir`, `publicDir`, and `entrypointsDir`, within `wxt.config.ts`.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/project-structure.md

LANGUAGE: ts
CODE:
```
export default defineConfig({
  // Relative to project root
  srcDir: "src",             // default: "."
  modulesDir: "wxt-modules", // default: "modules"
  outDir: "dist",            // default: ".output"
  publicDir: "static",       // default: "public"

  // Relative to srcDir
  entrypointsDir: "entries", // default: "entrypoints"
})
```

--------------------------------

TITLE: Import Storage without WXT
DESCRIPTION: Shows how to import the storage API from the installed @wxt-dev/storage package when not using WXT.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/storage/README.md

LANGUAGE: ts
CODE:
```
import { storage } from '@wxt-dev/storage';
```

--------------------------------

TITLE: Importing with Custom Aliases
DESCRIPTION: Example of how to import modules using the custom aliases defined in `wxt.config.ts`.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/config/typescript.md

LANGUAGE: typescript
CODE:
```
import { fakeTab } from 'testing/fake-objects';
import { toLowerCase } from 'strings';
```

--------------------------------

TITLE: Add Build-Time Config to WXT Module
DESCRIPTION: Illustrates how to define and use build-time options for a WXT module. This involves augmenting WXT's `InlineConfig` interface and accessing options in the `setup` function.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/wxt-modules.md

LANGUAGE: ts
CODE:
```
import { defineWxtModule } from 'wxt/modules';
import 'wxt';

export interface MyModuleOptions {
  // Add your build-time options here...
}
declare module 'wxt' {
  export interface InlineConfig {
    // Add types for the "myModule" key in wxt.config.ts
    myModule: MyModuleOptions;
  }
}

export default defineWxtModule<MyModuleOptions>({
  configKey: 'myModule',

  // Build time config is available via the second argument of setup
  setup(wxt, options) {
    console.log(options);
  },
});
```

--------------------------------

TITLE: Build and Test Firefox Extension from ZIP
DESCRIPTION: Provides commands to install dependencies and build the extension from a ZIP archive, as required for Firefox Addon Store submissions. This ensures the extension can be rebuilt from its source code.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/publishing.md

LANGUAGE: sh
CODE:
```
pnpm i
pnpm zip:firefox
```

LANGUAGE: sh
CODE:
```
npm i
npm run zip:firefox
```

LANGUAGE: sh
CODE:
```
yarn
yarn zip:firefox
```

LANGUAGE: sh
CODE:
```
bun i
bun zip:firefox
```

--------------------------------

TITLE: Integrate ESLint 9 Auto-imports
DESCRIPTION: Shows how to integrate the generated ESLint 9 auto-import configuration into your ESLint setup.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/config/auto-imports.md

LANGUAGE: js
CODE:
```
// eslint.config.mjs
import autoImports from './.wxt/eslint-auto-imports.mjs';

export default [
  autoImports,
  {
    // The rest of your config...
  },
];
```

--------------------------------

TITLE: Recommended Project Structure
DESCRIPTION: Illustrates a recommended folder structure for WXT projects with multiple entry points, including shared assets, components, and entrypoint-specific files.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/frontend-frameworks.md

LANGUAGE: html
CODE:
```
📂 {srcDir}/
   📂 assets/          <---------- Put shared assets here
      📄 tailwind.css
   📂 components/
      📄 Button.tsx
   📂 entrypoints/
      📂 options/       <--------- Use a folder with an index.html file in it
         📁 pages/      <--------- A good place to put your router pages if you have them
         📄 index.html
         📄 App.tsx
         📄 main.tsx    <--------- Create and mount your app here
         📄 style.css   <--------- Entrypoint-specific styles
         📄 router.ts
```

--------------------------------

TITLE: Runtime Access to Unlisted Script
DESCRIPTION: Demonstrates how to access an unlisted script at runtime using `browser.runtime.getURL`. This allows you to get the URL of the script for further use.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/entrypoints.md

LANGUAGE: ts
CODE:
```
const url = browser.runtime.getURL('/{name}.js');

console.log(url); // "chrome-extension://{id}/{name}.js"
```

--------------------------------

TITLE: Nested Keys Translation Example
DESCRIPTION: Demonstrates accessing nested translation keys using dot notation in the `i18n.t` function.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/packages/i18n/README.md

LANGUAGE: yaml
CODE:
```
ok: OK
cancel: Cancel
welcome:
  title: Welcome to XYZ
dialogs:
  confirmation:
    title: 'Are you sure?'
```

--------------------------------

TITLE: Integrate ESLint 8 Auto-imports
DESCRIPTION: Demonstrates how to integrate the generated ESLint 8 auto-import configuration into your ESLint setup.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/config/auto-imports.md

LANGUAGE: js
CODE:
```
// .eslintrc.mjs
export default {
  extends: ['./.wxt/eslintrc-auto-import.json'],
  // The rest of your config...
};
```

--------------------------------

TITLE: Initialize WXT Project
DESCRIPTION: Command to generate a new WXT project with a vanilla template.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/resources/migrate.md

LANGUAGE: sh
CODE:
```
cd path/to/your/project
pnpm dlx wxt@latest init example-wxt --template vanilla
```

--------------------------------

TITLE: Rendering BlogHome Component in Vue.js Template
DESCRIPTION: This snippet demonstrates the straightforward rendering of the `BlogHome` component within the Vue.js template. After being imported in the `<script setup>` block, the component can be directly used as a custom HTML tag. This typically serves as the main entry point for displaying the blog's content or layout on the home page.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/blog.md

LANGUAGE: HTML
CODE:
```
<BlogHome />
```

--------------------------------

TITLE: Create Shadow Root UI (React)
DESCRIPTION: Shows how to create an isolated UI with `createShadowRootUi` using React. This example covers importing styles, configuring `cssInjectionMode`, rendering a React app into the Shadow Root container, and unmounting it.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/content-scripts.md

LANGUAGE: typescript
CODE:
```
import './style.css';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'example-ui',
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        const app = document.createElement('div');
        container.append(app);

        const root = ReactDOM.createRoot(app);
        root.render(<App />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
```

--------------------------------

TITLE: Manifest CSS Injection
DESCRIPTION: Example of how CSS is typically included in a web extension's manifest file for content scripts.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/content-scripts.md

LANGUAGE: json
CODE:
```
{
  "content_scripts": [
    {
      "css": ["content/style.css"],
      "js": ["content/index.js"],
      "matches": ["*://*/*"]
    }
  ]
}
```

--------------------------------

TITLE: Example Vitest Tests
DESCRIPTION: Demonstrates unit tests for a function that interacts with WXT's storage API. It utilizes `@webext-core/fake-browser` to provide an in-memory implementation of browser storage, allowing tests to run without actual browser storage.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/unit-testing.md

LANGUAGE: ts
CODE:
```
import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

const accountStorage = storage.defineItem<Account>('local:account');

async function isLoggedIn(): Promise<Account> {
  const value = await accountStorage.getValue();
  return value != null;
}

describe('isLoggedIn', () => {
  beforeEach(() => {
    // See https://webext-core.aklinker1/fake-browser/reseting-state
    fakeBrowser.reset();
  });

  it('should return true when the account exists in storage', async () => {
    const account: Account = {
      username: '...',
      preferences: {
        // ...
      },
    };
    await accountStorage.setValue(account);

    expect(await isLoggedIn()).toBe(true);
  });

  it('should return false when the account does not exist in storage', async () => {
    await accountStorage.deleteValue();

    expect(await isLoggedIn()).toBe(false);
  });
});
```

--------------------------------

TITLE: Unlisted CSS Entrypoints
DESCRIPTION: Defines patterns for CSS and preprocessor files that are automatically unlisted in the build. Provides examples for common CSS file naming conventions and integration with content scripts. Supports various CSS preprocessors via Vite.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/guide/essentials/entrypoints.md

LANGUAGE: css
CODE:
```
body {
  /* ... */
}
```

--------------------------------

TITLE: WXT Storage Bulk Operations Overview
DESCRIPTION: Lists the available bulk operations in the WXT storage API for efficient data management. These include getting, setting, and removing multiple items or their metadata.

SOURCE: https://github.com/wxt-dev/wxt/blob/main/docs/storage.md

LANGUAGE: APIDOC
CODE:
```
Bulk Operations:

- getItems: Get multiple values at once.
- getMetas: Get metadata for multiple items at once.
- setItems: Set multiple values at once.
- setMetas: Set metadata for multiple items at once.
- removeItems: Remove multiple values (and optionally metadata) at once.

All these APIs support both string keys and defined storage items.
```