import { build } from 'esbuild'
import external from 'esbuild-plugin-external-global'

export function buildFunction(entry: string) {
  return build({
    globalName: 'Franke',
    footer: {
      js: `
        if (Franke.default.fetch) {
          addEventListener('fetch', event => event.respondWith(Franke.default.fetch(event.request, {__STATIC_CONTENT: __STATIC_CONTENT}, event)))
        }
    `,
    },
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    target: 'esnext',
    write: false,
    loader: {
      '.html': 'text',
      '.txt': 'text',
    },
    minify: true,
    allowOverwrite: true,
    external: ['__STATIC_CONTENT_MANIFEST'],
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
      external.externalGlobalPlugin({
        '__STATIC_CONTENT_MANIFEST': '__STATIC_CONTENT_MANIFEST',
      }),
    ],
  })
}
