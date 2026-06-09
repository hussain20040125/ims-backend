var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const IS_PROD = process.env.NODE_ENV === "production";
const LEVEL = (process.env.LOG_LEVEL || (IS_PROD ? "error" : "debug")).toLowerCase();
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const current = LEVELS[LEVEL] ?? (IS_PROD ? 3 : 0);
const ts = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "ts");
const logger = {
  debug: /* @__PURE__ */ __name((...a) => current <= 0 && console.log(`[${ts()}] DEBUG`, ...a), "debug"),
  info: /* @__PURE__ */ __name((...a) => current <= 1 && console.log(`[${ts()}] INFO `, ...a), "info"),
  warn: /* @__PURE__ */ __name((...a) => current <= 2 && console.warn(`[${ts()}] WARN `, ...a), "warn"),
  error: /* @__PURE__ */ __name((...a) => current <= 3 && console.error(`[${ts()}] ERROR`, ...a), "error")
};
export {
  logger
};
