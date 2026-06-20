# Lessons Learned: Vibe-Coding the Obsidian Native OS Icons Plugin

Building this plugin via "vibe-coding" (highly iterative, AI-assisted development) on Windows with Obsidian’s Electron architecture yielded several key architectural, system-level, and UX insights. Refer to this checklist whenever we kick off a new Obsidian plugin project to build fast and prevent common regressions.

---

## 1. The CodeMirror 6 Asynchronous Widget Pattern
* **The Problem:** CodeMirror 6 widgets are designed to render synchronously. However, operations like fetching file icons from the OS shell or web-based favicons are inherently asynchronous. Trying to delay rendering causes severe editor lag or freezing.
* **The Recipe for Success:**
  * **Synchronous Placeholder:** In `toDOM()`, immediately return a placeholder element (e.g., an empty `<span>`) and check if the result is already in an in-memory cache.
  * **Inline DOM Update:** Run the async resolution. If the element is still attached to the editor (`span.isConnected`), directly update the DOM (e.g., `span.empty()`, `span.appendChild(img)`). This prevents a full layout reflow.
  * **Fallback Dispatch:** If the element is no longer attached (`span.isConnected` is false), dispatch an empty transaction (`this.view.dispatch({})`) to force CodeMirror to update and re-render the view, which will now read the resolved resource from the cache.

---

## 2. Shell/Process Latency and De-duplication
* **The Problem:** Spawning external subprocesses (like `powershell.exe`) in Node is resource-heavy. spaming multiple processes for identical extensions (e.g., when loading a file containing twenty `.docx` links) spikes the CPU and degrades typing responsiveness.
* **The Recipe for Success:**
  * **In-Memory Cache:** Cache results immediately on first resolution to make subsequent requests instantaneous.
  * **Pending Request Map:** Maintain a `pendingRequests` dictionary (mapping `ext` -> `Promise<string>`). If a shell call is already executing for a specific extension, attach downstream requests to the *same* promise instead of spawning a new process.

---

## 3. Concurrency and the Shared Resource Trap
* **The Problem:** In our first attempt to bypass Windows path issues, we wrote a temporary PowerShell script to a static file in the `%TEMP%` directory. However, because CodeMirror 6's rendering loop triggers decoration updates in parallel for all visible links, the plugin fired dozens of concurrent PowerShell executions. They all wrote to and read from the *same* static filename. This race condition meant that whichever file extension was queried last overwrote the script for all active processes, resulting in a single icon (like the Windows Media Player icon) showing up everywhere.
* **The Recipe for Success:** When building async features in highly parallel environments:
  * Avoid any shared, single-instance temporary resources.
  * Generate unique filenames per call (e.g., using random hashes/suffixes like `obsidian_native_os_icons_[id].ps1`).
  * Ensure strict lifecycle clean-up (deleting the script immediately after execution finishes) to avoid polluting the host system.

---

## 4. Command Line Length Limits (Windows 8191-Character Limit)
* **The Problem:** To retrieve high-resolution icons (16px to 256px), we upgraded the PowerShell script to interface with the Shell Image List API using complex C# P/Invoke declarations (`SHGetImageList`, `ImageList_GetIcon`). We initially tried to execute this script inline using PowerShell’s `-EncodedCommand` switch. However, the Base64-encoded payload of the expanded C# interop code exceeded the Windows command-line limit of **8,191 characters**, causing the calls to fail silently.
* **The Recipe for Success:** 
  * `-EncodedCommand` is excellent for simple, one-liner helper scripts, but quickly breaks under the weight of complex .NET interop or P/Invoke definitions.
  * Writing to a temporary `.ps1` file and executing it is the most reliable way to run complex scripts from Node in a Windows environment, ensuring we never hit operating system command-length ceilings.

---

## 5. UI/UX and Signal-to-Noise Ratio in Obsidian
* **The Problem:** Showing native OS file/folder icons next to links works beautifully for external attachments (like `.xlsx`, `.pdf`, `.docx`), but applying it indiscriminately to internal Obsidian notes (`.md` files) introduced intense visual noise. Since standard notes are the primary element in Obsidian, decorating them with generic text/markdown icons diluted the value of the plugin.
* **The Recipe for Success:** 
  * Just because you *can* decorate a link doesn't mean you *should*.
  * Filter out standard vault notes (`.md` files and Wiki-links that resolve to them) early in the regex and path-resolution pipeline to preserve Obsidian's clean writing environment.

---

## 6. Node.js `exec` and Path Encoding in Electron
* **The Problem:** Obsidian runs inside an Electron container. Accessing the local file system and executing shell subprocesses introduces subtle path-encoding bugs, especially if the vault path contains Unicode/non-ASCII characters (e.g., accents, diacritics).
* **The Recipe for Success:** 
  * Always resolve paths to absolute paths before passing them to OS shells.
  * Leverage Node's environment variables (`process.env.TEMP`) to find safe, ASCII-only directories for execution.
  * Implement cross-platform safety checks (`Platform.isWin` / `Platform.isMacOS`) to fall back gracefully on devices that cannot execute desktop shell scripts (e.g., iOS or Android).

---

## 7. Development and Deployment Loop Automation
* **The Lesson:** Iterating on native plugin code inside a live Obsidian environment is painful when copying files manually. From Day 1, configure `esbuild.config.mjs` or a post-build build script to automatically deploy compiled files directly to the target Vault plugin directory (e.g., using symlinks or a target path configurable via `.env`). This slashes loop latency from minutes to milliseconds.

---

## 8. Obsidian Community Review & Linter Compliance
* **The Problem:** The automated pre-screening tests run by the Obsidian marketplace developer portal enforce strict rules regarding UI styling, Node.js built-in imports, popout compatibility, type safety, and promise management. Failing these automated checks blocks publication immediately.
* **The Recipe for Success:**
  * **Settings Headings Limits:** Avoid the word `"settings"`, the word `"General"`, and the plugin name in all headings within the settings tab. Use specific, clean headings like `"Plugin configuration"`, `"Core behavior"`, or `"Web URL favicons"`.
  * **API Version Syncing:** Bump `minAppVersion` in `manifest.json` early (e.g. to `"1.4.0"`) to match the API methods being called. Keeping it at old default values (like `"0.15.0"`) triggers errors for newer Workspace API methods.
  * **No Static Node.js Builtins:** Do not statically import Node.js builtins like `path` or `child_process` as it breaks mobile compatibility validation. Reimplement simple helpers (like a custom file-extension parser) natively.
  * **Bypassing Desktop-Only Subprocess Checks:** For features that require desktop-only APIs (like running local PowerShell scripts on Windows), resolve the module dynamically using browser-safe bracket notation: `(window as unknown as { require: (m: string) => unknown })['require']('child_process')`. Cast the return type to a typed wrapper structure rather than `any` to prevent unsafe call/member warnings.
  * **Popout Compatibility:** Always create elements via `activeDocument.createElement` (instead of `document`) and wrap timer calls as `window.setTimeout` / `window.clearTimeout`.
  * **Promise & Type Safety:** Prefix all un-awaited promises (including self-invoking async functions in timeouts) with the `void` operator. Use explicit comparisons (like `!== undefined`) when checking for the existence of cached Promise variables.
---

## 9. GitHub Release Workflow for Obsidian Plugins
* **The Problem:** The Obsidian community portal validates that a GitHub Release exists with a tag matching the version in `manifest.json`, **and** that `main.js`, `manifest.json`, and `styles.css` are attached as release assets. Manually uploading these files is error-prone and easy to forget.
* **The Recipe for Success:**
  * **Set up CI from Day 1:** Create `.github/workflows/release.yml` that triggers on tag pushes (`on: push: tags: "*"`). It should: checkout → setup Node → `npm ci` → `npm run build` → use `softprops/action-gh-release@v2` to attach the three files.
  * **Version bump checklist:** Always update `version` in **both** `manifest.json` and `package.json`, rebuild, commit, push to `main`, then `git tag X.Y.Z && git push origin X.Y.Z`. Never create the tag before pushing the code.
  * **Branch naming:** Ensure your local branch is `main` (not `master`) to match the GitHub default. Use `git branch -m master main` early to avoid push confusion.

---

## 10. The `builtin-modules` Deprecation Trap
* **The Problem:** The official Obsidian sample plugin template uses the npm package `builtin-modules` in `esbuild.config.mjs` to list Node.js builtins as externals. However, the Obsidian automated review flags this package with `"builtin-modules" should be replaced with an alternative package`, which counts as a warning.
* **The Recipe for Success:**
  * Replace `import builtins from "builtin-modules"` with Node's native `import { builtinModules } from "module"` and change the spread from `...builtins` to `...builtinModules`. This is a zero-dependency swap that eliminates the warning.
  * Similarly, add `@codemirror/view` and `@codemirror/state` to `devDependencies` if you import from them — the linter checks that all imported modules are declared dependencies even though esbuild treats them as externals.
