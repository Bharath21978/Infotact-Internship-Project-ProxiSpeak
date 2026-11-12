"use strict";

// Tiny HTTP client on node:http. Unlike fetch it lets tests set the
// Origin and Cookie headers freely, which browsers normally control.

const http = require("node:http");

function request(baseUrl, path, { method = "GET", body, raw, cookie, origin, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined;
        const h = { ...headers };

        if (payload !== undefined) {
            h["Content-Type"] = h["Content-Type"] || "application/json";
            h["Content-Length"] = Buffer.byteLength(payload);
        }

        if (cookie) h.Cookie = cookie;
        if (origin) h.Origin = origin;

        const req = http.request(new URL(path, baseUrl), { method, headers: h }, (res) => {
            const chunks = [];

            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                let json;

                try { json = JSON.parse(text); } catch { /* not JSON */ }

                resolve({ status: res.statusCode, headers: res.headers, setCookie: res.headers["set-cookie"] || [], text, json });
            });
        });

        req.on("error", reject);
        if (payload !== undefined) req.write(payload);
        req.end();
    });
}

// "name=value" from a Set-Cookie list, or null if absent/cleared.
function cookieFrom(res, name = "proxispeak_token") {
    const line = res.setCookie.find((c) => c.startsWith(`${name}=`));

    if (!line) return null;

    const pair = line.split(";")[0];

    return pair === `${name}=` ? null : pair;
}

module.exports = { request, cookieFrom };
