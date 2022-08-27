import { build } from 'esbuild'

export function buildFunction(entry: string) {
  return build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    target: 'esnext',
    write: false,
    loader: {
      '.html': 'text',
      '.txt': 'text',
    },
    minify: true,
    allowOverwrite: true,
    plugins: [
      {
        name: 'notifier and monitor',
        setup(pluginBuild) {
          pluginBuild.onEnd((result) => {
            if (result.errors.length > 0) {
              console.error(
                `${result.errors.length} error(s) and ${result.warnings.length} warning(s) when compiling function.`,
              )
            } else if (result.warnings.length > 0) {
              console.warn(
                `${result.warnings.length} warning(s) when compiling Worker.`,
              )
            } else {
              console.log('Compiled function successfully.')
            }
          })
        },
      },
    ],
  })
}
