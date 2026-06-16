/**
 * Sandbox Service — runs code in remote sandboxes (no API key required).
 *
 * Primary backend: Judge0 CE public instance (https://ce.judge0.com)
 *   - Free, no auth needed
 *   - Rate-limited (~50 req/min — plenty for personal bot use)
 *   - Supports 60+ languages
 *
 * Fallback backend: Wandbox (https://wandbox.org/api)
 *   - Also free, no auth
 *   - Some runtime instability (OCI errors on busy days)
 *
 * Env vars (all optional):
 * - SANDBOX_BACKEND: "judge0" | "wandbox" | "piston" (default: judge0)
 * - SANDBOX_API_URL: override API URL (e.g., self-hosted Judge0)
 * - SANDBOX_TIMEOUT: per-run timeout in ms (default: 10000, max: 30000)
 */

import config from '../../config/default.js';

// ============================================
// Judge0 language IDs (most common ones)
// https://judge0.com/languages
// ============================================
const JUDGE0_LANGUAGES = {
  python:     { id: 71,  name: 'Python 3',           version: '3.x' },
  python3:    { id: 71,  name: 'Python 3',           version: '3.x' },
  py:         { id: 71,  name: 'Python 3',           version: '3.x' },
  javascript: { id: 63,  name: 'JavaScript (Node)',  version: 'Node 18.x' },
  js:         { id: 63,  name: 'JavaScript (Node)',  version: 'Node 18.x' },
  node:       { id: 63,  name: 'JavaScript (Node)',  version: 'Node 18.x' },
  typescript: { id: 74,  name: 'TypeScript',         version: '5.x' },
  ts:         { id: 74,  name: 'TypeScript',         version: '5.x' },
  bash:       { id: 46,  name: 'Bash',               version: '5.x' },
  sh:         { id: 46,  name: 'Bash',               version: '5.x' },
  shell:      { id: 46,  name: 'Bash',               version: '5.x' },
  go:         { id: 60,  name: 'Go',                 version: '1.x' },
  golang:     { id: 60,  name: 'Go',                 version: '1.x' },
  rust:       { id: 73,  name: 'Rust',               version: '1.x' },
  rs:         { id: 73,  name: 'Rust',               version: '1.x' },
  c:          { id: 50,  name: 'C (GCC 9.2)',        version: 'GCC 9.2' },
  'c++':      { id: 54,  name: 'C++ (GCC 9.2)',      version: 'GCC 9.2' },
  cpp:        { id: 54,  name: 'C++ (GCC 9.2)',      version: 'GCC 9.2' },
  cxx:        { id: 54,  name: 'C++ (GCC 9.2)',      version: 'GCC 9.2' },
  java:       { id: 62,  name: 'Java (OpenJDK 13)',  version: 'OpenJDK 13' },
  ruby:       { id: 72,  name: 'Ruby',               version: '3.x' },
  rb:         { id: 72,  name: 'Ruby',               version: '3.x' },
  php:        { id: 68,  name: 'PHP',                version: '7.x' },
  lua:        { id: 64,  name: 'Lua',                version: '5.x' },
  perl:       { id: 85,  name: 'Perl',               version: '5.x' },
  haskell:    { id: 61,  name: 'Haskell',            version: 'GHC 8.x' },
  hs:         { id: 61,  name: 'Haskell',            version: 'GHC 8.x' },
  swift:      { id: 83,  name: 'Swift',              version: '5.x' },
  kotlin:     { id: 78,  name: 'Kotlin',             version: '1.x' },
  kt:         { id: 78,  name: 'Kotlin',             version: '1.x' },
  sql:        { id: 82,  name: 'SQL (SQLite)',       version: '3.x' },
  csharp:     { id: 51,  name: 'C# (.NET)',          version: '.NET Core 3.1' },
  'c#':       { id: 51,  name: 'C# (.NET)',          version: '.NET Core 3.1' },
  r:          { id: 80,  name: 'R',                  version: '4.x' },
  scala:      { id: 81,  name: 'Scala',              version: '3.x' },
  dart:       { id: 90,  name: 'Dart',               version: '2.x' },
  elixir:     { id: 57,  name: 'Elixir',             version: '1.x' },
  clojure:    { id: 86,  name: 'Clojure',            version: '1.x' },
  fsharp:     { id: 87,  name: 'F#',                 version: '4.x' },
  ocaml:      { id: 89,  name: 'OCaml',              version: '4.x' },
  cobol:      { id: 36,  name: 'COBOL',              version: 'GnuCOBOL' },
  d:          { id: 56,  name: 'D',                  version: 'DMD 2.x' },
  erlang:     { id: 58,  name: 'Erlang',             version: 'OTP 22' },
  fortran:    { id: 59,  name: 'Fortran',            version: 'GFortran 9.x' },
  groovy:     { id: 88,  name: 'Groovy',             version: '3.x' },
  julia:      { id: 60,  name: 'Julia',              version: '1.x' },  // shared slot
  nim:        { id: 93,  name: 'Nim',                version: '1.x' },
  octave:     { id: 94,  name: 'Octave',             version: '5.x' },
  pascal:     { id: 67,  name: 'Pascal',             version: 'FPC 3.x' },
  prolog:     { id: 69,  name: 'Prolog',             version: 'SWI-Prolog' },
  scheme:     { id: 33,  name: 'Scheme',             version: 'Gauche' },
  vb:         { id: 84,  name: 'Visual Basic',       version: '.NET Core 3.1' },
  zsh:        { id: 46,  name: 'Bash',               version: '5.x' },
};

// Reverse-lookup for "list supported languages"
const SUPPORTED_LANGUAGE_NAMES = Array.from(new Set(
  Object.entries(JUDGE0_LANGUAGES).map(([k, v]) => v.name)
)).sort();

// Heuristic auto-detect language from code content
function _detectLanguageFromCode(code) {
  if (!code) return null;
  const text = String(code);
  const firstLine = text.split('\n')[0] || '';

  // Shebang
  if (firstLine.startsWith('#!')) {
    if (/python/.test(firstLine)) return 'python';
    if (/node/.test(firstLine)) return 'javascript';
    if (/bash|sh|zsh/.test(firstLine)) return 'bash';
    if (/ruby/.test(firstLine)) return 'ruby';
    if (/perl/.test(firstLine)) return 'perl';
  }

  // Strong syntactic signals (ordered by specificity)
  if (/^\s*package main\s*$/m.test(text) && /func\s+\w+\s*\(/.test(text)) return 'go';
  if (/^\s*fn\s+\w+/m.test(text) && /use\s+std::/.test(text)) return 'rust';
  if (/^\s*#include\s*<[^>]+>/m.test(text)) {
    return /std::cout|class\s+\w+|cout\s*<</.test(text) ? 'c++' : 'c';
  }
  if (/^\s*public\s+class\s+\w+/m.test(text) && /public\s+static\s+void\s+main/.test(text)) return 'java';
  if (/^\s*def\s+\w+\s*\(/m.test(text) && /print\s*\(/.test(text)) return 'python';
  if (/^\s*(const|let|var|function|import\s+.*from|require\()/.test(text)) {
    return /interface\s+\w+|:\s*(string|number|boolean)\b/.test(text) ? 'typescript' : 'javascript';
  }
  if (/^\s*(puts|print)\s+["']/.test(text) && /^\s*def\s+\w+/m.test(text)) return 'ruby';
  if (/^\s*<\?php/.test(text)) return 'php';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)/i.test(text)) return 'sql';
  if (/^\s*object\s+\w+/m.test(text) && /fun\s+main/.test(text)) return 'kotlin';

  return null;
}

class SandboxService {
  constructor() {
    this.backend = (process.env.SANDBOX_BACKEND || 'judge0').toLowerCase();
    this.apiUrl = process.env.SANDBOX_API_URL || this._getDefaultApiUrl(this.backend);
    this.defaultTimeout = Math.min(parseInt(process.env.SANDBOX_TIMEOUT || '10000', 10), 30000);
  }

  _getDefaultApiUrl(backend) {
    if (backend === 'piston') return 'https://emkc.org/api/v2/piston';
    if (backend === 'wandbox') return 'https://wandbox.org/api';
    return 'https://ce.judge0.com';  // judge0 default
  }

  /**
   * Resolve a language string to a sandbox language spec.
   * @param {string} lang
   * @returns {Object|null}
   */
  resolveLanguage(lang) {
    if (!lang) return null;
    const normalized = String(lang).toLowerCase().trim();
    return JUDGE0_LANGUAGES[normalized] || null;
  }

  /**
   * Auto-detect language from code.
   * @param {string} code
   * @returns {string|null} - canonical language key
   */
  detectLanguage(code) {
    return _detectLanguageFromCode(code);
  }

  /**
   * Execute code via Judge0 CE public instance.
   * @param {string} code
   * @param {Object} opts - { language, stdin, args, timeoutMs }
   * @returns {Promise<Object>}
   */
  async runCode(code, opts = {}) {
    const startedAt = Date.now();

    // Resolve language: explicit > auto-detect > error
    const langKey = opts.language || this.detectLanguage(code);
    const langSpec = this.resolveLanguage(langKey);
    if (!langSpec) {
      return {
        ok: false,
        language: opts.language || langKey || 'unknown',
        version: '',
        output: '',
        stdout: '',
        stderr: '',
        exitCode: -1,
        signal: null,
        durationMs: Date.now() - startedAt,
        error: `Bahasa tidak dikenali. Supported: python, javascript, typescript, go, rust, c, c++, java, ruby, php, bash, sql, dll. Atau ketik: /run python <code>`,
      };
    }

    if (this.backend === 'wandbox') {
      return this._runWandbox(code, opts, langKey, langSpec, startedAt);
    }
    if (this.backend === 'piston') {
      return this._runPiston(code, opts, langKey, langSpec, startedAt);
    }
    return this._runJudge0(code, opts, langKey, langSpec, startedAt);
  }

  /**
   * Judge0 CE — primary backend
   */
  async _runJudge0(code, opts, langKey, langSpec, startedAt) {
    const timeoutMs = Math.min(opts.timeoutMs || this.defaultTimeout, 30000);
    const body = {
      source_code: String(code),
      language_id: langSpec.id,
      stdin: opts.stdin || '',
      command_line_arguments: (opts.args || []).join(' '),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs + 10000);
      const res = await fetch(`${this.apiUrl}/submissions/?base64_encoded=false&wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok) {
        return {
          ok: false,
          language: langSpec.name,
          version: langSpec.version,
          output: '',
          stdout: '',
          stderr: data.message || data.error || `HTTP ${res.status}`,
          exitCode: -1,
          signal: null,
          durationMs: Date.now() - startedAt,
          error: data.message || `Judge0 error HTTP ${res.status}`,
        };
      }

      // Judge0 status codes:
      // 1=In Queue, 2=Processing, 3=Accepted, 4=Wrong Answer, 5=Time Limit Exceeded,
      // 6=Compilation Error, 7=Runtime Error (SIGSEGV), 8=Runtime Error (SIGXCPU),
      // 9=Runtime Error (SIGFPE), 10=Runtime Error (SIGABRT), 11=Runtime Error (NZEC),
      // 12=Runtime Error (Other), 13=Internal Error
      const statusId = data.status?.id;
      const statusDesc = data.status?.description || '';
      const stdout = data.stdout || '';
      const stderr = (data.stderr || '') + (data.compile_output ? `[compile]\n${data.compile_output}\n` : '');
      const output = (stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : '')).trim();

      const ok = statusId === 3;
      let exitCode = 0;
      if (!ok) {
        if (statusId === 5) exitCode = 124; // timeout
        else if (statusId === 6) exitCode = 1; // compile error
        else if (statusId === 11) exitCode = 1; // NZEC
        else if (statusId >= 7 && statusId <= 12) exitCode = 134; // runtime error
        else exitCode = 1;
      }

      let errorMsg = null;
      if (!ok) {
        if (statusId === 5) errorMsg = '⏱ Time limit exceeded';
        else if (statusId === 6) errorMsg = '❌ Compilation error';
        else if (statusId >= 7 && statusId <= 12) errorMsg = `❌ Runtime error: ${statusDesc}`;
        else errorMsg = `❌ ${statusDesc}`;
      }

      return {
        ok,
        language: langSpec.name,
        version: langSpec.version,
        output: output || (ok ? '(no output)' : errorMsg),
        stdout,
        stderr,
        exitCode,
        signal: statusId >= 7 && statusId <= 9 ? statusDesc : null,
        durationMs: Date.now() - startedAt,
        error: errorMsg,
      };
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      return {
        ok: false,
        language: langSpec.name,
        version: langSpec.version,
        output: '',
        stdout: '',
        stderr: isTimeout ? '⏱ Execution timed out' : err.message,
        exitCode: -1,
        signal: isTimeout ? 'SIGKILL' : null,
        durationMs: Date.now() - startedAt,
        error: isTimeout ? `Execution timed out after ${timeoutMs}ms` : err.message,
      };
    }
  }

  /**
   * Wandbox — fallback backend
   */
  async _runWandbox(code, opts, langKey, langSpec, startedAt) {
    // Map to Wandbox compiler names
    const WANDBOX_COMPILERS = {
      python: 'cpython-3.12.7',
      python3: 'cpython-3.12.7',
      py: 'cpython-3.12.7',
      javascript: 'nodejs-20.17.0',
      js: 'nodejs-20.17.0',
      node: 'nodejs-20.17.0',
      typescript: 'typescript-5.3.3',
      ts: 'typescript-5.3.3',
      go: 'go-1.21.0',
      golang: 'go-1.21.0',
      rust: 'rust-1.73.0',
      rs: 'rust-1.73.0',
      c: 'gcc-13.2.0-c',
      'c++': 'gcc-13.2.0',
      cpp: 'gcc-13.2.0',
      ruby: 'ruby-3.2.2',
      rb: 'ruby-3.2.2',
      php: 'php-8.3.0',
      bash: 'bash',
      sh: 'bash',
      haskell: 'ghc-9.6.2',
      hs: 'ghc-9.6.2',
    };
    const compiler = WANDBOX_COMPILERS[langKey];
    if (!compiler) {
      return {
        ok: false,
        language: langSpec.name,
        version: '',
        output: '',
        stdout: '',
        stderr: `Wandbox tidak support bahasa: ${langKey}. Pakai backend judge0 (default).`,
        exitCode: -1,
        signal: null,
        durationMs: Date.now() - startedAt,
        error: `Wandbox tidak support ${langKey}`,
      };
    }

    try {
      const res = await fetch(`${this.apiUrl}/compile.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: String(code),
          compiler,
          stdin: opts.stdin || '',
          runtime: false,
        }),
      });
      const data = await res.json();
      const stdout = data.program_output || '';
      const stderr = (data.program_error || '') + (data.compiler_error ? `\n[compile] ${data.compiler_error}` : '');
      const status = parseInt(data.status || '0', 10);
      const ok = status === 0;
      return {
        ok,
        language: langSpec.name,
        version: langSpec.version,
        output: (stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : '')).trim() || '(no output)',
        stdout,
        stderr,
        exitCode: ok ? 0 : 1,
        signal: data.signal || null,
        durationMs: Date.now() - startedAt,
        error: ok ? null : `Exit ${status}`,
      };
    } catch (err) {
      return {
        ok: false,
        language: langSpec.name,
        version: langSpec.version,
        output: '',
        stdout: '',
        stderr: err.message,
        exitCode: -1,
        signal: null,
        durationMs: Date.now() - startedAt,
        error: err.message,
      };
    }
  }

  /**
   * Piston — secondary fallback (only if user self-hosts or whitelist)
   */
  async _runPiston(code, opts, langKey, langSpec, startedAt) {
    return {
      ok: false,
      language: langSpec.name,
      version: langSpec.version,
      output: '',
      stdout: '',
      stderr: 'Piston public API is now whitelist-only. Set SANDBOX_BACKEND=judge0 (default) or self-host.',
      exitCode: -1,
      signal: null,
      durationMs: Date.now() - startedAt,
      error: 'Piston public API unavailable. Use judge0 backend (default).',
    };
  }

  /**
   * Format execution result for Telegram (Markdown).
   * @param {Object} result
   * @returns {string}
   */
  formatResult(result) {
    const langSlug = (result.language || 'text').toLowerCase().replace(/[^a-z0-9+]/g, '').substring(0, 12) || 'text';
    const lines = [];
    lines.push('```' + langSlug);
    const output = (result.output || '').substring(0, 1800);
    lines.push(output);
    if ((result.output || '').length > 1800) {
      lines.push('\n... (output truncated)');
    }
    lines.push('```');
    lines.push('');
    const statusLine = result.ok
      ? `✅ exit 0`
      : `❌ exit ${result.exitCode}${result.signal ? ` (${result.signal})` : ''}`;
    lines.push(`🌐 \`${result.language} ${result.version}\`  •  ⏱ \`${result.durationMs}ms\`  •  ${statusLine}`);
    return lines.join('\n');
  }

  /**
   * List supported languages for /run help
   */
  getSupportedLanguagesList() {
    const common = ['python', 'javascript', 'typescript', 'go', 'rust', 'c', 'c++', 'java', 'ruby', 'php', 'bash', 'sql'];
    return `Bahasa yang didukung (pilih salah satu):\n${common.map(l => `• \`${l}\``).join('\n')}\n\nTotal: 30+ bahasa (lihat /run help untuk detail).`;
  }
}

// Singleton
const sandboxService = new SandboxService();
export default sandboxService;
