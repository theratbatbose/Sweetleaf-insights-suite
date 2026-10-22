import { execFile } from "node:child_process";
import { Agent, EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

/**
 * Office networks, VPNs and some antivirus products route traffic through a proxy and/or
 * inspect HTTPS with their own certificate. Node.js ignores both by default, which makes
 * AI requests fail with an unhelpful "fetch failed". This module routes requests through
 * the right proxy and explains failures in plain language.
 */

export type NetworkStatus = {
  proxy: string;
  proxySource: "settings" | "environment" | "windows" | "none";
  windowsAutoConfig: string;
  systemCertificates: boolean;
  nodeVersion: string;
};

const LOCAL_HOSTS = "localhost,127.0.0.1,::1";
let status: NetworkStatus = {
  proxy: "",
  proxySource: "none",
  windowsAutoConfig: "",
  systemCertificates: process.env.NODE_USE_SYSTEM_CA === "1" || process.execArgv.includes("--use-system-ca"),
  nodeVersion: process.versions.node,
};

export function networkStatus() {
  return status;
}

type WindowsProxy = { server: string; autoConfig: string };

/** Reads the proxy set in Windows "Proxy settings" (the same one browsers use). */
function windowsProxy(): Promise<WindowsProxy> {
  if (process.platform !== "win32") return Promise.resolve({ server: "", autoConfig: "" });
  return new Promise((resolve) => {
    execFile("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      if (error) return resolve({ server: "", autoConfig: "" });
      const value = (name: string) => stdout.match(new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.*)$`, "mi"))?.[1]?.trim() ?? "";
      const enabled = /0x1$/i.test(value("ProxyEnable"));
      let server = enabled ? value("ProxyServer") : "";
      // "http=host:port;https=host:port" → prefer the https entry
      if (server.includes("=")) {
        const parts = Object.fromEntries(server.split(";").map((part) => part.split("=").map((piece) => piece.trim())));
        server = parts.https ?? parts.http ?? "";
      }
      resolve({ server, autoConfig: value("AutoConfigURL") });
    });
  });
}

function normaliseProxy(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/** Applies the proxy (from Settings, then environment, then Windows) to every outgoing request. */
export async function configureNetwork(settingsProxy = "") {
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "";
  const windows = settingsProxy || envProxy ? { server: "", autoConfig: "" } : await windowsProxy();
  const proxy = normaliseProxy(settingsProxy || envProxy || windows.server);
  const source: NetworkStatus["proxySource"] = settingsProxy ? "settings" : envProxy ? "environment" : windows.server ? "windows" : "none";

  if (proxy) {
    const noProxy = [LOCAL_HOSTS, process.env.NO_PROXY ?? process.env.no_proxy ?? ""].filter(Boolean).join(",");
    setGlobalDispatcher(new EnvHttpProxyAgent({ httpProxy: proxy, httpsProxy: proxy, noProxy }));
  } else {
    setGlobalDispatcher(new Agent());
  }
  status = { ...status, proxy, proxySource: source, windowsAutoConfig: windows.autoConfig };
  return status;
}

const CERT_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", "UNABLE_TO_GET_ISSUER_CERT", "CERT_UNTRUSTED",
]);

function errorCode(error: unknown): string {
  let current = error as { code?: string; cause?: unknown } | undefined;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current.code) return current.code;
    current = current.cause as typeof current;
  }
  return "";
}

/** Whether retrying might help (a dropped connection), as opposed to a setup problem. */
export function isTransient(error: unknown) {
  return ["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(errorCode(error));
}

/** A plain-language explanation of why a request never got an answer. */
export function describeNetworkError(error: unknown, url: string, label: string): string {
  const { host, hostname, origin } = new URL(url);
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(hostname);
  const code = errorCode(error);
  const proxyNote = status.proxy ? ` Sweetleaf is using the proxy ${status.proxy}${status.proxySource === "windows" ? " (from your Windows settings)" : ""}.` : "";

  if ((error as Error)?.name === "TimeoutError") return `${label} took too long to answer. Try again; if it keeps happening, check your internet connection.`;
  if (local && (code === "ECONNREFUSED" || code === "ENOTFOUND")) {
    return `Nothing is answering at ${origin}. Make sure ${label} is installed and running on this computer, and that the server address in Settings → AI is right.`;
  }
  if (CERT_CODES.has(code)) {
    return `A security certificate on your network wasn't trusted (${code}). This usually means antivirus software or an office network is checking secure connections. Fixes: start Sweetleaf with the Start file (it trusts your computer's certificates), update Node.js from nodejs.org to the latest LTS, or ask your IT team.`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return `This computer couldn't find ${host}. Check that you're online. On an office network or VPN you may need a proxy: Sweetleaf picks up your Windows proxy automatically, or you can enter it under Settings → AI → Advanced → Proxy.${status.windowsAutoConfig ? " Your PC uses an automatic proxy script, which Sweetleaf can't read; ask IT for the proxy address and enter it there." : ""}${proxyNote}`;
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "UND_ERR_SOCKET" || code === "UND_ERR_ABORTED" || /cancel|403|tunnel/i.test(String((error as Error)?.message ?? "") + String((error as { cause?: Error })?.cause?.message ?? ""))) {
    return `The connection to ${host} was blocked or cut off, usually by a firewall, VPN or proxy. Try another network (for example a phone hotspot) to confirm, then ask IT to allow ${host}.${proxyNote}`;
  }
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return `Connecting to ${host} timed out. A firewall may be blocking it, or the internet connection is slow.${proxyNote}`;
  }
  const detail = (error as { cause?: Error })?.cause?.message ?? (error as Error)?.message ?? "unknown error";
  return `Could not reach ${label} (${detail}).${proxyNote}`;
}
