import { detectURL } from "./detectURL.ts";
import { assert, assertEquals } from "./deps/testing.ts";

Deno.test("Absolute Path", async (t) => {
  {
    const text = "https://example.com/test.css";
    await t.step(text, () => {
      const url = detectURL(text);
      assert(url instanceof URL);
      if (url instanceof URL) assertEquals(url.href, text);
    });
  }
  {
    const text = ".div { display: block; }";
    await t.step(text, () => {
      const url = detectURL(text);
      assert(!(url instanceof URL));
      assertEquals(url, text);
    });
  }
  {
    const text = "./test.css";
    await t.step(text, () => {
      const url = detectURL(text);
      assert(!(url instanceof URL));
      assertEquals(url, text);
    });
  }
});
Deno.test("Relative Path", async (t) => {
  const base = "https://example.com/foo/bar/baz";
  {
    const text = "https://example.com/test.css";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(url instanceof URL);
      if (url instanceof URL) assertEquals(url.href, text);
    });
  }
  {
    const text = ".div { display: block; }";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(!(url instanceof URL));
      assertEquals(url, text);
    });
  }
  {
    const text = "#editor { display: block; }";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(!(url instanceof URL));
      assertEquals(url, text);
    });
  }
  {
    const text = "#editor { background: url('../../image.png'); }";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(!(url instanceof URL));
      assertEquals(url, text);
    });
  }
  {
    const text = "#editor { background: url('./image.png'); }";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(!(url instanceof URL));
      assertEquals(url, text);
    });
  }
  {
    const text = "#editor { background: url('/image.png'); }";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(!(url instanceof URL));
      assertEquals(url, text);
    });
  }
  {
    const text = "./test.css";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(url instanceof URL);
      assertEquals(url.href, "https://example.com/foo/bar/test.css");
    });
  }
  {
    const text = "../test.css";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(url instanceof URL);
      assertEquals(url.href, "https://example.com/foo/test.css");
    });
  }
  {
    const text = "../../hoge/test.css";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(url instanceof URL);
      assertEquals(url.href, "https://example.com/hoge/test.css");
    });
  }
  {
    const text = "/test.css";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(url instanceof URL);
      assertEquals(url.href, "https://example.com/test.css");
    });
  }
  {
    const text = "//test.com/test.css";
    await t.step(text, () => {
      const url = detectURL(text, base);
      assert(url instanceof URL);
      assertEquals(url.href, "https://test.com/test.css");
    });
  }
});

Deno.test("edge cases", async (t) => {
  await t.step("URL instance passes through", () => {
    const original = new URL("https://example.com/x");
    const detected = detectURL(original, "https://ignored.invalid/");
    assert(detected instanceof URL);
    assertEquals(detected, original);
  });

  await t.step("relative without base stays string", () => {
    const rel = "./a.css";
    const detected = detectURL(rel);
    assertEquals(detected, rel);
  });

  await t.step("non relative with base stays string", () => {
    const text = "image.png"; // not starting with ./ ../ /
    const base2 = "https://example.com/path/";
    const detected = detectURL(text, base2);
    assertEquals(detected, text);
  });

  await t.step("invalid base fallback returns original", () => {
    const rel = "./a.css";
    const badBase = ":::::/invalid"; // new URL => TypeError
    const detected = detectURL(rel, badBase);
    assertEquals(detected, rel);
  });
});
