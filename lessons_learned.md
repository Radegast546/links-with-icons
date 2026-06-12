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
