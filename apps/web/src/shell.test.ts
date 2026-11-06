import { describe, expect, it } from "vitest";
import { renderShell } from "./shell";
import { WEB_STYLES } from "./theme";

const GUILD = { id: "111111111111111111", name: "Alpha", icon: null };

describe("dashboard shell", () => {
  it("escapes every interpolated name and ships no client script", () => {
    const html = renderShell(
      {
        title: "</title><script>alert(1)</script>",
        username: "</summary><script>alert(2)</script>",
        csrfToken: "csrf-\"quoted\"",
        guild: { id: GUILD.id, name: "A & B </h1>", icon: null },
        section: "overview",
        head: true,
        storage: "postgres",
      },
      "<p>body</p>",
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("A &amp; B &lt;/h1&gt;");
    expect(html).toContain("csrf-&quot;quoted&quot;");
    expect(html).toContain('href="#main"');
    expect(html).toContain("Skip to content");
    expect(html).toContain("Read ");
    expect(html).toContain("postgres");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Overview");
  });

  it("uses the shared palette and never a second accent literal", () => {
    const html = renderShell({ title: "Page", storage: "memory" }, "body");
    expect(html).toContain("--brand:#5865f2");
    expect(html).toContain("--ok:#57f287");
    expect(html).toContain("--danger:#ed4245");
    expect(html).toContain("memory");
  });

  it("gives a page without a guild the full width, not the sidebar track", () => {
    const html = renderShell({ title: "Landing", storage: "memory" }, "<section class=\"hero\">hi</section>");
    expect(html).toContain('class="layout solo"');
    // A bare `grid-template-columns:` attribute is invalid HTML and leaves the
    // content in the 238px sidebar column; the override belongs in the sheet.
    expect(html).not.toContain('<div class="layout solo" grid-template-columns');
    expect(WEB_STYLES).toContain(".layout.solo{grid-template-columns:minmax(0,1fr)}");
  });

  it("sizes and strokes every inline icon", () => {
    const html = renderShell({ title: "Page", guild: GUILD, section: "overview" }, "");
    expect(html).toContain('class="icon"');
    expect(WEB_STYLES).toContain(".icon{width:18px;height:18px;flex:none;fill:none;stroke:currentColor");
  });

  it("falls back to initials when a guild icon hash is unsafe", () => {
    const safe = renderShell(
      {
        title: "Page",
        guild: { id: GUILD.id, name: "Alpha", icon: "abcdef123456" },
      },
      "",
    );
    expect(safe).toContain("https://cdn.discordapp.com/icons/");
    expect(safe).toContain("?size=64");

    const unsafe = renderShell(
      {
        title: "Page",
        guild: { id: GUILD.id, name: "Alpha", icon: 'x" onerror="alert(1)' },
      },
      "",
    );
    expect(unsafe).not.toContain("cdn.discordapp.com");
    expect(unsafe).toContain(">AL<");
  });

  it("omits the heading when the page owns its own h1", () => {
    const html = renderShell(
      { title: "Hidden heading", head: false },
      "<h1>Page heading</h1>",
    );
    expect(html).not.toContain("<h1>Hidden heading</h1>");
    expect(html).toContain("<h1>Page heading</h1>");
  });

  it("offers sign-out only when a CSRF token exists", () => {
    const withToken = renderShell(
      { title: "Page", username: "Admin", csrfToken: "token" },
      "",
    );
    expect(withToken).toContain('action="/logout"');
    expect(withToken).toContain('value="token"');

    const without = renderShell({ title: "Page", username: "Admin" }, "");
    expect(without).not.toContain('action="/logout"');
    expect(without).toContain("Admin");
  });
});
