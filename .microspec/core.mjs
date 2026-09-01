const [tool, ...rest] = Deno.args;
if (!tool) { console.error("usage: core.mjs <tool> [args]"); Deno.exit(2); }
const spec = import.meta.resolve(`@microspec/core/${tool}`);
const out = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--minimum-dependency-age", "0", spec, ...rest], stdin: "inherit", stdout: "inherit", stderr: "inherit" }).output();
Deno.exit(out.code);
