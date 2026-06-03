# Contributing to Markline

Thanks for your interest in improving Markline. This repo holds **both** the
framework (the Next.js app + `markline` CLI, published as `@markline/markline`)
and Markline's own documentation site (the content in `site/`).

## Repo layout

```
markline/
├── app/            # Next.js App Router (the framework shell)
├── components/     # docs UI, API reference, landing primitives
├── lib/            # config, OpenAPI, content resolution
├── bin/markline.mjs# the CLI (init/dev/build/start/export)
├── templates/init/ # starter scaffolded by `markline init`
├── create/         # @markline/create — the `npm create @markline` scaffolder
└── site/           # Markline's own docs + landing (deployed to markline.dev)
```

Content lives outside the framework via the `MARKLINE_CONTENT` env var. When
unset, the repo serves its own `site/` so you get docs + landing out of the box.

## Local development

```bash
npm install
npm run dev          # serves site/ at http://localhost:3000
```

Point the dev server at other content with `MARKLINE_CONTENT`:

```bash
MARKLINE_CONTENT=../my-docs npm run dev
```

## Before opening a PR

```bash
npm run typecheck    # tsc --noEmit — must pass
npm run build        # production build (CI runs the static export)
```

CI runs `typecheck` and a static export build on every PR. Please keep both
green.

## Testing the CLI from a real install

The CLI behaves differently when installed from a tarball (npm hoists deps),
so test it that way rather than with a `file:` dependency:

```bash
npm pack                                  # produces markline-markline-X.Y.Z.tgz
cd /tmp && mkdir cli-test && cd cli-test
npm init -y && npm install /path/to/markline-markline-X.Y.Z.tgz
npx markline init && npx markline dev
```

## Commit messages

Keep the subject line capitalized and imperative; explain the *why* in the body
when it isn't obvious. No fixed prefix is required.

## License

By contributing, you agree that your contributions are licensed under the MIT
License (see [LICENSE](./LICENSE)).
