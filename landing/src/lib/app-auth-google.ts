import * as dns from "node:dns";
import * as https from "node:https";

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

const GOOGLE_TOKEN_HOST = "oauth2.googleapis.com";
const GOOGLE_TOKEN_PATH = "/token";
const GOOGLE_TOKEN_URL = `https://${GOOGLE_TOKEN_HOST}${GOOGLE_TOKEN_PATH}`;

function isLikelyNetworkFetchFailure(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("enotfound") ||
    m.includes("eai_again") ||
    m.includes("econnrefused") ||
    m.includes("socket") ||
    m.includes("cert") ||
    m.includes("ssl") ||
    m.includes("tls")
  );
}

/**
 * POST to Google token URL over IPv4 only. Resolves A record first, then connects to the IP with
 * SNI + Host header — avoids custom `lookup` (Next/Node can call it with a signature that left
 * the peer address undefined → "Invalid IP address: undefined").
 */
async function postTokenHttpsIpv4(
  body: string,
  signal: AbortSignal,
): Promise<{ statusCode: number; text: string }> {
  if (signal.aborted) {
    throw new Error("oauth_token_aborted");
  }

  let address: string;
  try {
    const r = await dns.promises.lookup(GOOGLE_TOKEN_HOST, { family: 4 });
    address = r.address;
  } catch (dnsErr) {
    throw new Error(
      `dns_ipv4:${dnsErr instanceof Error ? dnsErr.message : String(dnsErr)}`,
    );
  }
  if (!address || typeof address !== "string") {
    throw new Error("dns_ipv4_empty_address");
  }

  if (signal.aborted) {
    throw new Error("oauth_token_aborted");
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: address,
        port: 443,
        path: GOOGLE_TOKEN_PATH,
        method: "POST",
        servername: GOOGLE_TOKEN_HOST,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body, "utf8"),
          Host: GOOGLE_TOKEN_HOST,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    const onAbort = () => {
      req.destroy();
      reject(new Error("oauth_token_aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    req.on("error", (err) => {
      signal.removeEventListener("abort", onAbort);
      reject(err);
    });
    req.on("close", () => {
      signal.removeEventListener("abort", onAbort);
    });

    req.write(body, "utf8");
    req.end();
  });
}

function parseTokenJson(
  statusCode: number,
  text: string,
  ok: boolean,
): GoogleTokenResponse {
  let json: GoogleTokenResponse;
  try {
    json = JSON.parse(text) as GoogleTokenResponse;
  } catch {
    throw new Error(`google_token_bad_json_${statusCode}`);
  }
  if (!ok) {
    const msg =
      json.error_description || json.error || `token_status_${statusCode}`;
    throw new Error(msg);
  }
  return json;
}

export async function exchangeGoogleAuthorizationCode(params: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
  const bodyString = body.toString();
  const signal = AbortSignal.timeout(20_000);

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyString,
      signal,
    });
    const text = await res.text();
    return parseTokenJson(res.status, text, res.ok);
  } catch (e) {
    if (!isLikelyNetworkFetchFailure(e)) {
      throw e;
    }
    try {
      const { statusCode, text } = await postTokenHttpsIpv4(bodyString, signal);
      const ok = statusCode >= 200 && statusCode < 300;
      return parseTokenJson(statusCode, text, ok);
    } catch (inner) {
      const outer = e instanceof Error ? e.message : String(e);
      const innerMsg = inner instanceof Error ? inner.message : String(inner);
      throw new Error(`${outer} | ipv4_fallback:${innerMsg}`);
    }
  }
}
