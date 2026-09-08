// Unit tests for scripts/extract-shortcut-scopes.py.
//
// The extractor parses lark-cli's Go source, so every failure mode here is
// SILENT: a shortcut it fails to see simply never gets a scope mapping, and
// incremental authorization stops working for that tool with no test going red.
// `scope-coverage.test.ts` catches gaps only when a matching lark-cli binary is
// installed locally; these tests need nothing but Python and pin the three
// concrete regressions found during the 1.0.92 → 1.0.94 bump.
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = join(ROOT, "scripts/extract-shortcut-scopes.py");

/**
 * Run the extractor over a synthetic lark-cli tree and return the parsed map.
 *
 * The script always writes to `<repo>/docker/shortcut-scopes.json`, so it is
 * invoked with cwd pointed at a throwaway directory laid out like the repo
 * (`scripts/` + `docker/`) and the real script copied in — that keeps the
 * committed map untouched while exercising the real code path.
 */
function extract(files: Record<string, string>): {
  shortcuts: { service: string; command: string; scopes: string[]; userCallable?: boolean }[];
} {
  const tmp = mkdtempSync(join(tmpdir(), "extract-scopes-"));
  try {
    mkdirSync(join(tmp, "repo/scripts"), { recursive: true });
    mkdirSync(join(tmp, "repo/docker"), { recursive: true });
    writeFileSync(join(tmp, "repo/scripts/extract-shortcut-scopes.py"), readFileSync(SCRIPT));
    for (const [name, body] of Object.entries(files)) {
      const p = join(tmp, "src/shortcuts", name);
      mkdirSync(resolve(p, ".."), { recursive: true });
      writeFileSync(p, body);
    }
    execFileSync(
      "python3",
      [join(tmp, "repo/scripts/extract-shortcut-scopes.py"), join(tmp, "src"), "9.9.9"],
      { encoding: "utf-8", timeout: 30_000 },
    );
    return JSON.parse(readFileSync(join(tmp, "repo/docker/shortcut-scopes.json"), "utf-8"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const find = (out: ReturnType<typeof extract>, service: string, command: string) =>
  out.shortcuts.find((s) => s.service === service && s.command === command);

describe("extract-shortcut-scopes.py", () => {
  // Regression: the struct body was matched with `common\.Shortcut\s*\{(.*?)\n\}`,
  // which requires a closing brace at COLUMN 0. lark-cli 1.0.94's
  // shortcuts/okr/okr_comment.go ends its last declaration with an indented
  // `\t}}` (final `Execute:` closure folded onto the struct's closing line), so
  // no column-0 brace followed and `okr +comment-delete` vanished entirely.
  it("extracts a shortcut whose literal closes on an indented brace at EOF", () => {
    const out = extract({
      "okr/okr_comment.go": `package okr

var OKRDeleteComment = common.Shortcut{
	Service:     "okr",
	Command:     "+comment-delete",
	Description: "Delete an OKR comment permanently",
	Scopes:      []string{"okr:okr.comment.delete"},
	AuthTypes:   []string{"user"},
	Execute: func(ctx context.Context, runtime *common.RuntimeContext) error {
		return nil
	}}
`,
    });
    expect(find(out, "okr", "+comment-delete")?.scopes).toEqual(["okr:okr.comment.delete"]);
  });

  // Regression: comments were stripped with a naive `//[^\n]*` regex, which eats
  // the tail of any literal containing `//` — a URL in a Desc string being the
  // common case — INCLUDING its closing backtick. The orphaned quote then
  // desynchronised the brace scan and silently dropped the shortcut
  // (`base +form-create`, `base +url-resolve` in 1.0.94).
  it("does not corrupt raw-string literals that contain //", () => {
    const out = extract({
      "base/base_form_create.go": `package base

var BaseFormCreate = common.Shortcut{
	Service: "base",
	Command: "+form-create",
	Scopes:  []string{"base:form:create"},
	Flags: []common.Flag{
		{Name: "description", Desc: ` +
        "`" +
        `form description (markdown link like [text](https://example.com))` +
        "`" +
        `},
	},
}

var BaseUrlResolve = common.Shortcut{
	Service: "base",
	Command: "+url-resolve",
	Scopes:  []string{"base:app:read"},
}
`,
    });
    expect(find(out, "base", "+form-create")?.scopes).toEqual(["base:form:create"]);
    // The shortcut declared *after* the poisoned literal is the real casualty.
    expect(find(out, "base", "+url-resolve")?.scopes).toEqual(["base:app:read"]);
  });

  // Regression: shortcuts built by a factory taking the command as a *parameter*
  // were invisible — phase 2 skips them (Command is not a literal) and the
  // config-struct pass skips them (Command is not `cfg.Command`). 1.0.93/1.0.94
  // introduced the shape for `mail +rule-enable/-disable` and
  // `okr +comment-solve/-reopen`. Service and scopes are read from the factory
  // body; command names come from the call sites.
  it("extracts shortcuts from a factory whose Command is a function parameter", () => {
    const out = extract({
      "mail/mail_rules.go": `package mail

var mailRuleAuthTypes = []string{"user", "bot"}

func makeRuleToggleShortcut(command string, enabled bool) common.Shortcut {
	return common.Shortcut{
		Service:   "mail",
		Command:   command,
		Risk:      "write",
		Scopes:    []string{"mail:user_mailbox.rule:write"},
		AuthTypes: mailRuleAuthTypes,
	}
}

var MailRuleEnable = makeRuleToggleShortcut("+rule-enable", true)
var MailRuleDisable = makeRuleToggleShortcut("+rule-disable", false)
`,
    });
    for (const cmd of ["+rule-enable", "+rule-disable"]) {
      expect(find(out, "mail", cmd)?.scopes).toEqual(["mail:user_mailbox.rule:write"]);
    }
  });

  // The user-only boundary must hold through the factory path too: a factory
  // whose AuthTypes omits "user" yields no user scopes, exactly as a literal
  // declaration would.
  it("drops scopes from a factory-built shortcut whose AuthTypes omits user", () => {
    const out = extract({
      "im/im_bot.go": `package im

func makeBotOnlyShortcut(command string) common.Shortcut {
	return common.Shortcut{
		Service:   "im",
		Command:   command,
		Scopes:    []string{"im:message:send_as_bot"},
		AuthTypes: []string{"bot"},
	}
}

var IMBotThing = makeBotOnlyShortcut("+bot-thing")
`,
    });
    const e = find(out, "im", "+bot-thing");
    expect(e?.scopes).toEqual([]);
    expect(e?.userCallable).toBe(false);
  });
});
