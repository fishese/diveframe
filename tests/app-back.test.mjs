import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const source = await readFile("lib/app-back.ts", "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  appBackHrefForLocation,
  appBackParent,
  APP_BACK_BOOTSTRAP,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`,
);

const PARENT_CASES = [
  ["/", "", null],
  ["/", "?dive=abc", "/"],
  ["/index.html", "", null],
  ["/index.html", "?dive=abc", "/"],
  ["/compose", "?dive=abc", "/?dive=abc"],
  ["/compose.html", "?dive=abc", "/?dive=abc"],
  ["/compose", "", "/"],
  ["/catalog/supplement", "", "/catalog"],
  ["/catalog/supplement.html", "", "/catalog"],
  ["/catalog/device-additions", "", "/catalog"],
  ["/catalog/device-additions.html", "", "/catalog"],
  ["/settings", "", "/"],
  ["/settings.html", "", "/"],
  ["/map", "", "/"],
  ["/about", "", "/"],
  ["/memos", "", "/"],
  ["/memo", "", "/"],
  ["/android", "", "/"],
  ["/catalog", "", "/"],
  ["/unknown-route", "", "/"],
];

test("appBackParent maps nested routes up and leaves the home list", () => {
  for (const [pathname, search, expected] of PARENT_CASES) {
    assert.equal(
      appBackParent(pathname, search),
      expected,
      `${pathname}${search}`,
    );
  }
});

test("appBackHrefForLocation adds native .html except on /", () => {
  assert.equal(appBackHrefForLocation("/catalog", "/settings.html"), "/catalog.html");
  assert.equal(appBackHrefForLocation("/?dive=abc", "/compose.html"), "/?dive=abc");
  assert.equal(appBackHrefForLocation("/", "/settings.html"), "/");
  assert.equal(appBackHrefForLocation("/catalog", "/settings"), "/catalog");
});

test("bootstrap parent function matches appBackParent", () => {
  const { parent } = runBootstrap("/settings.html", "");
  for (const [pathname, search, expected] of PARENT_CASES) {
    assert.equal(parent(pathname, search), expected, `bootstrap ${pathname}${search}`);
  }
});

test("bootstrap handleBack replaces nested URLs and ignores home", () => {
  const nested = runBootstrap("/settings.html", "");
  assert.equal(nested.window.__diveFrameHandleBack(), true);
  assert.equal(nested.location.replaced, "/");

  const home = runBootstrap("/", "");
  assert.equal(home.window.__diveFrameHandleBack(), false);
  assert.equal(home.location.replaced, undefined);

  const compose = runBootstrap("/compose.html", "?dive=n1");
  assert.equal(compose.window.__diveFrameHandleBack(), true);
  assert.equal(compose.location.replaced, "/?dive=n1");
});

function runBootstrap(pathname, search) {
  const location = {
    pathname,
    search,
    href: `https://localhost${pathname}${search}`,
    replace(url) {
      location.replaced = url;
    },
  };
  const history = {
    state: null,
    pushState(state) {
      history.state = state;
    },
  };
  const window = {
    location,
    history,
    addEventListener() {},
  };
  const context = vm.createContext({ window, location, history });
  vm.runInContext(APP_BACK_BOOTSTRAP, context);
  return {
    window,
    location,
    parent: window.__diveFrameBack.parent,
  };
}
