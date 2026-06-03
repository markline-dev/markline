# @markline/create

Scaffold a new [Markline](https://github.com/markline-dev/markline) documentation
project in one command.

```bash
npm create @markline@latest my-docs
cd my-docs
npm install
npm run dev
```

## What it creates

A ready-to-edit docs project that depends on
[`@markline/markline`](https://www.npmjs.com/package/@markline/markline):

```text
my-docs/
├── docs.json                      # navigation, theme, branding, API settings
├── docs/                          # your pages (*.mdx)
│   ├── index.mdx
│   └── quickstart.mdx
├── api/openapi.json               # rendered as an interactive API reference
├── package.json                   # markline scripts + dependency
├── Dockerfile / .dockerignore     # Node-server deploy
├── netlify.toml                   # static deploy
└── .github/workflows/deploy.yml   # GitHub Pages
```

The new package is named after the target directory. If you omit the directory
argument, the current directory is used.

## Adding to an existing project

Skip the scaffolder and use the CLI directly:

```bash
npm install @markline/markline
npx markline init
```

## License

MIT
